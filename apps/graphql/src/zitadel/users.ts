// src/zitadel/users.ts
// User data layer over the Zitadel user/v2, authorization/v2 and project/v2
// Connect APIs. This replaces the former management/v1 REST layer completely.
import {create} from '@bufbuild/protobuf'
import {InvalidInputError} from '../errors/general.errors'
import {timestampDate} from '@bufbuild/protobuf/wkt'
import {getContext} from '@getcronit/pylon'

import {getZitadelClients, createCallOptions, getDefaultOrgId} from './client'
import type {
  ZitadelAuthorizationCreateInput,
  ZitadelAuthorizationUpdateInput,
  ZitadelIDPLink,
  ZitadelProjectRole,
  ZitadelUserCreateInput,
  ZitadelUserGrant,
  ZitadelUserUpdateInput
} from './types'

import type {User as ProtoUser} from '@zitadel/proto/zitadel/user/v2/user_pb'
import {
  CreateUserRequestSchema,
  CreateUserRequest_HumanSchema,
  DeactivateUserRequestSchema,
  DeleteUserRequestSchema,
  GetUserByIDRequestSchema,
  ListIDPLinksRequestSchema,
  ListUserMetadataRequestSchema,
  ListUsersRequestSchema,
  LockUserRequestSchema,
  MetadataSchema,
  PasswordResetRequestSchema,
  ReactivateUserRequestSchema,
  ResendEmailCodeRequestSchema,
  SendEmailCodeRequestSchema,
  SetPhoneRequestSchema,
  SetUserMetadataRequestSchema,
  UnlockUserRequestSchema,
  UpdateUserRequestSchema,
  UpdateUserRequest_HumanSchema,
  UpdateUserRequest_Human_ProfileSchema,
  VerifyEmailRequestSchema
} from '@zitadel/proto/zitadel/user/v2/user_service_pb'
import {
  SearchQuerySchema as UserSearchQuerySchema,
  EmailQuerySchema,
  InUserIDQuerySchema,
  OrganizationIdQuerySchema,
  TypeQuerySchema,
  UserNameQuerySchema,
  OrQuerySchema,
  Type as ProtoUserType
} from '@zitadel/proto/zitadel/user/v2/query_pb'
import {SetHumanEmailSchema} from '@zitadel/proto/zitadel/user/v2/email_pb'
import {SetHumanPhoneSchema} from '@zitadel/proto/zitadel/user/v2/phone_pb'
import {SetHumanProfileSchema, Gender as ProtoGender} from '@zitadel/proto/zitadel/user/v2/user_pb'
import {
  HashedPasswordSchema,
  PasswordSchema,
  SetPasswordSchema
} from '@zitadel/proto/zitadel/user/v2/password_pb'
import {ListQuerySchema, TextQueryMethod} from '@zitadel/proto/zitadel/object/v2/object_pb'
import {
  ListAuthorizationsRequestSchema,
  CreateAuthorizationRequestSchema,
  UpdateAuthorizationRequestSchema,
  DeleteAuthorizationRequestSchema
} from '@zitadel/proto/zitadel/authorization/v2/authorization_service_pb'
import {
  AuthorizationsSearchFilterSchema,
  RoleKeyQuerySchema,
  State as ProtoAuthorizationState,
  type Authorization as ProtoAuthorization
} from '@zitadel/proto/zitadel/authorization/v2/authorization_pb'
import {
  InIDsFilterSchema,
  PaginationRequestSchema,
  TextFilterMethod
} from '@zitadel/proto/zitadel/filter/v2/filter_pb'
import {ListProjectRolesRequestSchema} from '@zitadel/proto/zitadel/project/v2/project_service_pb'

// --------------------------------------------------
// Helpers
// --------------------------------------------------

export function tsToIso(ts: any): string {
  if (!ts) return ''
  try {
    return timestampDate(ts).toISOString()
  } catch {
    return ''
  }
}

/**
 * Role displayName formatting:
 * - take everything after ":" from the role key
 * - uppercase first letter
 */
