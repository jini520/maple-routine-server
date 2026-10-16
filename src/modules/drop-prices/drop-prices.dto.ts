import { z } from 'zod'

/** 기기가 만든 v4. 변형 비트까지 따지지 않는다. 멀쩡한 본문을 거절하면 앱이 5회 뒤 그 건을 버린다. */
export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

/**
 * 드롭 판매가 한 건. 앱의 DropPricePayload 와 칸이 맞는다.
 *
 * priceMeso 는 1 이상이다. 앱이 0 이하는 안 보낸다. periodKey 는 주간 YYYY-MM-DD · 월간 YYYY-MM 이다.
 */
export const dropPriceBody = z.object({
  dropRecordId: uuidLike,
  itemKey: z.string().min(1).max(200),
  priceMeso: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  periodKey: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  worldKey: z.string().min(1).max(100).nullish(),
  ringLevel: z.number().int().nullish(),
  /** 어느 보스 · 난이도에서 얻었나. 이 칸 둘이 생기기 전 OTA 는 안 보내므로 없어도 받는다. */
  boss: z.string().min(1).max(100).nullish(),
  difficulty: z.string().min(1).max(50).nullish(),
})
export type DropPriceBody = z.infer<typeof dropPriceBody>
