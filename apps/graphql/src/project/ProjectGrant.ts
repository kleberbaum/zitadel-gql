// src/project/ProjectGrant.ts
import type {ID} from '../types'
import type {ProjectGrantNode} from './types'
import {ProjectState} from '../relay/types'
import {PageInfo} from '../relay/PageInfo'
import type {Project} from './Project'
import type {Organization} from '../organization/Organization'

/**
 * Represents a grant of a project to an organization.
 */
export class ProjectGrant implements ProjectGrantNode {
  public id: ID
  public projectId: string
  public grantedOrgId: string
  public grantedOrgName?: string
  public state: ProjectState
  public roleKeys: string[]
  public creationDate: string
  public changeDate: string

  constructor(base: {
    id: string
    projectId: string
    grantedOrgId: string
    grantedOrgName?: string
    state?: ProjectState | string
    roleKeys?: string[]
    creationDate?: string
    changeDate?: string
  }) {
    this.id = base.id
    this.projectId = base.projectId
    this.grantedOrgId = base.grantedOrgId
    this.grantedOrgName = base.grantedOrgName
    this.roleKeys = base.roleKeys ?? []
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''

    // Normalize state
    if (typeof base.state === 'string') {
      const s = base.state.toUpperCase()
      if (s.includes('ACTIVE') && !s.includes('INACTIVE')) {
        this.state = ProjectState.PROJECT_STATE_ACTIVE
      } else if (s.includes('INACTIVE')) {
        this.state = ProjectState.PROJECT_STATE_INACTIVE
      } else {
        this.state = ProjectState.PROJECT_STATE_UNSPECIFIED
      }
    } else {
      this.state = base.state ?? ProjectState.PROJECT_STATE_UNSPECIFIED
    }
  }

  /**
   * Backlink: Resolves the project that this grant belongs to.
   */
  project = async (): Promise<Project | null> => {
    // Lazy import to avoid circular dependency
    const {ProjectServices} = await import('./services')
    return ProjectServices.getById(this.projectId)
  }

  /**
   * Backlink: Resolves the organization that received this grant.
   */
  grantedOrg = async (): Promise<Organization | null> => {
    // Lazy import to avoid circular dependency
    const {OrganizationServices} = await import('../organization/services')
    return OrganizationServices.getById(this.grantedOrgId)
  }
}

/**
 * Edge for ProjectGrant in Relay connection
 */
export class ProjectGrantEdge {
  cursor: string
  node: ProjectGrant

  constructor(args: {cursor: string; node: ProjectGrant}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for ProjectGrant entities
 */
export class ProjectGrantConnection {
  edges: ProjectGrantEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: ProjectGrantEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
