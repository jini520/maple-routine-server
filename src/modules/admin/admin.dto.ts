import { z } from 'zod'

/** 보스를 연다. key 는 bosses 표에 있어야 하고 날짜는 KST YYYY-MM-DD 다. */
export const openBody = z.object({
  boss: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type OpenBody = z.infer<typeof openBody>

export const rowId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

/** 알림 문구. 비우면 공지 제목과 본문을 쓴다. 본문은 FCM 의 4KB 안에 들게 200자다. */
const pushText = z.object({
  title: z.string().min(1).max(100).nullish(),
  body: z.string().min(1).max(200).nullish(),
})

/** 공지를 쓴다. push 가 null 이면 안 알리고, scheduledAt 이 있으면 그 시각에 알린다. */
export const noticeCreateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  link: z.url().nullish(),
  push: pushText.extend({ scheduledAt: z.iso.datetime({ offset: true }).nullish() }).nullish(),
})
export type NoticeCreateBody = z.infer<typeof noticeCreateBody>

/** 고친다. 예약은 없다. push 가 있으면 지금 다시 보낸다. */
export const noticeUpdateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  link: z.url().nullish(),
  push: pushText.nullish(),
})
export type NoticeUpdateBody = z.infer<typeof noticeUpdateBody>

/** 드롭 가격 보기의 필터. 비우면 전부다. limit 은 줄 목록에만 쓴다. */
export const dropPriceQuery = z.object({
  itemKey: z.string().min(1).max(200).optional(),
  periodKey: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
})
export type DropPriceQuery = z.infer<typeof dropPriceQuery>

/** 난이도 줄 하나의 본문. 난이도는 경로가 든다. */
export const requiredLevelBody = z.object({ requiredLevel: z.number().int().min(1) })
