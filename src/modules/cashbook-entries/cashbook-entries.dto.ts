import { z } from 'zod'

import { uuidLike } from '../drop-prices/drop-prices.dto'

const amount = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullish()
const key = z.string().min(1).max(200).nullish()
const count = z.number().int().nullish()
const fragments = z.number().int().min(0).max(2_000_000_000).nullish()

/** 품목 한 줄. 앱의 기록 표 cashbook_entry_items 와 칸이 맞는다. 차례는 배열 순서다. */
export const cashbookEntryItemBody = z.object({
  itemKey: key,
  /** 사용자가 직접 친 품목 이름. */
  itemName: z.string().min(1).max(200).nullish(),
  formKey: key,
  itemKindKey: key,
  quantity: count,
  fromLevel: count,
  toLevel: count,
  amountMeso: amount,
  tariffMeso: amount,
  saleFeePercent: z.number().int().min(0).max(100).nullish(),
  saleFeeMeso: amount,
  amountPoint: amount,
  pointPer100mMeso: count,
  amountCash: amount,
  /** 헥사 강화 품목만 든다. */
  fragmentCount: fragments,
  untradableFragmentCount: fragments,
  fragmentPriceMeso: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullish(),
  hexaActivation: z.boolean().nullish(),
})

/**
 * 가계부 기록 한 건과 품목. 앱의 CashbookEntryPayload 와 칸이 맞는다.
 *
 * 캐릭터가 없는 기록은 accountRecordId 로 넥슨 계정을 알린다. 서버가 그 사람의 계정 줄로 바꿔 적고 못 찾으면 NULL 이다.
 */
export const cashbookEntryBody = z.object({
  entryRecordId: uuidLike,
  ocid: z.string().min(1).max(100).nullish(),
  accountRecordId: uuidLike.nullish(),
  entryType: z.enum(['income', 'spend']),
  categoryKey: z.string().min(1).max(100),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(cashbookEntryItemBody).min(1).max(20),
})
export type CashbookEntryBody = z.infer<typeof cashbookEntryBody>
