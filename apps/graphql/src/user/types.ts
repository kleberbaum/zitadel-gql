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

/**
 * Zitadel carries a gender on the human profile (user/v2 field 6). It is
 * surfaced under the same naming as UserState so the schema reads uniformly.
 */
export enum Gender {
  GENDER_UNSPECIFIED = 'GENDER_UNSPECIFIED',
  GENDER_FEMALE = 'GENDER_FEMALE',
  GENDER_MALE = 'GENDER_MALE',
  GENDER_DIVERSE = 'GENDER_DIVERSE'
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
  nickName?: string
  gender?: Gender
}

export interface UserDataNode extends Node {}
