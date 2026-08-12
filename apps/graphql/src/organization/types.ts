// src/organization/types.ts
import type {Node, OrgState, DomainValidationType} from '../relay/types'

/**
 * Organization node interface
 */
export interface OrganizationNode extends Node {
  name: string
  state: OrgState
  primaryDomain?: string
  creationDate: string
  changeDate: string
}

/**
 * Domain node interface
 */
export interface DomainNode extends Node {
  domain: string
  isVerified: boolean
  isPrimary: boolean
  validationType: DomainValidationType
  organizationId: string
}
