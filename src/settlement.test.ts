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

/** `console.warn` 을 가로채 줄을 모은다. */
async function 경고를모아(run: () => Promise<WatchState>): Promise<{ state: WatchState; lines: string[] }> {
  const lines: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    return { state: await run(), lines }
  } finally {
    console.warn = original
  }
}

const 결산중: Probe = { ok: false, status: 400, code: 'OPENAPI00009' }
const 끝났다: Probe = { ok: true, status: 200, code: null }
const 모름: Probe = { ok: false, status: 0, code: null }

/** 그 밤의 첫 타점을 지난 상태. 대부분의 표본이 여기서 시작한다. */
const 첫타점 = KST('2026-09-17T00:01:00')

test('창 밖(낮)에는 넥슨을 안 부르고 결산 중이 아니다', async () => {
  const { deps, calls } = watcher([결산중], KST('2026-09-16T14:00:00'))

  const next = await tick(IDLE, deps)

  assert.equal(calls.length, 0)
  assert.equal(next.settling, false)
})

test('20:00 은 아직 창 밖이다', async () => {
  const { deps, calls } = watcher([결산중], KST('2026-09-16T20:00:00'))

  const next = await tick(IDLE, deps)

  assert.equal(calls.length, 0)
  assert.equal(next.settling, false)
})

// 자정 전에는 결산을 가를 신호가 없다. 하루가 안 끝나 `date=오늘` 이 400 `OPENAPI00004` 로
// 거절되고, 남은 `date` 없는 조회는 결산 중에도 200 을 준다(2026-07-31 실측).
test('자정 직전에는 안 부른다', async () => {
  const { deps, calls } = watcher([결산중], KST('2026-09-16T23:59:00'))

  const next = await tick(IDLE, deps)

  assert.equal(calls.length, 0)
  assert.equal(next.settling, false)
})

test('00:00 정각에는 아직 안 부른다. 첫 타점은 00:01 이다', async () => {
  const { deps, calls } = watcher([결산중], KST('2026-09-17T00:00:30'))

  const next = await tick(IDLE, deps)

  assert.equal(calls.length, 0)
  assert.equal(next.settling, false)
})

test('00:01 에 어제 날짜로 묻는다', async () => {
  const { deps, calls } = watcher([결산중], 첫타점)

  await tick(IDLE, deps)

  assert.deepEqual(calls, [{ date: '2026-09-16' }])
})

test('OPENAPI00009 면 결산 중이고 시작 시각이 선다', async () => {
  const { deps } = watcher([결산중], 첫타점)

  const next = await tick(IDLE, deps)

  assert.equal(next.settling, true)
  assert.equal(next.startedAt, new Date(첫타점).toISOString())
})

test('결산 중을 보면 다음 타점은 02:00 이고 그 사이에는 안 묻는다', async () => {
  const settling = await tick(IDLE, watcher([결산중], 첫타점).deps)

  assert.equal(settling.nextProbeAt, KST('2026-09-17T02:00:00'))

  const 사이 = watcher([끝났다], KST('2026-09-17T01:30:00'))
  const next = await tick(settling, 사이.deps)

  assert.equal(사이.calls.length, 0, '00:01 과 02:00 사이에는 쭉 쉰다')
  assert.equal(next.settling, true, '쉬는 동안 판정이 안 바뀐다')
})

test('결산이 이어져도 시작 시각은 처음 본 그대로다', async () => {
  const first = await tick(IDLE, watcher([결산중], 첫타점).deps)

  const next = await tick(first, watcher([결산중], KST('2026-09-17T02:00:00')).deps)

  assert.equal(next.startedAt, new Date(첫타점).toISOString())
})

test('02:00 에 끝났으면 그날 밤은 더 안 묻는다', async () => {
  const settling = await tick(IDLE, watcher([결산중], 첫타점).deps)

  const done = await tick(settling, watcher([끝났다], KST('2026-09-17T02:00:00')).deps)
  const after = watcher([결산중], KST('2026-09-17T02:30:00'))
  const next = await tick(done, after.deps)

  assert.equal(done.settling, false)
  assert.equal(done.startedAt, null)
  assert.equal(after.calls.length, 0, '끈 밤에는 다시 안 부른다')
  assert.equal(next.settling, false)
})

test('02:00 에 정상으로 끝나면 로그를 안 남긴다', async () => {
  const settling = await tick(IDLE, watcher([결산중], 첫타점).deps)

  const { lines } = await 경고를모아(() =>
    tick(settling, watcher([끝났다], KST('2026-09-17T02:00:40')).deps),
  )

  assert.deepEqual(lines, [])
})

test('02:00 에 안 끝났으면 1분마다 묻는다', async () => {
  const settling = await tick(IDLE, watcher([결산중], 첫타점).deps)

  const still = await tick(settling, watcher([결산중], KST('2026-09-17T02:00:00')).deps)

  assert.equal(still.settling, true)
  assert.equal(still.nextProbeAt, KST('2026-09-17T02:01:00'))
})

