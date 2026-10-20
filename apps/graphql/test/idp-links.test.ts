// test/idp-links.test.ts
// The idpLinks field of users against the stand-in Zitadel of
// fake-zitadel.ts. No Zitadel and no network beyond the loopback interface.
import {beforeEach, describe, expect, test} from 'bun:test'
import {create, fromBinary, toBinary} from '@bufbuild/protobuf'
import {
  ListIDPLinksRequestSchema,
  ListIDPLinksResponseSchema
} from '@zitadel/proto/zitadel/user/v2/user_service_pb'

import {answer, calls, inRequest, protoResponse, refusal, resetZitadel} from './fake-zitadel'
import {HumanUser} from '../src/user/HumanUser'
import {MachineUser} from '../src/user/MachineUser'
import {UserState} from '../src/user/types'

const linksByUser = new Map<string, {idpId: string; userId: string; userName: string}[]>()

function answerLinks() {
  answer('ListIDPLinks', body => {
    const {userId} = fromBinary(ListIDPLinksRequestSchema, body)
    const response = create(ListIDPLinksResponseSchema, {result: linksByUser.get(userId) ?? []})
    return protoResponse(toBinary(ListIDPLinksResponseSchema, response))
  })
}

function linkCalls() {
  return calls
    .filter(call => call.method === 'ListIDPLinks')
    .map(call => ({
      authorization: call.authorization,
      orgId: call.orgId,
      userId: fromBinary(ListIDPLinksRequestSchema, call.body).userId
    }))
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

beforeEach(() => {
  resetZitadel()
  linksByUser.clear()
  answerLinks()
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

    expect(linkCalls()).toEqual([{authorization: 'Bearer caller-token', orgId: 'org-walther', userId: 'user-1'}])
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

    expect(linkCalls()).toHaveLength(1)
  })

  test('fails the field when Zitadel refuses, instead of answering no links', async () => {
    answer('ListIDPLinks', () => refusal())

    await expect(inRequest('caller-token', () => human('user-1').idpLinks())).rejects.toThrow(/permission/i)
  })

  test('machine users answer the same field', async () => {
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
    expect(linkCalls()).toEqual([{authorization: 'Bearer caller-token', orgId: 'org-walther', userId: 'machine-1'}])
  })
})
