import { z } from 'zod'

import { uuidLike } from '../../common/uuid-like'
import { cashbookItemTargetTypeEnum, fragmentSourceEnum } from '../../database/schema'
import { mapleId, nexonIdHash } from '../identity/me.dto'

const amount = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const count = z.number().int()
const percent = z.number().int().min(0).max(100)
const fragments = z.number().int().min(0).max(2_000_000_000)
/** 빠진 칸은 비어 있는 칸이다. */
const empty = <T extends z.ZodTypeAny>(type: T) =>
  type.nullish().transform((value) => value ?? null)

/** 품목 한 줄. 이름은 표의 칸을 따른다. 대상은 종류와 줄 id 로 가리키고, 직접 친 품목은 이름만 있다. */
export const cashbookEntryItemBody = z.object({
  targetType: empty(z.enum(cashbookItemTargetTypeEnum.enumValues)),
  targetId: empty(uuidLike),
  itemName: empty(z.string().min(1).max(200)),
  spendRewardTypeId: empty(uuidLike),
  itemTypeId: empty(uuidLike),
  quantity: empty(count),
  fromLevel: empty(count),
  toLevel: empty(count),
  amountMeso: empty(amount),
  tariffMeso: empty(amount),
  saleFeePercent: empty(percent),
  saleFeeMeso: empty(amount),
  amountMaplePoint: empty(amount),
  maplePointPer100mMeso: empty(count),
  amountCash: empty(amount),
  fragmentQuantity: empty(fragments),
  untradableFragmentQuantity: empty(fragments),
  fragmentPriceMeso: empty(meso),
  includesHexaActivation: empty(z.boolean()),
  saleFeeFollowsMvpGrade: empty(z.boolean()),
  mesoMarketFeePercent: empty(percent),
  usesStoredFragments: empty(z.boolean()),
  countsStoredFragmentsAsSpend: empty(z.boolean()),
  inventoryItemId: empty(uuidLike),
})

/** 계산기 사냥의 입력. 직접 입력 사냥은 친 메소만 있다. */
const huntInputBody = z.object({
  characterLevel: empty(count),
  missedMobQuantity: empty(count),
  usesWealthPotion: empty(z.boolean()),
  usesUnionWealth: empty(z.boolean()),
  unionWealthTier: empty(z.number().int().min(1).max(3)),
  fragmentQuantity: empty(fragments),
  fragmentPriceMeso: empty(meso),
  mesoAcquisitionPercent: empty(count),
  typedMeso: empty(meso),
})

/** 메소 이전의 입력. 받는 캐릭터는 ocid 해시로 싣고, 서버가 캐릭터 줄로 바꿔 적는다. */
const transferInputBody = z.object({
  receiverOcid: empty(nexonIdHash),
  transferMeso: meso,
  feePercent: empty(percent),
  feeFollowsMvpGrade: z.boolean(),
})

/** 환전의 입력 */
const exchangeInputBody = z.object({
  soldMeso: empty(meso),
  sellMaplePointPer100mMeso: empty(count),
  boughtMeso: empty(meso),
  buyMaplePointPer100mMeso: empty(count),
  mesoMarketFeePercent: empty(percent),
})

/** 헥사 강화의 조각을 가져온 곳. 사냥 조각은 가져온 캐릭터의 ocid 해시를 싣고 기타 조각은 비운다. */
const fragmentUseBody = z.object({
  fragmentSource: z.enum(fragmentSourceEnum.enumValues),
  ocid: empty(nexonIdHash),
  fragmentQuantity: fragments,
})

/**
 * 가계부 기록 한 건과 딸린 줄. 이름은 표의 칸을 따른다. 기기는 캐릭터 줄 id 를 몰라 메이플 ID 해시와 ocid 해시를 싣는다. ocid 가
 * 없는 기록은 메이플 ID 에 붙은 기록이다. 수입인지 지출인지는 분류 줄에서 읽는다.
 */
export const cashbookEntryBody = z.object({
  id: uuidLike,
  mapleId,
  ocid: empty(nexonIdHash),
  worldId: empty(uuidLike),
  categoryId: uuidLike,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: empty(z.string().max(1000)),
  recordedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  items: z.array(cashbookEntryItemBody).min(1).max(20),
  huntInput: empty(huntInputBody),
  transferInput: empty(transferInputBody),
  exchangeInput: empty(exchangeInputBody),
  fragmentUses: z.array(fragmentUseBody).max(100).default([]),
})
export type CashbookEntryBody = z.infer<typeof cashbookEntryBody>
