import { z } from 'zod'

import { enhancementAnomalyReasonEnum, enhancementApiTypeEnum } from '../../database/schema'
import { mapleId } from '../identity/me.dto'

/** 한 번에 받는 상황 수의 상한. 앱은 500 씩 나눠 보낸다. */
export const ANOMALY_BATCH_MAX = 500

/**
 * 상황 하나. 칸은 표의 칸 이름을 따른다. 캐릭터 이름은 받지 않는다. `mapleId` 는 그 내역을 받은 넥슨 계정의 메이플 ID 해시이고,
 * 그 메이플 ID 가 달린 넥슨 계정의 줄에 적는다.
 */
export const enhancementAnomalyBody = z.object({
  mapleId,
  historyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  apiType: z.enum(enhancementApiTypeEnum.enumValues),
  reason: z.enum(enhancementAnomalyReasonEnum.enumValues),
  /** 판정하지 못한 줄은 장비와 무관해 빈 글자다. */
  itemName: z.string().max(200),
  rowCount: z.number().int().min(1),
  detail: z.string().max(200).nullish(),
})
export type EnhancementAnomalyBody = z.infer<typeof enhancementAnomalyBody>

export const enhancementAnomaliesBody = z.object({
  items: z.array(enhancementAnomalyBody).min(1).max(ANOMALY_BATCH_MAX),
})
export type EnhancementAnomaliesBody = z.infer<typeof enhancementAnomaliesBody>
