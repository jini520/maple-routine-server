// 운영자 창구의 판정 둘. DB 와 FCM 을 타는 핸들러는 여기서 안 돌리고, 그 앞에서 답을
// 정하는 순수 함수만 본다. 여기서 막는 사고는 «엉뚱한 공지를 지우는» 종류다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { missingFields, scheduleError, type AdminForm } from './admin.ts'

const 온전한폼: AdminForm = {
  title: '점검 안내',
  body: '9월 17일 새벽 2시부터 점검합니다.',
  pushTitle: '',
  pushBody: '',
  push: false,
  schedule: false,
  scheduledAt: '',
  dryRun: false,
}

/** 예약 판정의 기준 시각. 2026-09-19 12:00 KST. */
const 지금 = Date.parse('2026-09-19T03:00:00.000Z')

const 예약폼: AdminForm = {
  ...온전한폼,
  pushTitle: '점검 안내',
  pushBody: '새벽 2시부터 점검합니다.',
  push: true,
  schedule: true,
  scheduledAt: '2026-09-19T11:00:00.000Z',
}

test('제목과 내용이 있으면 빠진 칸이 없다', () => {
  assert.deepEqual(missingFields(온전한폼), [])
})

test('제목이 비면 제목을 짚는다', () => {
  assert.deepEqual(missingFields({ ...온전한폼, title: '' }), ['제목'])
})

test('내용이 비면 내용을 짚는다', () => {
  assert.deepEqual(missingFields({ ...온전한폼, body: '' }), ['내용'])
})

// 알림을 안 보낼 거면 그 칸은 비어 있는 것이 정상이다. 여기서 따지면 공지만 저장할 수 없다.
test('알림을 끄면 알림 칸이 비어도 안 따진다', () => {
  assert.deepEqual(missingFields({ ...온전한폼, push: false }), [])
})

test('알림을 켜면 알림 제목과 내용을 따진다', () => {
  assert.deepEqual(missingFields({ ...온전한폼, push: true }), ['알림 제목', '알림 내용'])
})

test('빠진 칸을 화면에 뜨는 순서대로 짚는다', () => {
  const 빈폼: AdminForm = { ...온전한폼, title: '', body: '', push: true }

  assert.deepEqual(missingFields(빈폼), ['제목', '내용', '알림 제목', '알림 내용'])
})

test('예약을 켜면 보낼 시각을 따진다', () => {
  assert.deepEqual(missingFields({ ...예약폼, scheduledAt: '' }), ['보낼 시각'])
})

test('예약을 켜고 시각을 채우면 빠진 칸이 없다', () => {
  assert.deepEqual(missingFields(예약폼), [])
})

// 예약 칸은 알림 아래에 있다. 알림을 껐으면 화면에서 흐려져 있고, 그때 남아 있던 값이 함께
// 올라와도 따질 것이 없다.
test('알림을 끄면 예약 칸을 안 따진다', () => {
  assert.deepEqual(missingFields({ ...예약폼, push: false, scheduledAt: '' }), [])
})

test('예약한 시각이 앞이면 통과한다', () => {
  assert.equal(scheduleError(예약폼, 지금), null)
})

test('예약을 안 켰으면 시각을 안 본다', () => {
  assert.equal(scheduleError({ ...예약폼, schedule: false, scheduledAt: '어제' }, 지금), null)
})

// 화면이 ISO 8601 로 바꿔 보낸다. 그 밖의 값이 오는 것은 화면을 거치지 않은 요청이다.
test('못 읽는 시각은 거절한다', () => {
  assert.equal(scheduleError({ ...예약폼, scheduledAt: '내일 저녁' }, 지금), '보낼 시각을 읽을 수 없습니다')
})

// `Date.parse` 는 이 값을 거절하지 않고 **프로세스의 시간대**로 읽는다. 컨테이너가 UTC 로 돌면
// 운영자가 고른 KST 20:00 이 9시간 뒤로 밀린다. 그래서 시간대가 붙은 값만 받는다.
test('시간대가 없는 시각은 거절한다', () => {
  assert.equal(
    scheduleError({ ...예약폼, scheduledAt: '2026-09-19T20:00' }, 지금),
    '보낼 시각을 읽을 수 없습니다',
  )
  assert.equal(
    scheduleError({ ...예약폼, scheduledAt: '2026-09-19 20:00' }, 지금),
    '보낼 시각을 읽을 수 없습니다',
  )
})

// 오프셋을 직접 붙여 보내는 화면도 있을 수 있다. Z 만 받으면 그 값이 거절된다.
test('오프셋이 붙은 시각을 받는다', () => {
  assert.equal(scheduleError({ ...예약폼, scheduledAt: '2026-09-19T20:00:00+09:00' }, 지금), null)
})

// 지난 시각을 넣는 것은 오타다. 지금 보내려면 예약을 끄면 된다.
test('지난 시각은 거절한다', () => {
  assert.equal(
    scheduleError({ ...예약폼, scheduledAt: '2026-09-19T02:00:00.000Z' }, 지금),
    '보낼 시각이 이미 지났습니다',
  )
})

