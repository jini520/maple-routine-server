import { z } from 'zod'

import { enhancementCategoryEnum } from '../../database/schema'
import { uuidLike } from '../drop-prices/drop-prices.dto'

const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * 강화 합계 한 줄. 앱의 EnhancementTotalPayload 와 칸이 맞는다. 기기의 enhancement_totals 중 이벤트 월드가 아닌 줄이다.
 *
 * 비용 두 칸은 MVP 할인 전이다. accountRecordId 는 강화 내역을 받은 넥슨 계정의 기기 id 다.
 */
export const enhancementTotalBody = z.object({
  totalRecordId: uuidLike,
  accountRecordId: uuidLike.nullish(),
  characterName: z.string().min(1).max(100),
  historyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  enhancementCategory: z.enum(enhancementCategoryEnum.enumValues),
  itemKey: z.string().min(1).max(200).nullish(),
  itemName: z.string().min(1).max(200),
  attempts: z.number().int().min(1),
  attemptCostMeso: meso,
  destroyDefenceCostMeso: meso,
})
export type EnhancementTotalBody = z.infer<typeof enhancementTotalBody>
