import { z } from 'zod'

/** 기기가 만든 v4. 변형 비트까지 따지지 않는다. 멀쩡한 본문을 거절하면 앱이 5회 뒤 그 건을 버린다. */
export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

/** 본문이 적을 수 있는 상태 셋. deleted 는 기기에서 기록이 사라진 것이라 DELETE 가 적는다. */
export const dropRecordStatusBody = z.enum(['pending', 'completed', 'skipped'])

/**
 * 드롭 가격 기록 한 건. 앱의 DropPricePayload 와 칸이 맞는다.
 *
 * priceMeso 는 completed 만 1 이상이고 pending · skipped 는 null 이다. 앱이 0 은 안 보낸다. periodKey 는 주간 YYYY-MM-DD ·
 * 월간 YYYY-MM 이다.
 */
export const dropPriceBody = z
  .object({
    dropRecordId: uuidLike,
    itemKey: z.string().min(1).max(200),
    priceMeso: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullish(),
    periodKey: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
    worldKey: z.string().min(1).max(100).nullish(),
    ringLevel: z.number().int().nullish(),
    /** 어느 보스 · 난이도에서 얻었나. 이 칸 둘이 생기기 전 OTA 는 안 보내므로 없어도 받는다. */
    boss: z.string().min(1).max(100).nullish(),
    difficulty: z.string().min(1).max(50).nullish(),
    /** 어느 처치 기간의 드롭인가. 기기의 기간 행 id 다. 이 칸이 생기기 전 OTA 는 안 보내므로 없어도 받는다. */
    periodRecordId: uuidLike.nullish(),
    /** 기록의 상태. 이 칸이 생기기 전 OTA 는 가격 있는 기록만 보내므로 없으면 completed 다. */
    status: dropRecordStatusBody.default('completed'),
  })
  .refine((body) => (body.status === 'completed') === (body.priceMeso != null), {
    message: 'completed 만 priceMeso 를 갖고 pending · skipped 는 null 이다',
    path: ['priceMeso'],
  })
export type DropPriceBody = z.infer<typeof dropPriceBody>
