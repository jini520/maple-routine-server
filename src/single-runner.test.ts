// 인스턴스가 여럿일 때 고리가 한 쪽에서만 도는 것. 여기서 막는 사고는 알림이 두 번 나가는
// 것이라, 자물쇠를 못 잡은 회차가 정말 아무것도 안 하는지를 본다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pollOnce, startPolling, type PollDeps } from './poll.ts'
import { startScheduleWatch, type DuePush, type ScheduleDeps } from './schedule.ts'
import { LOCK_IDS, runAnyway, type RunExclusively } from './single-runner.ts'

/** 고리가 첫 회차를 끝낼 틈. `void loop()` 라 부른 쪽이 기다릴 수 없다. */
const 한숨 = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** 자물쇠를 잡은 척한다. */
const 잡힘: RunExclusively = (run) => run()

/** 다른 인스턴스가 들고 있어 못 잡은 척한다. `run` 을 안 부르는 것이 요점이다. */
function 못잡음(): { 시도: () => number; lock: RunExclusively } {
  let count = 0
  return {
    시도: () => count,
    lock: async () => {
      count += 1
    },
  }
}

function 폴러(): { 부른횟수: () => number; deps: PollDeps } {
  let called = 0
  return {
    부른횟수: () => called,
    deps: {
      list: async () => {
        called += 1
        return []
      },
      detail: async () => null,
      knownIds: async () => new Set(),
      hasAny: async () => true,
      save: async () => {},
      send: async () => {},
      pace: async () => {},
    },
  }
}

function 예약고리(): { 부른횟수: () => number; deps: ScheduleDeps } {
  let called = 0
  return {
    부른횟수: () => called,
    deps: {
      due: async (): Promise<DuePush[]> => {
        called += 1
        return []
      },
      send: async () => {},
    },
  }
}

test('자물쇠를 못 잡으면 폴러가 넥슨을 안 부른다', async () => {
  const 폴 = 폴러()
  const 자물쇠 = 못잡음()

  const stop = startPolling(폴.deps, 60_000, 자물쇠.lock)
  await 한숨()
  stop()

  assert.equal(자물쇠.시도(), 1, '자물쇠는 회차마다 한 번 시도한다')
  assert.equal(폴.부른횟수(), 0, '못 잡은 회차는 넥슨을 안 부른다')
})

test('자물쇠를 잡으면 폴러가 평소대로 돈다', async () => {
  const 폴 = 폴러()

  const stop = startPolling(폴.deps, 60_000, 잡힘)
  await 한숨()
  stop()

  // 분류 넷을 각각 부른다.
  assert.equal(폴.부른횟수(), 4)
})

test('자물쇠를 못 잡으면 예약 알림을 안 보낸다', async () => {
  const 예약 = 예약고리()
  const 자물쇠 = 못잡음()

  const stop = startScheduleWatch(예약.deps, 60_000, 자물쇠.lock)
  await 한숨()
  stop()

  assert.equal(자물쇠.시도(), 1)
  assert.equal(예약.부른횟수(), 0, '못 잡은 회차는 예약을 읽지도 않는다')
})

test('자물쇠를 잡으면 예약 고리가 평소대로 돈다', async () => {
  const 예약 = 예약고리()

  const stop = startScheduleWatch(예약.deps, 60_000, 잡힘)
  await 한숨()
  stop()

  assert.equal(예약.부른횟수(), 1)
})

test('자물쇠를 안 주면 막는 것이 없다', async () => {
  // 인스턴스가 하나뿐인 지금과 테스트가 기대는 기본값이다.
  const 폴 = 폴러()

  const stop = startPolling(폴.deps, 60_000)
  await 한숨()
  stop()

  assert.equal(폴.부른횟수(), 4)
})

test('회차가 던져도 자물쇠 바깥으로 안 샌다', async () => {
  // 자물쇠를 푸는 일은 `run` 이 던지든 말든 일어나야 한다. 여기서는 고리가 그 예외를 삼키는
  // 것까지 본다. 안 삼키면 미처리 rejection 으로 프로세스가 죽는다.
  const deps: PollDeps = {
    list: async () => {
      throw new Error('넥슨이 죽었다')
    },
    detail: async () => null,
    knownIds: async () => new Set(),
    hasAny: async () => true,
    save: async () => {},
    send: async () => {},
    pace: async () => {},
  }

  let 샌예외: unknown = null
  const stop = startPolling(deps, 60_000, async (run) => {
    try {
      await run()
    } catch (error) {
      샌예외 = error
    }
  })
  await 한숨()
  stop()

  assert.equal(샌예외, null, 'pollOnce 가 분류별 실패를 이미 삼킨다')
})

test('고리마다 자물쇠 번호가 다르다', () => {
  // 같으면 폴러가 도는 동안 예약 알림이 통째로 밀린다. 폴러 한 회차가 상세 스물까지 부른다.
  assert.notEqual(LOCK_IDS.poll, LOCK_IDS.schedule)

  // node-pg-migrate 가 부팅 때 쓰는 번호다. 겹치면 마이그레이션이 고리를 막는다.
  const 마이그레이션 = 7241865325823964
  assert.notEqual(LOCK_IDS.poll, 마이그레이션)
  assert.notEqual(LOCK_IDS.schedule, 마이그레이션)
})

test('기본 자물쇠는 그냥 통과시킨다', async () => {
  let 돌았나 = false
  await runAnyway(async () => {
    돌았나 = true
  })
  assert.equal(돌았나, true)
})

test('pollOnce 는 자물쇠를 모른다', async () => {
  // 자물쇠는 고리가 드는 것이고 회차 로직은 그대로다. 이 둘이 섞이면 회차를 테스트할 때마다
  // 자물쇠를 만들어 줘야 한다.
  const 폴 = 폴러()
  const summary = await pollOnce(폴.deps)
  assert.equal(summary.errors, 0)
})
