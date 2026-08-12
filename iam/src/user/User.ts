// src/user/User.ts
import {PageInfo} from '../relay/PageInfo'
import type {UserNode} from './types'

/**
 * Holds a user node together with the cursor used for pagination.
 * This shape is used by Relay connections and is recognized by schema visualizers.
 */
export class UserEdge {
  cursor: string
  node: UserNode

  constructor(args: {cursor: string; node: UserNode}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Wraps a list of edges plus pagination state in Relay connection format.
 * Keeping exact field names makes schema tools detect it as a Relay connection.
 */
export class UserConnection {
  edges: UserEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: UserEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
