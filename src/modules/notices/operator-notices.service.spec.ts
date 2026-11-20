import type { NoticesRepository } from './notices.repository'
import type { PushService } from '../push/push.service'
import { MarkdownRejected } from './markdown-blocks'
import {
  AlreadyPublished,
  OperatorNoticesService,
  SchedulePassed,
} from './operator-notices.service'

const NOW = new Date('2026-10-15T03:04:05Z')

function build() {
  const repo = {
    listApp: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue({ id: 'n1' }),
    markSent: jest.fn().mockResolvedValue(undefined),
    findAppById: jest.fn(),
    updateApp: jest.fn().mockResolvedValue(true),
    deleteApp: jest.fn().mockResolvedValue(true),
    setPublishedAt: jest.fn().mockResolvedValue(undefined),
  }
  const push = { sendNotice: jest.fn().mockResolvedValue('msg-1') }
  const service = new OperatorNoticesService(
    repo as unknown as NoticesRepository,
    push as unknown as PushService,
  )
  service.clock = () => NOW
  return { service, repo, push }
}

const base = { title: '점검 안내', markdown: '오늘 밤 점검', link: null, publishAt: null }
/** base 를 저장할 때 표에 들어가는 값. 마크다운을 바꾼 블록과 평문이 함께 간다. */
const stored = {
  title: base.title,
  markdown: base.markdown,
  link: null,
  blocks: [{ type: 'text', text: '오늘 밤 점검' }],
  body: '오늘 밤 점검',
}

describe('OperatorNoticesService.create', () => {
  it('알림 없이 쓰면 저장만 하고 열쇠는 notice-YYYYMMDD-HHMMSS 다', async () => {
    const { service, repo, push } = build()

    const result = await service.create({ ...base, push: null })

    expect(result).toEqual({ id: 'n1', noticeKey: 'notice-20261015-030405', messageId: null })
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'app', ...stored, publishedAt: NOW, scheduledAt: null }),
    )
    expect(push.sendNotice).not.toHaveBeenCalled()
    expect(repo.markSent).not.toHaveBeenCalled()
  })

  it('마크다운을 블록과 평문으로 바꿔 원문과 함께 저장하고, 알림 문구를 비우면 바꾼 평문을 쓴다', async () => {
    const { service, repo, push } = build()
    const markdown = '## 새 기능\n\n![](https://mapleroutine.store/assets/a.webp)\n\n메모를 붙여요'

    await service.create({
      ...base,
      markdown,
      push: { title: null, body: null },
    })

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown,
        blocks: [
          { type: 'heading', text: '새 기능' },
          { type: 'image', src: 'https://mapleroutine.store/assets/a.webp' },
          { type: 'text', text: '메모를 붙여요' },
        ],
        body: '새 기능\n메모를 붙여요',
      }),
    )
    expect(push.sendNotice).toHaveBeenCalledWith(
      expect.objectContaining({ body: '새 기능\n메모를 붙여요', pushBody: null }),
    )
  })

  it('주소가 https 가 아니면 저장도 발송도 하지 않는다', async () => {
    const { service, repo, push } = build()

    await expect(
      service.create({
        ...base,
        markdown: '![](http://x.test/a.png)',
        push: { title: null, body: null },
      }),
    ).rejects.toBeInstanceOf(MarkdownRejected)
    expect(repo.insert).not.toHaveBeenCalled()
    expect(push.sendNotice).not.toHaveBeenCalled()
  })

  it('지금 보내기는 저장 뒤 발송하고 sent_at 을 적는다', async () => {
    const { service, repo, push } = build()

    const result = await service.create({
      ...base,
      push: { title: '점검', body: '밤 10시' },
    })

    expect(result.messageId).toBe('msg-1')
    expect(push.sendNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        noticeKey: 'notice-20261015-030405',
        pushTitle: '점검',
        pushBody: '밤 10시',
      }),
    )
    expect(repo.markSent).toHaveBeenCalledWith('n1', NOW)
    expect(repo.insert.mock.invocationCallOrder[0]).toBeLessThan(
      push.sendNotice.mock.invocationCallOrder[0],
    )
  })

  // 공지가 안 보이는데 알림이 먼저 가거나, 보이는데 알림이 뒤늦게 가지 않게 둘을 같은 시각에 묶는다.
  it('예약하면 게시 시각이 예약 시각이 되고, 켠 알림은 같은 시각으로 적어 두고 지금 보내지 않는다', async () => {
    const { service, repo, push } = build()
    const later = new Date('2026-10-15T12:00:00Z')

    const result = await service.create({
      ...base,
      publishAt: later,
      push: { title: null, body: null },
    })

    expect(result.messageId).toBeNull()
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ publishedAt: later, scheduledAt: later, pushTitle: null }),
    )
    expect(push.sendNotice).not.toHaveBeenCalled()

    await service.create({ ...base, publishAt: later, push: null })
    expect(repo.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({ publishedAt: later, scheduledAt: null }),
    )
  })

  it('지난 시각의 예약은 거절하고 저장하지 않는다', async () => {
    const { service, repo } = build()

    await expect(service.create({ ...base, publishAt: NOW, push: null })).rejects.toBeInstanceOf(
      SchedulePassed,
    )
    expect(repo.insert).not.toHaveBeenCalled()
  })
})

