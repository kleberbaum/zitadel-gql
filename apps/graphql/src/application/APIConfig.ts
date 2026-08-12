// src/application/APIConfig.ts
import type {APIConfigNode} from './types'

/**
 * API application configuration.
 */
export class APIConfig implements APIConfigNode {
  public clientId: string
  public authMethodType: string

  constructor(base: {clientId?: string; authMethodType?: string}) {
    this.clientId = base.clientId ?? ''
    this.authMethodType = base.authMethodType ?? ''
  }
}
