// src/session/types.ts
import type {Node, SessionState} from '../relay/types'

/**
 * Session node interface
 */
export interface SessionNode extends Node {
  userId?: string
  state: SessionState
  creationDate: string
  changeDate: string
  expirationDate?: string
  metadata: Record<string, string>
}

/**
 * Session factors - authentication methods used
 */
export interface SessionFactors {
  user?: UserFactor
  password?: PasswordFactor
  webAuthN?: WebAuthNFactor
  intent?: IntentFactor
  totp?: TOTPFactor
  otpSms?: OTPFactor
  otpEmail?: OTPFactor
}

export interface UserFactor {
  verifiedAt?: string
  id: string
  loginName: string
  displayName: string
  organizationId?: string
}

export interface PasswordFactor {
  verifiedAt?: string
}

export interface WebAuthNFactor {
  verifiedAt?: string
  userVerified?: boolean
}

export interface IntentFactor {
  verifiedAt?: string
}

export interface TOTPFactor {
  verifiedAt?: string
}

export interface OTPFactor {
  verifiedAt?: string
}