export function roleDisplayNameFromKey(roleKey?: string | null): string | undefined {
  if (!roleKey) return undefined
  const raw = String(roleKey)
  const afterColon = raw.includes(':') ? (raw.split(':').pop() ?? '') : raw
  const s = afterColon.trim()
  if (!s) return undefined
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Request-scoped cache helper. Outside a request context (tests, build)
 * fresh maps are returned, so nothing is cached but nothing breaks either.
 */
function requestScopedMaps<V, P>(cacheKey: string): {
  cache: Map<string, V>
  inflight: Map<string, Promise<P>>
} {
  let ctx: any
  try {
    ctx = getContext() as any
  } catch {
    return {cache: new Map(), inflight: new Map()}
  }

  let cache = ctx.get(cacheKey) as Map<string, V> | undefined
  if (!cache) {
    cache = new Map<string, V>()
    ctx.set(cacheKey, cache)
  }

  const inflightKey = `${cacheKey}Inflight`
  let inflight = ctx.get(inflightKey) as Map<string, Promise<P>> | undefined
  if (!inflight) {
    inflight = new Map<string, Promise<P>>()
    ctx.set(inflightKey, inflight)
  }

  return {cache, inflight}
}

async function dedupe<T>(
  maps: {cache: Map<string, T>; inflight: Map<string, Promise<T>>},
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = maps.cache.get(key)
  if (cached !== undefined) return cached

  const existing = maps.inflight.get(key)
  if (existing) return existing

  const p = (async () => {
    const value = await fetcher()
    maps.cache.set(key, value)
    return value
  })().finally(() => maps.inflight.delete(key))

  maps.inflight.set(key, p)
  return p
}

// --------------------------------------------------
// User lookup / listing
// --------------------------------------------------

export async function getZitadelUserById(userId: string, organizationId?: string): Promise<ProtoUser> {
  const maps = requestScopedMaps<ProtoUser, ProtoUser>('zitadelUserCache')
  const cacheKey = organizationId ? `${organizationId}:${userId}` : userId

  return dedupe(maps, cacheKey, async () => {
    const clients = getZitadelClients()
    const request = create(GetUserByIDRequestSchema, {userId})
    const response = await clients.users.getUserByID(request, createCallOptions(organizationId))
    if (!response.user) throw new Error(`User not found: ${userId}`)
    return response.user
  })
}

/**
 * Zitadel refuses a list limit above SystemDefaults.MaxQueryLimit, 1000 by
 * default, with Errors.Query.LimitExceeded. Every list here stays at or
 * below it, and an id list longer than that is sent in slices.
 */
const MAX_LIST_LIMIT = 1000

function slices<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * The search queries every user list shares: both user types, and the
 * organization when one is known, either per call or as the deployment's
 * ZITADEL_ORG_ID. The org filter is deliberate rather than left to the
 * token's own scope: a facade deployed for one brand must never list the
 * neighbouring organization, whatever the caller's token could see.
 */
function userListQueries(organizationId: string | undefined, userIds?: string[]) {
  const queries = [
    create(UserSearchQuerySchema, {
      query: {
        case: 'orQuery',
        value: create(OrQuerySchema, {
          queries: [
            create(UserSearchQuerySchema, {
              query: {case: 'typeQuery', value: create(TypeQuerySchema, {type: ProtoUserType.HUMAN})}
            }),
            create(UserSearchQuerySchema, {
              query: {case: 'typeQuery', value: create(TypeQuerySchema, {type: ProtoUserType.MACHINE})}
            })
          ]
        })
      }
    })
  ]

  const orgId = organizationId ?? getDefaultOrgId()
  if (orgId) {
    queries.push(
      create(UserSearchQuerySchema, {
        query: {case: 'organizationIdQuery', value: create(OrganizationIdQuerySchema, {organizationId: orgId})}
      })
    )
  }

  if (userIds) {
    queries.push(
      create(UserSearchQuerySchema, {
        query: {case: 'inUserIdsQuery', value: create(InUserIDQuerySchema, {userIds})}
      })
    )
  }

  return queries
}

/**
 * List users of both types (human and machine), like the old v1 search did.
 * One ListUsers call.
 */
export async function listZitadelUsers(limit = 100, organizationId?: string): Promise<ProtoUser[]> {
  const clients = getZitadelClients()

  const request = create(ListUsersRequestSchema, {
    query: create(ListQuerySchema, {limit: Math.min(limit, MAX_LIST_LIMIT), asc: true}),
    queries: userListQueries(organizationId)
  })

  const response = await clients.users.listUsers(request, createCallOptions(organizationId))
  return response.result ?? []
}

/**
 * The users behind a list of ids, in one ListUsers call (one per thousand
 * ids). The answer keeps the order of the ids, and an id Zitadel does not
 * answer for is simply absent, exactly as the former one-GetUser-per-id loop
 * treated a failed lookup.
 */
export async function listZitadelUsersByIds(userIds: string[], organizationId?: string): Promise<ProtoUser[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (ids.length === 0) return []

  const clients = getZitadelClients()
  const byId = new Map<string, ProtoUser>()

  for (const slice of slices(ids, MAX_LIST_LIMIT)) {
    const request = create(ListUsersRequestSchema, {
      query: create(ListQuerySchema, {limit: slice.length, asc: true}),
      queries: userListQueries(organizationId, slice)
    })
    const response = await clients.users.listUsers(request, createCallOptions(organizationId))
    for (const u of response.result ?? []) byId.set(u.userId, u)
  }

  return ids.map(id => byId.get(id)).filter((u): u is ProtoUser => !!u)
}

/**
 * Uniqueness check for a login name. Email addresses are matched against the
 * email query, everything else against the username query. This replaces the
 * removed management/v1 _is_unique endpoint.
 */
export async function getIsUnique(loginName: string, organizationId?: string): Promise<boolean> {
  const clients = getZitadelClients()

  const query = loginName.includes('@')
    ? create(UserSearchQuerySchema, {
        query: {
          case: 'emailQuery',
          value: create(EmailQuerySchema, {
            emailAddress: loginName,
            method: TextQueryMethod.EQUALS_IGNORE_CASE
          })
        }
      })
    : create(UserSearchQuerySchema, {
        query: {
          case: 'userNameQuery',
          value: create(UserNameQuerySchema, {
            userName: loginName,
            method: TextQueryMethod.EQUALS_IGNORE_CASE
          })
        }
      })

  const request = create(ListUsersRequestSchema, {
    query: create(ListQuerySchema, {limit: 1, asc: true}),
    queries: [query]
  })

  const response = await clients.users.listUsers(request, createCallOptions(organizationId))
  const total = Number(response.details?.totalResult ?? BigInt(response.result?.length ?? 0))
  return total === 0
}

// --------------------------------------------------
// User lifecycle
// --------------------------------------------------

export async function createUser(
  values: ZitadelUserCreateInput,
  organizationId?: string,
  createProfile?: boolean,
  skipEmailVerification?: boolean
): Promise<{userId: string}> {
  const emailAddress = values.emailAddress.toLowerCase()
  const username = values.username.toLowerCase()

  if (!(await getIsUnique(username, organizationId)) || !(await getIsUnique(emailAddress, organizationId))) {
    throw new Error(`${username} <${emailAddress}> already exists`)
  }

  const clients = getZitadelClients()

  const human = create(CreateUserRequest_HumanSchema, {
    ...(createProfile === false
      ? {}
      : {
          profile: create(SetHumanProfileSchema, {
            givenName: values.details?.firstName ?? '',
            familyName: values.details?.lastName ?? '',
            preferredLanguage: 'en'
          })
        }),
    email: create(SetHumanEmailSchema, {
      email: values.emailAddress,
      ...(skipEmailVerification ? {verification: {case: 'isVerified' as const, value: true}} : {})
    }),
    ...(values.hashedPassword
      ? {
          passwordType: {
            case: 'hashedPassword' as const,
            value: create(HashedPasswordSchema, {hash: values.hashedPassword})
          }
        }
      : values.password
        ? {
            passwordType: {
              case: 'password' as const,
              value: create(PasswordSchema, {password: values.password, changeRequired: false})
            }
          }
        : {})
  })

  const request = create(CreateUserRequestSchema, {
    organizationId: organizationId ?? '',
    username: values.username,
    userType: {case: 'human', value: human}
  })

  const response = await clients.users.createUser(request, createCallOptions(organizationId))
  return {userId: response.id}
}

export async function deleteUser(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.deleteUser(create(DeleteUserRequestSchema, {userId}), createCallOptions(organizationId))
}

export async function deactivateUser(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.deactivateUser(create(DeactivateUserRequestSchema, {userId}), createCallOptions(organizationId))
}

export async function reactivateUser(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.reactivateUser(create(ReactivateUserRequestSchema, {userId}), createCallOptions(organizationId))
}

export async function lockUser(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.lockUser(create(LockUserRequestSchema, {userId}), createCallOptions(organizationId))
}

export async function unlockUser(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.unlockUser(create(UnlockUserRequestSchema, {userId}), createCallOptions(organizationId))
}

// --------------------------------------------------
// User updates / credentials
// --------------------------------------------------

/**
 * Accepts the enum name a caller sends and returns Zitadel's numeric gender.
 * An unknown name maps to UNSPECIFIED rather than throwing, so a client that
 * learns a new value cannot break an otherwise valid profile update.
 */
function genderFromString(gender: string): ProtoGender {
  switch (gender) {
    case 'GENDER_FEMALE':
      return ProtoGender.FEMALE
    case 'GENDER_MALE':
      return ProtoGender.MALE
    case 'GENDER_DIVERSE':
      return ProtoGender.DIVERSE
    case 'GENDER_UNSPECIFIED':
      return ProtoGender.UNSPECIFIED
    default:
      // A misspelled name used to map to UNSPECIFIED and thereby clear a
      // stored gender. Rejecting it keeps a typo from becoming a write.
      throw new InvalidInputError(`unknown gender "${gender}"`)
  }
}

export async function updateUser(userId: string, changes: ZitadelUserUpdateInput, organizationId?: string) {
  const clients = getZitadelClients()

  const human = create(UpdateUserRequest_HumanSchema, {
    ...(changes.profile
      ? {
          profile: create(UpdateUserRequest_Human_ProfileSchema, {
            ...(changes.profile.givenName ? {givenName: changes.profile.givenName} : {}),
            ...(changes.profile.familyName ? {familyName: changes.profile.familyName} : {}),
            // Zitadel validates each optional profile string it receives as
            // 1 to 200 runes. An empty string is therefore not "leave it" but
            // "invalid request", and one empty nickName failed the whole
            // update. Empty is treated as absent here.
            ...(changes.profile.displayName ? {displayName: changes.profile.displayName} : {}),
            ...(changes.profile.preferredLanguage
              ? {preferredLanguage: changes.profile.preferredLanguage}
              : {}),
            ...(changes.profile.nickName ? {nickName: changes.profile.nickName} : {}),
            ...(changes.profile.gender
              ? {gender: genderFromString(changes.profile.gender)}
              : {})
          })
        }
      : {}),
    ...(changes.email ? {email: create(SetHumanEmailSchema, {email: changes.email.email})} : {}),
    ...(changes.phone ? {phone: create(SetHumanPhoneSchema, {phone: changes.phone.phone})} : {}),
    ...(changes.password
      ? {
          password: create(SetPasswordSchema, {
            passwordType: {
              case: 'password',
              value: create(PasswordSchema, {
                password: changes.password.password,
                changeRequired: !!changes.password.changeRequired
              })
            }
          })
        }
      : {})
  })

  const request = create(UpdateUserRequestSchema, {
    userId,
    ...(changes.username ? {username: changes.username} : {}),
    userType: {case: 'human', value: human}
  })

  return clients.users.updateUser(request, createCallOptions(organizationId))
}

/**
 * Sets a password through UpdateUser with human.password. The dedicated
 * SetPassword RPC is deprecated at v4. Runs with the caller's token, so
 * Zitadel decides whether the caller may set that user's password.
 */
export async function setPassword(userId: string, newPassword: string, changeRequired = false, organizationId?: string) {
  return updateUser(userId, {password: {password: newPassword, changeRequired}}, organizationId)
}

export async function requestPasswordReset(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  // No medium set, Zitadel picks the default notification channel
  return clients.users.passwordReset(create(PasswordResetRequestSchema, {userId}), createCallOptions(organizationId))
}

export async function sendEmailVerification(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.sendEmailCode(create(SendEmailCodeRequestSchema, {userId}), createCallOptions(organizationId))
}

export async function resendEmailVerification(userId: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.resendEmailCode(create(ResendEmailCodeRequestSchema, {userId}), createCallOptions(organizationId))
}

export async function verifyEmail(userId: string, code: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.verifyEmail(
    create(VerifyEmailRequestSchema, {userId, verificationCode: code}),
    createCallOptions(organizationId)
  )
}

export async function setPhone(userId: string, phone: string, organizationId?: string) {
  const clients = getZitadelClients()
  return clients.users.setPhone(create(SetPhoneRequestSchema, {userId, phone}), createCallOptions(organizationId))
}

// --------------------------------------------------
// User metadata (graduated onto user/v2 UserService at v4)
// --------------------------------------------------

export async function setUserMetadata(userId: string, key: string, value: string, organizationId?: string) {
  const clients = getZitadelClients()
  const request = create(SetUserMetadataRequestSchema, {
    userId,
    metadata: [create(MetadataSchema, {key, value: new TextEncoder().encode(value)})]
  })
  return clients.users.setUserMetadata(request, createCallOptions(organizationId))
}

export async function getUserMetadata(userId: string, key: string, organizationId?: string): Promise<string | null> {
  const clients = getZitadelClients()
  const request = create(ListUserMetadataRequestSchema, {userId})
  const response = await clients.users.listUserMetadata(request, createCallOptions(organizationId))
  const match = (response.metadata ?? []).find(m => m.key === key)
  if (!match?.value?.length) return null
  return new TextDecoder().decode(match.value)
}

// --------------------------------------------------
// Links to external identity providers
// --------------------------------------------------

/**
 * The user's links to external identity providers, one user/v2 ListIDPLinks
 * call, cached per request like the other single-user reads. Each link names
 * the provider and the user's id and name there, for ID Austria the id is
 * the qes-oidc subject. Unlike the grants, a failed read is not turned into
 * an empty list: a caller deciding whether somebody holds a link has to be
 * able to tell "no link" from "could not read".
 */
export async function listIDPLinks(userId: string, organizationId?: string): Promise<ZitadelIDPLink[]> {
  const maps = requestScopedMaps<ZitadelIDPLink[], ZitadelIDPLink[]>('zitadelIDPLinkCache')
  const cacheKey = organizationId ? `${organizationId}:${userId}` : userId

  return dedupe(maps, cacheKey, async () => {
    const clients = getZitadelClients()
    const request = create(ListIDPLinksRequestSchema, {
      userId,
      query: create(ListQuerySchema, {limit: 100, asc: true})
    })
    const response = await clients.users.listIDPLinks(request, createCallOptions(organizationId))
    return (response.result ?? []).map(link => ({
      idpId: link.idpId,
      userId: link.userId,
      userName: link.userName
    }))
  })
}

// --------------------------------------------------
// Grants / roles (authorization/v2 replaces users/grants/_search)
// --------------------------------------------------

function authorizationStateToString(state: number): string {
  switch (state) {
    case ProtoAuthorizationState.ACTIVE:
      return 'ACTIVE'
    case ProtoAuthorizationState.INACTIVE:
      return 'INACTIVE'
    default:
      return 'UNSPECIFIED'
  }
}

function authorizationToGrant(a: ProtoAuthorization): ZitadelUserGrant {
  return {
    userId: a.user?.id,
    organizationId: a.organization?.id,
    creationDate: tsToIso(a.creationDate),
    changeDate: tsToIso(a.changeDate),
    projectId: a.project?.id,
    projectName: a.project?.name,
    state: authorizationStateToString(a.state),
    roles: (a.roles ?? []).map(r => ({
      key: r.key,
      displayName: r.displayName || roleDisplayNameFromKey(r.key)
    }))
  }
}

/**
 * Fetch grants for a user via authorization/v2. Cached per request. This is
 * the lookup behind a single user (user, currentUser): the lists below hand
 * their users the grants up front and never reach it.
 */
export async function getUserGrants(userId: string, organizationId?: string): Promise<ZitadelUserGrant[]> {
  const maps = requestScopedMaps<ZitadelUserGrant[], ZitadelUserGrant[]>('zitadelUserGrantCache')
  const cacheKey = organizationId ? `${organizationId}:${userId}` : userId

  return dedupe(maps, cacheKey, async () => {
    try {
      const clients = getZitadelClients()

      const request = create(ListAuthorizationsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit: 100, asc: true}),
        filters: [
          create(AuthorizationsSearchFilterSchema, {
            filter: {
              case: 'inUserIds',
              value: create(InIDsFilterSchema, {ids: [userId]})
            }
          })
        ]
      })

      const response = await clients.auth.listAuthorizations(request, createCallOptions(organizationId))
      return (response.authorizations ?? []).map(authorizationToGrant)
    } catch (e) {
      console.error('Failed to fetch grants for user', userId, e)
      return []
    }
  })
}

