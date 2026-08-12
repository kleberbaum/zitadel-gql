// src/session/services.ts
import {create} from '@bufbuild/protobuf'
import {requireAuth} from '@getcronit/pylon'
import {getZitadelClients, createCallOptions} from '../zitadel/client'
import {tsToIso} from '../zitadel/users'
import {Session, SessionConnection, SessionEdge} from './Session'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor} from '../relay/relay'
import type {RelayArgs} from '../relay/types'
import {SessionState} from '../relay/types'
import {GetSessionRequestSchema, ListSessionsRequestSchema} from '../proto/zitadel/session/v2/session_service_pb'
import type {Session as ProtoSession} from '../proto/zitadel/session/v2/session_pb'
import {SearchQuerySchema, UserIDQuerySchema} from '../proto/zitadel/session/v2/session_pb'
import {ListQuerySchema} from '../proto/zitadel/object/v2/object_pb'

/**
 * Maps a proto Session to the entity class.
 */
function mapProtoToSession(proto: ProtoSession): Session {
  return new Session({
    id: proto.id,
    userId: proto.factors?.user?.id,
    state: mapSessionState(proto),
    creationDate: tsToIso(proto.creationDate),
    changeDate: tsToIso(proto.changeDate),
    expirationDate: proto.expirationDate ? tsToIso(proto.expirationDate) : undefined,
    metadata: Object.fromEntries(
      Object.entries(proto.metadata ?? {}).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : new TextDecoder().decode(v)
      ])
    ),
    factors: proto.factors
      ? {
          user: proto.factors.user
            ? {
                id: proto.factors.user.id,
                loginName: proto.factors.user.loginName,
                displayName: proto.factors.user.displayName,
                organizationId: proto.factors.user.organizationId,
                verifiedAt: proto.factors.user.verifiedAt ? tsToIso(proto.factors.user.verifiedAt) : undefined
              }
            : undefined,
          password: proto.factors.password
            ? {
                verifiedAt: proto.factors.password.verifiedAt ? tsToIso(proto.factors.password.verifiedAt) : undefined
              }
            : undefined
        }
      : undefined
  })
}

/**
 * Session has no explicit state at v2, derive it from the expiration.
 */
function mapSessionState(proto: ProtoSession): SessionState {
  if (proto.expirationDate) {
    const iso = tsToIso(proto.expirationDate)
    if (iso && new Date(iso) < new Date()) {
      return SessionState.SESSION_STATE_TERMINATED
    }
  }
  return SessionState.SESSION_STATE_ACTIVE
}

/**
 * Session services using the session/v2 Connect client.
 */
export class SessionServices {
  /**
   * Get session by ID.
   */
  @requireAuth()
  static async getById(id: string): Promise<Session | null> {
    try {
      const clients = getZitadelClients()
      const request = create(GetSessionRequestSchema, {sessionId: id})
      const response = await clients.sessions.getSession(request, createCallOptions())

      if (!response.session) {
        return null
      }

      return mapProtoToSession(response.session)
    } catch (error) {
      console.error('Failed to get session by ID:', id, error)
      return null
    }
  }

  /**
   * List all sessions as Relay connection.
   */
  @requireAuth()
  static async list(args?: RelayArgs): Promise<SessionConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListSessionsRequestSchema, {
        query: create(ListQuerySchema, {limit, asc: true})
      })

      const response = await clients.sessions.listSessions(request, createCallOptions())
      const items = (response.sessions ?? []).map(mapProtoToSession)
      const totalCount = Number(response.details?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new SessionEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new SessionConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list sessions:', error)
      return new SessionConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * List sessions for a user as Relay connection.
   */
  static async listByUser(userId: string, args?: RelayArgs): Promise<SessionConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListSessionsRequestSchema, {
        query: create(ListQuerySchema, {limit, asc: true}),
        queries: [
          create(SearchQuerySchema, {
            query: {
              case: 'userIdQuery',
              value: create(UserIDQuerySchema, {id: userId})
            }
          })
        ]
      })

      const response = await clients.sessions.listSessions(request, createCallOptions())
      const items = (response.sessions ?? []).map(mapProtoToSession)
      const totalCount = Number(response.details?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new SessionEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new SessionConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list sessions for user:', userId, error)
      return new SessionConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }
}
