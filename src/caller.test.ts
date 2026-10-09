import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { callerFor, KEY_HASH_HEADER, type CallerDeps } from './caller.ts'
import { SESSION_HEADER } from './auth-routes.ts'

const ME = '11111111-1111-4111-8111-111111111111'
const KEY_USER = '22222222-2222-4222-8222-222222222222'
const HASH = createHash('sha256').update('어떤 키', 'utf8').digest('hex')

function fakeDeps(over: Partial<CallerDeps> = {}): CallerDeps & { calls: string[] } {
  const calls: string[] = []
  const base: CallerDeps = {
    userIdForSession: async () => null,
    userIdForApiKey: async () => null,
    ...over,
  }
  return {
    calls,
    userIdForSession: async (value) => {
      calls.push('session')
      return base.userIdForSession(value)
    },
    userIdForApiKey: async (value) => {
      calls.push('key')
      return base.userIdForApiKey(value)
    },
  }
}

describe('부른 사람 가리기', () => {
  it('세션으로 사람을 찾는다', async () => {
    const deps = fakeDeps({ userIdForSession: async () => ME })

    assert.deepEqual(await callerFor(deps, { [SESSION_HEADER]: '세션값' }), { userId: ME })
    assert.deepEqual(deps.calls, ['session'])
  })

  it('세션이 없으면 키 해시로 찾는다', async () => {
    const deps = fakeDeps({ userIdForApiKey: async () => KEY_USER })

    assert.deepEqual(await callerFor(deps, { [KEY_HASH_HEADER]: HASH }), { userId: KEY_USER })
    assert.deepEqual(deps.calls, ['key'])
  })

  it('둘이 다 오면 세션이 이긴다', async () => {
    // 로그인한 사용자의 기록이 키 해시 쪽으로 갈라지면 사람 한 표로 모은 것이 다시 쪼개진다.
    const deps = fakeDeps({
      userIdForSession: async () => ME,
      userIdForApiKey: async () => KEY_USER,
    })

    assert.deepEqual(
      await callerFor(deps, { [SESSION_HEADER]: '세션값', [KEY_HASH_HEADER]: HASH }),
      { userId: ME },
    )
    assert.deepEqual(deps.calls, ['session'])
  })

  it('세션이 왔는데 죽었으면 키 해시로 안 넘어간다', async () => {
    // 넘어가면 그 사람의 기록이 두 열쇠로 갈라진다. 재로그인을 요구하는 것이 맞는 답이다.
    const deps = fakeDeps({ userIdForApiKey: async () => KEY_USER })

    assert.deepEqual(
      await callerFor(deps, { [SESSION_HEADER]: '죽은세션', [KEY_HASH_HEADER]: HASH }),
      { error: 'signin_required' },
    )
    assert.deepEqual(deps.calls, ['session'])
  })

  it('로그인했지만 uid 를 못 받은 세션은 사람이 아니다', async () => {
    // `userForLogin` 이 그 세션을 사람으로 승격하지 않는다. 조회는 되고 쓰기만 안 된다.
    const deps = fakeDeps({ userIdForSession: async () => null })

    assert.deepEqual(await callerFor(deps, { [SESSION_HEADER]: '세션값' }), {
      error: 'signin_required',
    })
  })

  it('열쇠가 아예 없으면 거부한다', async () => {
    const deps = fakeDeps()

    assert.deepEqual(await callerFor(deps, {}), { error: 'unauthorized' })
    assert.deepEqual(deps.calls, [])
  })

  it('빈 헤더는 없는 것과 같다', async () => {
    const deps = fakeDeps()

    assert.deepEqual(await callerFor(deps, { [SESSION_HEADER]: '  ', [KEY_HASH_HEADER]: '' }), {
      error: 'unauthorized',
    })
    assert.deepEqual(deps.calls, [])
  })

  it('해시 모양이 틀리면 거부한다', async () => {
    // 키 원문이 실려 오면 길이가 안 맞아 여기서 걸린다.
    const deps = fakeDeps({ userIdForApiKey: async () => null })

    assert.deepEqual(await callerFor(deps, { [KEY_HASH_HEADER]: '키원문처럼생긴값' }), {
      error: 'unauthorized',
    })
  })

  it('헤더가 배열로 와도 첫 값을 읽는다', async () => {
    // 같은 헤더를 두 번 보내면 Fastify 가 배열로 준다.
    const deps = fakeDeps({ userIdForApiKey: async () => KEY_USER })

    assert.deepEqual(await callerFor(deps, { [KEY_HASH_HEADER]: [HASH, HASH] }), {
      userId: KEY_USER,
    })
  })
})
