// src/application/Application.ts
import type {ID} from '../types'
import type {ApplicationNode} from './types'
import type {RelayArgs} from '../relay/types'
import {ApplicationState} from '../relay/types'
import {PageInfo} from '../relay/PageInfo'
import {encodeCursor, paginateWindow} from '../relay/relay'
import {ApplicationKey, ApplicationKeyConnection, ApplicationKeyEdge} from './ApplicationKey'
import {OIDCConfig} from './OIDCConfig'
import {APIConfig} from './APIConfig'
import {SAMLConfig} from './SAMLConfig'
import type {Project} from '../project/Project'

/**
 * Represents an application from Zitadel.
 * Applications can be OIDC, API, or SAML apps.
 */
export class Application implements ApplicationNode {
  public id: ID
  public name: string
  public state: ApplicationState
  public projectId: string
  public creationDate: string
  public changeDate: string

  // Config (only one will be set based on app type)
  public oidcConfig?: OIDCConfig
  public apiConfig?: APIConfig
  public samlConfig?: SAMLConfig

  constructor(base: {
    id: string
    name: string
    state?: ApplicationState | string
    projectId: string
    creationDate?: string
    changeDate?: string
    oidcConfig?: OIDCConfig | object
    apiConfig?: APIConfig | object
    samlConfig?: SAMLConfig | object
  }) {
    this.id = base.id
    this.name = base.name
    this.projectId = base.projectId
    this.creationDate = base.creationDate ?? ''
    this.changeDate = base.changeDate ?? ''

    // Set configs if provided
    if (base.oidcConfig) {
      this.oidcConfig = base.oidcConfig instanceof OIDCConfig ? base.oidcConfig : new OIDCConfig(base.oidcConfig)
    }
    if (base.apiConfig) {
      this.apiConfig = base.apiConfig instanceof APIConfig ? base.apiConfig : new APIConfig(base.apiConfig)
    }
    if (base.samlConfig) {
      this.samlConfig = base.samlConfig instanceof SAMLConfig ? base.samlConfig : new SAMLConfig(base.samlConfig)
    }

    // Normalize state
    if (typeof base.state === 'string') {
      const s = base.state.toUpperCase()
      if (s.includes('ACTIVE') && !s.includes('INACTIVE')) {
        this.state = ApplicationState.APP_STATE_ACTIVE
      } else if (s.includes('INACTIVE')) {
        this.state = ApplicationState.APP_STATE_INACTIVE
      } else {
        this.state = ApplicationState.APP_STATE_UNSPECIFIED
      }
    } else {
      this.state = base.state ?? ApplicationState.APP_STATE_UNSPECIFIED
    }
  }

  /**
   * Resolves application keys as a Relay connection.
   * Not wired to the API, kept for schema compatibility with the old facade.
   */
  async keys(args?: RelayArgs): Promise<ApplicationKeyConnection> {
    const items: ApplicationKey[] = []

    const {start, end, hasNextPage, hasPreviousPage} = paginateWindow({
      totalCount: items.length,
      first: args?.first ?? null,
      after: args?.after ?? null,
      last: args?.last ?? null,
      before: args?.before ?? null
    })

    const sliced = items.slice(start, end)
    const edges = sliced.map((n, i) => new ApplicationKeyEdge({node: n, cursor: encodeCursor(start + i)}))

    const pageInfo = new PageInfo({
      hasNextPage,
      hasPreviousPage,
      startCursor: edges[0]?.cursor,
      endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
    })

    return new ApplicationKeyConnection({edges, pageInfo, totalCount: items.length})
  }

  /**
   * Backlink: Resolves the project this application belongs to.
   */
  async project(): Promise<Project | null> {
    // Lazy import to avoid circular dependency
    const {ProjectServices} = await import('../project/services')
    return ProjectServices.getById(this.projectId)
  }
}

/**
 * Edge for Application in Relay connection
 */
export class ApplicationEdge {
  cursor: string
  node: Application

  constructor(args: {cursor: string; node: Application}) {
    this.cursor = args.cursor
    this.node = args.node
  }
}

/**
 * Connection for Application entities
 */
export class ApplicationConnection {
  edges: ApplicationEdge[]
  pageInfo: PageInfo
  totalCount: number

  constructor(args: {edges: ApplicationEdge[]; pageInfo: PageInfo; totalCount: number}) {
    this.edges = args.edges
    this.pageInfo = args.pageInfo
    this.totalCount = args.totalCount
  }
}
