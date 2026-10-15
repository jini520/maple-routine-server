import { Injectable } from '@nestjs/common'

import { type PushableNotice } from '../push/push-text'
import { PushService } from '../push/push.service'
import { operatorNoticeKey } from './notice-key'
import { type NewNotice, type NoticeRow, NoticesRepository } from './notices.repository'

/** 알림 문구. null 이면 공지 제목과 본문을 그대로 쓴다. */
export interface PushRequest {
  title: string | null
  body: string | null
}

export interface CreateInput {
  title: string
  body: string
  link: string | null
  /** null 이면 알림을 안 보낸다. scheduledAt 이 있으면 그 시각에 폴러가 보낸다. */
  push: (PushRequest & { scheduledAt: Date | null }) | null
}

export interface UpdateInput {
  title: string
  body: string
  link: string | null
  /** null 이면 고치기만 한다. 있으면 지금 다시 보내고 문구를 덮는다. 수정에는 예약이 없다. */
  push: PushRequest | null
}

/** 예약 시각이 이미 지났다. 어제를 넣는 것은 오타다. 지금 보내려면 예약을 끄면 된다. */
export class SchedulePassed extends Error {}

/** 관리 화면이 보여 주는 수. 운영자 공지는 달에 몇 건이라 이만큼이면 몇 해다. */
export const LIST_LIMIT = 100

/**
 * 운영자 공지. 쓰고 고치고 지우고 예약을 내린다.
 *
 * 저장이 발송보다 먼저다. 알림은 갔는데 목록에 없는 공지는 되돌릴 방법이 없다.
 */
@Injectable()
export class OperatorNoticesService {
  /** 스펙이 바꿔 끼우는 시계. */
  clock: () => Date = () => new Date()

  constructor(
    private readonly repo: NoticesRepository,
    private readonly push: PushService,
  ) {}

  list(): Promise<NoticeRow[]> {
    return this.repo.listApp(LIST_LIMIT)
  }

  async create(
    input: CreateInput,
  ): Promise<{ id: string; noticeKey: string; messageId: string | null }> {
    const now = this.clock()
    const scheduledAt = input.push?.scheduledAt ?? null
    if (scheduledAt !== null && scheduledAt.getTime() <= now.getTime()) throw new SchedulePassed()

    const row: NewNotice = {
      noticeKey: operatorNoticeKey(now),
      kind: 'app',
      title: input.title,
      body: input.body,
      link: input.link,
      publishedAt: now,
      scheduledAt,
      pushTitle: input.push?.title ?? null,
      pushBody: input.push?.body ?? null,
    }
    const { id } = await this.repo.insert(row)
    if (input.push === null || scheduledAt !== null)
      return { id, noticeKey: row.noticeKey, messageId: null }

    const messageId = await this.push.sendNotice(pushableOf(row))
    await this.repo.markSent(id, this.clock())
    return { id, noticeKey: row.noticeKey, messageId }
  }

  /** 없거나 넥슨 공지면 null. 알림을 켜면 보낸 문구를 덮고, 안 켜면 예약 문구는 그대로다. */
  async update(id: string, input: UpdateInput): Promise<{ messageId: string | null } | null> {
    const existing = await this.repo.findAppById(id)
    if (existing === null) return null

    const base = { title: input.title, body: input.body, link: input.link }
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

  remove(id: string): Promise<boolean> {
    return this.repo.deleteApp(id)
  }

  cancelSchedule(id: string): Promise<boolean> {
    return this.repo.cancelSchedule(id)
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
