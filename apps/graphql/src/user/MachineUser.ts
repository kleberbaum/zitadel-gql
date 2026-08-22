// src/user/MachineUser.ts
import type {ID} from '../types'
import type {ZitadelProjectRole, ZitadelUserGrant} from '../zitadel/types'
import {getUserGrants, flattenRolesFromGrants} from '../zitadel/users'
import {encodeCursor, paginateWindow} from '../relay/relay'
import {PageInfo} from '../relay/PageInfo'
import {Grant, GrantConnection, GrantEdge} from './Grant'
import {Role, RoleConnection, RoleEdge} from './Role'
import type {UserNode, UserState, UserDataNode} from './types'
import type {RelayArgs} from '../relay/types'
import type {Organization} from '../organization/Organization'
import type {SessionConnection} from '../session/Session'
import type {AuthorizationConnection} from '../authorization/Authorization'
import {DataConnection, DataEdge} from './data/Data'

/**
 * Represents a machine user coming from Zitadel.
 * The instance type is what makes `... on MachineUser` resolve correctly.
 */
export class MachineUser implements UserNode {
  public __typename: 'MachineUser' = 'MachineUser'

  public id: ID
  public state: UserState

  public userName: string
  public loginNames: string[]
  public preferredLoginName: string
  public resourceOwner: string
  public creationDate: string
  public changeDate: string
  public sequence: string

  private _grantsP?: Promise<ZitadelUserGrant[]>
  private _rolesP?: Promise<ZitadelProjectRole[]>

  constructor(base: {
    id: ID
    state: UserState
    userName: string
    loginNames: string[]
    preferredLoginName: string
    resourceOwner: string
    changeDate: string
    creationDate: string
    sequence: string
  }) {
    this.id = base.id
    this.state = base.state
    this.userName = base.userName
    this.loginNames = base.loginNames
    this.preferredLoginName = base.preferredLoginName
    this.resourceOwner = base.resourceOwner
    this.changeDate = base.changeDate
    this.creationDate = base.creationDate
    this.sequence = base.sequence
  }

  private async _getGrants(): Promise<ZitadelUserGrant[]> {
    if (!this._grantsP) {
      this._grantsP = getUserGrants(String(this.id), this.resourceOwner).catch(e => {
        console.error('Failed to fetch grants for machine user', this.id, e)
        return []
      })
    }
    return this._grantsP
  }

  private async _getRoles(): Promise<ZitadelProjectRole[]> {
    if (!this._rolesP) {
      this._rolesP = this._getGrants()
        .then(gs => flattenRolesFromGrants(gs))
        .catch(e => {
          console.error('Failed to derive roles for machine user', this.id, e)
          return []
        })
    }
    return this._rolesP
  }

  /**
   * Resolves the user's data as a Relay connection.
   */
  data = async (args?: RelayArgs): Promise<DataConnection> => {
    const items: UserDataNode[] = []

    items.push({
      id: `data:${this.id}`
    })

    const {start, end, hasNextPage, hasPreviousPage} = paginateWindow({
      totalCount: items.length,
      first: args?.first ?? null,
      after: args?.after ?? null,
      last: args?.last ?? null,
      before: args?.before ?? null
    })

    const sliced = items.slice(start, end)
    const edges = sliced.map((n, i) => new DataEdge({node: n, cursor: encodeCursor(start + i)}))

    const pageInfo = new PageInfo({
      hasNextPage,
      hasPreviousPage,
      startCursor: edges[0]?.cursor,
      endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
    })

    return new DataConnection({edges, pageInfo, totalCount: items.length})
  }

  /**
   * Resolves grants as a Relay connection.
   * The underlying Zitadel request is cached per request.
   */
  grants = async (args?: RelayArgs): Promise<GrantConnection> => {
    const gs = await this._getGrants()
    const items = gs.map(g => new Grant(g))

    const {start, end, hasNextPage, hasPreviousPage} = paginateWindow({
      totalCount: items.length,
      first: args?.first ?? null,
      after: args?.after ?? null,
      last: args?.last ?? null,
      before: args?.before ?? null
    })

    const sliced = items.slice(start, end)
    const edges = sliced.map((n, i) => new GrantEdge({node: n, cursor: encodeCursor(start + i)}))

    const pageInfo = new PageInfo({
      hasNextPage,
      hasPreviousPage,
      startCursor: edges[0]?.cursor,
      endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
    })

    return new GrantConnection({edges, pageInfo, totalCount: items.length})
  }

  /**
   * Resolves roles as a Relay connection.
   * Roles are derived from cached grants to avoid extra requests.
   */
  roles = async (args?: RelayArgs): Promise<RoleConnection> => {
    const rs = await this._getRoles()
    const items = rs.map(r => new Role({key: r.key, displayName: r.displayName}))

    const {start, end, hasNextPage, hasPreviousPage} = paginateWindow({
      totalCount: items.length,
      first: args?.first ?? null,
      after: args?.after ?? null,
      last: args?.last ?? null,
      before: args?.before ?? null
    })

    const sliced = items.slice(start, end)
    const edges = sliced.map((n, i) => new RoleEdge({node: n, cursor: encodeCursor(start + i)}))

    const pageInfo = new PageInfo({
      hasNextPage,
      hasPreviousPage,
      startCursor: edges[0]?.cursor,
      endCursor: edges.length ? edges[edges.length - 1].cursor : undefined
    })

    return new RoleConnection({edges, pageInfo, totalCount: items.length})
  }

  /**
   * Backlink: Resolves the organization (resourceOwner) this user belongs to.
   */
  organization = async (): Promise<Organization | null> => {
    // Lazy import to avoid circular dependency
    const {OrganizationServices} = await import('../organization/services')
    return OrganizationServices.getById(this.resourceOwner)
  }

  /**
   * Backlink: Resolves sessions for this user as Relay connection.
   */
  sessions = async (args?: RelayArgs): Promise<SessionConnection> => {
    // Lazy import to avoid circular dependency
    const {SessionServices} = await import('../session/services')
    return SessionServices.listByUser(String(this.id), args)
  }

  /**
   * Backlink: Resolves authorizations for this user as Relay connection.
   */
  authorizations = async (args?: RelayArgs): Promise<AuthorizationConnection> => {
    // Lazy import to avoid circular dependency
    const {AuthorizationServices} = await import('../authorization/services')
    return AuthorizationServices.listByUser(String(this.id), args)
  }
}
