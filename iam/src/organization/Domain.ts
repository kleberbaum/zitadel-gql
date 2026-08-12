// src/organization/Domain.ts
import type {ID} from '../types'
import type {DomainNode} from './types'
import {DomainValidationType} from '../relay/types'
import {PageInfo} from '../relay/PageInfo'

/**
 * Represents a domain associated with an organization.
 */
export class Domain implements DomainNode {
  public id: ID
  public domain: string
  public isVerified: boolean
  public isPrimary: boolean
  public validationType: DomainValidationType
  public organizationId: string

  constructor(base: {
    id?: string
    domain: string
    isVerified?: boolean
    isPrimary?: boolean
    validationType?: DomainValidationType | string
    organizationId: string
  }) {
    this.domain = base.domain
    this.organizationId = base.organizationId
    this.isVerified = base.isVerified ?? false
    this.isPrimary = base.isPrimary ?? false

    // Normalize validation type
    if (typeof base.validationType === 'string') {
      this.validationType = base.validationType.includes('HTTP')
        ? DomainValidationType.DOMAIN_VALIDATION_TYPE_HTTP
        : base.validationType.includes('DNS')
          ? DomainValidationType.DOMAIN_VALIDATION_TYPE_DNS
          : DomainValidationType.DOMAIN_VALIDATION_TYPE_UNSPECIFIED
    } else {
      this.validationType = base.validationType ?? DomainValidationType.DOMAIN_VALIDATION_TYPE_UNSPECIFIED
    }

    // Synthesize ID from domain + org
    this.id = base.id ?? `domain:${base.organizationId}:${base.domain}`
  }
}

/**
 * Edge for Domain in Relay connection
 */
export class DomainEdge {
  cursor: string
  node: Domain

  constructor(args: {cursor: string; node: Domain}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for Domain entities
 */
export class DomainConnection {
  edges: DomainEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: DomainEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
