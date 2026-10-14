import { Injectable } from '@nestjs/common'

import { toNotice, toSundayRecord } from './notice.view'
import type { Notice, NoticeKind, SundayRecord } from './notice.types'
import { NoticesRepository } from './notices.repository'
import { isSundayMaple } from './sunday'

/** 썬데이를 가릴 때 훑는 이벤트 수. 이벤트는 주에 스물 안팎이라 이만큼이면 반년이다. */
const SUNDAY_SCAN = 500

@Injectable()
export class NoticesService {
  constructor(private readonly repo: NoticesRepository) {}

  async list(kinds: readonly NoticeKind[] | null, limit: number): Promise<Notice[]> {
    const rows = await this.repo.list(kinds, limit)
    return rows.map(toNotice)
  }

  async detail(noticeKey: string): Promise<Notice | null> {
    const row = await this.repo.findByKey(noticeKey)
    return row === null ? null : toNotice(row)
  }

  /** 판정은 조회 때 제목으로 한다. 판정을 고치면 쌓인 기록도 같이 바로잡힌다. */
  async sunday(limit: number): Promise<SundayRecord[]> {
    const rows = await this.repo.recentEvents(SUNDAY_SCAN)
    return rows
      .filter((row) => isSundayMaple(row.title))
      .slice(0, limit)
      .map(toSundayRecord)
  }
}
