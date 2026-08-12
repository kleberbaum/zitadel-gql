// src/application/ApplicationKey.ts
import type {ID} from '../types'
import type {ApplicationKeyNode} from './types'
import {PageInfo} from '../relay/PageInfo'

/**
 * Represents a key for an application.
 */
export class ApplicationKey implements ApplicationKeyNode {
  public id: ID
  public applicationId: string
  public keyType: string
  public expirationDate: string
  public creationDate: string

  constructor(base: {
    id: string
    applicationId: string
    keyType?: string
    expirationDate?: string
    creationDate?: string
  }) {
    this.id = base.id
    this.applicationId = base.applicationId
    this.keyType = base.keyType ?? ''
    this.expirationDate = base.expirationDate ?? ''
    this.creationDate = base.creationDate ?? ''
  }
}

/**
 * Edge for ApplicationKey in Relay connection
 */
export class ApplicationKeyEdge {
  cursor: string
  node: ApplicationKey

  constructor(args: {cursor: string; node: ApplicationKey}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for ApplicationKey entities
 */
export class ApplicationKeyConnection {
  edges: ApplicationKeyEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: ApplicationKeyEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
