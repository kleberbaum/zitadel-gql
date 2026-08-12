// src/session/Session.ts
import type {ID} from '../types'
import type {SessionNode, SessionFactors} from './types'
import {SessionState} from '../relay/types'
import {PageInfo} from '../relay/PageInfo'
import type {UserNode} from '../user/types'

/**
 * Represents a user session from Zitadel.
 */
export class Session implements SessionNode {
  public id: ID
  public userId?: string
  public state: SessionState
  public creationDate: string
  public changeDate: string
  public expirationDate?: string
  public metadata: Record<string, string>
  public factors?: SessionFactors

  constructor(base: {
    id: string
    userId?: string
    state?: SessionState | string
    creationDate?: string
    changeDate?: string
    expirationDate?: string
    metadata?: Record<string, string>
    factors?: SessionFactors
  }) {
    this.id = base.id
    this.userId = base.userId
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''
    this.expirationDate = base.expirationDate
    this.metadata = base.metadata ?? {}
    this.factors = base.factors

    // Normalize state
    if (typeof base.state === 'string') {
      const s = base.state.toUpperCase()
      if (s.includes('ACTIVE')) {
        this.state = SessionState.SESSION_STATE_ACTIVE
      } else if (s.includes('TERMINATED')) {
        this.state = SessionState.SESSION_STATE_TERMINATED
      } else {
        this.state = SessionState.SESSION_STATE_UNSPECIFIED
      }
    } else {
      this.state = base.state ?? SessionState.SESSION_STATE_UNSPECIFIED
    }
  }

  /**
   * Backlink: Resolves the user this session belongs to.
   */
  async user(): Promise<UserNode | null> {
    if (!this.userId) return null
    // Lazy import to avoid circular dependency
    const {UserServices} = await import('../user')
    return UserServices.user({id: this.userId})
  }
}

/**
 * Edge for Session in Relay connection
 */
export class SessionEdge {
  cursor: string
  node: Session

  constructor(args: {cursor: string; node: Session}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for Session entities
 */
export class SessionConnection {
  edges: SessionEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: SessionEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
