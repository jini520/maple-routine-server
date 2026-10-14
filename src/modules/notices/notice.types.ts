import { noticeKindEnum } from '../../database/schema'

/** 분류 다섯. app 은 운영자 공지이고 나머지 넷은 넥슨이 준다. */
export type NoticeKind = (typeof noticeKindEnum.enumValues)[number]
export const NOTICE_KINDS = noticeKindEnum.enumValues

/** 상세 본문 한 조각. HTML 이 앱에 안 들어가게 하는 모양이고 앱의 types/notice.ts 와 같다. */
export type NoticeBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; src: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'table'; rows: string[][] }

/** 앱 계약. 푸시 data 와 같은 모양이다. 목록에는 blocks 가 안 실린다. */
export interface Notice {
  id: string
  kind: NoticeKind
  title: string
  body: string
  publishedAt: string
  link?: string
  blocks?: NoticeBlock[]
}

/** 썬데이 메이플 기록. 어느 일요일이었나가 중요해 기간을 싣고 목록인데도 blocks 를 싣는다. */
export interface SundayRecord extends Notice {
  startsAt?: string
  endsAt?: string
}