/**
 * The grants of a whole page of users in one ListAuthorizations call (one
 * per thousand ids), keyed by user id. Every requested id is present in the
 * answer, with an empty list when Zitadel returned nothing for it, so a user
 * built from this map never falls back to a lookup of its own.
 *
 * The call runs with the caller's token and the organization header like
 * every other one. Note the trap that applies to it: a token scoped to
 * another organization is not refused here, it is answered with an empty
 * list, so an all-empty map is a reason to check the token, not proof that
 * nobody holds a role.
 */
export async function listGrantsForUsers(
  userIds: string[],
  organizationId?: string
): Promise<Map<string, ZitadelUserGrant[]>> {
  const grants = new Map<string, ZitadelUserGrant[]>()
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  for (const id of ids) grants.set(id, [])
  if (ids.length === 0) return grants

  const clients = getZitadelClients()

  for (const slice of slices(ids, MAX_LIST_LIMIT)) {
    const request = create(ListAuthorizationsRequestSchema, {
      pagination: create(PaginationRequestSchema, {limit: MAX_LIST_LIMIT, asc: true}),
      filters: [
        create(AuthorizationsSearchFilterSchema, {
          filter: {case: 'inUserIds', value: create(InIDsFilterSchema, {ids: slice})}
        })
      ]
    })

    const response = await clients.auth.listAuthorizations(request, createCallOptions(organizationId))
    const total = Number(response.pagination?.totalResult ?? 0)
    if (total > MAX_LIST_LIMIT) {
      console.warn(
        `zitadel-gql: ${total} authorizations for ${slice.length} users, only the first ${MAX_LIST_LIMIT} were read`
      )
    }

    for (const a of response.authorizations ?? []) {
      const g = authorizationToGrant(a)
      if (!g.userId) continue
      const list = grants.get(g.userId)
      if (list) list.push(g)
      else grants.set(g.userId, [g])
    }
  }

  return grants
}

