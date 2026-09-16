// 결산 확인이 지키는 규칙들. 여기서 막는 사고는 «앱에 거짓을 말하는» 종류다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { IDLE, settlementOf, tick, type Probe, type WatchState } from './settlement.ts'

/** KST 시각을 epoch ms 로. 서버가 UTC 로 돌아도 판정은 KST 라서 표본을 KST 로 적는다. */
const KST = (text: string): number => Date.parse(`${text}+09:00`)

interface Call {
  date: string | null
}

function watcher(answers: Probe[], at: number): { deps: Parameters<typeof tick>[1]; calls: Call[] } {
  const calls: Call[] = []
  let turn = 0

  return {
    calls,
    deps: {
      probe: (date) => {
        calls.push({ date })
        const answer = answers[Math.min(turn, answers.length - 1)]
        turn += 1
        return Promise.resolve(answer ?? { ok: true, status: 200, code: null })
      },
      now: () => at,
    },
  }
}

const 결산중: Probe = { ok: false, status: 400, code: 'OPENAPI00009' }
const 끝났다: Probe = { ok: true, status: 200, code: null }
const 모름: Probe = { ok: false, status: 0, code: null }

test('창 밖(낮)에는 넥슨을 안 부르고 결산 중이 아니다', async () => {
  const { deps, calls } = watcher([결산중], KST('2026-09-16T14:00:00'))

  const next = await tick(IDLE, deps)

  assert.equal(calls.length, 0)
  assert.equal(next.settling, false)
})

test('20:00 에 창이 열리고, 자정 전에는 `date` 없이 부른다', async () => {
  const { deps, calls } = watcher([끝났다], KST('2026-09-16T20:00:00'))

  await tick(IDLE, deps)

  assert.deepEqual(calls, [{ date: null }])
})

test('자정 뒤에는 켠 날 날짜로 부른다', async () => {
  const { deps, calls } = watcher([결산중], KST('2026-09-17T02:00:00'))

  await tick(IDLE, deps)

  assert.deepEqual(calls, [{ date: '2026-09-16' }])
})

test('자정 뒤 OPENAPI00009 면 결산 중이고 시작 시각이 선다', async () => {
  const at = KST('2026-09-17T00:30:00')
  const { deps } = watcher([결산중], at)

  const next = await tick(IDLE, deps)

  assert.equal(next.settling, true)
  assert.equal(next.startedAt, new Date(at).toISOString())
})

test('결산이 이어져도 시작 시각은 처음 본 그대로다', async () => {
  const 처음 = KST('2026-09-17T00:30:00')
  const first = await tick(IDLE, watcher([결산중], 처음).deps)

  const next = await tick(first, watcher([결산중], KST('2026-09-17T02:00:00')).deps)

  assert.equal(next.startedAt, new Date(처음).toISOString())
})

test('자정 뒤 200 이면 결산이 끝나고 그날 밤은 더 안 부른다', async () => {
  const settling = await tick(IDLE, watcher([결산중], KST('2026-09-17T00:30:00')).deps)

  const done = await tick(settling, watcher([끝났다], KST('2026-09-17T03:40:00')).deps)
  const after = watcher([결산중], KST('2026-09-17T04:00:00'))
  const next = await tick(done, after.deps)

  assert.equal(done.settling, false)
  assert.equal(done.startedAt, null)
  assert.equal(after.calls.length, 0, '끈 밤에는 다시 안 부른다')
  assert.equal(next.settling, false)
})

test('다음 날 밤 20:00 이 되면 다시 부른다', async () => {
  const done = await tick(
    await tick(IDLE, watcher([결산중], KST('2026-09-17T00:30:00')).deps),
    watcher([끝났다], KST('2026-09-17T03:40:00')).deps,
  )

  const tonight = watcher([끝났다], KST('2026-09-17T20:10:00'))
  await tick(done, tonight.deps)

  assert.deepEqual(tonight.calls, [{ date: null }])
})

test('06:00 이 되면 끝을 못 봤어도 결산 중이 아니게 된다', async () => {
  const settling = await tick(IDLE, watcher([결산중], KST('2026-09-17T05:50:00')).deps)

  const out = watcher([결산중], KST('2026-09-17T06:00:00'))
  const next = await tick(settling, out.deps)

  assert.equal(settling.settling, true)
  assert.equal(next.settling, false)
  assert.equal(next.startedAt, null)
  assert.equal(out.calls.length, 0)
})

test('자정 전 200 은 아직 결산 전이다', async () => {
  const { deps } = watcher([끝났다], KST('2026-09-16T22:00:00'))

  const next = await tick(IDLE, deps)

  assert.equal(next.settling, false)
})

test('자정 전 오류는 판정하지 않는다. 그 신호를 아직 모른다', async () => {
  const { deps } = watcher([결산중], KST('2026-09-16T23:00:00'))

  const next = await tick(IDLE, deps)

  assert.equal(next.settling, false, '자정 전 OPENAPI00009 를 결산 중으로 읽지 않는다')
})

test('모름은 결산 중을 새로 선언하지 않는다', async () => {
  const { deps } = watcher([모름], KST('2026-09-17T01:00:00'))

  const next = await tick(IDLE, deps)

  assert.equal(next.settling, false)
})

test('모름은 이미 본 결산을 안 지운다', async () => {
  const settling = await tick(IDLE, watcher([결산중], KST('2026-09-17T00:30:00')).deps)

  const next = await tick(settling, watcher([모름], KST('2026-09-17T01:00:00')).deps)

  assert.equal(next.settling, true, '넥슨이 한 번 못 답했다고 배너가 깜빡이면 안 된다')
  assert.equal(next.startedAt, settling.startedAt)
})

test('넥슨이 던져도 회차가 안 죽는다', async () => {
  const state: WatchState = IDLE
  const deps = {
    probe: () => Promise.reject(new Error('네트워크')),
    now: () => KST('2026-09-17T01:00:00'),
  }

  const next = await tick(state, deps)

  assert.equal(next.settling, false)
})

test('앱에 주는 모양은 결산 여부와 시작 시각 둘이다', async () => {
  const settling = await tick(IDLE, watcher([결산중], KST('2026-09-17T00:30:00')).deps)

  assert.deepEqual(settlementOf(settling), {
    settling: true,
    startedAt: '2026-09-16T15:30:00.000Z',
  })
  assert.deepEqual(settlementOf(IDLE), { settling: false, startedAt: null })
})
