// test/fake-zitadel.ts
// A stand-in for Zitadel in the tests: a Connect server on the loopback
// interface that records every call and answers the methods a test sets up,
// in the binary format the facade's transport speaks. Resolvers under test
// run inside inRequest, the request context the facade reads the caller's
// token and its per-request caches from.
import {asyncContext} from '@getcronit/pylon'

export type Call = {
  method: string
  authorization: string | null
  orgId: string | null
  body: Uint8Array
}

type Handler = (body: Uint8Array) => Response

export const calls: Call[] = []
const handlers = new Map<string, Handler>()

const zitadel = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(req) {
    const method = new URL(req.url).pathname.split('/').pop() ?? ''
    const body = new Uint8Array(await req.arrayBuffer())
    calls.push({
      method,
      authorization: req.headers.get('authorization'),
      orgId: req.headers.get('x-zitadel-orgid'),
      body
    })
    const handler = handlers.get(method)
    if (!handler) {
      return Response.json({code: 'unimplemented', message: `no answer for ${method}`}, {status: 501})
    }
    return handler(body)
  }
})

// the server must not keep the test run alive once the tests are done
zitadel.unref()

// The facade creates its Zitadel client on first use and reads the base URL
// then, so this has to be set before any test reaches Zitadel.
process.env.ZITADEL_BASE_URL = `http://127.0.0.1:${zitadel.port}`

/** Answers every call of the Connect method (the last path segment) with handler. */
export function answer(method: string, handler: Handler) {
  handlers.set(method, handler)
}

/** A successful unary Connect answer carrying the binary message. */
export function protoResponse(message: Uint8Array<ArrayBuffer>): Response {
  return new Response(message, {headers: {'content-type': 'application/proto'}})
}

/** Zitadel's answer to a caller without the permission. */
export function refusal(): Response {
  return Response.json({code: 'permission_denied', message: 'No matching permissions found'}, {status: 403})
}

/** Forgets the recorded calls and every answer set up so far. */
export function resetZitadel() {
  calls.length = 0
  handlers.clear()
}

/**
 * Runs fn the way a resolver runs, inside a request whose bearer token is
 * the given one and whose caller counts as signed in for requireAuth.
 */
export function inRequest<T>(token: string, fn: () => Promise<T>): Promise<T> {
  const store = new Map<string, unknown>([['auth', {user: {sub: 'caller'}}]])
  const ctx = {
    req: {
      header: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined)
    },
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => {
      store.set(key, value)
    }
  }
  return asyncContext.run(ctx as any, fn)
}
