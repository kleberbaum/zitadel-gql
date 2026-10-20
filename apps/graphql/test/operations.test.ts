// test/operations.test.ts
// The operations a registration flow builds on (the Walther wiki's, see
// walther-registration contracts section 5.6), each run through its
// resolver against the stand-in Zitadel of fake-zitadel.ts: which Zitadel
// call it makes with which arguments and token, and what it answers.
import {beforeEach, describe, expect, test} from 'bun:test'
import {create, fromBinary, toBinary} from '@bufbuild/protobuf'
import {
  GetUserByIDRequestSchema,
  GetUserByIDResponseSchema
} from '@zitadel/proto/zitadel/user/v2/user_service_pb'
import {UserState as ProtoUserState} from '@zitadel/proto/zitadel/user/v2/user_pb'

import {answer, calls, inRequest, protoResponse, resetZitadel} from './fake-zitadel'
import {UserServices} from '../src/user'
import type {HumanUser} from '../src/user/HumanUser'

const ORG_ID = 'org-walther'

function protoUser(userId: string, emailVerified: boolean) {
  return {
    userId,
    state: ProtoUserState.ACTIVE,
    username: 'person@example.com',
    preferredLoginName: 'person@example.com',
    details: {resourceOwner: ORG_ID},
    type: {
      case: 'human' as const,
      value: {
        profile: {givenName: 'Erika', familyName: 'Mustermann'},
        email: {email: 'person@example.com', isVerified: emailVerified}
      }
    }
  }
}

function callsOf(method: string) {
  return calls.filter(call => call.method === method)
}

beforeEach(() => {
  resetZitadel()
})

describe('user(args: {id})', () => {
  test('answers state, organization, username, names, email and whether the email is verified', async () => {
    answer('GetUserByID', body => {
      const {userId} = fromBinary(GetUserByIDRequestSchema, body)
      const response = create(GetUserByIDResponseSchema, {user: protoUser(userId, true)})
      return protoResponse(toBinary(GetUserByIDResponseSchema, response))
    })

    const profile = await inRequest('registration-pat', async () => {
      const user = (await UserServices.user({id: 'user-1'})) as HumanUser
      expect(user.__typename).toBe('HumanUser')
      expect(user.state).toBe('USER_STATE_ACTIVE' as any)
      expect(user.userName).toBe('person@example.com')
      expect(user.resourceOwner).toBe(ORG_ID)
      return (await user.profiles()).edges[0].node
    })

    expect(profile).toMatchObject({
      firstName: 'Erika',
      lastName: 'Mustermann',
      email: 'person@example.com',
      isEmailVerified: true
    })
    expect(callsOf('GetUserByID').map(call => call.authorization)).toEqual(['Bearer registration-pat'])
  })

  test('reports an unverified email address as such', async () => {
    answer('GetUserByID', body => {
      const {userId} = fromBinary(GetUserByIDRequestSchema, body)
      const response = create(GetUserByIDResponseSchema, {user: protoUser(userId, false)})
      return protoResponse(toBinary(GetUserByIDResponseSchema, response))
    })

    const profile = await inRequest('registration-pat', async () => {
      const user = (await UserServices.user({id: 'user-1'})) as HumanUser
      return (await user.profiles()).edges[0].node
    })

    expect(profile.isEmailVerified).toBe(false)
  })

  test('refuses a caller who is not signed in before calling Zitadel', async () => {
    await expect(
      inRequest('', () => UserServices.user({id: 'user-1'}), {signedIn: false})
    ).rejects.toThrow('Authentication required')
    expect(calls).toEqual([])
  })
})
