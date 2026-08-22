// src/user/index.ts
import {getContext} from '@getcronit/pylon'
import {requireAuth} from '../auth'

import type {ID} from '../types'
import {InvalidInputError} from '../errors/general.errors'

import type {
  ZitadelAuthorizationCreateInput,
  ZitadelAuthorizationUpdateInput,
  ZitadelUserCreateInput,
  ZitadelUserUpdateInput
} from '../zitadel/types'

import {
  createAuthorization as zitadelCreateAuthorization,
  createUser as zitadelCreateUser,
  deactivateUser as zitadelDeactivateUser,
  deleteAuthorization as zitadelDeleteAuthorization,
  deleteUser as zitadelDeleteUser,
  getIsUnique,
  getZitadelUserById,
  listProjectRoles,
  listUsersByRole as listZitadelUsersByRole,
  listZitadelUsers,
  lockUser as zitadelLockUser,
  reactivateUser as zitadelReactivateUser,
  requestPasswordReset as zitadelRequestPasswordReset,
  resendEmailVerification as zitadelResendEmailVerification,
  sendEmailVerification as zitadelSendEmailVerification,
  setPassword as zitadelSetPassword,
  setPhone as zitadelSetPhone,
  tsToIso,
  unlockUser as zitadelUnlockUser,
  updateAuthorization as zitadelUpdateAuthorization,
  updateUser as zitadelUpdateUser,
  verifyEmail as zitadelVerifyEmail
} from '../zitadel/users'

import type {User as ProtoUser} from '@zitadel/proto/zitadel/user/v2/user_pb'
import {
  Gender as ProtoGender,
  UserState as ProtoUserState
} from '@zitadel/proto/zitadel/user/v2/user_pb'

import {HumanUser} from './HumanUser'
import {MachineUser} from './MachineUser'
import {UserConnection, UserEdge} from './User'
import {Role, RoleConnection, RoleEdge} from './Role'
import {PageInfo} from '../relay/PageInfo'
import type {UserNode} from './types'
import {Gender, UserState} from './types'

/**
 * Mutation payloads (return OBJECTS, not raw JSON/void).
 * Keep these tiny and stable so Pylon generates predictable schema types.
 */
export class MutationResult {
  ok: boolean
  message?: string

  constructor(args: {ok: boolean; message?: string}) {
    this.ok = args.ok
    this.message = args.message
  }
}

export class UserMutationResult {
  ok: boolean
  message?: string
  userId?: string
  user?: UserNode

  constructor(args: {ok: boolean; message?: string; userId?: string; user?: UserNode}) {
    this.ok = args.ok
    this.message = args.message
    this.userId = args.userId
    this.user = args.user
  }
}

export class AuthorizationMutationResult {
  ok: boolean
  message?: string
  authorizationId?: string

  constructor(args: {ok: boolean; message?: string; authorizationId?: string}) {
    this.ok = args.ok
    this.message = args.message
    this.authorizationId = args.authorizationId
  }
}

function mapGender(gender: number | undefined): Gender | undefined {
  switch (gender) {
    case ProtoGender.FEMALE:
      return Gender.GENDER_FEMALE
    case ProtoGender.MALE:
      return Gender.GENDER_MALE
    case ProtoGender.DIVERSE:
      return Gender.GENDER_DIVERSE
    default:
      // Zitadel always sends the field for a human profile, with 0
      // (UNSPECIFIED) when nobody ever set it. Reporting that as a value would
      // make an unset field look answered, so it reads as absent.
      return undefined
  }
}

function mapUserState(state: number): UserState {
  switch (state) {
    case ProtoUserState.ACTIVE:
      return UserState.USER_STATE_ACTIVE
    case ProtoUserState.INACTIVE:
      return UserState.USER_STATE_INACTIVE
    case ProtoUserState.DELETED:
      return UserState.USER_STATE_DELETED
    case ProtoUserState.LOCKED:
      return UserState.USER_STATE_LOCKED
    case ProtoUserState.INITIAL:
      return UserState.USER_STATE_INITIAL
    default:
      return UserState.USER_STATE_UNSPECIFIED
  }
}