test('02:00 을 넘겨 끝나면 그 시각을 로그로 남긴다', async () => {
  const settling = await tick(IDLE, watcher([결산중], 첫타점).deps)
  const still = await tick(settling, watcher([결산중], KST('2026-09-17T02:00:00')).deps)

  const { state, lines } = await 경고를모아(() =>
    tick(still, watcher([끝났다], KST('2026-09-17T02:07:00')).deps),
  )

  assert.equal(state.doneNight, '2026-09-16')
  assert.equal(lines.length, 1)
  assert.match(lines[0] ?? '', /02:00/)
  assert.match(lines[0] ?? '', /2026-09-16T17:07/, '끝난 시각을 적는다')
})

// 사용자 결정 2026-09-26. 실측은 00:00:0x 에 이미 결산 중이었지만, 넥슨이 시작을 늦추면
// 첫 타점의 200 이 «결산이 없다» 가 아니라 «아직 시작 안 했다» 다. 창이 닫힐 때까지 기다린다.
test('첫 타점에 아직 시작을 안 했으면 1분마다 기다린다', async () => {
  const waiting = await tick(IDLE, watcher([끝났다], 첫타점).deps)

  assert.equal(waiting.settling, false)
  assert.equal(waiting.doneNight, null, '시작을 못 본 200 으로 밤을 끄지 않는다')
  assert.equal(waiting.nextProbeAt, KST('2026-09-17T00:02:00'))
})

test('늦게 시작해도 다음 타점은 02:00 이다', async () => {
  const late = await tick(IDLE, watcher([결산중], KST('2026-09-17T00:30:00')).deps)

  assert.equal(late.settling, true)
  assert.equal(late.nextProbeAt, KST('2026-09-17T02:00:00'))
})

test('02:00 을 넘겨 시작하면 1분 뒤에 다시 묻는다', async () => {
  const late = await tick(IDLE, watcher([결산중], KST('2026-09-17T03:00:00')).deps)

  assert.equal(late.nextProbeAt, KST('2026-09-17T03:01:00'), '02:00 은 이미 지났다')
})

test('다음 날 밤 00:01 이 되면 다시 부른다', async () => {
  const done = await tick(
    await tick(IDLE, watcher([결산중], 첫타점).deps),
    watcher([끝났다], KST('2026-09-17T02:00:00')).deps,
  )

  const tonight = watcher([끝났다], KST('2026-09-18T00:01:00'))
  await tick(done, tonight.deps)

  assert.deepEqual(tonight.calls, [{ date: '2026-09-17' }])
})

test('06:00 이 되면 끝을 못 봤어도 결산 중이 아니게 된다', async () => {
  const settling = await tick(IDLE, watcher([결산중], KST('2026-09-17T05:50:00')).deps)

  const out = watcher([결산중], KST('2026-09-17T06:00:00'))
  const next = await tick(settling, out.deps)

  assert.equal(settling.settling, true)
  assert.equal(next.settling, false)
  assert.equal(next.startedAt, null)
  assert.equal(next.nextProbeAt, null, '다음 밤은 첫 타점부터 다시 센다')
  assert.equal(out.calls.length, 0)
})

test('모름은 결산 중을 새로 선언하지 않는다', async () => {
  const { deps } = watcher([모름], 첫타점)

  const next = await tick(IDLE, deps)

  assert.equal(next.settling, false)
  assert.equal(next.nextProbeAt, KST('2026-09-17T00:02:00'), '1분 뒤에 다시 묻는다')
})

test('모름은 이미 본 결산을 안 지운다', async () => {
  const settling = await tick(IDLE, watcher([결산중], 첫타점).deps)

  const next = await tick(settling, watcher([모름], KST('2026-09-17T02:00:00')).deps)

  assert.equal(next.settling, true, '넥슨이 한 번 못 답했다고 배너가 깜빡이면 안 된다')
  assert.equal(next.startedAt, settling.startedAt)
})

test('넥슨이 던져도 회차가 안 죽는다', async () => {
  const state: WatchState = IDLE
  const deps = {
    probe: () => Promise.reject(new Error('네트워크')),
    now: () => 첫타점,
  }

  const next = await tick(state, deps)

  assert.equal(next.settling, false)
})

test('앱에 주는 모양은 결산 여부와 시작 시각 둘이다', async () => {
  const settling = await tick(IDLE, watcher([결산중], 첫타점).deps)

  assert.deepEqual(settlementOf(settling), {
    settling: true,
    startedAt: '2026-09-16T15:01:00.000Z',
  })
  assert.deepEqual(settlementOf(IDLE), { settling: false, startedAt: null })
})
