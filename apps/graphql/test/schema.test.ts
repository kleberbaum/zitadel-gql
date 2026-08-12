// test/schema.test.ts
// Schema smoke test. No network calls, no Zitadel required.
import {describe, expect, test} from 'bun:test'
import {existsSync, readFileSync} from 'fs'
import {join} from 'path'

import {graphql} from '../src/index'

const expectedQueries = [
  'user',
  'users',
  'usersByRole',
  'currentUser',
  'isUnique',
  'organization',
  'organizations',
  'project',
  'projects',
  'projectRoles',
  'session',
  'sessions',
  'application',
  'applications',
  'authorization',
  'authorizations',
  'idp',
  'idps'
]

const expectedMutations = [
  'createUser',
  'deleteUser',
  'deactivateUser',
  'reactivateUser',
  'lockUser',
  'unlockUser',
  'updateUser',
  'setUserPassword',
  'requestUserPasswordReset',
  'sendUserEmailVerification',
  'resendUserEmailVerification',
  'verifyUserEmail',
  'setUserPhone',
  'createAuthorization',
  'updateAuthorization',
  'deleteAuthorization'
]

describe('graphql export', () => {
  test('exposes every expected Query root field as a function', () => {
    for (const name of expectedQueries) {
      expect(typeof (graphql.Query as any)[name]).toBe('function')
    }
    expect(Object.keys(graphql.Query).sort()).toEqual([...expectedQueries].sort())
  })

  test('exposes every expected Mutation root field as a function', () => {
    for (const name of expectedMutations) {
      expect(typeof (graphql.Mutation as any)[name]).toBe('function')
    }
    expect(Object.keys(graphql.Mutation).sort()).toEqual([...expectedMutations].sort())
  })

  test('drops the old stub auth mutations', () => {
    for (const name of ['userSignIn', 'userSignOut', 'userRefresh']) {
      expect((graphql.Mutation as any)[name]).toBeUndefined()
    }
  })
})

describe('pylon build artifacts', () => {
  const pylonDir = join(import.meta.dir, '..', '.pylon')

  test('.pylon/index.js exists (run `bun run build` first)', () => {
    expect(existsSync(join(pylonDir, 'index.js'))).toBe(true)
  })

  test('built schema contains the expected root fields', () => {
    const schemaPath = join(pylonDir, 'schema.graphql')
    expect(existsSync(schemaPath)).toBe(true)

    const schema = readFileSync(schemaPath, 'utf8')
    for (const name of [...expectedQueries, ...expectedMutations]) {
      expect(schema).toContain(`${name}(`)
    }

    // The v1 REST surface and the stub auth mutations must be gone
    expect(schema).not.toContain('userSignIn')
    expect(schema).not.toContain('userSignOut')
    expect(schema).not.toContain('userRefresh')
  })
})
