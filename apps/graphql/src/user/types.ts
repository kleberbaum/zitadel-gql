// src/user/types.ts
import type {ID} from '../types'
import type {HumanUser} from './HumanUser'
import type {MachineUser} from './MachineUser'

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

/**
 * The fields every user carries, human or machine. The classes implement
 * this; the schema never sees it by that name.
 */
export interface UserFields extends Node {
  state: UserState

  userName: string
  loginNames: string[]
  preferredLoginName: string
  resourceOwner: string
  creationDate: string
  changeDate: string
  sequence: string
}

/**
 * A user as the schema returns it: `union UserNode = HumanUser | MachineUser`.
 *
 * This used to be the interface above, which Pylon published as an interface
 * `IUserNode` plus a phantom object type `UserNode` that nothing ever
 * instantiated, and whose runtime type resolution failed on a real page
 * ("Abstract type IUserNode must resolve to an Object type"). The consumers
 * of this facade were generated against a union of exactly these two types
 * and select with `... on HumanUser`, so the union is the shape to keep.
 */
export type UserNode = HumanUser | MachineUser

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
  /**
   * Whether the user proved control of `email`, by a code or because the
   * address was created verified. Zitadel's human email `is_verified`.
   */
  isEmailVerified: boolean
  phone?: string
  firstName?: string
  lastName?: string
  nickName?: string
  gender?: Gender
}

export interface UserDataNode extends Node {}
