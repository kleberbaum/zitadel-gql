// src/idp/services.ts
import {create} from '@bufbuild/protobuf'
import {requireAuth} from '@getcronit/pylon'
import {getZitadelClients, createCallOptions} from '../zitadel/client'
import {tsToIso} from '../zitadel/users'
import {IDP, IDPConnection, IDPEdge} from './IDP'
import {PageInfo} from '../relay/PageInfo'
import type {RelayArgs} from '../relay/types'
import {GetIDPByIDRequestSchema} from '@zitadel/proto/zitadel/idp/v2/idp_service_pb'
import type {IDP as ProtoIDP} from '@zitadel/proto/zitadel/idp/v2/idp_pb'
import {IDPType as ProtoIDPType, IDPState as ProtoIDPState} from '@zitadel/proto/zitadel/idp/v2/idp_pb'

/**
 * Maps a proto IDP to the entity class. The v2 proto carries an explicit type
 * enum, so the mapping no longer needs to sniff the config oneof.
 */
function mapProtoToIDP(proto: ProtoIDP): IDP {
  return new IDP({
    id: proto.id,
    name: proto.name,
    type: ProtoIDPType[proto.type] ?? 'UNKNOWN',
    state: ProtoIDPState[proto.state] ?? 'UNKNOWN',
    creationDate: tsToIso(proto.details?.creationDate),
    changeDate: tsToIso(proto.details?.changeDate)
  })
}

/**
 * IDP services using the idp/v2 Connect client.
 * The idp/v2 service is read only and only exposes GetIDPByID.
 */
export class IDPServices {
  /**
   * Get IDP by ID.
   */
  @requireAuth()
  static async getById(id: string): Promise<IDP | null> {
    try {
      const clients = getZitadelClients()
      const request = create(GetIDPByIDRequestSchema, {id})
      const response = await clients.idps.getIDPByID(request, createCallOptions())

      if (!response.idp) {
        return null
      }

      return mapProtoToIDP(response.idp)
    } catch (error) {
      console.error('Failed to get IDP by ID:', id, error)
      return null
    }
  }

  /**
   * List all IDPs as Relay connection.
   * The idp/v2 API has no list endpoint at v4.16.1, so this stays an empty
   * connection. See the Known gaps section in the README.
   */
  @requireAuth()
  static async list(args?: RelayArgs): Promise<IDPConnection> {
    console.warn('IDPServices.list is not available in the idp/v2 API')
    return new IDPConnection({
      edges: [],
      pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
      totalCount: 0
    })
  }
}
