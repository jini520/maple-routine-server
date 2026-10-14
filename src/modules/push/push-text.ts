import type { FcmMessage } from '../../clients/fcm.client'
import type { NoticeKind } from '../notices/notice.types'

/** 푸시로 보낼 수 있는 공지. 표의 행이 그대로 이 모양이다. */
export interface PushableNotice {
  noticeKey: string
  kind: NoticeKind
  title: string
  body: string | null
  publishedAt: Date
  link: string | null
  pushTitle: string | null
  pushBody: string | null
}

/** 토픽 이름. 스토어에 나간 바이너리가 구독하고 있어 못 바꾼다. */
export const TOPIC_BY_KIND: Record<NoticeKind, string> = {
  app: 'notice',
  game: 'notice-game',
  event: 'notice-event',
  update: 'notice-update',
  cashshop: 'notice-cashshop',
}

/** 알림 제목은 분류가 정한다. 트레이가 한 줄로 잘라 공지 제목을 제목에 두면 무엇이 왔는지 안 남는다. */
const TITLE_BY_KIND: Record<Exclude<NoticeKind, 'app'>, string> = {
  game: '새 공지 사항이 올라왔어요.',
  update: '새 업데이트를 확인해보세요.',
  event: '새로운 이벤트가 시작돼요.',
  cashshop: '캐시 아이템이 업데이트 됐어요.',
}

/** 캐시샵 제목은 앞이 전부 같은 꼴이라 뗀다. 못 떼면 통째로 쓴다. */
const CASHSHOP_PREFIX = /^\d{1,2}월\s*\d{1,2}일\s*캐시\s*아이템\s*업데이트\s*-\s*/

/** 메시지 전체가 4KB 를 넘으면 FCM 이 거부한다. 한글은 한 글자가 3바이트다. */
export const NOTIFICATION_BODY_MAX = 200
export const DATA_BODY_MAX = 500

export function pushTextFor(notice: PushableNotice): { title: string; body: string } {
  if (notice.kind === 'app') {
    return {
      title: notice.pushTitle ?? notice.title,
      body: (notice.pushBody ?? notice.body ?? '').slice(0, NOTIFICATION_BODY_MAX),
    }
  }
  const body =
    notice.kind === 'cashshop'
      ? notice.title.replace(CASHSHOP_PREFIX, '') || notice.title
      : notice.title
  return { title: TITLE_BY_KIND[notice.kind], body }
}

/** data 는 전부 문자열이어야 한다. 숫자나 불리언을 넣으면 FCM 이 발송을 거부한다. */
export function messageFor(notice: PushableNotice): FcmMessage {
  const data: Record<string, string> = {
    noticeId: notice.noticeKey,
    kind: notice.kind,
    title: notice.title,
    body: (notice.body ?? '').slice(0, DATA_BODY_MAX),
    publishedAt: notice.publishedAt.toISOString(),
  }
  if (notice.link !== null) data.link = notice.link
  return { topic: TOPIC_BY_KIND[notice.kind], notification: pushTextFor(notice), data }
}
