// src/project/types.ts
import type {Node, ProjectState} from '../relay/types'

/**
 * Project node interface
 */
export interface ProjectNode extends Node {
  name: string
  state: ProjectState
  organizationId: string
  projectRoleAssertion: boolean
  projectRoleCheck: boolean
  hasProjectCheck: boolean
  privateLabelingSetting: string
  creationDate: string
  changeDate: string
}

/**
 * ProjectRole node interface
 */
export interface ProjectRoleNode extends Node {
  projectId: string
  key: string
  displayName: string
  group: string
}

/**
 * ProjectGrant node interface
 */
export interface ProjectGrantNode extends Node {
  projectId: string
  grantedOrgId: string
  grantedOrgName?: string
  state: ProjectState
  roleKeys: string[]
  creationDate: string
  changeDate: string
}
