// src/zitadel/types.ts
// Input and intermediate shapes shared between the data layer and resolvers.

export interface ZitadelProjectRole {
  key: string
  displayName?: string
}

export interface ZitadelUserGrant {
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
