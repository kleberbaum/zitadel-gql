// src/application/services.ts
import {create} from '@bufbuild/protobuf'
import {requireAuth} from '../auth'
import {getZitadelClients, createCallOptions} from '../zitadel/client'
import {tsToIso} from '../zitadel/users'
import {Application, ApplicationConnection, ApplicationEdge} from './Application'
import {OIDCConfig} from './OIDCConfig'
import {APIConfig} from './APIConfig'
import {SAMLConfig} from './SAMLConfig'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor} from '../relay/relay'
import type {RelayArgs} from '../relay/types'
import {ApplicationState} from '../relay/types'
import {
  GetApplicationRequestSchema,
  ListApplicationsRequestSchema
} from '@zitadel/proto/zitadel/application/v2/application_service_pb'
import {
  ApplicationSearchFilterSchema,
  ProjectIDFilterSchema,
  ApplicationState as ProtoApplicationState
} from '@zitadel/proto/zitadel/application/v2/application_pb'
import type {Application as ProtoApplication} from '@zitadel/proto/zitadel/application/v2/application_pb'
import {PaginationRequestSchema} from '@zitadel/proto/zitadel/filter/v2/filter_pb'

/**
 * Maps a proto Application to the entity class. The configuration oneof was
 * renamed from config to configuration when app/v2beta became application/v2,
 * the GraphQL field names stay stable.
 */
function mapProtoToApplication(proto: ProtoApplication): Application {
  const config = proto.configuration

  return new Application({
    id: proto.applicationId,
    name: proto.name,
    projectId: proto.projectId,
    state: mapApplicationState(proto.state),
    creationDate: tsToIso(proto.creationDate),
    changeDate: tsToIso(proto.changeDate),
    oidcConfig:
      config?.case === 'oidcConfiguration'
        ? new OIDCConfig({
            redirectUris: config.value.redirectUris ?? [],
            postLogoutRedirectUris: config.value.postLogoutRedirectUris ?? [],
            responseTypes: (config.value.responseTypes ?? []).map(String),
            grantTypes: (config.value.grantTypes ?? []).map(String),
            appType: String(config.value.applicationType ?? ''),
            authMethodType: String(config.value.authMethodType ?? ''),
            clientId: config.value.clientId,
            accessTokenType: String(config.value.accessTokenType ?? ''),
            accessTokenRoleAssertion: config.value.accessTokenRoleAssertion,
            idTokenRoleAssertion: config.value.idTokenRoleAssertion,
            idTokenUserinfoAssertion: config.value.idTokenUserinfoAssertion,
            clockSkew: config.value.clockSkew ? `${config.value.clockSkew.seconds}s` : '0s',
            additionalOrigins: config.value.additionalOrigins ?? [],
            skipNativeAppSuccessPage: config.value.skipNativeAppSuccessPage
          })
        : undefined,
    apiConfig:
      config?.case === 'apiConfiguration'
        ? new APIConfig({
            clientId: config.value.clientId,
            authMethodType: String(config.value.authMethodType ?? '')
          })
        : undefined,
    samlConfig:
      config?.case === 'samlConfiguration'
        ? new SAMLConfig({
            metadataXml: config.value.metadataXml?.length ? new TextDecoder().decode(config.value.metadataXml) : '',
            entityId: config.value.metadataUrl ?? ''
          })
        : undefined
  })
}

function mapApplicationState(protoState: number): ApplicationState {
  switch (protoState) {
    case ProtoApplicationState.ACTIVE:
      return ApplicationState.APP_STATE_ACTIVE
    case ProtoApplicationState.INACTIVE:
      return ApplicationState.APP_STATE_INACTIVE
    default:
      return ApplicationState.APP_STATE_UNSPECIFIED
  }
}

/**
 * Application services using the application/v2 Connect client.
 */
export class ApplicationServices {
  /**
   * Get application by ID.
   */
  @requireAuth()
  static async getById(id: string): Promise<Application | null> {
    try {
      const clients = getZitadelClients()
      const request = create(GetApplicationRequestSchema, {applicationId: id})
      const response = await clients.apps.getApplication(request, createCallOptions())

      if (!response.application) {
        return null
      }

      return mapProtoToApplication(response.application)
    } catch (error) {
      console.error('Failed to get application by ID:', id, error)
      return null
    }
  }

  /**
   * List all applications as Relay connection.
   */
  @requireAuth()
  static async list(args?: RelayArgs): Promise<ApplicationConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListApplicationsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })

      const response = await clients.apps.listApplications(request, createCallOptions())
      const items = (response.applications ?? []).map(mapProtoToApplication)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new ApplicationEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new ApplicationConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list applications:', error)
      return new ApplicationConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * List applications for a project as Relay connection.
   */
  static async listByProject(projectId: string, args?: RelayArgs): Promise<ApplicationConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListApplicationsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit, asc: true}),
        filters: [
          create(ApplicationSearchFilterSchema, {
            filter: {
              case: 'projectIdFilter',
              value: create(ProjectIDFilterSchema, {projectId})
            }
          })
        ]
      })

      const response = await clients.apps.listApplications(request, createCallOptions())
      const items = (response.applications ?? []).map(mapProtoToApplication)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new ApplicationEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new ApplicationConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list applications for project:', projectId, error)
      return new ApplicationConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }

  /**
   * List applications for an organization as Relay connection.
   * The x-zitadel-orgid header scopes the call to the organization.
   */
  static async listByOrg(organizationId: string, args?: RelayArgs): Promise<ApplicationConnection> {
    try {
      const clients = getZitadelClients()
      const limit = args?.first ?? args?.last ?? 100

      const request = create(ListApplicationsRequestSchema, {
        pagination: create(PaginationRequestSchema, {limit, asc: true})
      })

      const response = await clients.apps.listApplications(request, createCallOptions(organizationId))
      const items = (response.applications ?? []).map(mapProtoToApplication)
      const totalCount = Number(response.pagination?.totalResult ?? BigInt(items.length))

      const startIndex = 0
      const edges = items.map((n, i) => new ApplicationEdge({node: n, cursor: encodeCursor(startIndex + i)}))

      const pageInfo = new PageInfo({
        hasNextPage: items.length < totalCount,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
      })

      return new ApplicationConnection({edges, pageInfo, totalCount})
    } catch (error) {
      console.error('Failed to list applications for org:', organizationId, error)
      return new ApplicationConnection({
        edges: [],
        pageInfo: new PageInfo({hasNextPage: false, hasPreviousPage: false}),
        totalCount: 0
      })
    }
  }
}
