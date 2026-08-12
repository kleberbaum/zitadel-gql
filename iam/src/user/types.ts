// src/user/types.ts
import type {ID} from '../types'

export enum UserState {
  USER_STATE_UNSPECIFIED = 'USER_STATE_UNSPECIFIED',
  USER_STATE_ACTIVE = 'USER_STATE_ACTIVE',
  USER_STATE_INACTIVE = 'USER_STATE_INACTIVE',
  USER_STATE_DELETED = 'USER_STATE_DELETED',
  USER_STATE_LOCKED = 'USER_STATE_LOCKED',
  USER_STATE_INITIAL = 'USER_STATE_INITIAL'
}

export interface Node {
  id: ID
}

export interface UserNode extends Node {
  state: UserState

  userName: string
  loginNames: string[]
  preferredLoginName: string
  resourceOwner: string
  creationDate: string
  changeDate: string
  sequence: string
}

export interface RoleNode extends Node {
  key: string
  displayName?: string
}

export interface GrantNode extends Node {
  organizationId?: string
  creationDate?: string
  changeDate?: string
  projectId?: string
  projectName?: string
  state?: string
}

export interface UserProfileNode extends Node {
  avatarUrl?: string
  preferredLanguage?: string
  displayName?: string
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
}

export interface UserDataNode extends Node {}
