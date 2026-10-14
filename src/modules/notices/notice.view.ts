import type { Notice, NoticeBlock, SundayRecord } from './notice.types'
import type { NoticeDetailRow, NoticeRow } from './notices.repository'

/** 행을 앱 계약으로. body NULL 은 빈 문자열이고 link · blocks 는 있을 때만 싣는다. */
export function toNotice(row: NoticeRow & { blocks?: NoticeBlock[] | null }): Notice {
  return {
    id: row.noticeKey,
    kind: row.kind,
    title: row.title,
    body: row.body ?? '',
    publishedAt: row.publishedAt.toISOString(),
    ...(row.link === null ? {} : { link: row.link }),
    ...(row.blocks === null || row.blocks === undefined ? {} : { blocks: row.blocks }),
  }
}

export function toSundayRecord(row: NoticeDetailRow): SundayRecord {
  return {
    ...toNotice(row),
    ...(row.startsAt === null ? {} : { startsAt: row.startsAt.toISOString() }),
    ...(row.endsAt === null ? {} : { endsAt: row.endsAt.toISOString() }),
  }
}
