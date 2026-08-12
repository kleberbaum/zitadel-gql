// src/index.ts
import {app, useAuth, type PylonConfig} from '@getcronit/pylon'
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
// resolvers keep their @requireAuth() decorators. Auth stays inactive during
// the hermetic `pylon build` because AUTH_ISSUER is not set in the build env.
const authIssuer = process.env.AUTH_ISSUER

export const config: PylonConfig = {
  plugins: authIssuer ? [useAuth({issuer: authIssuer})] : []
}

// Bun serves the default export directly. On Cloudflare Workers the same
// shape works because app.fetch is a module worker fetch handler.
export default {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  fetch: app.fetch
}
