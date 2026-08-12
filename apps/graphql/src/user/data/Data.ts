// src/user/data/Data.ts
import {PageInfo} from '../../relay/PageInfo'
import type {UserDataNode} from '../types'

export class DataEdge {
  cursor: string
  node: UserDataNode

  constructor(args: {cursor: string; node: UserDataNode}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

export class DataConnection {
  edges: DataEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: DataEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
