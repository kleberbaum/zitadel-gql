// src/group/services.ts
//
// The GraphQL area for native Zitadel groups (`zitadel.group.v2.GroupService`).
//
// Groups landed in Zitadel main in stages during late 2025 (PRs #10758,
// #10940, #10945, #11009), so the fork line carries them from upstream rather
// than from a patch of ours. The Connect clients have been generated since
// then, but nothing exposed them: with REST removed from the package, groups
// were reachable only over the internal Connect API. This closes that.
import {create} from '@bufbuild/protobuf'
import {requireAuth} from '../auth'
import {getZitadelClients, createCallOptions} from '../zitadel/client'
import {tsToIso} from '../zitadel/users'
import {
  Group,
  GroupUser,
  GroupGrant,
  GroupConnection,
  GroupEdge,
  GroupUserConnection,
  GroupUserEdge,
  GroupGrantConnection,
  GroupGrantEdge
} from './Group'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor} from '../relay/relay'
import type {RelayArgs} from '../relay/types'
import {
  CreateGroupRequestSchema,
  GetGroupRequestSchema,
  ListGroupsRequestSchema,
  UpdateGroupRequestSchema,
  DeleteGroupRequestSchema,
  AddUsersToGroupRequestSchema,
  RemoveUsersFromGroupRequestSchema,
  ListGroupUsersRequestSchema,
  CreateGroupGrantRequestSchema,
  UpdateGroupGrantRequestSchema,
  DeleteGroupGrantRequestSchema,
  ListGroupGrantsRequestSchema,
  SetGroupManagerRolesRequestSchema
} from '@zitadel/proto/zitadel/group/v2/group_service_pb'
import {
  GroupsSearchFilterSchema,
  GroupUsersSearchFilterSchema,
  GroupGrantsSearchFilterSchema,
  GroupNameFilterSchema
} from '@zitadel/proto/zitadel/group/v2/group_pb'
import type {
  Group as ProtoGroup,
  GroupUser as ProtoGroupUser,
  GroupGrant as ProtoGroupGrant
} from '@zitadel/proto/zitadel/group/v2/group_pb'
import {PaginationRequestSchema, IDFilterSchema} from '@zitadel/proto/zitadel/filter/v2/filter_pb'

const DEFAULT_LIMIT = 100

function mapProtoToGroup(proto: ProtoGroup): Group {
  return new Group({
    id: proto.id,
    name: proto.name,
    description: proto.description,
    organizationId: proto.organizationId,
    // userCount is a bigint on the wire, narrowed for GraphQL Int.
    userCount: Number(proto.userCount ?? BigInt(0)),
    creationDate: tsToIso(proto.creationDate),
    changeDate: tsToIso(proto.changeDate)
  })
}

function mapProtoToGroupUser(proto: ProtoGroupUser): GroupUser {
  return new GroupUser({
    groupId: proto.groupId,
    groupName: proto.groupName,
    organizationId: proto.organizationId,
    userId: proto.user?.id ?? '',
    preferredLoginName: proto.user?.preferredLoginName,
    displayName: proto.user?.displayName,
    avatarUrl: proto.user?.avatarUrl,
    creationDate: tsToIso(proto.creationDate)
  })
}

function mapProtoToGroupGrant(proto: ProtoGroupGrant): GroupGrant {
  return new GroupGrant({
    id: proto.id,
    groupId: proto.groupId,
    groupName: proto.groupName,
    organizationId: proto.organizationId,
    projectId: proto.projectId,
    projectGrantId: proto.projectGrantId,
    roleKeys: proto.roleKeys ?? [],
    creationDate: tsToIso(proto.creationDate),
    changeDate: tsToIso(proto.changeDate)
  })
}

function pagination(args?: RelayArgs) {
  return create(PaginationRequestSchema, {
    limit: args?.first ?? args?.last ?? DEFAULT_LIMIT,
    offset: BigInt(0),
    asc: true
  })
}

/**
 * Builds the PageInfo and cursors for a page.
 *
 * `group/v2` reports its total through PaginationResponse rather than the
 * `details.totalResult` the v1-era services use, so this reads that instead
 * and falls back to the page size when the server omits it.
 */
function pageInfoFor(count: number, totalCount: number, edges: Array<{cursor: string}>) {
  return new PageInfo({
    hasNextPage: count < totalCount,
    hasPreviousPage: false,
    startCursor: edges[0]?.cursor,
    endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
  })
}

function totalFrom(response: any, fallback: number): number {
  const total = response?.pagination?.totalResult
  return total === undefined || total === null ? fallback : Number(total)
}

