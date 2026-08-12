// src/project/ProjectRole.ts
import type {ID} from '../types'
import type {ProjectRoleNode} from './types'
import {PageInfo} from '../relay/PageInfo'

/**
 * Represents a role within a project.
 */
export class ProjectRole implements ProjectRoleNode {
  public id: ID
  public projectId: string
  public key: string
  public displayName: string
  public group: string

  constructor(base: {projectId: string; key: string; displayName?: string; group?: string}) {
    this.projectId = base.projectId
    this.key = base.key
    this.displayName = base.displayName ?? base.key
    this.group = base.group ?? ''

    // Synthesize ID from project + key
    this.id = `projectRole:${base.projectId}:${base.key}`
  }
}

/**
 * Edge for ProjectRole in Relay connection
 */
export class ProjectRoleEdge {
  cursor: string
  node: ProjectRole

  constructor(args: {cursor: string; node: ProjectRole}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for ProjectRole entities
 */
export class ProjectRoleConnection {
  edges: ProjectRoleEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: ProjectRoleEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
