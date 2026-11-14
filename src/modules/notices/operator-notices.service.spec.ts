import type { NoticesRepository } from './notices.repository'
import type { PushService } from '../push/push.service'
import { MarkdownRejected } from './markdown-blocks'
import { OperatorNoticesService, SchedulePassed } from './operator-notices.service'

const NOW = new Date('2026-10-15T03:04:05Z')

function build() {
  const repo = {
    listApp: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue({ id: 'n1' }),
    markSent: jest.fn().mockResolvedValue(undefined),
    findAppById: jest.fn(),
    updateApp: jest.fn().mockResolvedValue(true),
    deleteApp: jest.fn().mockResolvedValue(true),
    cancelSchedule: jest.fn().mockResolvedValue(true),
  }
  const push = { sendNotice: jest.fn().mockResolvedValue('msg-1') }
  const service = new OperatorNoticesService(
    repo as unknown as NoticesRepository,
    push as unknown as PushService,
  )
  service.clock = () => NOW
  return { service, repo, push }
}

const base = { title: '점검 안내', markdown: '오늘 밤 점검', link: null }
/** base 를 저장할 때 표에 들어가는 값. 마크다운을 바꾼 블록과 평문이 함께 간다. */
const stored = { ...base, blocks: [{ type: 'text', text: '오늘 밤 점검' }], body: '오늘 밤 점검' }

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
      push: { title: null, body: null, scheduledAt: null },
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
        push: { title: null, body: null, scheduledAt: null },
      }),
    ).rejects.toBeInstanceOf(MarkdownRejected)
    expect(repo.insert).not.toHaveBeenCalled()
    expect(push.sendNotice).not.toHaveBeenCalled()
  })

  it('지금 보내기는 저장 뒤 발송하고 sent_at 을 적는다', async () => {
    const { service, repo, push } = build()

    const result = await service.create({
      ...base,
      push: { title: '점검', body: '밤 10시', scheduledAt: null },
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

  it('예약하면 시각과 문구를 적어 두고 보내지 않는다', async () => {
    const { service, repo, push } = build()
    const later = new Date('2026-10-15T12:00:00Z')

    const result = await service.create({
      ...base,
      push: { title: null, body: null, scheduledAt: later },
    })

    expect(result.messageId).toBeNull()
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: later, pushTitle: null, pushBody: null }),
    )
    expect(push.sendNotice).not.toHaveBeenCalled()
  })

  it('지난 시각의 예약은 거절하고 저장하지 않는다', async () => {
    const { service, repo } = build()

    await expect(
      service.create({ ...base, push: { title: null, body: null, scheduledAt: NOW } }),
    ).rejects.toBeInstanceOf(SchedulePassed)
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