/**
 * Group services over the group/v2 Connect client.
 *
 * Every call runs with the caller's forwarded token (see
 * `createCallOptions`), so Zitadel applies the same permissions it would to a
 * direct API call. The facade grants nothing of its own.
 */
export class GroupServices {
  /**
   * A single group by ID, or null when it does not exist.
   */
  @requireAuth()
  static async getById(id: string): Promise<Group | null> {
    try {
      const clients = getZitadelClients()
      const response = await clients.groups.getGroup(
        create(GetGroupRequestSchema, {id}),
        createCallOptions()
      )
      return response.group ? mapProtoToGroup(response.group) : null
    } catch (error) {
      console.error('Failed to get group by ID:', id, error)
      return null
    }
  }

  /**
   * Groups as a Relay connection, optionally narrowed to one organization or
   * filtered by name.
   */
  @requireAuth()
  static async list(
    args?: RelayArgs & {organizationId?: string; name?: string}
  ): Promise<GroupConnection> {
    try {
      const clients = getZitadelClients()
      const filters: any[] = []

      if (args?.organizationId) {
        filters.push(
          create(GroupsSearchFilterSchema, {
            filter: {
              case: 'organizationId',
              value: create(IDFilterSchema, {id: args.organizationId})
            }
          })
        )
      }
      if (args?.name) {
        filters.push(
          create(GroupsSearchFilterSchema, {
            filter: {
              case: 'nameFilter',
              value: create(GroupNameFilterSchema, {name: args.name})
            }
          })
        )
      }

      const response = await clients.groups.listGroups(
        create(ListGroupsRequestSchema, {filters, pagination: pagination(args)}),
        createCallOptions()
      )

      const items = (response.groups ?? []).map(mapProtoToGroup)
      const totalCount = totalFrom(response, items.length)
      const edges = items.map((node, i) => new GroupEdge({node, cursor: encodeCursor(i)}))

      return new GroupConnection({
        edges,
        pageInfo: pageInfoFor(items.length, totalCount, edges),
        totalCount
      })
    } catch (error) {
      console.error('Failed to list groups:', error)
      return new GroupConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * Members of a group as a Relay connection.
   */
  @requireAuth()
  static async listMembers(groupId: string, args?: RelayArgs): Promise<GroupUserConnection> {
    try {
      const clients = getZitadelClients()
      const response = await clients.groups.listGroupUsers(
        create(ListGroupUsersRequestSchema, {
          filters: [
            create(GroupUsersSearchFilterSchema, {
              filter: {case: 'groupIds', value: {ids: [groupId]}}
            })
          ],
          pagination: pagination(args)
        }),
        createCallOptions()
      )

      const items = (response.groupUsers ?? []).map(mapProtoToGroupUser)
      const totalCount = totalFrom(response, items.length)
      const edges = items.map((node, i) => new GroupUserEdge({node, cursor: encodeCursor(i)}))

      return new GroupUserConnection({
        edges,
        pageInfo: pageInfoFor(items.length, totalCount, edges),
        totalCount
      })
    } catch (error) {
      console.error('Failed to list group members:', groupId, error)
      return new GroupUserConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * Every group a user belongs to.
   */
  @requireAuth()
  static async listByUser(userId: string, args?: RelayArgs): Promise<GroupUserConnection> {
    try {
      const clients = getZitadelClients()
      const response = await clients.groups.listGroupUsers(
        create(ListGroupUsersRequestSchema, {
          filters: [
            create(GroupUsersSearchFilterSchema, {
              filter: {case: 'userIds', value: {ids: [userId]}}
            })
          ],
          pagination: pagination(args)
        }),
        createCallOptions()
      )

      const items = (response.groupUsers ?? []).map(mapProtoToGroupUser)
      const totalCount = totalFrom(response, items.length)
      const edges = items.map((node, i) => new GroupUserEdge({node, cursor: encodeCursor(i)}))

      return new GroupUserConnection({
        edges,
        pageInfo: pageInfoFor(items.length, totalCount, edges),
        totalCount
      })
    } catch (error) {
      console.error('Failed to list groups for user:', userId, error)
      return new GroupUserConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * Project role grants held by a group.
   */
  @requireAuth()
  static async listGrants(groupId: string, args?: RelayArgs): Promise<GroupGrantConnection> {
    try {
      const clients = getZitadelClients()
      const response = await clients.groups.listGroupGrants(
        create(ListGroupGrantsRequestSchema, {
          filters: [
            create(GroupGrantsSearchFilterSchema, {
              filter: {case: 'groupIds', value: {ids: [groupId]}}
            })
          ],
          pagination: pagination(args)
        }),
        createCallOptions()
      )

      const items = (response.groupGrants ?? []).map(mapProtoToGroupGrant)
      const totalCount = totalFrom(response, items.length)
      const edges = items.map((node, i) => new GroupGrantEdge({node, cursor: encodeCursor(i)}))

      return new GroupGrantConnection({
        edges,
        pageInfo: pageInfoFor(items.length, totalCount, edges),
        totalCount
      })
    } catch (error) {
      console.error('Failed to list group grants:', groupId, error)
      return new GroupGrantConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  // ---------------------------------------------------------------------
  // Mutations. These throw rather than returning null: a caller that asked
  // to change something needs to know that it did not happen.
  // ---------------------------------------------------------------------

  @requireAuth()
  static async createGroup(args: {
    organizationId: string
    name: string
    description?: string
  }): Promise<Group> {
    const clients = getZitadelClients()
    const response = await clients.groups.createGroup(
      create(CreateGroupRequestSchema, {
        organizationId: args.organizationId,
        name: args.name,
        description: args.description ?? ''
      }),
      createCallOptions(args.organizationId)
    )

    return new Group({
      id: response.id,
      name: args.name,
      description: args.description,
      organizationId: args.organizationId,
      userCount: 0,
      creationDate: tsToIso(response.creationDate),
      changeDate: tsToIso(response.creationDate)
    })
  }

  @requireAuth()
  static async updateGroup(args: {
    id: string
    name?: string
    description?: string
  }): Promise<Group | null> {
    const clients = getZitadelClients()
    await clients.groups.updateGroup(
      create(UpdateGroupRequestSchema, {
        id: args.id,
        name: args.name,
        description: args.description
      }),
      createCallOptions()
    )
    // Re-read so the caller gets the server's view, not an optimistic one.
    return GroupServices.getById(args.id)
  }

  @requireAuth()
  static async deleteGroup(id: string): Promise<boolean> {
    const clients = getZitadelClients()
    await clients.groups.deleteGroup(create(DeleteGroupRequestSchema, {id}), createCallOptions())
    return true
  }

  @requireAuth()
  static async addUsersToGroup(args: {groupId: string; userIds: string[]}): Promise<boolean> {
    const clients = getZitadelClients()
    await clients.groups.addUsersToGroup(
      create(AddUsersToGroupRequestSchema, {id: args.groupId, userIds: args.userIds}),
      createCallOptions()
    )
    return true
  }

  @requireAuth()
  static async removeUsersFromGroup(args: {groupId: string; userIds: string[]}): Promise<boolean> {
    const clients = getZitadelClients()
    await clients.groups.removeUsersFromGroup(
      create(RemoveUsersFromGroupRequestSchema, {id: args.groupId, userIds: args.userIds}),
      createCallOptions()
    )
    return true
  }

  @requireAuth()
  static async createGroupGrant(args: {
    groupId: string
    projectId: string
    projectGrantId?: string
    roleKeys: string[]
  }): Promise<string> {
    const clients = getZitadelClients()
    const response = await clients.groups.createGroupGrant(
      create(CreateGroupGrantRequestSchema, {
        groupId: args.groupId,
        projectId: args.projectId,
        projectGrantId: args.projectGrantId,
        roleKeys: args.roleKeys
      }),
      createCallOptions()
    )
    return response.id
  }

  @requireAuth()
  static async updateGroupGrant(args: {id: string; roleKeys: string[]}): Promise<boolean> {
    const clients = getZitadelClients()
    await clients.groups.updateGroupGrant(
      create(UpdateGroupGrantRequestSchema, {id: args.id, roleKeys: args.roleKeys}),
      createCallOptions()
    )
    return true
  }

  @requireAuth()
  static async deleteGroupGrant(id: string): Promise<boolean> {
    const clients = getZitadelClients()
    await clients.groups.deleteGroupGrant(
      create(DeleteGroupGrantRequestSchema, {id}),
      createCallOptions()
    )
    return true
  }

  @requireAuth()
  static async setGroupManagerRoles(args: {groupId: string; roles: string[]}): Promise<boolean> {
    const clients = getZitadelClients()
    await clients.groups.setGroupManagerRoles(
      create(SetGroupManagerRolesRequestSchema, {groupId: args.groupId, roles: args.roles}),
      createCallOptions()
    )
    return true
  }
}
