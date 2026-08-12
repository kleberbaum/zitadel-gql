// src/zitadel/client.ts
// Connect RPC client factory for the Zitadel v2 APIs (Zitadel v4.16.1).
import {createClient} from '@connectrpc/connect'
import {createConnectTransport} from '@connectrpc/connect-web'
import {getContext, getEnv} from '@getcronit/pylon'

// Generated service descriptors (protoc-gen-es v2, services as GenService)
import {UserService} from '@zitadel/proto/zitadel/user/v2/user_service_pb'
import {OrganizationService} from '@zitadel/proto/zitadel/org/v2/org_service_pb'
import {SessionService} from '@zitadel/proto/zitadel/session/v2/session_service_pb'
import {ProjectService} from '@zitadel/proto/zitadel/project/v2/project_service_pb'
import {AuthorizationService} from '@zitadel/proto/zitadel/authorization/v2/authorization_service_pb'
import {IdentityProviderService} from '@zitadel/proto/zitadel/idp/v2/idp_service_pb'
import {ApplicationService} from '@zitadel/proto/zitadel/application/v2/application_service_pb'
import {GroupService} from '@zitadel/proto/zitadel/group/v2/group_service_pb'

// Custom fetch for Cloudflare Workers compatibility.
// Workers don't support redirect: 'error', only 'follow' or 'manual'.
function workerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const modifiedInit = {...init}
  // Change 'error' to 'manual' and handle redirects ourselves
  if (modifiedInit.redirect === 'error') {
    modifiedInit.redirect = 'manual'
  }
  // In the single-package pod the facade dials Zitadel on localhost, but
  // Zitadel resolves its (virtual) instance by Host header. ZITADEL_HOST_HEADER
  // carries the canonical issuer host for that case. If the runtime refuses a
  // Host override, use a pod hostAlias mapping the issuer to 127.0.0.1 instead.
  const hostHeader = env()?.ZITADEL_HOST_HEADER
  if (hostHeader) {
    const headers = new Headers(
      modifiedInit.headers ?? (input instanceof Request ? input.headers : undefined)
    )
    headers.set('Host', hostHeader)
    modifiedInit.headers = headers
  }
  return fetch(input, modifiedInit).then(response => {
    // If we got a redirect when we didn't want one, throw an error
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new Error(`Unexpected redirect to ${response.headers.get('location')}`)
    }
    return response
  })
}

function createZitadelTransport(baseUrl: string) {
  return createConnectTransport({
    baseUrl,
    useBinaryFormat: true, // smaller payloads, matters on Workers
    // Bun's fetch type carries an extra preconnect helper the shim lacks
    fetch: workerFetch as typeof fetch
  })
}

function env(): any {
  return getEnv() as any
}

/**
 * Resolve the Zitadel base URL. ZITADEL_BASE_URL wins so the facade can talk
 * to Zitadel over an internal address while consumers validate tokens against
 * the public AUTH_ISSUER.
 */
export function getZitadelBaseUrl(): string {
  const e = env()
  const url = e?.ZITADEL_BASE_URL ?? e?.AUTH_ISSUER
  if (!url) {
    throw new Error('Neither ZITADEL_BASE_URL nor AUTH_ISSUER is set')
  }
  return url
}

export function createZitadelClients(baseUrl?: string) {
  const transport = createZitadelTransport(baseUrl ?? getZitadelBaseUrl())

  return {
    users: createClient(UserService, transport),
    orgs: createClient(OrganizationService, transport),
    sessions: createClient(SessionService, transport),
    projects: createClient(ProjectService, transport),
    auth: createClient(AuthorizationService, transport),
    idps: createClient(IdentityProviderService, transport),
    apps: createClient(ApplicationService, transport),
    groups: createClient(GroupService, transport)
  }
}

// Singleton clients (lazy initialized)
let _clients: ReturnType<typeof createZitadelClients> | undefined

export function getZitadelClients() {
  if (!_clients) {
    _clients = createZitadelClients()
  }
  return _clients
}

/**
 * Default organization scope, optional. Explicit per-call organization ids
 * always win over this.
 */
export function getDefaultOrgId(): string | undefined {
  const id = env()?.ZITADEL_ORG_ID
  return id ? String(id) : undefined
}

/**
 * The caller's own bearer token, read from the inbound request. Undefined
 * outside a request context or when the caller sent none.
 */
function getCallerToken(): string | undefined {
  try {
    const auth = getContext().req.header('Authorization')
    if (auth?.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length)
    }
  } catch {
    // no active request context (startup, tests)
  }
  return undefined
}

function orgHeaders(organizationId?: string): Headers {
  const headers = new Headers()
  const orgId = organizationId ?? getDefaultOrgId()
  if (orgId) {
    headers.set('x-zitadel-orgid', orgId)
  }
  return headers
}

/**
 * Default CallOptions: the CALLER's token is forwarded, so Zitadel enforces
 * the same per-RPC permissions it enforced on its own REST surface. The
 * facade adds no authorization model of its own and never silently escalates
 * to the service PAT. Callers without a token get Zitadel's own
 * unauthenticated answer. Note that management operations require the token
 * to carry the Zitadel project audience
 * (scope urn:zitadel:iam:org:project:id:zitadel:aud), exactly as on REST.
 */
export function createCallOptions(organizationId?: string): {headers: Headers} {
  const headers = orgHeaders(organizationId)
  const token = getCallerToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return {headers}
}

// Re-export service descriptors for convenience
export {
  UserService,
  OrganizationService,
  SessionService,
  ProjectService,
  AuthorizationService,
  IdentityProviderService,
  ApplicationService
}
