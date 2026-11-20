import { Injectable } from '@nestjs/common'

import { type PushableNotice } from '../push/push-text'
import { PushService } from '../push/push.service'
import { markdownToNotice } from './markdown-blocks'
import { operatorNoticeKey } from './notice-key'
import { type AppNoticeRow, type NewNotice, NoticesRepository } from './notices.repository'

/** 알림 문구. null 이면 공지 제목과 본문을 그대로 쓴다. */
export interface PushRequest {
  title: string | null
  body: string | null
}

export interface CreateInput {
  title: string
  /** 운영자가 쓴 본문. 저장할 때 블록과 평문 body 로 바꾼다. */
  markdown: string
  link: string | null
  /** 올릴 시각. null 이면 지금 올린다. 그 시각 전에는 앱에 보이지 않는다. */
  publishAt: Date | null
  /** null 이면 알림을 안 보낸다. 있으면 올리는 시각에 보낸다. */
  push: PushRequest | null
}

export interface UpdateInput {
  title: string
  markdown: string
  link: string | null
  /** 예약한 공지의 올릴 시각을 바꾼다. null 이면 그대로다. */
  publishAt: Date | null
  /** 올라간 공지면 지금 다시 보내고 문구를 덮는다(null 이면 안 보낸다). 예약한 공지면 올라갈 때 보낼 문구이고, null 이면 알림을 끈다. */
  push: PushRequest | null
}

/** 예약 시각이 이미 지났다. 어제를 넣는 것은 오타다. 지금 올리려면 예약을 비우면 된다. */
export class SchedulePassed extends Error {}
/** 이미 올라간 공지다. 올릴 시각을 바꾸거나 지금 올릴 수 없다. */
export class AlreadyPublished extends Error {}

/** 관리 화면이 보여 주는 수. 운영자 공지는 달에 몇 건이라 이만큼이면 몇 해다. */
export const LIST_LIMIT = 100

/**
 * 운영자 공지. 쓰고 고치고 지우고, 예약한 공지를 지금 올린다.
 *
 * 저장이 발송보다 먼저다. 알림은 갔는데 목록에 없는 공지는 되돌릴 방법이 없다. 예약한 공지의 알림은 1분마다 도는 폴러가
 * 게시 시각에 보낸다.
 */
@Injectable()
export class OperatorNoticesService {
  /** 스펙이 바꿔 끼우는 시계. */
  clock: () => Date = () => new Date()

  constructor(
    private readonly repo: NoticesRepository,
    private readonly push: PushService,
  ) {}

  list(): Promise<AppNoticeRow[]> {
    return this.repo.listApp(LIST_LIMIT)
  }

  async create(
    input: CreateInput,
  ): Promise<{ id: string; noticeKey: string; messageId: string | null }> {
    const now = this.clock()
    const { publishAt } = input
    if (publishAt !== null && publishAt.getTime() <= now.getTime()) throw new SchedulePassed()

    const row: NewNotice = {
      noticeKey: operatorNoticeKey(now),
      kind: 'app',
      title: input.title,
      markdown: input.markdown,
      ...markdownToNotice(input.markdown),
      link: input.link,
      publishedAt: publishAt ?? now,
      scheduledAt: publishAt !== null && input.push !== null ? publishAt : null,
      pushTitle: input.push?.title ?? null,
      pushBody: input.push?.body ?? null,
    }
    const { id } = await this.repo.insert(row)
    if (input.push === null || publishAt !== null)
      return { id, noticeKey: row.noticeKey, messageId: null }

    const messageId = await this.push.sendNotice(pushableOf(row))
    await this.repo.markSent(id, this.clock())
    return { id, noticeKey: row.noticeKey, messageId }
  }

  /** 없거나 넥슨 공지면 null. 올라간 공지에 올릴 시각을 주면 AlreadyPublished, 지난 시각이면 SchedulePassed 다. */
  async update(id: string, input: UpdateInput): Promise<{ messageId: string | null } | null> {
    const existing = await this.repo.findAppById(id)
    if (existing === null) return null
    const now = this.clock()
    const scheduled = existing.publishedAt.getTime() > now.getTime()
    if (input.publishAt !== null) {
      if (!scheduled) throw new AlreadyPublished()
      if (input.publishAt.getTime() <= now.getTime()) throw new SchedulePassed()
    }

    const base = {
      title: input.title,
      markdown: input.markdown,
      ...markdownToNotice(input.markdown),
      link: input.link,
    }
    if (scheduled) {
      const publishedAt = input.publishAt ?? existing.publishedAt
      const pushOn = input.push !== null
      await this.repo.updateApp(id, {
        ...base,
        ...(input.push === null ? {} : { pushTitle: input.push.title, pushBody: input.push.body }),
        publishedAt,
        scheduledAt: pushOn ? publishedAt : null,
      })
      return { messageId: null }
    }

    await this.repo.updateApp(
      id,
      input.push === null
        ? base
        : { ...base, pushTitle: input.push.title, pushBody: input.push.body },
    )
    if (input.push === null) return { messageId: null }

    const messageId = await this.push.sendNotice(
      pushableOf({
        noticeKey: existing.noticeKey,
        kind: 'app',
        ...base,
        publishedAt: existing.publishedAt,
        pushTitle: input.push.title,
        pushBody: input.push.body,
      }),
    )
    await this.repo.markSent(id, this.clock())
    return { messageId }
  }

  /**
   * 예약한 공지를 지금 올린다. 알림을 켜 둔 공지면 지금 보낸다. 없거나 넥슨 공지면 false, 이미 올라간 공지면
   * AlreadyPublished 다.
   */
  async publishNow(id: string): Promise<boolean> {
    const existing = await this.repo.findAppById(id)
    if (existing === null) return false
    const now = this.clock()
    if (existing.publishedAt.getTime() <= now.getTime()) throw new AlreadyPublished()
    const pushOn = existing.scheduledAt !== null && existing.sentAt === null
    await this.repo.setPublishedAt(id, now, pushOn ? now : null)
    if (!pushOn) return true
    await this.push.sendNotice(pushableOf({ ...existing, publishedAt: now }))
    await this.repo.markSent(id, this.clock())
    return true
  }

  remove(id: string): Promise<boolean> {
    return this.repo.deleteApp(id)
  }
}

function pushableOf(row: NewNotice): PushableNotice {
  return {
    noticeKey: row.noticeKey,
    kind: row.kind,
    title: row.title,
    body: row.body ?? null,
    publishedAt: row.publishedAt,
    link: row.link ?? null,
    pushTitle: row.pushTitle ?? null,
    pushBody: row.pushBody ?? null,
  }
}
