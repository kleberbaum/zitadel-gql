// src/group/Group.ts
import type {ID} from '../types'
import type {GroupNode, GroupUserNode, GroupGrantNode} from './types'
import type {RelayArgs} from '../relay/types'
import {PageInfo} from '../relay/PageInfo'

/**
 * A group from Zitadel `group/v2`.
 *
 * Related entities are lazy: `members` and `grants` are separate RPCs, so
 * asking for a group costs one call and only a query that selects them pays
 * for them.
 */
export class Group implements GroupNode {
  public id: ID
  public name: string
  public description?: string
  public organizationId: string
  public userCount: number
  public creationDate: string
  public changeDate: string

  constructor(base: {
    id: string
    name: string
    description?: string
    organizationId: string
    userCount?: number
    creationDate?: string
    changeDate?: string
  }) {
    this.id = base.id
    this.name = base.name
    this.description = base.description || undefined
    this.organizationId = base.organizationId
    this.userCount = base.userCount ?? 0
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''
  }

  /**
   * Members of this group as a Relay connection.
   */
  async members(args?: RelayArgs): Promise<GroupUserConnection> {
    // Lazy import to avoid a circular dependency, same as the other areas.
    const {GroupServices} = await import('./services')
    return GroupServices.listMembers(String(this.id), args)
  }

  /**
   * Project role grants held by this group.
   */
  async grants(args?: RelayArgs): Promise<GroupGrantConnection> {
    const {GroupServices} = await import('./services')
    return GroupServices.listGrants(String(this.id), args)
  }
}

/**
 * A user's membership in a group.
 */
export class GroupUser implements GroupUserNode {
  public id: ID
  public groupId: string
  public groupName: string
  public organizationId: string
  public userId: string
  public preferredLoginName?: string
  public displayName?: string
  public avatarUrl?: string
  public creationDate: string

  constructor(base: {
    groupId: string
    groupName: string
    organizationId: string
    userId: string
    preferredLoginName?: string
    displayName?: string
    avatarUrl?: string
    creationDate?: string
  }) {
    // A membership has no id of its own in the proto, so the pair identifies
    // it. Relay wants a stable id and this one is stable and meaningful.
    this.id = `${base.groupId}:${base.userId}`
    this.groupId = base.groupId
    this.groupName = base.groupName
    this.organizationId = base.organizationId
    this.userId = base.userId
    this.preferredLoginName = base.preferredLoginName || undefined
    this.displayName = base.displayName || undefined
    this.avatarUrl = base.avatarUrl || undefined
    this.creationDate = base.creationDate ?? ''
  }

  /**
   * The full user behind this membership.
   */
  async user() {
    const {UserServices} = await import('../user')
    return UserServices.user({id: this.userId, organizationId: this.organizationId})
  }
}

/**
 * A grant of project roles to a group.
 */
export class GroupGrant implements GroupGrantNode {
  public id: ID
  public groupId: string
  public groupName: string
  public organizationId: string
  public projectId: string
  public projectGrantId?: string
  public roleKeys: string[]
  public creationDate: string
  public changeDate: string

  constructor(base: {
    id: string
    groupId: string
    groupName: string
    organizationId: string
    projectId: string
    projectGrantId?: string
    roleKeys?: string[]
    creationDate?: string
    changeDate?: string
  }) {
    this.id = base.id
    this.groupId = base.groupId
    this.groupName = base.groupName
    this.organizationId = base.organizationId
    this.projectId = base.projectId
    this.projectGrantId = base.projectGrantId || undefined
    this.roleKeys = base.roleKeys ?? []
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''
  }
}

export class GroupEdge {
  cursor: string
  node: Group

  constructor(args: {cursor: string; node: Group}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

export class GroupConnection {
  edges: GroupEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: GroupEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}

export class GroupUserEdge {
  cursor: string
  node: GroupUser

  constructor(args: {cursor: string; node: GroupUser}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

export class GroupUserConnection {
  edges: GroupUserEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: GroupUserEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}

export class GroupGrantEdge {
  cursor: string
  node: GroupGrant

  constructor(args: {cursor: string; node: GroupGrant}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

export class GroupGrantConnection {
  edges: GroupGrantEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: GroupGrantEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
