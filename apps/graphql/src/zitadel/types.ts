// src/zitadel/types.ts
// Input and intermediate shapes shared between the data layer and resolvers.

export interface ZitadelProjectRole {
  key: string
  displayName?: string
}

/**
 * A link of a user to an external identity provider, as user/v2 IDPLink
 * carries it: the provider, and the user's id and name at that provider.
 */
export interface ZitadelIDPLink {
  idpId: string
  userId: string
  userName: string
}

/**
 * A deferred read of one user's grants. A list hands one to every node of a
 * page so the page's grants cost one Zitadel call, made only when a query
 * asks for roles or grants, and shared by all nodes of that page.
 */
export type GrantsLoader = () => Promise<ZitadelUserGrant[]>

export interface ZitadelUserGrant {
  /**
   * The user the authorization belongs to. Set when the grant came out of a
   * list that covered several users at once, so it can be handed to the
   * right user without a second lookup.
   */
  userId?: string
  organizationId?: string
  creationDate?: string
  changeDate?: string
  projectId?: string
  projectName?: string
  state?: string
  roles: ZitadelProjectRole[]
}

export type ZitadelUserUpdateInput = {
  username?: string
  profile?: {
    givenName?: string
    familyName?: string
    displayName?: string
    preferredLanguage?: string
    nickName?: string
    /**
     * One of GENDER_UNSPECIFIED, GENDER_FEMALE, GENDER_MALE, GENDER_DIVERSE.
     * Taken as the enum name rather than the numeric proto value so callers
     * never have to know Zitadel's wire encoding.
     */
    gender?: string
  }
  email?: {
    email: string
  }
  phone?: {
    phone: string
  }
  password?: {
    password: string
    changeRequired?: boolean
  }
}

export type ZitadelUserCreateInput = {
  emailAddress: string
  username: string
  password?: string
  hashedPassword?: string
  details?: {firstName?: string; lastName?: string}
}

export type ZitadelAuthorizationCreateInput = {
  userId: string
  projectId?: string
  projectGrantId?: string
  roleKeys: string[]
}

export type ZitadelAuthorizationUpdateInput = {
  authorizationId: string
  roleKeys: string[]
}
