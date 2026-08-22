// src/authorization/Authorization.ts
import type {ID} from '../types'
import type {AuthorizationNode} from './types'
import {AuthorizationState} from './types'
import {PageInfo} from '../relay/PageInfo'
import type {Organization} from '../organization/Organization'
import type {Project} from '../project/Project'
import type {UserNode} from '../user/types'

/**
 * Represents a user authorization (grant) from Zitadel.
 * Links a user to a project with specific roles.
 */
export class Authorization implements AuthorizationNode {
  public id: ID
  public userId: string
  public userName?: string
  public userDisplayName?: string
  public organizationId: string
  public organizationName?: string
  public projectId: string
  public projectName?: string
  public roleKeys: string[]
  public state: AuthorizationState
  public creationDate: string
  public changeDate: string

  constructor(base: {
    id: string
    userId: string
    userName?: string
    userDisplayName?: string
    organizationId: string
    organizationName?: string
    projectId: string
    projectName?: string
    roleKeys?: string[]
    state?: AuthorizationState | string
    creationDate?: string
    changeDate?: string
  }) {
    this.id = base.id
    this.userId = base.userId
    this.userName = base.userName
    this.userDisplayName = base.userDisplayName
    this.organizationId = base.organizationId
    this.organizationName = base.organizationName
    this.projectId = base.projectId
    this.projectName = base.projectName
    this.roleKeys = base.roleKeys ?? []
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''

    // Normalize state
    if (typeof base.state === 'string') {
      const s = base.state.toUpperCase()
      if (s.includes('ACTIVE') && !s.includes('INACTIVE')) {
        this.state = AuthorizationState.AUTHORIZATION_STATE_ACTIVE
      } else if (s.includes('INACTIVE')) {
        this.state = AuthorizationState.AUTHORIZATION_STATE_INACTIVE
      } else {
        this.state = AuthorizationState.AUTHORIZATION_STATE_UNSPECIFIED
      }
    } else {
      this.state = base.state ?? AuthorizationState.AUTHORIZATION_STATE_UNSPECIFIED
    }
  }

  /**
   * Backlink: Resolves the user this authorization belongs to.
   */
  user = async (): Promise<UserNode | null> => {
    // Lazy import to avoid circular dependency
    const {UserServices} = await import('../user')
    return UserServices.user({id: this.userId})
  }

  /**
   * Backlink: Resolves the organization this authorization is for.
   */
  organization = async (): Promise<Organization | null> => {
    // Lazy import to avoid circular dependency
    const {OrganizationServices} = await import('../organization/services')
    return OrganizationServices.getById(this.organizationId)
  }

  /**
   * Backlink: Resolves the project this authorization grants access to.
   */
  project = async (): Promise<Project | null> => {
    // Lazy import to avoid circular dependency
    const {ProjectServices} = await import('../project/services')
    return ProjectServices.getById(this.projectId)
  }
}

/**
 * Edge for Authorization in Relay connection
 */
export class AuthorizationEdge {
  cursor: string
  node: Authorization

  constructor(args: {cursor: string; node: Authorization}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for Authorization entities
 */
export class AuthorizationConnection {
  edges: AuthorizationEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: AuthorizationEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
