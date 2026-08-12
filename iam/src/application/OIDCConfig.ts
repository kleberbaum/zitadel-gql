// src/application/OIDCConfig.ts
import type {OIDCConfigNode} from './types'

/**
 * OIDC application configuration.
 */
export class OIDCConfig implements OIDCConfigNode {
  public redirectUris: string[]
  public postLogoutRedirectUris: string[]
  public responseTypes: string[]
  public grantTypes: string[]
  public appType: string
  public authMethodType: string
  public clientId: string
  public accessTokenType: string
  public accessTokenRoleAssertion: boolean
  public idTokenRoleAssertion: boolean
  public idTokenUserinfoAssertion: boolean
  public clockSkew: string
  public additionalOrigins: string[]
  public skipNativeAppSuccessPage: boolean

  constructor(base: {
    redirectUris?: string[]
    postLogoutRedirectUris?: string[]
    responseTypes?: string[]
    grantTypes?: string[]
    appType?: string
    authMethodType?: string
    clientId?: string
    accessTokenType?: string
    accessTokenRoleAssertion?: boolean
    idTokenRoleAssertion?: boolean
    idTokenUserinfoAssertion?: boolean
    clockSkew?: string
    additionalOrigins?: string[]
    skipNativeAppSuccessPage?: boolean
  }) {
    this.redirectUris = base.redirectUris ?? []
    this.postLogoutRedirectUris = base.postLogoutRedirectUris ?? []
    this.responseTypes = base.responseTypes ?? []
    this.grantTypes = base.grantTypes ?? []
    this.appType = base.appType ?? ''
    this.authMethodType = base.authMethodType ?? ''
    this.clientId = base.clientId ?? ''
    this.accessTokenType = base.accessTokenType ?? ''
    this.accessTokenRoleAssertion = base.accessTokenRoleAssertion ?? false
    this.idTokenRoleAssertion = base.idTokenRoleAssertion ?? false
    this.idTokenUserinfoAssertion = base.idTokenUserinfoAssertion ?? false
    this.clockSkew = base.clockSkew ?? '0s'
    this.additionalOrigins = base.additionalOrigins ?? []
    this.skipNativeAppSuccessPage = base.skipNativeAppSuccessPage ?? false
  }
}
