// src/idp/IDP.ts
import type {ID} from '../types'
import type {IDPNode} from './types'
import {IDPState, IDPType} from './types'
import {PageInfo} from '../relay/PageInfo'

/**
 * Represents an Identity Provider from Zitadel.
 */
export class IDP implements IDPNode {
  public id: ID
  public name: string
  public type: IDPType
  public state: IDPState
  public organizationId?: string
  public creationDate: string
  public changeDate: string

  constructor(base: {
    id: string
    name: string
    type?: IDPType | string
    state?: IDPState | string
    organizationId?: string
    creationDate?: string
    changeDate?: string
  }) {
    this.id = base.id
    this.name = base.name
    this.organizationId = base.organizationId
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''

    // Normalize type
    if (typeof base.type === 'string') {
      const t = base.type.toUpperCase()
      if (t.includes('OIDC')) {
        this.type = IDPType.IDP_TYPE_OIDC
      } else if (t.includes('GOOGLE')) {
        this.type = IDPType.IDP_TYPE_GOOGLE
      } else if (t.includes('GITHUB')) {
        this.type = t.includes('ES') ? IDPType.IDP_TYPE_GITHUB_ES : IDPType.IDP_TYPE_GITHUB
      } else if (t.includes('GITLAB')) {
        this.type = t.includes('SELF') ? IDPType.IDP_TYPE_GITLAB_SELF_HOSTED : IDPType.IDP_TYPE_GITLAB
      } else if (t.includes('AZURE')) {
        this.type = IDPType.IDP_TYPE_AZURE_AD
      } else if (t.includes('APPLE')) {
        this.type = IDPType.IDP_TYPE_APPLE
      } else if (t.includes('SAML')) {
        this.type = IDPType.IDP_TYPE_SAML
      } else if (t.includes('LDAP')) {
        this.type = IDPType.IDP_TYPE_LDAP
      } else if (t.includes('JWT')) {
        this.type = IDPType.IDP_TYPE_JWT
      } else if (t.includes('OAUTH')) {
        this.type = IDPType.IDP_TYPE_OAUTH
      } else {
        this.type = IDPType.IDP_TYPE_UNSPECIFIED
      }
    } else {
      this.type = base.type ?? IDPType.IDP_TYPE_UNSPECIFIED
    }

    // Normalize state
    if (typeof base.state === 'string') {
      const s = base.state.toUpperCase()
      if (s.includes('ACTIVE') && !s.includes('INACTIVE')) {
        this.state = IDPState.IDP_STATE_ACTIVE
      } else if (s.includes('INACTIVE')) {
        this.state = IDPState.IDP_STATE_INACTIVE
      } else {
        this.state = IDPState.IDP_STATE_UNSPECIFIED
      }
    } else {
      this.state = base.state ?? IDPState.IDP_STATE_UNSPECIFIED
    }
  }
}

/**
 * Edge for IDP in Relay connection
 */
export class IDPEdge {
  cursor: string
  node: IDP

  constructor(args: {cursor: string; node: IDP}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for IDP entities
 */
export class IDPConnection {
  edges: IDPEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: IDPEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
