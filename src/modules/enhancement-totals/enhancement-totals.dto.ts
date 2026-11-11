import { z } from 'zod'

import { enhancementCategoryEnum } from '../../database/schema'
import { uuidLike } from '../drop-prices/drop-prices.dto'
import { mapleId, nexonIdHash } from '../identity/me.dto'

const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * 강화 합계 한 줄. 앱의 EnhancementTotalPayload 와 칸이 맞는다. 기기의 enhancement_totals 중 이벤트 월드가 아닌 줄이다.
 *
 * 비용 두 칸은 MVP 할인 전이다. ocid 는 그날 그 이름이었던 캐릭터이고, 같은 합계는 ocid · 날짜 · 분류 · 장비 묶음으로 가린다.
 */
export const enhancementTotalBody = z.object({
  totalRecordId: uuidLike,
  mapleId,
  ocid: nexonIdHash,
  historyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  enhancementCategory: z.enum(enhancementCategoryEnum.enumValues),
  /** 장비 key 면 'key:…', 없으면 공백을 지운 이름 'name:…'. */
  itemGroup: z.string().regex(/^(key|name):.{1,200}$/),
  itemKey: z.string().min(1).max(200).nullish(),
  itemName: z.string().min(1).max(200),
  attempts: z.number().int().min(1),
  attemptCostMeso: meso,
  destroyDefenceCostMeso: meso,
})
export type EnhancementTotalBody = z.infer<typeof enhancementTotalBody>
