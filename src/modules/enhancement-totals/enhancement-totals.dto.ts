import { z } from 'zod'

import { enhancementCategoryEnum } from '../../database/schema'
import { uuidLike } from '../../common/uuid-like'
import { mapleId, nexonIdHash } from '../identity/me.dto'

const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * 강화 합계 한 줄. 이름은 표의 칸을 따른다. 기기는 캐릭터 줄 id 를 몰라 메이플 ID 해시와 ocid 해시를 싣고, 서버가 캐릭터 줄로
 * 바꿔 적는다. 이벤트 월드인 줄도 받는다. 기기끼리 맞추려면 모든 줄과 그 판정이 있어야 한다.
 */
export const enhancementTotalBody = z.object({
  id: uuidLike,
  mapleId,
  ocid: nexonIdHash,
  historyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(enhancementCategoryEnum.enumValues),
  itemName: z.string().min(1).max(200),
  attemptCount: z.number().int().min(1),
  attemptCostMeso: meso,
  destroyDefenceCostMeso: meso,
  worldId: uuidLike.nullable(),
  superiorCostMeso: meso.nullable(),
  fromStar: z.number().int().min(0).max(30).nullable(),
  toStar: z.number().int().min(0).max(30).nullable(),
  isEventWorld: z.boolean().nullable(),
})
export type EnhancementTotalBody = z.infer<typeof enhancementTotalBody>
