// src/authorization/services.ts
import {create} from '@bufbuild/protobuf'
import {requireAuth} from '@getcronit/pylon'
import {getZitadelClients, createCallOptions} from '../zitadel/client'
import {tsToIso} from '../zitadel/users'
import {Authorization, AuthorizationConnection, AuthorizationEdge} from './Authorization'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor} from '../relay/relay'
import type {RelayArgs} from '../relay/types'
import {AuthorizationState} from './types'
import {ListAuthorizationsRequestSchema} from '@zitadel/proto/zitadel/authorization/v2/authorization_service_pb'
import {AuthorizationsSearchFilterSchema, State as ProtoState} from '@zitadel/proto/zitadel/authorization/v2/authorization_pb'
import type {Authorization as ProtoAuthorization} from '@zitadel/proto/zitadel/authorization/v2/authorization_pb'
import {PaginationRequestSchema, InIDsFilterSchema} from '@zitadel/proto/zitadel/filter/v2/filter_pb'

/**
 * Maps a proto Authorization to the entity class. At v4 the proto carries
 * full Role objects, the GraphQL surface keeps the flat roleKeys list.
 */
function mapProtoToAuthorization(proto: ProtoAuthorization): Authorization {
  return new Authorization({
    id: proto.id,
    userId: proto.user?.id ?? '',
    userName: proto.user?.preferredLoginName || undefined,
    userDisplayName: proto.user?.displayName || undefined,
    organizationId: proto.organization?.id ?? '',
    organizationName: proto.organization?.name || undefined,
    projectId: proto.project?.id ?? '',
    projectName: proto.project?.name,
    roleKeys: (proto.roles ?? []).map(r => r.key),
    state: mapAuthorizationState(proto.state),
    creationDate: tsToIso(proto.creationDate),
    changeDate: tsToIso(proto.changeDate)
  })
}

function mapAuthorizationState(protoState: number): AuthorizationState {
  switch (protoState) {
    case ProtoState.ACTIVE:
      return AuthorizationState.AUTHORIZATION_STATE_ACTIVE
    case ProtoState.INACTIVE:
      return AuthorizationState.AUTHORIZATION_STATE_INACTIVE
    default:
      return AuthorizationState.AUTHORIZATION_STATE_UNSPECIFIED
  }
}

/**
 * Authorization services using the authorization/v2 Connect client.
 */
export class AuthorizationServices {
  /**
   * Get authorization by ID via the authorizationIds filter.
   */
  @requireAuth()
  static async getById(id: string): Promise<Authorization | null> {
    try {
      const clients = getZitadelClients()

      const request = create(ListAuthorizationsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit: 1, asc: true}),
        filters: [
          create(AuthorizationsSearchFilterSchema, {
            filter: {
              case: 'authorizationIds',
              value: create(InIDsFilterSchema, {ids: [id]})
            }
          })
        ]
      })

      const response = await clients.auth.listAuthorizations(request, createCallOptions())
      const found = response.authorizations?.find(a => a.id === id) ?? response.authorizations?.[0]

      if (!found) {
        return null
      }

      return mapProtoToAuthorization(found)
    } catch (error) {
      console.error('Failed to get authorization by ID:', id, error)
      return null
    }
  }

  /**
   * List all authorizations as Relay connection.
   */
  @requireAuth()
  static async list(args?: RelayArgs): Promise<AuthorizationConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListAuthorizationsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })

      const response = await clients.auth.listAuthorizations(request, createCallOptions())
      const items = (response.authorizations ?? []).map(mapProtoToAuthorization)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new AuthorizationEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new AuthorizationConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list authorizations:', error)
      return new AuthorizationConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * List authorizations for a user as Relay connection.
   */
  static async listByUser(userId: string, args?: RelayArgs): Promise<AuthorizationConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListAuthorizationsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit, asc: true}),
        filters: [
          create(AuthorizationsSearchFilterSchema, {
            filter: {
              case: 'inUserIds',
              value: create(InIDsFilterSchema, {ids: [userId]})
            }
          })
        ]
      })

      const response = await clients.auth.listAuthorizations(request, createCallOptions())
      const items = (response.authorizations ?? []).map(mapProtoToAuthorization)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new AuthorizationEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new AuthorizationConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list authorizations for user:', userId, error)
      return new AuthorizationConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }
}
