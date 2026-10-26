import { z } from 'zod'

import { enhancementAnomalyTypeEnum, enhancementTypeEnum } from '../../database/schema'

/** 한 번에 받는 상황 수의 상한. 앱은 500 씩 나눠 보낸다. */
export const ANOMALY_BATCH_MAX = 500

/** 상황 하나. 앱의 EnhancementAnomaly 와 칸이 맞는다. 캐릭터 이름은 받지 않는다. */
export const enhancementAnomalyBody = z.object({
  historyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  enhancementType: z.enum(enhancementTypeEnum.enumValues),
  anomalyType: z.enum(enhancementAnomalyTypeEnum.enumValues),
  itemKey: z.string().min(1).max(200).nullish(),
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
