// 운영자 창구의 판정 둘. DB 와 FCM 을 타는 핸들러는 여기서 안 돌리고, 그 앞에서 답을
// 정하는 순수 함수만 본다. 여기서 막는 사고는 «엉뚱한 공지를 지우는» 종류다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { adminNoticeId, missingFields, type AdminForm } from './admin.ts'

const 온전한폼: AdminForm = {
  title: '점검 안내',
  body: '9월 17일 새벽 2시부터 점검합니다.',
  pushTitle: '',
  pushBody: '',
  push: false,
  dryRun: false,
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

test('수정·삭제가 가리키는 공지 id 를 읽는다', () => {
  assert.equal(adminNoticeId('/admin/notices/notice-20260916-120000'), 'notice-20260916-120000')
})

// 목록과 작성이 쓰는 경로다. 여기서 id 를 읽으면 목록 조회가 상세 수정으로 새어 나간다.
test('id 가 없는 경로는 안 읽는다', () => {
  assert.equal(adminNoticeId('/admin/notices'), null)
  assert.equal(adminNoticeId('/admin/notices/'), null)
})

test('다른 관리자 경로는 안 읽는다', () => {
  assert.equal(adminNoticeId('/admin/list'), null)
  assert.equal(adminNoticeId('/admin'), null)
})

// id 에 공백이나 슬래시가 들어 있으면 주소에 인코딩돼 온다. 안 풀면 DB 의 id 와 안 맞아
// 멀쩡한 공지가 없는 것이 된다.
test('인코딩된 id 를 푼다', () => {
  assert.equal(adminNoticeId('/admin/notices/notice%20a'), 'notice a')
})
