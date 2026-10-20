// test/operations.test.ts
// The operations a registration flow builds on (the Walther wiki's, see
// walther-registration contracts section 5.6), each run through its
// resolver against the stand-in Zitadel of fake-zitadel.ts: which Zitadel
// call it makes with which arguments and token, and what it answers.
import {beforeEach, describe, expect, test} from 'bun:test'
import {create, fromBinary, toBinary} from '@bufbuild/protobuf'
import {
  GetUserByIDRequestSchema,
  GetUserByIDResponseSchema,
  ListUsersRequestSchema,
  ListUsersResponseSchema
} from '@zitadel/proto/zitadel/user/v2/user_service_pb'
import {UserState as ProtoUserState} from '@zitadel/proto/zitadel/user/v2/user_pb'
import {
  ListAuthorizationsRequestSchema,
  ListAuthorizationsResponseSchema
} from '@zitadel/proto/zitadel/authorization/v2/authorization_service_pb'
import {State as ProtoAuthorizationState} from '@zitadel/proto/zitadel/authorization/v2/authorization_pb'
import {
  AddUsersToGroupRequestSchema,
  AddUsersToGroupResponseSchema,
  ListGroupUsersRequestSchema,
  ListGroupUsersResponseSchema,
  ListGroupsRequestSchema,
  ListGroupsResponseSchema
} from '@zitadel/proto/zitadel/group/v2/group_service_pb'

import {answer, calls, inRequest, protoResponse, refusal, resetZitadel} from './fake-zitadel'
import {UserServices} from '../src/user'
import {GroupServices} from '../src/group/services'
import type {HumanUser} from '../src/user/HumanUser'

const ORG_ID = 'org-walther'
const PROJECT_ID = 'project-zitadel'

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

describe('usersByRole(args: {roleKey})', () => {
  test('answers the holders of the role with the authorizations that carry it', async () => {
    answer('ListAuthorizations', () => {
      const response = create(ListAuthorizationsResponseSchema, {
        authorizations: [
          {
            id: 'authorization-1',
            user: {id: 'approver-1'},
            project: {id: PROJECT_ID, name: 'ZITADEL'},
            organization: {id: ORG_ID},
            state: ProtoAuthorizationState.ACTIVE,
            roles: [{key: 'wiki:approver'}]
          }
        ]
      })
      return protoResponse(toBinary(ListAuthorizationsResponseSchema, response))
    })
    answer('ListUsers', () => {
      const response = create(ListUsersResponseSchema, {result: [protoUser('approver-1', true)]})
      return protoResponse(toBinary(ListUsersResponseSchema, response))
    })

    const holders = await inRequest('registration-pat', async () => {
      const connection = await UserServices.usersByRole({roleKey: 'wiki:approver'})
      return Promise.all(
        connection.edges.map(async ({node}) => {
          const user = node as HumanUser
          const grants = await user.grants()
          const profile = (await user.profiles()).edges[0].node
          return {
            id: user.id,
            state: user.state,
            email: profile.email,
            isEmailVerified: profile.isEmailVerified,
            grants: grants.edges.map(({node: grant}) => ({projectId: grant.projectId, state: grant.state}))
          }
        })
      )
    })

    expect(holders).toEqual([
      {
        id: 'approver-1',
        state: 'USER_STATE_ACTIVE' as any,
        email: 'person@example.com',
        isEmailVerified: true,
        grants: [{projectId: PROJECT_ID, state: 'ACTIVE'}]
      }
    ])

    const [listAuthorizations] = callsOf('ListAuthorizations')
    const filter = fromBinary(ListAuthorizationsRequestSchema, listAuthorizations.body).filters[0].filter
    expect(filter.case).toBe('roleKey')
    expect(filter.case === 'roleKey' ? filter.value.key : '').toBe('wiki:approver')
    // the grants travel with the users, nothing is read per user
    expect(callsOf('ListAuthorizations')).toHaveLength(1)
    expect(callsOf('ListUsers')).toHaveLength(1)
  })
})

describe('groups(args: {organizationId, name})', () => {
  test('filters by organization and name and answers the group ids', async () => {
    answer('ListGroups', () => {
      const response = create(ListGroupsResponseSchema, {
        groups: [{id: 'group-1', name: 'walther-group', organizationId: ORG_ID}]
      })
      return protoResponse(toBinary(ListGroupsResponseSchema, response))
    })

    const connection = await inRequest('registration-pat', () =>
      GroupServices.list({organizationId: ORG_ID, name: 'walther-group'})
    )

    expect(connection.edges.map(({node}) => ({id: node.id, name: node.name}))).toEqual([
      {id: 'group-1', name: 'walther-group'}
    ])
    const request = fromBinary(ListGroupsRequestSchema, callsOf('ListGroups')[0].body)
    expect(request.filters.map(f => f.filter.case)).toEqual(['organizationId', 'nameFilter'])
  })
})

describe('addUsersToGroup(args: {groupId, userIds})', () => {
  test('adds the users with the caller token and answers true', async () => {
    answer('AddUsersToGroup', () =>
      protoResponse(toBinary(AddUsersToGroupResponseSchema, create(AddUsersToGroupResponseSchema, {})))
    )

    const added = await inRequest('registration-pat', () =>
      GroupServices.addUsersToGroup({groupId: 'group-1', userIds: ['user-1']})
    )

    expect(added).toBe(true)
    const [call] = callsOf('AddUsersToGroup')
    expect(call.authorization).toBe('Bearer registration-pat')
    expect(fromBinary(AddUsersToGroupRequestSchema, call.body)).toMatchObject({id: 'group-1', userIds: ['user-1']})
  })

  test('fails when Zitadel refuses', async () => {
    answer('AddUsersToGroup', () => refusal())

    await expect(
      inRequest('registration-pat', () => GroupServices.addUsersToGroup({groupId: 'group-1', userIds: ['user-1']}))
    ).rejects.toThrow(/permission/i)
  })
})

describe('userGroups(userId)', () => {
  test('answers the groups of the user', async () => {
    answer('ListGroupUsers', () => {
      const response = create(ListGroupUsersResponseSchema, {
        groupUsers: [{groupId: 'group-1', groupName: 'walther-group', organizationId: ORG_ID, user: {id: 'user-1'}}]
      })
      return protoResponse(toBinary(ListGroupUsersResponseSchema, response))
    })

    const connection = await inRequest('registration-pat', () => GroupServices.listByUser('user-1'))

    expect(connection.edges.map(({node}) => ({groupId: node.groupId, groupName: node.groupName}))).toEqual([
      {groupId: 'group-1', groupName: 'walther-group'}
    ])
    const request = fromBinary(ListGroupUsersRequestSchema, callsOf('ListGroupUsers')[0].body)
    expect(request.filters[0].filter.case).toBe('userIds')
  })

  test('answers an empty connection when Zitadel fails, so a caller cannot tell that from no group', async () => {
    answer('ListGroupUsers', () => refusal())

    const connection = await inRequest('registration-pat', () => GroupServices.listByUser('user-1'))

    expect(connection.totalCount).toBe(0)
    expect(connection.edges).toEqual([])
  })
})