/**
 * Flatten roles from grants into unique ZitadelProjectRole[].
 * Keeps the best displayName encountered.
 */
export function flattenRolesFromGrants(grants: ZitadelUserGrant[]): ZitadelProjectRole[] {
  const map = new Map<string, ZitadelProjectRole>()

  for (const g of grants ?? []) {
    for (const r of g?.roles ?? []) {
      if (!r?.key) continue
      const existing = map.get(r.key)
      const displayName = r.displayName ?? roleDisplayNameFromKey(r.key)

      if (!existing) {
        map.set(r.key, {key: r.key, displayName})
      } else if (!existing.displayName && displayName) {
        map.set(r.key, {key: r.key, displayName})
      }
    }
  }

  return Array.from(map.values())
}

/**
 * A user together with the grants that were read for it, so the resolvers
 * can hand both to the model at once.
 */
export interface UserWithGrants {
  user: ProtoUser
  grants: ZitadelUserGrant[]
}

/**
 * Users holding a role, in two calls: one ListAuthorizations filtered by the
 * role key, then the users behind those authorizations in one ListUsers by
 * id. Each user gets the authorizations that call returned for it, which is
 * every authorization carrying the role. A role a user holds through a
 * second authorization that does not carry this key is not among them, and
 * that is the trade the two-call shape makes; the single-user lookup
 * (getUserGrants) still reads everything.
 */
