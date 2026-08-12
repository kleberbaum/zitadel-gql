// src/relay/types.ts
// Base Relay types shared across all domains
import type {ID} from '../types'

/**
 * Base Node interface. All GraphQL objects that can be fetched by ID implement this.
 */
export interface Node {
  id: ID
}

/**
 * Standard Relay connection args for pagination.
 */
export interface RelayArgs {
  first?: number
  after?: string
  last?: number
  before?: string
}

/**
 * Standard Relay PageInfo shape.
 */
export interface PageInfoData {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor?: string
  endCursor?: string
}

/**
 * Generic Edge interface for Relay connections.
 */
export interface Edge<T extends Node> {
  cursor: string
  node: T
}

/**
 * Generic Connection interface for Relay connections.
 */
export interface Connection<T extends Node> {
  edges: Edge<T>[]
  pageInfo: PageInfoData
  totalCount: number
}

// Common state enums
export enum OrgState {
  ORG_STATE_UNSPECIFIED = 'ORG_STATE_UNSPECIFIED',
  ORG_STATE_ACTIVE = 'ORG_STATE_ACTIVE',
  ORG_STATE_INACTIVE = 'ORG_STATE_INACTIVE'
}

export enum ProjectState {
  PROJECT_STATE_UNSPECIFIED = 'PROJECT_STATE_UNSPECIFIED',
  PROJECT_STATE_ACTIVE = 'PROJECT_STATE_ACTIVE',
  PROJECT_STATE_INACTIVE = 'PROJECT_STATE_INACTIVE'
}

export enum ApplicationState {
  APP_STATE_UNSPECIFIED = 'APP_STATE_UNSPECIFIED',
  APP_STATE_ACTIVE = 'APP_STATE_ACTIVE',
  APP_STATE_INACTIVE = 'APP_STATE_INACTIVE'
}

export enum SessionState {
  SESSION_STATE_UNSPECIFIED = 'SESSION_STATE_UNSPECIFIED',
  SESSION_STATE_ACTIVE = 'SESSION_STATE_ACTIVE',
  SESSION_STATE_TERMINATED = 'SESSION_STATE_TERMINATED'
}

export enum DomainValidationType {
  DOMAIN_VALIDATION_TYPE_UNSPECIFIED = 'DOMAIN_VALIDATION_TYPE_UNSPECIFIED',
  DOMAIN_VALIDATION_TYPE_HTTP = 'DOMAIN_VALIDATION_TYPE_HTTP',
  DOMAIN_VALIDATION_TYPE_DNS = 'DOMAIN_VALIDATION_TYPE_DNS'
}
