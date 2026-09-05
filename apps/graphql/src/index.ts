// src/index.ts
import {app, useAuth, type Plugin, type PylonConfig} from '@getcronit/pylon'
import {
  isAbstractType,
  Kind,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  type DocumentNode,
  type GraphQLSchema,
  type SelectionSetNode
} from 'graphql'
import {UserServices} from './user'
import {OrganizationServices} from './organization/services'
import {ProjectServices} from './project/services'
import {SessionServices} from './session/services'
import {ApplicationServices} from './application/services'
import {AuthorizationServices} from './authorization/services'
import {IDPServices} from './idp/services'
import {GroupServices} from './group/services'

export const graphql = {
  Query: {
    // User queries
    user: UserServices.user,
    users: UserServices.users,
    usersByRole: UserServices.usersByRole,
    currentUser: UserServices.currentUser,
    isUnique: UserServices.isUnique,

    // Organization queries
    organization: OrganizationServices.getById,
    organizations: OrganizationServices.list,

    // Project queries
    project: ProjectServices.getById,
    projects: ProjectServices.list,
    projectRoles: UserServices.roles,

    // Session queries
    session: SessionServices.getById,
    sessions: SessionServices.list,

    // Application queries
    application: ApplicationServices.getById,
    applications: ApplicationServices.list,

    // Authorization queries
    authorization: AuthorizationServices.getById,
    authorizations: AuthorizationServices.list,

    // IDP queries
    idp: IDPServices.getById,
    idps: IDPServices.list,

    // Group queries (native zitadel.group.v2, org scoped and flat)
    group: GroupServices.getById,
    groups: GroupServices.list,
    groupMembers: GroupServices.listMembers,
    groupGrants: GroupServices.listGrants,
    userGroups: GroupServices.listByUser
  },
  Mutation: {
    // User mutations
    createUser: UserServices.createUser,

    deleteUser: UserServices.deleteUser,
    deactivateUser: UserServices.deactivateUser,
    reactivateUser: UserServices.reactivateUser,
    lockUser: UserServices.lockUser,
    unlockUser: UserServices.unlockUser,

    updateUser: UserServices.updateUser,

    setUserPassword: UserServices.setUserPassword,
    requestUserPasswordReset: UserServices.requestUserPasswordReset,

    sendUserEmailVerification: UserServices.sendUserEmailVerification,
    resendUserEmailVerification: UserServices.resendUserEmailVerification,
    verifyUserEmail: UserServices.verifyUserEmail,

    setUserPhone: UserServices.setUserPhone,

    createAuthorization: UserServices.createAuthorization,
    updateAuthorization: UserServices.updateAuthorization,
    deleteAuthorization: UserServices.deleteAuthorization,

    // Group mutations. Membership and grants are separate calls in
    // group/v2, and the facade keeps that split rather than pretending a
    // group can be created with members in one shot.
    createGroup: GroupServices.createGroup,
    updateGroup: GroupServices.updateGroup,
    deleteGroup: GroupServices.deleteGroup,
    addUsersToGroup: GroupServices.addUsersToGroup,
    removeUsersFromGroup: GroupServices.removeUsersFromGroup,
    createGroupGrant: GroupServices.createGroupGrant,
    updateGroupGrant: GroupServices.updateGroupGrant,
    deleteGroupGrant: GroupServices.deleteGroupGrant,
    setGroupManagerRoles: GroupServices.setGroupManagerRoles
  }
}

// Built-in OIDC auth against the Zitadel this facade fronts, wired as a v3
// plugin (the previous build initialized it through app.use()). Guarded
// resolvers keep their @requireAuth() decorators.
//
// AUTH_ISSUER is mandatory. There is no unauthenticated build of this facade:
// it exposes every user, org and project of the Zitadel behind it, so a
// deployment that cannot authenticate its callers must not start at all.
//
// This used to be `authIssuer ? [useAuth(...)] : []`, so that `pylon build`
// would work without the variable. That conditional was a trap. Pylon only
// populates the auth context from the plugin, and authMiddleware throws
// "Authentication required" whenever that context is empty, so a facade
// deployed without AUTH_ISSUER answered 401 to every guarded resolver no
// matter what token the caller sent. It failed closed rather than open, but
// the failure was indistinguishable from a bad token and cost hours to find.
// The build now passes the variable explicitly (see the build script) instead
// of the code quietly tolerating its absence.
const authIssuer = process.env.AUTH_ISSUER

