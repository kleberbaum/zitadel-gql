// src/user/profile/Profile.ts
import {PageInfo} from '../../relay/PageInfo'
import type {UserProfileNode} from '../types'

export class ProfileEdge {
  cursor: string
  node: UserProfileNode

  constructor(args: {cursor: string; node: UserProfileNode}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

export class ProfileConnection {
  edges: ProfileEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: ProfileEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
