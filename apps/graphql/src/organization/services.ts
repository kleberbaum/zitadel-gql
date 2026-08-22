// src/organization/services.ts
import {create} from '@bufbuild/protobuf'
import {requireAuth} from '../auth'
import {getZitadelClients, createCallOptions} from '../zitadel/client'
import {tsToIso} from '../zitadel/users'
import {Organization, OrganizationConnection, OrganizationEdge} from './Organization'
import {Domain, DomainConnection, DomainEdge} from './Domain'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor} from '../relay/relay'
import type {RelayArgs} from '../relay/types'
import {OrgState, DomainValidationType} from '../relay/types'
import {
  ListOrganizationsRequestSchema,
  ListOrganizationDomainsRequestSchema
} from '@zitadel/proto/zitadel/org/v2/org_service_pb'
import type {Organization as ProtoOrganization, Domain as ProtoDomain} from '@zitadel/proto/zitadel/org/v2/org_pb'
import {OrganizationState, DomainValidationType as ProtoDomainValidationType} from '@zitadel/proto/zitadel/org/v2/org_pb'
import {
  SearchQuerySchema as OrgSearchQuerySchema,
  OrganizationIDQuerySchema
} from '@zitadel/proto/zitadel/org/v2/query_pb'
import {ListQuerySchema} from '@zitadel/proto/zitadel/object/v2/object_pb'
import {PaginationRequestSchema} from '@zitadel/proto/zitadel/filter/v2/filter_pb'

/**
 * Maps a proto Organization to the entity class.
 */
function mapProtoToOrganization(proto: ProtoOrganization): Organization {
  return new Organization({
    id: proto.id,
    name: proto.name,
    state: mapOrgState(proto.state),
    primaryDomain: proto.primaryDomain || undefined,
    creationDate: tsToIso(proto.details?.creationDate),
    changeDate: tsToIso(proto.details?.changeDate)
  })
}

function mapOrgState(protoState: number): OrgState {
  switch (protoState) {
    case OrganizationState.ACTIVE:
      return OrgState.ORG_STATE_ACTIVE
    case OrganizationState.INACTIVE:
      return OrgState.ORG_STATE_INACTIVE
    default:
      return OrgState.ORG_STATE_UNSPECIFIED
  }
}

function mapDomainValidationType(protoType: number): DomainValidationType {
  switch (protoType) {
    case ProtoDomainValidationType.HTTP:
      return DomainValidationType.DOMAIN_VALIDATION_TYPE_HTTP
    case ProtoDomainValidationType.DNS:
      return DomainValidationType.DOMAIN_VALIDATION_TYPE_DNS
    default:
      return DomainValidationType.DOMAIN_VALIDATION_TYPE_UNSPECIFIED
  }
}

function mapProtoToDomain(proto: ProtoDomain): Domain {
  return new Domain({
    domain: proto.domain,
    organizationId: proto.organizationId,
    isVerified: proto.isVerified,
    isPrimary: proto.isPrimary,
    validationType: mapDomainValidationType(proto.validationType)
  })
}

/**
 * Organization services using the org/v2 Connect client.
 */
export class OrganizationServices {
  /**
   * Get organization by ID. org/v2 has no GetOrganizationByID, so this uses
   * ListOrganizations with an id filter.
   */
  @requireAuth()
  static async getById(id: string): Promise<Organization | null> {
    try {
      const clients = getZitadelClients()
      const request = create(ListOrganizationsRequestSchema, {
        query: create(ListQuerySchema, {limit: 1, asc: true}),
        queries: [
          create(OrgSearchQuerySchema, {
            query: {
              case: 'idQuery',
              value: create(OrganizationIDQuerySchema, {id})
            }
          })
        ]
      })

      const response = await clients.orgs.listOrganizations(request, createCallOptions())
      const found = response.result?.[0]
      if (!found) return null
      return mapProtoToOrganization(found)
    } catch (error) {
      console.error('Failed to get organization by ID:', id, error)
      return null
    }
  }

  /**
   * List organizations as Relay connection.
   */
  @requireAuth()
  static async list(args?: RelayArgs): Promise<OrganizationConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListOrganizationsRequestSchema, {
        query: create(ListQuerySchema, {limit, asc: true})
      })

      const response = await clients.orgs.listOrganizations(request, createCallOptions())
      const items = (response.result ?? []).map(mapProtoToOrganization)
      const totalCount = Number(response.details?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new OrganizationEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new OrganizationConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list organizations:', error)
      return new OrganizationConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * Get domains for an organization via ListOrganizationDomains.
   */
  static async getDomains(organizationId: string, args?: RelayArgs): Promise<DomainConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListOrganizationDomainsRequestSchema, {
        organizationId,
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })

      const response = await clients.orgs.listOrganizationDomains(request, createCallOptions(organizationId))
      const items = (response.domains ?? []).map(mapProtoToDomain)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new DomainEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new DomainConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to get domains for organization:', organizationId, error)
      return new DomainConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }
}
