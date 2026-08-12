// src/idp/types.ts
import type {Node} from '../relay/types'

/**
 * IDP state
 */
export enum IDPState {
  IDP_STATE_UNSPECIFIED = 'IDP_STATE_UNSPECIFIED',
  IDP_STATE_ACTIVE = 'IDP_STATE_ACTIVE',
  IDP_STATE_INACTIVE = 'IDP_STATE_INACTIVE'
}

/**
 * IDP type
 */
export enum IDPType {
  IDP_TYPE_UNSPECIFIED = 'IDP_TYPE_UNSPECIFIED',
  IDP_TYPE_OIDC = 'IDP_TYPE_OIDC',
  IDP_TYPE_JWT = 'IDP_TYPE_JWT',
  IDP_TYPE_LDAP = 'IDP_TYPE_LDAP',
  IDP_TYPE_OAUTH = 'IDP_TYPE_OAUTH',
  IDP_TYPE_AZURE_AD = 'IDP_TYPE_AZURE_AD',
  IDP_TYPE_GITHUB = 'IDP_TYPE_GITHUB',
  IDP_TYPE_GITHUB_ES = 'IDP_TYPE_GITHUB_ES',
  IDP_TYPE_GITLAB = 'IDP_TYPE_GITLAB',
  IDP_TYPE_GITLAB_SELF_HOSTED = 'IDP_TYPE_GITLAB_SELF_HOSTED',
  IDP_TYPE_GOOGLE = 'IDP_TYPE_GOOGLE',
  IDP_TYPE_APPLE = 'IDP_TYPE_APPLE',
  IDP_TYPE_SAML = 'IDP_TYPE_SAML'
}

/**
 * IDP node interface
 */
export interface IDPNode extends Node {
  name: string
  type: IDPType
  state: IDPState
  organizationId?: string
  creationDate: string
  changeDate: string
}

/**
 * IDP Link node interface (link between user and external IDP)
 */
export interface IDPLinkNode extends Node {
  userId: string
  idpId: string
  idpName: string
  providedUserId: string
  providedUserName: string
}
