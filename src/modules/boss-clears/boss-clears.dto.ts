import { z } from 'zod'

import { uuidLike } from '../../common/uuid-like'
import { clearRecordedByEnum, splitTypeEnum } from '../../database/schema'
import { mapleId, nexonIdHash } from '../identity/me.dto'

const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * 보스 수익 건 한 줄. 이름은 표의 칸을 따른다. 기기는 캐릭터 줄 id 를 몰라 메이플 ID 해시와 ocid 해시를 싣고, 보스 줄은 서버가
 * 난이도 줄에서 채운다. 기간은 주간 `W202647` · 월간 `M202611` 이다. 처치 전 줄도 받는다. 칸끼리 맞는지는 표의 CHECK 가 본다.
 */
export const bossClearBody = z.object({
  id: uuidLike,
  mapleId,
  ocid: nexonIdHash,
  bossDifficultyId: uuidLike,
  periodCode: z.string().regex(/^[WM]\d{6}$/),
  worldId: uuidLike.nullable(),
  crystalPriceMeso: meso.nullable(),
  crystalReceivedMeso: meso.nullable(),
  splitType: z.enum(splitTypeEnum.enumValues).nullable(),
  partySize: z.number().int().min(1).max(100).nullable(),
  /** 내 몫. % 에 1000 을 곱한 정수 */
  splitShareMillipercent: z.number().int().min(0).max(100_000).nullable(),
  splitFeePercent: z.number().int().min(0).max(100).nullable(),
  splitFeeFollowsMvpGrade: z.boolean(),
  clearedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  clearRecordedBy: z.enum(clearRecordedByEnum.enumValues).nullable(),
})
export type BossClearBody = z.infer<typeof bossClearBody>
