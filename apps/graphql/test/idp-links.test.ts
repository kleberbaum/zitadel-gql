// test/idp-links.test.ts
// The idpLinks field of users against a stand-in for Zitadel: a local
// Connect server answering ListIDPLinks in the binary format the transport
// speaks. No Zitadel and no network beyond the loopback interface.
import {afterAll, beforeAll, beforeEach, describe, expect, test} from 'bun:test'
import {create, fromBinary, toBinary} from '@bufbuild/protobuf'
import {asyncContext} from '@getcronit/pylon'
import {
  ListIDPLinksRequestSchema,
  ListIDPLinksResponseSchema
} from '@zitadel/proto/zitadel/user/v2/user_service_pb'

import {HumanUser} from '../src/user/HumanUser'
import {MachineUser} from '../src/user/MachineUser'
import {UserState} from '../src/user/types'

type Call = {method: string; authorization: string | null; orgId: string | null; userId?: string}

const calls: Call[] = []
const linksByUser = new Map<string, {idpId: string; userId: string; userName: string}[]>()
let refuseLinks = false

const zitadel = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(req) {
    const method = new URL(req.url).pathname.split('/').pop() ?? ''
    const body = new Uint8Array(await req.arrayBuffer())
    const call: Call = {
      method,
      authorization: req.headers.get('authorization'),
      orgId: req.headers.get('x-zitadel-orgid')
    }
    calls.push(call)

    if (method !== 'ListIDPLinks') {
      return new Response('unexpected call', {status: 404})
    }

    if (refuseLinks) {
      return Response.json(
        {code: 'permission_denied', message: 'No matching permissions found'},
        {status: 403}
      )
    }

    const {userId} = fromBinary(ListIDPLinksRequestSchema, body)
    call.userId = userId
    const response = create(ListIDPLinksResponseSchema, {result: linksByUser.get(userId) ?? []})
    return new Response(toBinary(ListIDPLinksResponseSchema, response), {
      headers: {'content-type': 'application/proto'}
    })
  }
})

/**
 * Runs fn the way a resolver runs, inside a request whose bearer token is
 * the given one. The facade reads the caller's token and its per-request
 * caches from this context.
 */
function inRequest<T>(token: string, fn: () => Promise<T>): Promise<T> {
  const store = new Map<string, unknown>()
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

function human(id: string) {
  return new HumanUser({
    id,
    state: UserState.USER_STATE_ACTIVE,
    userName: 'person@example.com',
    loginNames: ['person@example.com'],
    preferredLoginName: 'person@example.com',
    resourceOwner: 'org-walther',
    changeDate: '',
    creationDate: '',
    sequence: '1',
    email: 'person@example.com'
  })
}

beforeAll(() => {
  // the client is created on first use and reads its base URL then
  process.env.ZITADEL_BASE_URL = `http://127.0.0.1:${zitadel.port}`
})

afterAll(() => {
  zitadel.stop(true)
})

beforeEach(() => {
  calls.length = 0
  linksByUser.clear()
  refuseLinks = false
})

describe('idpLinks', () => {
  test('reads nothing until the field is asked', async () => {
    await inRequest('caller-token', async () => {
      human('user-1')
    })

    expect(calls).toEqual([])
  })

  test('answers the links of the user with their provider, external id and external name', async () => {
    linksByUser.set('user-1', [
      {idpId: 'idp-id-austria', userId: 'qes-sub-1', userName: 'person@example.com'},
      {idpId: 'idp-other', userId: 'other-1', userName: 'erika'}
    ])

    const links = await inRequest('caller-token', () => human('user-1').idpLinks())

    expect(links.map(link => ({...link}))).toEqual([
      {id: 'idplink:idp-id-austria:qes-sub-1', idpId: 'idp-id-austria', userId: 'qes-sub-1', userName: 'person@example.com'},
      {id: 'idplink:idp-other:other-1', idpId: 'idp-other', userId: 'other-1', userName: 'erika'}
    ])
  })

  test("forwards the caller's own token and asks for exactly that user", async () => {
    await inRequest('caller-token', () => human('user-1').idpLinks())

    expect(calls).toEqual([
      {method: 'ListIDPLinks', authorization: 'Bearer caller-token', orgId: 'org-walther', userId: 'user-1'}
    ])
  })

  test('answers an empty list for a user without links', async () => {
    const links = await inRequest('caller-token', () => human('user-2').idpLinks())

    expect(links).toEqual([])
  })

  test('reads the links of a user once per request', async () => {
    linksByUser.set('user-1', [{idpId: 'idp-id-austria', userId: 'qes-sub-1', userName: 'person@example.com'}])

    await inRequest('caller-token', async () => {
      const user = human('user-1')
      await user.idpLinks()
      await user.idpLinks()
      await human('user-1').idpLinks()
    })

    expect(calls.filter(call => call.method === 'ListIDPLinks')).toHaveLength(1)
  })

  test('fails the field when Zitadel refuses, instead of answering no links', async () => {
    refuseLinks = true

    await expect(inRequest('caller-token', () => human('user-1').idpLinks())).rejects.toThrow(
      /permission/i
    )
  })

  test('machine users answer the same field', async () => {
    linksByUser.set('machine-1', [])
    const machine = new MachineUser({
      id: 'machine-1',
      state: UserState.USER_STATE_ACTIVE,
      userName: 'wiki-registration',
      loginNames: [],
      preferredLoginName: 'wiki-registration',
      resourceOwner: 'org-walther',
      changeDate: '',
      creationDate: '',
      sequence: '1'
    })

    expect(await inRequest('caller-token', () => machine.idpLinks())).toEqual([])
    expect(calls[0]).toMatchObject({method: 'ListIDPLinks', userId: 'machine-1'})
  })
})