export async function listUsersByRole(
  roleKey: string,
  limit = 100,
  organizationId?: string
): Promise<UserWithGrants[]> {
  const clients = getZitadelClients()

  const request = create(ListAuthorizationsRequestSchema, {
    pagination: create(PaginationRequestSchema, {limit: Math.min(limit, MAX_LIST_LIMIT), asc: true}),
    filters: [
      create(AuthorizationsSearchFilterSchema, {
        filter: {
          case: 'roleKey',
          value: create(RoleKeyQuerySchema, {key: roleKey, method: TextFilterMethod.EQUALS})
        }
      })
    ]
  })

  const response = await clients.auth.listAuthorizations(request, createCallOptions(organizationId))

  const grantsByUser = new Map<string, ZitadelUserGrant[]>()
  for (const a of response.authorizations ?? []) {
    const g = authorizationToGrant(a)
    if (!g.userId) continue
    const list = grantsByUser.get(g.userId)
    if (list) list.push(g)
    else grantsByUser.set(g.userId, [g])
  }

  const users = await listZitadelUsersByIds(Array.from(grantsByUser.keys()), organizationId)
  return users.map(user => ({user, grants: grantsByUser.get(user.userId) ?? []}))
}

// --------------------------------------------------
// Project roles (project/v2)
// --------------------------------------------------

