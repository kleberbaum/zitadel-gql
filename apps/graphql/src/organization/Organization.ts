// src/organization/Organization.ts
import type {ID} from '../types'
import type {OrganizationNode} from './types'
import type {RelayArgs} from '../relay/types'
import {OrgState} from '../relay/types'
import type {DomainConnection} from './Domain'
import {PageInfo} from '../relay/PageInfo'
import type {ProjectConnection} from '../project/Project'
import type {UserConnection} from '../user/User'
import type {ApplicationConnection} from '../application/Application'

/**
 * Represents an organization from Zitadel.
 * Implements Relay Node interface and lazy-loads related entities.
 */
export class Organization implements OrganizationNode {
  public id: ID
  public name: string
  public state: OrgState
  public primaryDomain?: string
  public creationDate: string
  public changeDate: string

  constructor(base: {
    id: string
    name: string
    state?: OrgState | string
    primaryDomain?: string
    creationDate?: string
    changeDate?: string
  }) {
    this.id = base.id
    this.name = base.name
    this.primaryDomain = base.primaryDomain
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''

    // Normalize state
    if (typeof base.state === 'string') {
      const s = base.state.toUpperCase()
      if (s.includes('ACTIVE') && !s.includes('INACTIVE')) {
        this.state = OrgState.ORG_STATE_ACTIVE
      } else if (s.includes('INACTIVE')) {
        this.state = OrgState.ORG_STATE_INACTIVE
      } else {
        this.state = OrgState.ORG_STATE_UNSPECIFIED
      }
    } else {
      this.state = base.state ?? OrgState.ORG_STATE_UNSPECIFIED
    }
  }

  /**
   * Resolves domains as a Relay connection via org/v2 ListOrganizationDomains.
   */
  domains = async (args?: RelayArgs): Promise<DomainConnection> => {
    // Lazy import to avoid circular dependency
    const {OrganizationServices} = await import('./services')
    return OrganizationServices.getDomains(String(this.id), args)
  }

  /**
   * Reverse connection: Resolves projects in this organization.
   */
  projects = async (args?: RelayArgs): Promise<ProjectConnection> => {
    // Lazy import to avoid circular dependency
    const {ProjectServices} = await import('../project/services')
    return ProjectServices.listByOrg(String(this.id), args)
  }

  /**
   * Reverse connection: Resolves users in this organization.
   */
  users = async (args?: RelayArgs): Promise<UserConnection> => {
    // Lazy import to avoid circular dependency
    const {UserServices} = await import('../user')
    return UserServices.listByOrg(String(this.id), args)
  }

  /**
   * Reverse connection: Resolves applications in this organization.
   */
  applications = async (args?: RelayArgs): Promise<ApplicationConnection> => {
    // Lazy import to avoid circular dependency
    const {ApplicationServices} = await import('../application/services')
    return ApplicationServices.listByOrg(String(this.id), args)
  }
}

/**
 * Edge for Organization in Relay connection
 */
export class OrganizationEdge {
  cursor: string
  node: Organization

  constructor(args: {cursor: string; node: Organization}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for Organization entities
 */
export class OrganizationConnection {
  edges: OrganizationEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: OrganizationEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
