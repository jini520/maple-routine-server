import { z } from 'zod'

import { uuidLike } from '../drop-prices/drop-prices.dto'

const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * 보스 처치 기간 한 건. 앱의 BossClearPayload 와 칸이 맞는다. 기기의 boss_party_periods 중 처치한 행이다.
 *
 * 분배가 비율이면 내 몫 · 비율 합이 있고, 균등이면 둘 다 없다. periodKey 는 주간 YYYY-MM-DD · 월간 YYYY-MM 이다.
 */
export const bossClearBody = z
  .object({
    periodRecordId: uuidLike,
    ocid: z.string().min(1).max(100),
    boss: z.string().min(1).max(100),
    difficulty: z.string().min(1).max(50),
    cycle: z.enum(['weekly', 'monthly']),
    periodKey: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
    worldKey: z.string().min(1).max(100).nullish(),
    priceMeso: meso,
    payoutMeso: meso,
    splitMode: z.enum(['even', 'ratio']),
    partySize: z.number().int().min(1).max(100),
    myShare: z.number().int().min(1).nullish(),
    sharesTotal: z.number().int().min(1).nullish(),
    splitFeePercent: z.number().int().min(0).max(100).nullish(),
    defeatedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    source: z.enum(['auto', 'manual']),
  })
  .refine(
    (body) => (body.splitMode === 'ratio') === (body.myShare != null && body.sharesTotal != null),
    {
      message: '비율 분배만 myShare · sharesTotal 을 갖는다',
      path: ['myShare'],
    },
  )
export type BossClearBody = z.infer<typeof bossClearBody>
