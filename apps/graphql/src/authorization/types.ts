// src/authorization/types.ts
import type {Node} from '../relay/types'

/**
 * Authorization state
 */
export enum AuthorizationState {
  AUTHORIZATION_STATE_UNSPECIFIED = 'AUTHORIZATION_STATE_UNSPECIFIED',
  AUTHORIZATION_STATE_ACTIVE = 'AUTHORIZATION_STATE_ACTIVE',
  AUTHORIZATION_STATE_INACTIVE = 'AUTHORIZATION_STATE_INACTIVE'
}

/**
 * Authorization node interface (user grant)
 */
export interface AuthorizationNode extends Node {
  userId: string
  userName?: string
  userDisplayName?: string
  organizationId: string
  organizationName?: string
  projectId: string
  projectName?: string
  roleKeys: string[]
  state: AuthorizationState
  creationDate: string
  changeDate: string
}