if (!authIssuer) {
  throw new Error(
    'AUTH_ISSUER is not set. The facade authenticates every caller against ' +
      'the Zitadel it fronts, so there is no mode in which it can run ' +
      'without an issuer. Set AUTH_ISSUER to that Zitadel, for example ' +
      'https://accounts.example.com, and AUTH_KEY to the JSON key of an API ' +
      'application there; Pylon introspects tokens with it and fails the ' +
      'first request without it.'
  )
}

// Pylon reads the API application key lazily, at the first request, and the
// failure it reports then ("Error while reading key file. Make sure it exists")
// names neither the variable nor the request that triggered it. Checked here so
// a deployment missing it dies at startup with the variable named.
if (!process.env.AUTH_KEY) {
  throw new Error(
    'AUTH_KEY is not set. It is the JSON key of an API application in the ' +
      'Zitadel named by AUTH_ISSUER; Pylon authenticates its token ' +
      'introspection with it. A key.json file is not looked for by this check.'
  )
}

/**
 * Pylon resolves an interface or union member by looking at which fields the
 * projected object carries, and that object holds only the fields the client
 * selected. A HumanUser selected as `... on HumanUser { id userName }` reaches
 * the generated resolver as `{id, userName}`, the check for `preferences`
 * fails, and the whole page dies with "Abstract type UserNode must resolve to
 * an Object type at runtime" (the same failure the previous interface shape
 * showed). Two things put that right, in one plugin.
 *
 * Every node class sets `__typename`, and the projection keeps it whenever
 * the document selects it. So the document is completed first: each
 * selection set on an abstract type gets `__typename` added unless it is
 * there already (GQty adds it for every `$on`, other clients may not). Then
 * the resolver reads it, and Pylon's field guess remains the fallback for
 * whatever the rewrite did not reach. The answer therefore carries
 * `__typename` on user nodes even when nobody asked, which every client
 * tolerates and the ones built for a union expect anyway.
 */
function withTypename(schema: GraphQLSchema, document: DocumentNode): DocumentNode {
  const typeInfo = new TypeInfo(schema)
  const typename = {kind: Kind.FIELD, name: {kind: Kind.NAME, value: '__typename'}} as const

  return visit(
    document,
    visitWithTypeInfo(typeInfo, {
      SelectionSet(node): SelectionSetNode | undefined {
        if (!isAbstractType(typeInfo.getParentType())) return undefined
        const present = node.selections.some(
          selection => selection.kind === Kind.FIELD && selection.name.value === '__typename'
        )
        if (present) return undefined
        return {...node, selections: [typename, ...node.selections]}
      }
    })
  )
}

const useTypenameResolution: Plugin = (() => {
  let current: GraphQLSchema | undefined

  return {
    onSchemaChange({schema}) {
      current = schema
      for (const type of Object.values(schema.getTypeMap())) {
        if (!isAbstractType(type)) continue
        const generated = type.resolveType
        type.resolveType = (value, context, info, abstract) => {
          const name = (value as {__typename?: unknown} | null)?.__typename
          if (typeof name === 'string') return name
          return generated?.(value, context, info, abstract)
        }
      }
    },
    onParse() {
      return ({result, replaceParseResult}) => {
        if (!current || !result || result instanceof Error) return
        replaceParseResult(withTypename(current, result))
      }
    }
  }
})()

export const config: PylonConfig = {
  plugins: [useTypenameResolution, useAuth({issuer: authIssuer})]
}

// Bun serves the default export directly. On Cloudflare Workers the same
// shape works because app.fetch is a module worker fetch handler.
export default {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  fetch: app.fetch
}