describe('OperatorNoticesService.update', () => {
  const existing = {
    id: 'n1',
    noticeKey: 'notice-20261001-000000',
    kind: 'app',
    title: '옛 제목',
    body: '옛 본문',
    link: null,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    pushTitle: '예약 문구',
    pushBody: '예약 본문',
  }

  it('없거나 넥슨 공지면 null 이다', async () => {
    const { service, repo } = build()
    repo.findAppById.mockResolvedValue(null)

    expect(await service.update('x', { ...base, push: null })).toBeNull()
    expect(repo.updateApp).not.toHaveBeenCalled()
  })

  it('알림을 안 켜면 제목 · 본문 · 링크만 고치고 예약 문구는 안 건드린다', async () => {
    const { service, repo, push } = build()
    repo.findAppById.mockResolvedValue(existing)

    expect(await service.update('n1', { ...base, push: null })).toEqual({ messageId: null })

    expect(repo.updateApp).toHaveBeenCalledWith('n1', stored)
    expect(push.sendNotice).not.toHaveBeenCalled()
  })

  it('주소가 https 가 아니면 고치지 않는다', async () => {
    const { service, repo } = build()
    repo.findAppById.mockResolvedValue(existing)

    await expect(
      service.update('n1', { ...base, markdown: '[글](http://x.test)', push: null }),
    ).rejects.toBeInstanceOf(MarkdownRejected)
    expect(repo.updateApp).not.toHaveBeenCalled()
  })

  it('알림을 켜면 지금 보내고 보낸 문구를 덮고 published_at 은 그대로다', async () => {
    const { service, repo, push } = build()
    repo.findAppById.mockResolvedValue(existing)

    const result = await service.update('n1', { ...base, push: { title: '다시', body: '알림' } })

    expect(result).toEqual({ messageId: 'msg-1' })
    expect(repo.updateApp).toHaveBeenCalledWith('n1', {
      ...stored,
      pushTitle: '다시',
      pushBody: '알림',
    })
    expect(push.sendNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        noticeKey: 'notice-20261001-000000',
        title: '점검 안내',
        publishedAt: existing.publishedAt,
        pushTitle: '다시',
      }),
    )
    expect(repo.markSent).toHaveBeenCalledWith('n1', NOW)
  })
})

describe('OperatorNoticesService 예약한 공지', () => {
  const later = new Date('2026-10-16T00:00:00Z')
  const pending = {
    id: 'n2',
    noticeKey: 'notice-20261015-000000',
    kind: 'app',
    title: '예약 공지',
    body: '본문',
    link: null,
    publishedAt: later,
    scheduledAt: later,
    sentAt: null,
    pushTitle: null,
    pushBody: null,
  }

  it('고치면 올릴 시각을 바꾸고 알림 예약도 그 시각으로 옮긴다. 알림을 끄면 예약을 지운다', async () => {
    const { service, repo, push } = build()
    repo.findAppById.mockResolvedValue(pending)
    const moved = new Date('2026-10-17T00:00:00Z')

    await service.update('n2', { ...base, publishAt: moved, push: { title: '곧', body: null } })
    expect(repo.updateApp).toHaveBeenCalledWith('n2', {
      ...stored,
      pushTitle: '곧',
      pushBody: null,
      publishedAt: moved,
      scheduledAt: moved,
    })
    await service.update('n2', { ...base, push: null })
    expect(repo.updateApp).toHaveBeenLastCalledWith('n2', {
      ...stored,
      publishedAt: later,
      scheduledAt: null,
    })
    expect(push.sendNotice).not.toHaveBeenCalled()
  })

  it('올라간 공지의 시각을 바꾸면 AlreadyPublished, 지난 시각이면 SchedulePassed 다', async () => {
    const { service, repo } = build()
    repo.findAppById.mockResolvedValue({
      ...pending,
      publishedAt: new Date('2026-10-01T00:00:00Z'),
    })
    await expect(
      service.update('n2', { ...base, publishAt: later, push: null }),
    ).rejects.toBeInstanceOf(AlreadyPublished)
    repo.findAppById.mockResolvedValue(pending)
    await expect(
      service.update('n2', { ...base, publishAt: NOW, push: null }),
    ).rejects.toBeInstanceOf(SchedulePassed)
    expect(repo.updateApp).not.toHaveBeenCalled()
  })

  it('지금 올리기는 게시 시각을 지금으로 당기고 켠 알림을 지금 보낸다. 알림이 없으면 보내지 않고, 올라간 공지는 AlreadyPublished 다', async () => {
    const { service, repo, push } = build()
    repo.findAppById.mockResolvedValue(pending)
    expect(await service.publishNow('n2')).toBe(true)
    expect(repo.setPublishedAt).toHaveBeenCalledWith('n2', NOW, NOW)
    expect(push.sendNotice).toHaveBeenCalledWith(expect.objectContaining({ publishedAt: NOW }))
    expect(repo.markSent).toHaveBeenCalledWith('n2', NOW)

    repo.findAppById.mockResolvedValue({ ...pending, scheduledAt: null })
    expect(await service.publishNow('n2')).toBe(true)
    expect(repo.setPublishedAt).toHaveBeenLastCalledWith('n2', NOW, null)
    expect(push.sendNotice).toHaveBeenCalledTimes(1)

    repo.findAppById.mockResolvedValue({
      ...pending,
      publishedAt: new Date('2026-10-01T00:00:00Z'),
    })
    await expect(service.publishNow('n2')).rejects.toBeInstanceOf(AlreadyPublished)
    repo.findAppById.mockResolvedValue(null)
    expect(await service.publishNow('nobody')).toBe(false)
  })
})
