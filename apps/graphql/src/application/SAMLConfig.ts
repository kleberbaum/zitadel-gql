// src/application/SAMLConfig.ts
import type {SAMLConfigNode} from './types'

/**
 * SAML application configuration.
 */
export class SAMLConfig implements SAMLConfigNode {
  public metadataXml: string
  public entityId: string

  constructor(base: {metadataXml?: string; entityId?: string}) {
    this.metadataXml = base.metadataXml ?? ''
    this.entityId = base.entityId ?? ''
  }
}
