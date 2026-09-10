// 폴러가 지키는 규칙들. 여기서 막는 사고가 전부 «한 번 나가면 못 되돌리는» 종류다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pollKind, pollOnce, type PollDeps } from './poll.ts'
import type { NexonDetail, NexonKind, NexonListItem } from './nexon.ts'
import type { Notice, PushText } from './notice.ts'

/** 표본이 «방금 올라온 글» 로 읽히게 시각을 고정한다. */
const 지금 = Date.parse('2026-09-01T01:00:00.000Z')

function item(sourceId: number, title: string, publishedAt = '2026-09-01T00:00:00.000Z'): NexonListItem {
  return { sourceId, title, url: `https://x.test/${sourceId}`, publishedAt }
}

function detailOf(one: NexonListItem, contents = '<p>본문</p>'): NexonDetail {
  return { ...one, contents, startsAt: null, endsAt: null, ongoing: null }
}

interface Recorder {
  deps: PollDeps
  saved: Notice[]
  sent: { notice: Notice; push: PushText }[]
}

function recorder(
  lists: Partial<Record<NexonKind, NexonListItem[]>>,
  options: {
    known?: string[]
    seeded?: NexonKind[]
    detail?: (kind: NexonKind, one: NexonListItem) => Promise<NexonDetail | null>
    onSend?: () => Promise<void>
  } = {},
): Recorder {
  const saved: Notice[] = []
  const sent: { notice: Notice; push: PushText }[] = []
  const known = new Set(options.known ?? [])
  const seeded = new Set(options.seeded ?? ['game', 'update', 'event', 'cashshop'])

  return {
    saved,
    sent,
    deps: {
      list: (kind) => Promise.resolve(lists[kind] ?? []),
      detail: options.detail ?? ((_, one) => Promise.resolve(detailOf(one))),
      knownIds: (ids) => Promise.resolve(new Set(ids.filter((id) => known.has(id)))),
      hasAny: (kind) => Promise.resolve(seeded.has(kind)),
      save: (notice) => {
        saved.push(notice)
        return Promise.resolve()
      },
      send: async (notice, push) => {
        await options.onSend?.()
        sent.push({ notice, push })
      },
      pace: () => Promise.resolve(),
      now: () => 지금,
    },
  }
}

test('아는 id 는 건너뛰고 새것만 저장한다', async () => {
  const rec = recorder({ game: [item(1, '옛것'), item(2, '새것')] }, { known: ['game-1'] })

  const result = await pollKind('game', rec.deps)

  assert.equal(result.saved, 1)
  assert.equal(rec.saved[0]?.id, 'game-2')
})

// 빈 표로 처음 돌면 목록 20건이 전부 «새 항목» 이다. 그대로 두면 첫 배포가 알림 79개를 쏜다.
test('그 분류의 첫 회차는 저장만 하고 발송하지 않는다', async () => {
  const rec = recorder({ game: [item(1, '가'), item(2, '나')] }, { seeded: [] })

  const result = await pollKind('game', rec.deps)

  assert.equal(result.saved, 2)
  assert.equal(result.sent, 0)
  assert.deepEqual(rec.sent, [])
})

test('둘째 회차부터 발송한다', async () => {
  const rec = recorder({ game: [item(1, '가')] })

  const result = await pollKind('game', rec.deps)

  assert.equal(result.sent, 1)
  // 알림 제목은 분류가 정하고, 공지 제목은 내용으로 간다.
  assert.equal(rec.sent[0]?.push.title, '새 공지 사항이 올라왔어요.')
  assert.equal(rec.sent[0]?.push.body, '가')
})

test('이벤트는 썬데이만 발송하고 나머지는 저장만 한다', async () => {
  const rec = recorder({
    event: [item(1, '울티마 유물 탐사'), item(2, '스페셜 썬데이 메이플'), item(3, 'VIP 사우나')],
  })

  const result = await pollKind('event', rec.deps)

  assert.equal(result.saved, 3)
  assert.equal(result.sent, 1)
  assert.equal(rec.sent[0]?.notice.title, '스페셜 썬데이 메이플')
})

// 목록에서 방금 빠진 글이다. 다시 부른다고 오지 않으므로 저장할 것도 없다.
test('상세를 못 받으면 저장도 발송도 안 한다', async () => {
  const rec = recorder({ game: [item(1, '사라진 글')] }, { detail: () => Promise.resolve(null) })

  const result = await pollKind('game', rec.deps)

  assert.deepEqual([result.saved, result.sent, result.missing], [0, 0, 1])
})

test('오래된 것부터 저장한다', async () => {
  // 알림이 발행 순서대로 도착해야 한다. 넥슨 목록은 최신순으로 온다.
  const rec = recorder({
    game: [item(3, '셋째', '2026-09-03T00:00:00.000Z'), item(1, '첫째', '2026-09-01T00:00:00.000Z')],
  })

  await pollKind('game', rec.deps)

  assert.deepEqual(rec.saved.map((n) => n.title), ['첫째', '셋째'])
})

test('본문은 블록에서 뽑은 평문이고 블록도 함께 저장한다', async () => {
  const rec = recorder(
    { game: [item(1, '공지')] },
    { detail: (_, one) => Promise.resolve(detailOf(one, '<p>첫 줄</p><p>둘째 줄</p>')) },
  )

  await pollKind('game', rec.deps)

  assert.equal(rec.saved[0]?.body, '첫 줄\n둘째 줄')
  assert.deepEqual(rec.saved[0]?.blocks, [
    { type: 'text', text: '첫 줄' },
    { type: 'text', text: '둘째 줄' },
  ])
})

test('링크는 넥슨 게시글 주소다', async () => {
  const rec = recorder({ game: [item(149862, '공지')] })

  await pollKind('game', rec.deps)

  assert.equal(rec.saved[0]?.link, 'https://x.test/149862')
})

// 저장이 발송보다 먼저다. 반대로 하면 알림은 갔는데 목록에 없는 공지가 생긴다.
test('발송이 실패해도 저장은 남는다', async () => {
  const rec = recorder(
    { game: [item(1, '가')] },
    { onSend: () => Promise.reject(new Error('FCM 죽음')) },
  )

  const result = await pollKind('game', rec.deps)

  assert.equal(result.saved, 1)
  assert.equal(result.failed, 1)
})

// 씨 뿌리기가 429 로 끊기면 다음 회차의 hasAny 가 참이 되어 남은 것이 전부 알림으로 나간다.
// 서버가 하루 죽었다 살아나는 경우도 같은 모양이다.
test('여섯 시간 넘은 글은 저장만 하고 알림을 안 보낸다', async () => {
  const rec = recorder({ game: [item(1, '어제 글', '2026-08-31T10:00:00.000Z')] })

  const result = await pollKind('game', rec.deps)

  assert.equal(result.saved, 1)
  assert.equal(result.sent, 0)
  assert.equal(result.quiet, 1)
})

test('여섯 시간 안쪽 글은 보낸다', async () => {
  const rec = recorder({ game: [item(1, '방금 글', '2026-09-01T00:30:00.000Z')] })

  assert.equal((await pollKind('game', rec.deps)).sent, 1)
})

test('한 분류가 실패해도 나머지는 돈다', async () => {
  const rec = recorder({ game: [item(1, '가')], cashshop: [item(2, '나')] })
  const deps: PollDeps = {
    ...rec.deps,
    list: (kind) => (kind === 'update' ? Promise.reject(new Error('429')) : rec.deps.list(kind)),
  }

  const summary = await pollOnce(deps)

  assert.equal(summary.saved, 2)
  assert.equal(summary.errors, 1)
})