/**
 * Convert a user/v2 proto User into the correct concrete GraphQL node instance.
 * GraphQL inline fragments are resolved using the runtime class (prototype),
 * not a `type` field.
 */
function toUserModel(z: ProtoUser): UserNode {
  const details = z.details

  const base = {
    id: z.userId as ID,
    state: mapUserState(z.state),
    userName: z.username || '',
    loginNames: z.loginNames ?? [],
    preferredLoginName: z.preferredLoginName || '',
    resourceOwner: details?.resourceOwner || '',
    creationDate: tsToIso(details?.creationDate),
    changeDate: tsToIso(details?.changeDate),
    sequence: details?.sequence != null ? String(details.sequence) : ''
  }

  // IMPORTANT: real MachineUser instance so `... on MachineUser` works
  if (z.type.case === 'machine') {
    return new MachineUser(base)
  }

  const human = z.type.case === 'human' ? z.type.value : undefined
  const profile = human?.profile
  const emailObj = human?.email
  const phoneObj = human?.phone

  const firstName = profile?.givenName ?? ''
  const lastName = profile?.familyName ?? ''

  const displayName =
    String(profile?.displayName ?? '').trim() ||
    `${firstName} ${lastName}`.trim() ||
    String(z.username ?? '').trim() ||
    undefined

  return new HumanUser({
    ...base,
    avatarUrl: profile?.avatarUrl || undefined,
    preferredLanguage: profile?.preferredLanguage || undefined,
    displayName,
    email: emailObj?.email || undefined,
    phone: phoneObj?.phone || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    nickName: profile?.nickName || undefined,
    gender: mapGender(profile?.gender)
  })
}

/**
 * Cursor helpers shared by the connection builders below.
 */
function encodeCursor(n: number): string {
  const g: any = globalThis as any
  if (typeof g?.btoa === 'function') return g.btoa(String(n))
  return String(n)
}

