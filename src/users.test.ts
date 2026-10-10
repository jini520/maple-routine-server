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
    deletedAt: null,
    ...over,
  }
}

const DELETED = new Date('2026-10-09T00:00:00Z')

/**
 * 부른 것을 적는 가짜. 조회 인자까지 단언하려고 모아 둔다.
 *
 * **기록은 감싸는 쪽이 한다.** `...over` 로 함수를 덮으면 그 안의 `calls.push` 가 함께 사라져,
 * 덮은 테스트에서는 부른 순서를 단언할 수 없다.
 */
function fakeDeps(over: Partial<UserDeps> = {}): UserDeps & { calls: string[]; seen: unknown[] } {
  const calls: string[] = []
  const seen: unknown[] = []
  const base: UserDeps = {
    findUserByNexonUid: async () => null,
    findUserByApiKeyHash: async () => null,
    insertUser: async (keys) => user({ nexonUid: keys.nexonUid ?? null }),
    restoreUser: async () => undefined,
    ...over,
  }
  return {
    calls,
    seen,
    findUserByNexonUid: async (uid) => {
      calls.push('findByUid')
      seen.push(uid)
      return base.findUserByNexonUid(uid)
    },
    findUserByApiKeyHash: async (sealed) => {
      calls.push('findByHash')
      seen.push(sealed)
      return base.findUserByApiKeyHash(sealed)
    },
    insertUser: async (keys) => {
      calls.push('insert')
      seen.push(keys)
      return base.insertUser(keys)
    },
    restoreUser: async (id) => {
      calls.push('restore')
      seen.push(id)
      return base.restoreUser(id)
    },
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

describe('탈퇴한 사람이 돌아오면', () => {
  it('로그인으로 돌아오면 되살리고 그 사람을 준다', async () => {
    // 같은 uid 라 사람 행이 하나뿐이고, 새로 만들면 `nexon_uid` 의 UNIQUE 가 막는다.
    const 탈퇴한사람 = user({ id: 'abc', nexonUid: 'uid-1', deletedAt: DELETED })
    const deps = fakeDeps({ findUserByNexonUid: async () => 탈퇴한사람 })

    const found = await userForLogin(deps, 'uid-1')

    assert.equal(found?.id, 'abc')
    // **돌려주는 값에도 탈퇴 표시가 없어야 한다.** 남아 있으면 부르는 쪽이 아직 탈퇴 상태로 본다.
    assert.equal(found?.deletedAt, null)
    assert.deepEqual(deps.calls, ['findByUid', 'restore'])
    assert.equal(deps.seen[1], 'abc')
  })

  it('키로 돌아오면 되살리고 그 사람을 준다', async () => {
    const 탈퇴한사람 = user({ id: 'def', deletedAt: DELETED })
    const deps = fakeDeps({ findUserByApiKeyHash: async () => 탈퇴한사람 })

    const found = await userForApiKey(deps, SOME_HASH)

    assert.equal(found?.id, 'def')
    assert.equal(found?.deletedAt, null)
    assert.deepEqual(deps.calls, ['findByHash', 'restore'])
  })

  it('활동 중인 사람에게는 되살리기를 안 부른다', async () => {
    // 요청마다 쓸데없는 UPDATE 가 도는 것을 막는다.
    const deps = fakeDeps({ findUserByNexonUid: async () => user({ nexonUid: 'uid-1' }) })

    await userForLogin(deps, 'uid-1')

    assert.ok(!deps.calls.includes('restore'))
  })

  it('방금 만든 사람에게도 안 부른다', async () => {
    const deps = fakeDeps()

    await userForLogin(deps, 'uid-1')

    assert.deepEqual(deps.calls, ['findByUid', 'insert'])
  })
})
