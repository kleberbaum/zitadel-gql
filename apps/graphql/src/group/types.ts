// src/group/types.ts
import type {Node} from '../relay/types'

/**
 * Group node interface.
 *
 * Groups are org scoped and flat: a group belongs to exactly one organization
 * and groups do not nest. That is the shape `zitadel.group.v2` defines, and
 * the facade does not invent a hierarchy on top of it.
 */
export interface GroupNode extends Node {
  name: string
  description?: string
  organizationId: string
  /**
   * Members counted by Zitadel. Exposed as a number because GraphQL Int is
   * signed 32 bit and a group large enough to overflow it is not a case this
   * API needs to serve.
   */
  userCount: number
  creationDate: string
  changeDate: string
}

/**
 * A user's membership in a group.
 *
 * This is the join, not the user: it carries the group side plus enough of
 * the user to render a member list without a second round trip.
 */
export interface GroupUserNode extends Node {
  groupId: string
  groupName: string
  organizationId: string
  userId: string
  preferredLoginName?: string
  displayName?: string
  avatarUrl?: string
  creationDate: string
}

/**
 * A grant of project roles to a whole group.
 *
 * This is what makes groups useful rather than decorative: role keys granted
 * here reach every member, which is how a Samba-style group maps onto Zitadel
 * authorizations without touching each user.
 */
export interface GroupGrantNode extends Node {
  groupId: string
  groupName: string
  organizationId: string
  projectId: string
  projectGrantId?: string
  roleKeys: string[]
  creationDate: string
  changeDate: string
}