function decodeCursor(cursor: string | null | undefined): number | null {
  if (!cursor) return null
  const g: any = globalThis as any
  try {
    if (typeof g?.atob === 'function') {
      const s = g.atob(cursor)
      const n = parseInt(s, 10)
      return Number.isFinite(n) ? n : null
    }
  } catch {
    // ignore
  }
  const n = parseInt(cursor, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Slice a list by Relay-style args.
 * Cursors are treated as integer offsets into the filtered list.
 */
function sliceByConnectionArgs<T>(
  items: T[],
  args?: {first?: number; after?: string; last?: number; before?: string}
): {slice: T[]; start: number; end: number; totalCount: number} {
  const totalCount = items.length

  const afterIdx = decodeCursor(args?.after) ?? -1
  const beforeIdx = decodeCursor(args?.before)

  let start = afterIdx + 1
  let end = beforeIdx == null ? totalCount : Math.max(0, beforeIdx)

  start = Math.max(0, Math.min(totalCount, start))
  end = Math.max(start, Math.min(totalCount, end))

  if (args?.first != null) {
    const first = Math.max(0, args.first)
    end = Math.min(end, start + first)
  }

  if (args?.last != null) {
    const last = Math.max(0, args.last)
    start = Math.max(start, end - last)
  }

  return {slice: items.slice(start, end), start, end, totalCount}
}

/**
 * Request-scoped caches to avoid duplicate list fetches per query.
 * Outside a request context fresh maps are used.
 */
function getListCaches<T>(cacheName: string): {
  cache: Map<string, T[]>
  inflight: Map<string, Promise<T[]>>
} {
  let ctx: any
  try {
    ctx = getContext() as any
  } catch {
    return {cache: new Map(), inflight: new Map()}
  }

  let cache = ctx.get(cacheName) as Map<string, T[]> | undefined
  if (!cache) {
    cache = new Map<string, T[]>()
    ctx.set(cacheName, cache)
  }

  const inflightName = `${cacheName}Inflight`
  let inflight = ctx.get(inflightName) as Map<string, Promise<T[]>> | undefined
  if (!inflight) {
    inflight = new Map<string, Promise<T[]>>()
    ctx.set(inflightName, inflight)
  }

  return {cache, inflight}
}

/**
 * Public GraphQL service facade for users/roles/grants.
 */
export class UserServices {
  @requireAuth()
  static async user(args: {id: string; organizationId?: string}): Promise<UserNode> {
    if (!args?.id) throw new InvalidInputError('id required')
    const u = await getZitadelUserById(args.id, args.organizationId)
    return toUserModel(u)
  }

  @requireAuth()
  static async users(args?: {
    first?: number
    after?: string
    last?: number
    before?: string
    limit?: number
    organizationId?: string
  }): Promise<UserConnection> {
    const limit = Math.max(1, Math.min(500, args?.limit ?? 200))
    const {cache, inflight} = getListCaches<UserNode>('userListCache')

    const key = args?.organizationId ? `${args.organizationId}:all:${limit}` : `all:${limit}`

    const cached = cache.get(key)
    if (cached) return UserServices._toUserConnection(cached, args)

    const existing = inflight.get(key)
    if (existing) {
      const items = await existing
      return UserServices._toUserConnection(items, args)
    }

    const p = (async () => {
      const raw = await listZitadelUsers(limit, args?.organizationId)
      const items = raw.map(toUserModel)
      cache.set(key, items)
      return items
    })().finally(() => inflight.delete(key))

    inflight.set(key, p)
    const items = await p
    return UserServices._toUserConnection(items, args)
  }

  @requireAuth()
  static async usersByRole(args: {
    roleKey: string
    first?: number
    after?: string
    last?: number
    before?: string
    limit?: number
    organizationId?: string
  }): Promise<UserConnection> {
    if (!args?.roleKey) throw new InvalidInputError('roleKey required')
    const limit = Math.max(1, Math.min(500, args.limit ?? 200))

    const {cache, inflight} = getListCaches<UserNode>('userListCache')
    const key = args.organizationId
      ? `${args.organizationId}:role:${args.roleKey}:${limit}`
      : `role:${args.roleKey}:${limit}`

    const cached = cache.get(key)
    if (cached) return UserServices._toUserConnection(cached, args)

    const existing = inflight.get(key)
    if (existing) {
      const items = await existing
      return UserServices._toUserConnection(items, args)
    }

    const p = (async () => {
      const raw = await listZitadelUsersByRole(args.roleKey, limit, args.organizationId)
      const items = raw.map(toUserModel)
      cache.set(key, items)
      return items
    })().finally(() => inflight.delete(key))

    inflight.set(key, p)
    const items = await p
    return UserServices._toUserConnection(items, args)
  }

  @requireAuth()
  static async roles(args: {
    projectId: string
    first?: number
    after?: string
    last?: number
    before?: string
    limit?: number
    organizationId?: string
  }): Promise<RoleConnection> {
    if (!args?.projectId) throw new InvalidInputError('projectId required')
    const limit = Math.max(1, Math.min(500, args.limit ?? 200))

    const {cache, inflight} = getListCaches<Role>('projectRoleModelCache')
    const key = args.organizationId ? `${args.organizationId}:${args.projectId}:${limit}` : `${args.projectId}:${limit}`

    const cached = cache.get(key)
    if (cached) return UserServices._toRoleConnection(cached, args)

    const existing = inflight.get(key)
    if (existing) {
      const items = await existing
      return UserServices._toRoleConnection(items, args)
    }

    const p = (async () => {
      const raw = await listProjectRoles(args.projectId, limit, args.organizationId)
      const items = raw
        .filter(r => r.key)
        .map(r => new Role({key: r.key, displayName: r.displayName}))
      cache.set(key, items)
      return items
    })().finally(() => inflight.delete(key))

    inflight.set(key, p)
    const items = await p
    return UserServices._toRoleConnection(items, args)
  }

  @requireAuth()
  static async isUnique(args: {loginName: string}): Promise<boolean | null> {
    if (!args?.loginName) throw new InvalidInputError('loginName required')
    return getIsUnique(args.loginName)
  }

  @requireAuth()
  static async currentUser(args?: {organizationId?: string}): Promise<UserNode> {
    const ctx = getContext()
    const authUser = ctx.get('auth')?.user

    const id = String(authUser?.sub ?? '')
    if (!id) throw new InvalidInputError('Not authenticated')

    const u = await getZitadelUserById(id, args?.organizationId)
    return toUserModel(u)
  }

  // -------------------------
  // Mutations (return objects)
  // -------------------------

  @requireAuth()
  static async createUser(args: {
    values: ZitadelUserCreateInput
    organizationId?: string
    createProfile?: boolean
    skipEmailVerification?: boolean
  }): Promise<UserMutationResult> {
    if (!args?.values) throw new InvalidInputError('values required')

    const res = await zitadelCreateUser(args.values, args.organizationId, args.createProfile, args.skipEmailVerification)
    const userId = res.userId

    if (userId) {
      const u = await getZitadelUserById(userId, args.organizationId).catch(() => null)
      return new UserMutationResult({
        ok: true,
        userId,
        user: u ? toUserModel(u) : undefined
      })
    }

    return new UserMutationResult({ok: true, message: 'created', userId: undefined})
  }

  @requireAuth()
  static async deleteUser(args: {userId: string; organizationId?: string}): Promise<UserMutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelDeleteUser(args.userId, args.organizationId)
    return new UserMutationResult({ok: true, userId: args.userId})
  }

  @requireAuth()
  static async deactivateUser(args: {userId: string; organizationId?: string}): Promise<UserMutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelDeactivateUser(args.userId, args.organizationId)
    const u = await getZitadelUserById(args.userId, args.organizationId).catch(() => null)
    return new UserMutationResult({ok: true, userId: args.userId, user: u ? toUserModel(u) : undefined})
  }

  @requireAuth()
  static async reactivateUser(args: {userId: string; organizationId?: string}): Promise<UserMutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelReactivateUser(args.userId, args.organizationId)
    const u = await getZitadelUserById(args.userId, args.organizationId).catch(() => null)
    return new UserMutationResult({ok: true, userId: args.userId, user: u ? toUserModel(u) : undefined})
  }

  @requireAuth()
  static async lockUser(args: {userId: string; organizationId?: string}): Promise<UserMutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelLockUser(args.userId, args.organizationId)
    const u = await getZitadelUserById(args.userId, args.organizationId).catch(() => null)
    return new UserMutationResult({ok: true, userId: args.userId, user: u ? toUserModel(u) : undefined})
  }

  @requireAuth()
  static async unlockUser(args: {userId: string; organizationId?: string}): Promise<UserMutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelUnlockUser(args.userId, args.organizationId)
    const u = await getZitadelUserById(args.userId, args.organizationId).catch(() => null)
    return new UserMutationResult({ok: true, userId: args.userId, user: u ? toUserModel(u) : undefined})
  }

  @requireAuth()
  static async updateUser(args: {
    userId: string
    changes: ZitadelUserUpdateInput
    organizationId?: string
  }): Promise<UserMutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    if (!args?.changes) throw new InvalidInputError('changes required')

    await zitadelUpdateUser(args.userId, args.changes, args.organizationId)
    const u = await getZitadelUserById(args.userId, args.organizationId).catch(() => null)
    return new UserMutationResult({ok: true, userId: args.userId, user: u ? toUserModel(u) : undefined})
  }

  @requireAuth()
  static async setUserPassword(args: {
    userId: string
    newPassword: string
    changeRequired?: boolean
    organizationId?: string
  }): Promise<MutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    if (!args?.newPassword) throw new InvalidInputError('newPassword required')
    await zitadelSetPassword(args.userId, args.newPassword, !!args.changeRequired, args.organizationId)
    return new MutationResult({ok: true})
  }

  @requireAuth()
  static async requestUserPasswordReset(args: {userId: string; organizationId?: string}): Promise<MutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelRequestPasswordReset(args.userId, args.organizationId)
    return new MutationResult({ok: true})
  }

  @requireAuth()
  static async sendUserEmailVerification(args: {userId: string; organizationId?: string}): Promise<MutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelSendEmailVerification(args.userId, args.organizationId)
    return new MutationResult({ok: true})
  }

  @requireAuth()
  static async resendUserEmailVerification(args: {userId: string; organizationId?: string}): Promise<MutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    await zitadelResendEmailVerification(args.userId, args.organizationId)
    return new MutationResult({ok: true})
  }

  @requireAuth()
  static async verifyUserEmail(args: {userId: string; code: string; organizationId?: string}): Promise<MutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    if (!args?.code) throw new InvalidInputError('code required')
    await zitadelVerifyEmail(args.userId, args.code, args.organizationId)
    return new MutationResult({ok: true})
  }

  @requireAuth()
  static async setUserPhone(args: {userId: string; phone: string; organizationId?: string}): Promise<UserMutationResult> {
    if (!args?.userId) throw new InvalidInputError('userId required')
    if (!args?.phone) throw new InvalidInputError('phone required')
    await zitadelSetPhone(args.userId, args.phone, args.organizationId)
    const u = await getZitadelUserById(args.userId, args.organizationId).catch(() => null)
    return new UserMutationResult({ok: true, userId: args.userId, user: u ? toUserModel(u) : undefined})
  }

  @requireAuth()
  static async createAuthorization(args: {
    input: ZitadelAuthorizationCreateInput
    organizationId?: string
  }): Promise<AuthorizationMutationResult> {
    if (!args?.input) throw new InvalidInputError('input required')
    const res = await zitadelCreateAuthorization(args.input, args.organizationId)
    return new AuthorizationMutationResult({ok: true, authorizationId: res.authorizationId || undefined})
  }

  @requireAuth()
  static async updateAuthorization(args: {
    input: ZitadelAuthorizationUpdateInput
    organizationId?: string
  }): Promise<AuthorizationMutationResult> {
    if (!args?.input) throw new InvalidInputError('input required')
    const res = await zitadelUpdateAuthorization(args.input, args.organizationId)
    return new AuthorizationMutationResult({ok: true, authorizationId: res.authorizationId || undefined})
  }

  @requireAuth()
  static async deleteAuthorization(args: {
    authorizationId: string
    organizationId?: string
  }): Promise<AuthorizationMutationResult> {
    if (!args?.authorizationId) throw new InvalidInputError('authorizationId required')
    await zitadelDeleteAuthorization(args.authorizationId, args.organizationId)
    return new AuthorizationMutationResult({ok: true, authorizationId: args.authorizationId})
  }

  // -------------------------
  // Connection builders
  // -------------------------

  private static _toUserConnection(
    items: UserNode[],
    args?: {first?: number; after?: string; last?: number; before?: string}
  ): UserConnection {
    const {slice, start, end, totalCount} = sliceByConnectionArgs(items, args)

    const edges = slice.map((node, i) => new UserEdge({node, cursor: encodeCursor(start + i)}))

    const pageInfo = new PageInfo({
      hasPreviousPage: start > 0,
      hasNextPage: end < totalCount,
      startCursor: edges[0]?.cursor,
      endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
    })

    return new UserConnection({edges, pageInfo, totalCount})
  }

  private static _toRoleConnection(
    items: Role[],
    args?: {first?: number; after?: string; last?: number; before?: string}
  ): RoleConnection {
    const {slice, start, end, totalCount} = sliceByConnectionArgs(items, args)

    const edges = slice.map((node, i) => new RoleEdge({node, cursor: encodeCursor(start + i)}))

    const pageInfo = new PageInfo({
      hasPreviousPage: start > 0,
      hasNextPage: end < totalCount,
      startCursor: edges[0]?.cursor,
      endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
    })

    return new RoleConnection({edges, pageInfo, totalCount})
  }

  /**
   * List users belonging to a specific organization as Relay connection.
   */
  static async listByOrg(
    organizationId: string,
    args?: {
      first?: number
      after?: string
      last?: number
      before?: string
      limit?: number
    }
  ): Promise<UserConnection> {
    return this.users({...args, organizationId})
  }
}
