import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { sealApiKeyHash, userForApiKey, userForLogin, type User, type UserDeps } from './users.ts'

const SOME_HASH = createHash('sha256').update('어떤 키', 'utf8').digest('hex')

function user(over: Partial<User> = {}): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nexonUid: null,
    createdAt: new Date('2026-10-08T00:00:00Z'),
    lastSeenAt: new Date('2026-10-08T00:00:00Z'),
    ...over,
  }
}

/** 부른 것을 적는 가짜. 조회 인자까지 단언하려고 모아 둔다. */
function fakeDeps(over: Partial<UserDeps> = {}): UserDeps & { calls: string[]; seen: unknown[] } {
  const calls: string[] = []
  const seen: unknown[] = []
  return {
    calls,
    seen,
    findUserByNexonUid: async (uid) => {
      calls.push('findByUid')
      seen.push(uid)
      return null
    },
    findUserByApiKeyHash: async (sealed) => {
      calls.push('findByHash')
      seen.push(sealed)
      return null
    },
    insertUser: async (keys) => {
      calls.push('insert')
      seen.push(keys)
      return user({ nexonUid: keys.nexonUid ?? null })
    },
    ...over,
  }
}

describe('로그인으로 들어온 사람', () => {
  it('uid 로 기존 사람을 찾는다', async () => {
    const found = user({ id: 'abc', nexonUid: 'uid-1' })
    const deps = fakeDeps({ findUserByNexonUid: async () => found })

    assert.equal(await userForLogin(deps, 'uid-1'), found)
    assert.ok(!deps.calls.includes('insert'))
  })

  it('없으면 만든다', async () => {
    const deps = fakeDeps()
    const made = await userForLogin(deps, 'uid-1')

    assert.equal(made?.nexonUid, 'uid-1')
    assert.deepEqual(deps.calls, ['findByUid', 'insert'])
    assert.deepEqual(deps.seen[1], { nexonUid: 'uid-1' })
  })

  it('uid 가 없으면 사람을 만들지 않는다', async () => {
    // userinfo 가 실패해도 로그인은 진행한다. 그 세션은 조회만 되고 새 기능은 안 열린다.
    const deps = fakeDeps()

    assert.equal(await userForLogin(deps, null), null)
    assert.deepEqual(deps.calls, [])
  })

  it('빈 문자열도 없는 것으로 본다', async () => {
    const deps = fakeDeps()

    assert.equal(await userForLogin(deps, ''), null)
    assert.deepEqual(deps.calls, [])
  })
})

describe('키로 들어온 사람', () => {
  it('받은 해시를 다시 해시해 찾는다', async () => {
    const deps = fakeDeps()
    await userForApiKey(deps, SOME_HASH)

    // **받은 값 그대로로 찾지 않는다.** DB 가 새도 그것으로 남의 기록을 열 수 없어야 한다.
    assert.notEqual((deps.seen[0] as Buffer).toString('hex'), SOME_HASH)
    assert.deepEqual(deps.seen[0], sealApiKeyHash(SOME_HASH))
  })

  it('없으면 만들고, 저장도 다시 해시한 값으로 한다', async () => {
    const deps = fakeDeps()
    const made = await userForApiKey(deps, SOME_HASH)

    assert.ok(made !== null)
    assert.deepEqual(deps.calls, ['findByHash', 'insert'])
    assert.deepEqual(deps.seen[1], { apiKeyHash: sealApiKeyHash(SOME_HASH) })
  })

  it('기존 사람이 있으면 안 만든다', async () => {
    const found = user({ id: 'abc' })
    const deps = fakeDeps({ findUserByApiKeyHash: async () => found })

    assert.equal(await userForApiKey(deps, SOME_HASH), found)
    assert.ok(!deps.calls.includes('insert'))
  })

  it('SHA-256 hex 가 아니면 거절한다', async () => {
    // 모양을 안 보면 아무 문자열이나 사람 행이 되어 쓰레기가 쌓인다.
    for (const bad of ['', 'nope', SOME_HASH.slice(0, 63), `${SOME_HASH}0`, SOME_HASH.toUpperCase()]) {
      const deps = fakeDeps()
      assert.equal(await userForApiKey(deps, bad), null, bad)
      assert.deepEqual(deps.calls, [], bad)
    }
  })
})

describe('받은 해시를 감싸는 것', () => {
  it('같은 값은 같게, 다른 값은 다르게 나온다', () => {
    assert.deepEqual(sealApiKeyHash(SOME_HASH), sealApiKeyHash(SOME_HASH))
    assert.notDeepEqual(sealApiKeyHash(SOME_HASH), sealApiKeyHash(SOME_HASH.replace(/.$/, '0')))
  })

  it('32바이트다', () => {
    assert.equal(sealApiKeyHash(SOME_HASH).length, 32)
  })
})
