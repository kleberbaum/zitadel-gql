// src/user/Grant.ts
import type {ID} from '../types'
import type {ZitadelUserGrant} from '../zitadel/types'
import type {GrantNode} from './types'
import {PageInfo} from '../relay/PageInfo'
import type {Organization} from '../organization/Organization'
import type {Project} from '../project/Project'

/**
 * Represents one grant assignment returned by Zitadel.
 * The id is synthesized from stable fields so this can be used like a Relay node.
 */
export class Grant implements GrantNode {
  id: ID

  organizationId?: string
  creationDate?: string
  changeDate?: string
  projectId?: string
  projectName?: string
  state?: string

  constructor(g: ZitadelUserGrant) {
    this.organizationId = g.organizationId
    this.creationDate = g.creationDate
    this.changeDate = g.changeDate
    this.projectId = g.projectId
    this.projectName = g.projectName
    this.state = g.state

    const oid = String(g.organizationId ?? '')
    const pid = String(g.projectId ?? '')
    const name = String(g.projectName ?? '')
    this.id = `grant:${oid}:${pid}:${name}`
  }

  /**
   * Backlink: Resolves the organization this grant belongs to.
   */
  organization = async (): Promise<Organization | null> => {
    if (!this.organizationId) return null
    // Lazy import to avoid circular dependency
    const {OrganizationServices} = await import('../organization/services')
    return OrganizationServices.getById(this.organizationId)
  }

  /**
   * Backlink: Resolves the project this grant is for.
   */
  project = async (): Promise<Project | null> => {
    if (!this.projectId) return null
    // Lazy import to avoid circular dependency
    const {ProjectServices} = await import('../project/services')
    return ProjectServices.getById(this.projectId)
  }
}

/**
 * Holds a grant node together with a pagination cursor.
 */
export class GrantEdge {
  cursor: string
  node: Grant

  constructor(args: {cursor: string; node: Grant}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Wraps grant edges plus pagination state.
 */
export class GrantConnection {
  edges: GrantEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: GrantEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
