// src/project/Project.ts
import type {ID} from '../types'
import type {ProjectNode} from './types'
import type {RelayArgs} from '../relay/types'
import {ProjectState} from '../relay/types'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor, paginateWindow} from '../relay/relay'
import type {ProjectRoleConnection} from './ProjectRole'
import {ProjectGrant, ProjectGrantConnection, ProjectGrantEdge} from './ProjectGrant'
import type {Organization} from '../organization/Organization'
import type {ApplicationConnection} from '../application/Application'

/**
 * Represents a project from Zitadel.
 * Projects group applications and define roles.
 */
export class Project implements ProjectNode {
  public id: ID
  public name: string
  public state: ProjectState
  public organizationId: string
  public projectRoleAssertion: boolean
  public projectRoleCheck: boolean
  public hasProjectCheck: boolean
  public privateLabelingSetting: string
  public creationDate: string
  public changeDate: string

  constructor(base: {
    id: string
    name: string
    state?: ProjectState | string
    organizationId: string
    projectRoleAssertion?: boolean
    projectRoleCheck?: boolean
    hasProjectCheck?: boolean
    privateLabelingSetting?: string
    creationDate?: string
    changeDate?: string
  }) {
    this.id = base.id
    this.name = base.name
    this.organizationId = base.organizationId
    this.projectRoleAssertion = base.projectRoleAssertion ?? false
    this.projectRoleCheck = base.projectRoleCheck ?? false
    this.hasProjectCheck = base.hasProjectCheck ?? false
    this.privateLabelingSetting = base.privateLabelingSetting ?? ''
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
   * Resolves project roles as a Relay connection via project/v2 ListProjectRoles.
   */
  async roles(args?: RelayArgs): Promise<ProjectRoleConnection> {
    // Lazy import to avoid circular dependency
    const {ProjectServices} = await import('./services')
    return ProjectServices.getRoles(String(this.id), args)
  }

  /**
   * Resolves project grants as a Relay connection.
   * Not wired to the API, kept for schema compatibility with the old facade.
   */
  async grants(args?: RelayArgs): Promise<ProjectGrantConnection> {
    const items: ProjectGrant[] = []

    const {start, end, hasNextPage, hasPreviousPage} = paginateWindow({
      totalCount: items.length,
      first: args?.first ?? null,
      after: args?.after ?? null,
      last: args?.last ?? null,
      before: args?.before ?? null
    })

    const sliced = items.slice(start, end)
    const edges = sliced.map((n, i) => new ProjectGrantEdge({node: n, cursor: encodeCursor(start + i)}))

    const pageInfo = new PageInfo({
      hasNextPage,
      hasPreviousPage,
      startCursor: edges[0]?.cursor,
      endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
    })

    return new ProjectGrantConnection({edges, pageInfo, totalCount: items.length})
  }

  /**
   * Backlink: Resolves the organization that owns this project.
   */
  async organization(): Promise<Organization | null> {
    // Lazy import to avoid circular dependency
    const {OrganizationServices} = await import('../organization/services')
    return OrganizationServices.getById(this.organizationId)
  }

  /**
   * Backlink: Resolves applications in this project as Relay connection.
   */
  async applications(args?: RelayArgs): Promise<ApplicationConnection> {
    // Lazy import to avoid circular dependency
    const {ApplicationServices} = await import('../application/services')
    return ApplicationServices.listByProject(String(this.id), args)
  }
}

/**
 * Edge for Project in Relay connection
 */
export class ProjectEdge {
  cursor: string
  node: Project

  constructor(args: {cursor: string; node: Project}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for Project entities
 */
export class ProjectConnection {
  edges: ProjectEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: ProjectEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
