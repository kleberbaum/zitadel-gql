// src/user/IDPLink.ts
import type {ID} from '../types'
import type {Node} from '../relay/types'
import type {ZitadelIDPLink} from '../zitadel/types'

/**
 * A link of a user to an external identity provider (user/v2 IDPLink).
 * `userId` and `userName` are the user's id and name at that provider, not
 * the Zitadel user: for ID Austria `userId` is the qes-oidc subject. The id
 * is synthesized from the provider and that external id, a pair Zitadel
 * keeps unique.
 */
export class IDPLinkNode implements Node {
  id: ID
  idpId: string
  userId: string
  userName: string

  constructor(link: ZitadelIDPLink) {
    this.idpId = link.idpId
    this.userId = link.userId
    this.userName = link.userName
    this.id = `idplink:${link.idpId}:${link.userId}`
  }
}
