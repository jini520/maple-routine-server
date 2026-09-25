// 세션 하나로 넥슨을 부를 수 있는 상태를 만드는 자리. 여기서 막는 사고는 둘이다.
//
// ① 죽은 토큰으로 넥슨을 불러 401 을 받고, 그것이 사용자에게 재로그인으로 보이는 것.
//    진짜 원인은 갱신을 안 돌린 것인데 그 사실이 묻힌다.
// ② 갱신 토큰까지 만료됐는데 계속 붙잡고 있는 것. 그때는 행을 지우고 앱에 알려야 한다.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

import { needsRefresh, sessionExpired, type StoredSession } from './nexon-session.ts'

const 원래 = { ...process.env }

beforeEach(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString('hex')
})

afterEach(() => {
  process.env = { ...원래 }
})

const 지금 = new Date('2026-09-26T12:00:00.000Z')

function 세션(덮어쓸것: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionHash: Buffer.alloc(32),
    nexonUid: null,
    accessToken: '액세스',
    accessExpiresAt: new Date('2026-09-26T12:20:00.000Z'),
    refreshToken: '갱신',
    refreshExpiresAt: new Date('2026-10-05T00:00:00.000Z'),
    ...덮어쓸것,
  }
}

test('액세스가 넉넉히 남았으면 갱신을 안 한다', () => {
  assert.equal(needsRefresh(세션(), 지금), false)
})

test('액세스가 곧 죽으면 미리 갱신한다', () => {
  // 딱 만료 시각에 갱신하면, 부르러 가는 사이에 죽어 401 이 온다. 여유를 두고 바꾼다.
  const 곧죽음 = 세션({ accessExpiresAt: new Date('2026-09-26T12:00:30.000Z') })
  assert.equal(needsRefresh(곧죽음, 지금), true)
})

test('액세스가 이미 죽었으면 갱신한다', () => {
  const 죽음 = 세션({ accessExpiresAt: new Date('2026-09-26T11:00:00.000Z') })
  assert.equal(needsRefresh(죽음, 지금), true)
})

test('갱신 토큰이 살아 있으면 세션도 산다', () => {
  assert.equal(sessionExpired(세션(), 지금), false)
})

test('갱신 토큰까지 만료되면 세션이 죽는다', () => {
  // 2주 넘게 앱을 안 켠 사용자가 여기 걸린다. 행을 지우고 앱에 재로그인을 알린다.
  const 지난 = 세션({ refreshExpiresAt: new Date('2026-09-25T00:00:00.000Z') })
  assert.equal(sessionExpired(지난, 지금), true)
})

test('액세스가 죽어도 갱신 토큰이 살아 있으면 세션은 안 죽는다', () => {
  // 이 둘을 안 가르면, 30분 지난 사용자가 전부 재로그인 화면을 본다.
  const 액세스만죽음 = 세션({ accessExpiresAt: new Date('2026-09-26T11:00:00.000Z') })

  assert.equal(sessionExpired(액세스만죽음, 지금), false)
  assert.equal(needsRefresh(액세스만죽음, 지금), true)
})

test('만료 시각이 딱 지금이면 죽은 것으로 본다', () => {
  // 경계에서 살아 있다고 보면 그 요청이 401 을 받는다.
  const 딱 = 세션({ refreshExpiresAt: 지금 })
  assert.equal(sessionExpired(딱, 지금), true)
})
