// src/application/types.ts
import type {Node, ApplicationState} from '../relay/types'

/**
 * Application node interface
 */
export interface ApplicationNode extends Node {
  name: string
  state: ApplicationState
  projectId: string
  creationDate: string
  changeDate: string
}

/**
 * ApplicationKey node interface
 */
export interface ApplicationKeyNode extends Node {
  applicationId: string
  keyType: string
  expirationDate: string
  creationDate: string
}

/**
 * OIDC Application Config
 */
export interface OIDCConfigNode {
  redirectUris: string[]
  postLogoutRedirectUris: string[]
  responseTypes: string[]
  grantTypes: string[]
  appType: string
  authMethodType: string
  clientId: string
  accessTokenType: string
  accessTokenRoleAssertion: boolean
  idTokenRoleAssertion: boolean
  idTokenUserinfoAssertion: boolean
  clockSkew: string
  additionalOrigins: string[]
  skipNativeAppSuccessPage: boolean
}

/**
 * API Application Config
 */
export interface APIConfigNode {
  clientId: string
  authMethodType: string
}

/**
 * SAML Application Config
 */
export interface SAMLConfigNode {
  metadataXml: string
  entityId: string
}
