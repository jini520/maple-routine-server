import { z } from 'zod'

import { BOSS_DIFFICULTIES } from '../bosses/bosses.dto'
import { PERIOD_TEXT } from '../crystal-prices/period-boundary'

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

/** 앱의 snake_case key. 아이템 · 보스가 같은 모양이다. */
export const snakeKey = z.string().regex(/^[a-z][a-z0-9_]*$/)
/** KST 기간 글자. 없으면 null 이다. */
const periodText = z.string().regex(PERIOD_TEXT).nullish()
const levelRange = <T extends { levelMin?: number | null; levelMax?: number | null }>(b: T) =>
  (b.levelMin == null) === (b.levelMax == null) &&
  (b.levelMin == null || b.levelMin <= (b.levelMax ?? 0))
const LEVEL_MESSAGE = '레벨 범위는 둘 다 있거나 둘 다 없고, min 이 max 를 안 넘는다'

export const dropItemCreateBody = z.object({
  key: snakeKey,
  name: z.string().min(1).max(100),
  iconFile: z.string().min(1).max(200).nullish(),
  valuable: z.boolean().default(false),
})
export type DropItemCreateBody = z.infer<typeof dropItemCreateBody>
export const dropItemUpdateBody = dropItemCreateBody.omit({ key: true })
export type DropItemUpdateBody = z.infer<typeof dropItemUpdateBody>

export const dropBoxCreateBody = z
  .object({
    item: snakeKey,
    levelMin: z.number().int().min(1).nullish(),
    levelMax: z.number().int().min(1).nullish(),
  })
  .refine(levelRange, { message: LEVEL_MESSAGE })
export type DropBoxCreateBody = z.infer<typeof dropBoxCreateBody>
export const dropBoxLevelsBody = z
  .object({
    levelMin: z.number().int().min(1).nullish(),
    levelMax: z.number().int().min(1).nullish(),
  })
  .refine(levelRange, { message: LEVEL_MESSAGE })
export type DropBoxLevelsBody = z.infer<typeof dropBoxLevelsBody>
export const boxContentBody = z.object({ item: snakeKey })
export const moveBody = z.object({ direction: z.enum(['up', 'down']) })
export type MoveBody = z.infer<typeof moveBody>

export const bossDropQuery = z.object({ boss: snakeKey, difficulty: z.enum(BOSS_DIFFICULTIES) })
export type BossDropQuery = z.infer<typeof bossDropQuery>
export const bossDropCreateBody = z.object({
  boss: snakeKey,
  difficulty: z.enum(BOSS_DIFFICULTIES),
  category: z.enum(['fixed', 'equipment', 'consumable']),
  item: snakeKey,
  amount: z.string().min(1).max(50).nullish(),
  from: periodText,
  until: periodText,
})
export type BossDropCreateBody = z.infer<typeof bossDropCreateBody>
export const bossDropUpdateBody = bossDropCreateBody.pick({ amount: true, from: true, until: true })
export type BossDropUpdateBody = z.infer<typeof bossDropUpdateBody>

export const crystalPriceBody = z.object({
  priceMeso: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  from: periodText,
})
export type CrystalPriceBody = z.infer<typeof crystalPriceBody>
export const maxPartySizeBody = z.object({
  maxPartySize: z.number().int().min(1).max(6).nullable(),
})
export type MaxPartySizeBody = z.infer<typeof maxPartySizeBody>