export async function listProjectRoles(
  projectId: string,
  limit = 100,
  organizationId?: string
): Promise<ZitadelProjectRole[]> {
  const maps = requestScopedMaps<ZitadelProjectRole[], ZitadelProjectRole[]>('projectRoleCache')
  const cacheKey = organizationId ? `${organizationId}:${projectId}` : projectId

  return dedupe(maps, cacheKey, async () => {
    try {
      const clients = getZitadelClients()
      const request = create(ListProjectRolesRequestSchema, {
        projectId,
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })
      const response = await clients.projects.listProjectRoles(request, createCallOptions(organizationId))

      return (response.projectRoles ?? [])
        .map(r => ({
          key: r.key,
          displayName: r.displayName || roleDisplayNameFromKey(r.key)
        }))
        .filter(r => r.key)
    } catch (err) {
      console.error('Failed to fetch project roles for project', projectId, err)
      return []
    }
  })
}

// --------------------------------------------------
// Authorization management
// --------------------------------------------------

export async function createAuthorization(input: ZitadelAuthorizationCreateInput, organizationId?: string) {
  const clients = getZitadelClients()
  // project_grant_id from the old input has no equivalent field at v2, the
  // project id together with the org scope selects the grant
  const request = create(CreateAuthorizationRequestSchema, {
    userId: input.userId,
    projectId: input.projectId ?? input.projectGrantId ?? '',
    ...(organizationId ? {organizationId} : {}),
    roleKeys: input.roleKeys
  })
  const response = await clients.auth.createAuthorization(request, createCallOptions(organizationId))
  return {authorizationId: response.id}
}

export async function updateAuthorization(input: ZitadelAuthorizationUpdateInput, organizationId?: string) {
  const clients = getZitadelClients()
  const request = create(UpdateAuthorizationRequestSchema, {
    id: input.authorizationId,
    roleKeys: input.roleKeys
  })
  await clients.auth.updateAuthorization(request, createCallOptions(organizationId))
  return {authorizationId: input.authorizationId}
}

export async function deleteAuthorization(authorizationId: string, organizationId?: string) {
  const clients = getZitadelClients()
  const request = create(DeleteAuthorizationRequestSchema, {id: authorizationId})
  await clients.auth.deleteAuthorization(request, createCallOptions(organizationId))
  return {authorizationId}
}
