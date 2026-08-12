// src/project/services.ts
import {create} from '@bufbuild/protobuf'
import {requireAuth} from '@getcronit/pylon'
import {getZitadelClients, createCallOptions} from '../zitadel/client'
import {tsToIso} from '../zitadel/users'
import {Project, ProjectConnection, ProjectEdge} from './Project'
import {ProjectRole, ProjectRoleConnection, ProjectRoleEdge} from './ProjectRole'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor} from '../relay/relay'
import type {RelayArgs} from '../relay/types'
import {ProjectState} from '../relay/types'
import {
  GetProjectRequestSchema,
  ListProjectsRequestSchema,
  ListProjectRolesRequestSchema
} from '../proto/zitadel/project/v2/project_service_pb'
import type {Project as ProtoProject, ProjectRole as ProtoProjectRole} from '../proto/zitadel/project/v2/query_pb'
import {ProjectState as ProtoProjectState} from '../proto/zitadel/project/v2/query_pb'
import {PaginationRequestSchema} from '../proto/zitadel/filter/v2/filter_pb'

/**
 * Maps a proto Project to the entity class. The old v2beta fields
 * project_role_check and has_project_check are called authorization_required
 * and project_access_required at v4, the GraphQL field names stay stable.
 */
function mapProtoToProject(proto: ProtoProject): Project {
  return new Project({
    id: proto.projectId,
    name: proto.name,
    organizationId: proto.organizationId,
    state: mapProjectState(proto.state),
    projectRoleAssertion: proto.projectRoleAssertion ?? false,
    projectRoleCheck: proto.authorizationRequired ?? false,
    hasProjectCheck: proto.projectAccessRequired ?? false,
    privateLabelingSetting: String(proto.privateLabelingSetting ?? ''),
    creationDate: tsToIso(proto.creationDate),
    changeDate: tsToIso(proto.changeDate)
  })
}

function mapProjectState(protoState: number): ProjectState {
  switch (protoState) {
    case ProtoProjectState.ACTIVE:
      return ProjectState.PROJECT_STATE_ACTIVE
    case ProtoProjectState.INACTIVE:
      return ProjectState.PROJECT_STATE_INACTIVE
    default:
      return ProjectState.PROJECT_STATE_UNSPECIFIED
  }
}

function mapProtoToProjectRole(proto: ProtoProjectRole, projectId: string): ProjectRole {
  return new ProjectRole({
    key: proto.key,
    displayName: proto.displayName ?? '',
    group: proto.group ?? '',
    projectId
  })
}

/**
 * Project services using the project/v2 Connect client.
 */
export class ProjectServices {
  /**
   * Get project by ID.
   */
  @requireAuth()
  static async getById(id: string): Promise<Project | null> {
    try {
      const clients = getZitadelClients()
      const request = create(GetProjectRequestSchema, {projectId: id})
      const response = await clients.projects.getProject(request, createCallOptions())

      if (!response.project) {
        return null
      }

      return mapProtoToProject(response.project)
    } catch (error) {
      console.error('Failed to get project by ID:', id, error)
      return null
    }
  }

  /**
   * List all projects as Relay connection.
   */
  @requireAuth()
  static async list(args?: RelayArgs): Promise<ProjectConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListProjectsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })

      const response = await clients.projects.listProjects(request, createCallOptions())
      const items = (response.projects ?? []).map(mapProtoToProject)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new ProjectEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new ProjectConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list projects:', error)
      return new ProjectConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * List projects for an organization as Relay connection.
   * The x-zitadel-orgid header scopes the call to the organization.
   */
  static async listByOrg(organizationId: string, args?: RelayArgs): Promise<ProjectConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListProjectsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })

      const response = await clients.projects.listProjects(request, createCallOptions(organizationId))
      const items = (response.projects ?? []).map(mapProtoToProject)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new ProjectEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new ProjectConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list projects for org:', organizationId, error)
      return new ProjectConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * Get roles for a project.
   */
  static async getRoles(projectId: string, args?: RelayArgs): Promise<ProjectRoleConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListProjectRolesRequestSchema, {
        projectId,
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })

      const response = await clients.projects.listProjectRoles(request, createCallOptions())
      const items = (response.projectRoles ?? []).map(r => mapProtoToProjectRole(r, projectId))
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new ProjectRoleEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new ProjectRoleConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to get roles for project:', projectId, error)
      return new ProjectRoleConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }
}
