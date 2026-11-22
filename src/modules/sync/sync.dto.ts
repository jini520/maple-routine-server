import { z } from 'zod'

import { uuidLike } from '../../common/uuid-like'
import {
  appointmentScheduleTypeEnum,
  cashbookItemTargetTypeEnum,
  clearRecordedByEnum,
  dropCategoryEnum,
  dropPriceStatusEnum,
  enhancementApiTypeEnum,
  enhancementCategoryEnum,
  fragmentSourceEnum,
  manualTrackedTypeEnum,
  rememberedLevelTypeEnum,
  splitTypeEnum,
  trackingTypeEnum,
} from '../../database/schema'
import { mapleId, nexonIdHash } from '../identity/me.dto'

/** 한 번의 올리기에 싣는 기록 수. 과거 기록을 처음 올릴 때 앱이 이만큼씩 나눠 보낸다. */
export const PUSH_RECORD_LIMIT = 100

/** 기록 id. 서버가 읽어 돌려주는 uuid 는 소문자라 받을 때도 소문자로 맞춘다. 맞추지 않으면 같은 id 를 다른 줄로 본다. */
const recordId = uuidLike.transform((value) => value.toLowerCase())
/** 게임 데이터 줄 id */
const rowId = uuidLike.transform((value) => value.toLowerCase())
const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const amount = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const count = z.number().int()
const percent = z.number().int().min(0).max(100)
const fragments = z.number().int().min(0).max(2_000_000_000)
const shareMillipercent = z.number().int().min(0).max(100_000)
const partySize = z.number().int().min(1).max(100)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const weekCode = z.string().regex(/^W\d{6}$/)
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value))
const screenKeys = z.array(z.string().min(1).max(100)).max(50)
/** 빠진 칸은 비어 있는 칸이다. */
const empty = <T extends z.ZodTypeAny>(type: T) =>
  type.nullish().transform((value) => value ?? null)

/** 캐릭터가 주인인 기록의 주인. 기기는 캐릭터 줄 id 를 몰라 메이플 ID 해시와 ocid 해시를 싣고, 서버가 캐릭터 줄로 바꾼다. */
const characterOwner = { mapleId, ocid: nexonIdHash }

/** 분배 칸 다섯. 수익 건 · 드롭 · 분배 설정이 같은 이름을 쓴다. */
const splitFields = {
  partySize: empty(partySize),
  splitShareMillipercent: empty(shareMillipercent),
  splitFeePercent: empty(percent),
  splitFeeFollowsMvpGrade: z.boolean(),
}

/** 보스 수익 건. 보스 줄은 서버가 난이도 줄에서 채운다. 기간은 주간 `W202647` · 월간 `M202611` 이다. 처치 전 줄도 받는다. */
export const bossProfitEntryRow = z.object({
  id: recordId,
  ...characterOwner,
  bossDifficultyId: rowId,
  periodCode: z.string().regex(/^[WM]\d{6}$/),
  worldId: empty(rowId),
  crystalPriceMeso: empty(meso),
  crystalReceivedMeso: empty(meso),
  splitType: empty(z.enum(splitTypeEnum.enumValues)),
  ...splitFields,
  clearedDate: empty(day),
  clearRecordedBy: empty(z.enum(clearRecordedByEnum.enumValues)),
})
export type BossProfitEntryRow = z.infer<typeof bossProfitEntryRow>

/** 수익 건에서 나온 드롭. 주인은 수익 건을 따라가 몸에 싣지 않는다. 기기는 지운 뒤에 보내 어느 계정의 것인지 모를 수 있다. */
export const bossDropRow = z.object({
  id: recordId,
  profitEntryId: recordId,
  itemId: rowId,
  category: z.enum(dropCategoryEnum.enumValues),
  priceStatus: z.enum(dropPriceStatusEnum.enumValues),
  salePriceMeso: empty(meso),
  saleReceivedMeso: empty(meso),
  pricedAt: empty(instant),
  saleFeePercent: empty(percent),
  saleFeeFollowsMvpGrade: z.boolean(),
  splitType: empty(z.enum(splitTypeEnum.enumValues)),
  ...splitFields,
})
export type BossDropRow = z.infer<typeof bossDropRow>

/** 캐릭터가 한 보스 · 난이도를 잡을 때 쓰는 기본 분배 */
export const bossSplitSettingRow = z.object({
  id: recordId,
  ...characterOwner,
  bossDifficultyId: rowId,
  splitType: z.enum(splitTypeEnum.enumValues),
  ...splitFields,
})
export type BossSplitSettingRow = z.infer<typeof bossSplitSettingRow>

/** 가계부 품목 한 줄. 대상은 종류와 줄 id 로 가리키고, 직접 친 품목은 이름만 있다. */
const cashbookEntryItemRow = z.object({
  targetType: empty(z.enum(cashbookItemTargetTypeEnum.enumValues)),
  targetId: empty(rowId),
  itemName: empty(z.string().min(1).max(200)),
  spendRewardTypeId: empty(rowId),
  itemTypeId: empty(rowId),
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
  inventoryItemId: empty(recordId),
})

/** 계산기 사냥의 입력. 직접 입력 사냥은 친 메소만 있다. */
const huntInputRow = z.object({
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

/** 메소 이전의 입력. 받는 캐릭터는 ocid 해시로 싣고 서버가 캐릭터 줄로 바꾼다. 받는 캐릭터는 기록과 같은 메이플 ID 다. */
const transferInputRow = z.object({
  receiverOcid: empty(nexonIdHash),
  transferMeso: meso,
  feePercent: empty(percent),
  feeFollowsMvpGrade: z.boolean(),
})

/** 환전의 입력 */
const exchangeInputRow = z.object({
  soldMeso: empty(meso),
  sellMaplePointPer100mMeso: empty(count),
  boughtMeso: empty(meso),
  buyMaplePointPer100mMeso: empty(count),
  mesoMarketFeePercent: empty(percent),
})

/** 헥사 강화의 조각을 가져온 곳. 사냥 조각은 가져온 캐릭터의 ocid 해시를 싣고 기타 조각은 비운다. */
const fragmentUseRow = z.object({
  fragmentSource: z.enum(fragmentSourceEnum.enumValues),
  ocid: empty(nexonIdHash),
  fragmentQuantity: fragments,
})

/** 가계부 기록 한 건과 딸린 줄. ocid 가 없는 기록은 메이플 ID 에 붙은 기록이다. 수입인지 지출인지는 분류 줄에서 읽는다. */
export const cashbookEntryRow = z.object({
  id: recordId,
  mapleId,
  ocid: empty(nexonIdHash),
  worldId: empty(rowId),
  categoryId: rowId,
  date: day,
  memo: empty(z.string().max(1000)),
  recordedAt: instant,
  items: z.array(cashbookEntryItemRow).min(1).max(20),
  huntInput: empty(huntInputRow),
  transferInput: empty(transferInputRow),
  exchangeInput: empty(exchangeInputRow),
  fragmentUses: z.array(fragmentUseRow).max(100).default([]),
})
export type CashbookEntryRow = z.infer<typeof cashbookEntryRow>

/** 인벤토리에 넣은 아이템. 레벨이 있는 반지는 레벨 줄이다. */
export const inventoryItemRow = z.object({
  id: recordId,
  mapleId,
  worldId: rowId,
  itemId: rowId,
  cashbookItemTypeId: rowId,
  addedQuantity: z.number().int().min(0),
})
export type InventoryItemRow = z.infer<typeof inventoryItemRow>

/** 강화 합계 한 줄. 이벤트 월드인 줄도 받는다. 기기끼리 맞추려면 모든 줄과 그 판정이 있어야 한다. */
export const enhancementTotalRow = z.object({
  id: recordId,
  ...characterOwner,
  historyDate: day,
  category: z.enum(enhancementCategoryEnum.enumValues),
  itemName: z.string().min(1).max(200),
  attemptCount: z.number().int().min(1),
  attemptCostMeso: meso,
  destroyDefenceCostMeso: meso,
  worldId: empty(rowId),
  superiorCostMeso: empty(meso),
  fromStar: empty(z.number().int().min(0).max(30)),
  toStar: empty(z.number().int().min(0).max(30)),
  isEventWorld: empty(z.boolean()),
})
export type EnhancementTotalRow = z.infer<typeof enhancementTotalRow>

/** 강화 내역을 다 받은 날. 넥슨 계정은 그 계정의 메이플 ID 하나로 가리킨다. 기기는 서버의 넥슨 계정 줄 id 를 모른다. */
export const enhancementSettledDayRow = z.object({
  mapleId,
  apiType: z.enum(enhancementApiTypeEnum.enumValues),
  historyDate: day,
})
export type EnhancementSettledDayRow = z.infer<typeof enhancementSettledDayRow>

/** 심볼 · 헥사 폼이 강화 전 레벨 칸을 채우는 값 */
export const rememberedLevelRow = z.object({
  id: recordId,
  ...characterOwner,
  type: z.enum(rememberedLevelTypeEnum.enumValues),
  targetId: rowId,
  level: z.number().int().min(0).max(1000),
})
export type RememberedLevelRow = z.infer<typeof rememberedLevelRow>

/** 사용자가 적은 MVP 등급 한 줄. 등급이 비면 등급 없음이다. */
export const mvpGradeHistoryRow = z.object({
  id: recordId,
  mapleId,
  fromDate: day,
  gradeId: empty(rowId),
})
export type MvpGradeHistoryRow = z.infer<typeof mvpGradeHistoryRow>

/** 월드 리프 한 번. 옛 ocid 와 새 ocid 를 해시로 싣는다. 두 캐릭터는 같은 메이플 ID 다. */
export const characterWorldLeapRow = z.object({
  id: recordId,
  mapleId,
  previousOcid: nexonIdHash,
  ocid: nexonIdHash,
})
export type CharacterWorldLeapRow = z.infer<typeof characterWorldLeapRow>

/** 수동 모드에서 캐릭터가 추적하기로 고른 항목. 일간 · 주간은 컨텐츠 줄, 보스는 난이도 줄을 가리킨다. */
export const manualTrackedItemRow = z.object({
  ...characterOwner,
  type: z.enum(manualTrackedTypeEnum.enumValues),
  targetId: rowId,
})
export type ManualTrackedItemRow = z.infer<typeof manualTrackedItemRow>

/** 월드나 계정이 함께 쓰는 컨텐츠의 진행. 계정이 함께 쓰는 컨텐츠는 월드가 비어 있다. */
export const sharedContentProgressRow = z.object({
  mapleId,
  worldId: empty(rowId),
  contentId: rowId,
  isRegistered: z.boolean(),
  nowCount: empty(count),
  maxCount: empty(count),
  questState: empty(z.number().int().min(0).max(2)),
  periodCode: z.string().regex(/^(W\d{6}|D\d{8})$/),
})
export type SharedContentProgressRow = z.infer<typeof sharedContentProgressRow>
const sharedContentProgressKey = sharedContentProgressRow.pick({
  mapleId: true,
  worldId: true,
  contentId: true,
})

/** 사용자가 메이플 ID 에 붙인 이름 */
export const mapleIdNameRow = z.object({ mapleId, name: z.string().min(1).max(100) })
export type MapleIdNameRow = z.infer<typeof mapleIdNameRow>

/** 추적하는 캐릭터 하나. 목록은 넥슨 계정 줄에 붙고 캐릭터는 메이플 ID · ocid 해시로 가리킨다. */
export const trackedCharacterRow = z.object({
  ...characterOwner,
  sortOrder: z.number().int().min(0),
  isRepresentative: z.boolean(),
})
export type TrackedCharacterRow = z.infer<typeof trackedCharacterRow>

/** 대표 캐릭터의 행동과 표정 */
export const representativeCharacterMotionRow = z.object({
  ...characterOwner,
  actions: z.array(z.string().min(1).max(100)).max(3),
  emotions: z.array(z.string().min(1).max(100)).max(5),
  durationMs: z.number().int().min(0),
  restsBetweenActions: z.boolean(),
})
export type RepresentativeCharacterMotionRow = z.infer<typeof representativeCharacterMotionRow>

/**
 * 사람마다 하나인 설정. 실은 칸만 고치고 빠진 칸은 두어, 두 기기가 다른 설정을 고쳐도 서로를 덮지 않는다. 처음 적을 때 빠진 칸은
 * 표의 기본값이다.
 */
export const accountSettingsRow = z.object({
  trackingType: z.enum(trackingTypeEnum.enumValues).nullable().optional(),
  quickLinkRowCount: z.number().int().min(1).max(2).nullable().optional(),
  quickLinkKeys: screenKeys.nullable().optional(),
  barGroupKeys: screenKeys.nullable().optional(),
  statsCumulativeStartDate: day.nullable().optional(),
  isMvpWeeklyCheckOff: z.boolean().optional(),
  mvpLastCheckedWeekCode: weekCode.nullable().optional(),
  isMvpBulkApplyAsked: z.boolean().optional(),
})
export type AccountSettingsRow = z.infer<typeof accountSettingsRow>

/** 하단바 그룹 하나의 하위 페이지 차례 */
export const bottomBarSubPageOrderRow = z.object({
  groupKey: z.string().min(1).max(100),
  subPageKeys: screenKeys,
})
export type BottomBarSubPageOrderRow = z.infer<typeof bottomBarSubPageOrderRow>

/** 약속이나 그 주의 예외에서 도는 보스 한 판. 캐릭터는 다른 메이플 ID 의 것일 수 있어 메이플 ID 도 싣는다. */
const appointmentBossRow = z.object({
  sortOrder: z.number().int().min(0),
  bossDifficultyId: rowId,
  ...characterOwner,
})

/** 매주 약속에서 한 주만 바꾼 값과 그 주의 보스 */
const appointmentExceptionRow = z.object({
  weekCode,
  date: day,
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(0),
  alarmMinutesBefore: empty(z.number().int().min(0)),
  bosses: z.array(appointmentBossRow).max(100).default([]),
})

/** 파티 약속과 딸린 보스 · 예외. 한 번 · 매주에 맞는 칸만 채우는지는 표의 CHECK 가 본다. */
export const partyAppointmentRow = z.object({
  id: recordId,
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(0),
  alarmMinutesBefore: empty(z.number().int().min(0)),
  scheduleType: z.enum(appointmentScheduleTypeEnum.enumValues),
  date: empty(day),
  weekday: empty(z.number().int().min(0).max(6)),
  fromWeekCode: empty(weekCode),
  untilWeekCode: empty(weekCode),
  memo: empty(z.string().max(1000)),
  bosses: z.array(appointmentBossRow).max(100),
  exceptions: z.array(appointmentExceptionRow).max(100).default([]),
})
export type PartyAppointmentRow = z.infer<typeof partyAppointmentRow>

/** 계산기 기록의 캐릭터가 넣은 보스. 계산기는 제외를 받지 않는다. */
const calculatorBossRow = z.object({
  bossDifficultyId: rowId,
  splitType: z.enum(splitTypeEnum.enumValues).exclude(['excluded']),
  partySize,
  splitShareMillipercent: empty(shareMillipercent),
  splitFeePercent: empty(percent),
  splitFeeFollowsMvpGrade: z.boolean(),
})

/** 계산기 기록 안의 캐릭터 한 명과 그 보스 */
const calculatorCharacterRow = z.object({
  sortOrder: z.number().int().min(0),
  ...characterOwner,
  bosses: z.array(calculatorBossRow).max(100),
})

/** 주간 보스 수익 계산기에서 저장한 기록 */
export const bossProfitCalculatorRecordRow = z.object({
  id: recordId,
  savedAt: instant,
  characters: z.array(calculatorCharacterRow).max(100),
})
export type BossProfitCalculatorRecordRow = z.infer<typeof bossProfitCalculatorRecordRow>

/** 기기에 id 가 있는 기록의 지우기. 기기는 기록이 사라진 뒤에 보내 주인을 모를 수 있어 서버가 줄에서 찾는다. */
export const deleteById = z.object({ id: recordId })
export type DeleteById = z.infer<typeof deleteById>

/** 캐릭터 하나에 한 줄인 기록의 지우기 */
export const deleteByCharacter = z.object(characterOwner)
export type DeleteByCharacter = z.infer<typeof deleteByCharacter>

/** 공유 진행의 지우기. 유일 기준인 메이플 ID · 월드 · 컨텐츠다. */
export const deleteSharedContentProgress = sharedContentProgressKey
export type DeleteSharedContentProgress = z.infer<typeof deleteSharedContentProgress>

/** 메이플 ID 이름의 지우기. 기본 이름으로 되돌린 것이다. */
export const deleteMapleIdName = mapleIdNameRow.pick({ mapleId: true })
export type DeleteMapleIdName = z.infer<typeof deleteMapleIdName>

/**
 * 올리기와 받기가 쓰는 표 이름. 서버 스키마의 표 이름을 낙타 표기로 쓴 것이다. 받기 응답의 칸도 이 차례로 싣는다. 기기는 이
 * 차례로 넣어야 가리키는 줄이 먼저 선다. 리프는 옛 ocid 의 기기 줄을 먼저 옮기고, 인벤토리는 가계부 품목보다, 수익 건은 드롭보다
 * 앞이다.
 */
export const SYNC_TABLE_NAMES = [
  'characterWorldLeaps',
  'inventoryItems',
  'cashbookEntries',
  'bossProfitEntries',
  'bossDrops',
  'bossSplitSettings',
  'enhancementTotals',
  'enhancementSettledDays',
  'rememberedLevels',
  'mvpGradeHistory',
  'manualTrackedItems',
  'sharedContentProgress',
  'mapleIdNames',
  'trackedCharacters',
  'representativeCharacterMotions',
  'accountSettings',
  'bottomBarSubPageOrders',
  'partyAppointments',
  'bossProfitCalculatorRecords',
] as const
export type SyncTableName = (typeof SYNC_TABLE_NAMES)[number]

/** 올리는 기록 한 건의 겉. row 는 표마다 따로 검사한다. 틀린 한 건이 다른 건을 막지 않게 하려는 것이다. */
export const pushRecord = z.object({
  table: z.enum(SYNC_TABLE_NAMES),
  action: z.enum(['upsert', 'delete']),
  row: z.unknown(),
})
export type PushRecord = z.infer<typeof pushRecord>

/** 올리기 본문. 건마다 따로 검사하므로 여기서는 배열의 길이만 본다. */
export const pushBody = z.object({ records: z.array(z.unknown()).min(1).max(PUSH_RECORD_LIMIT) })
export type PushBody = z.infer<typeof pushBody>

const changeSeq = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/**
 * 받기 본문. 주인마다 마지막으로 받은 변경 번호다. 사람의 번호는 그 번호를 받을 때의 넥슨 계정 줄 id 와 함께 보낸다. 줄이
 * 합쳐지거나 다른 사람으로 로그인해 신원의 넥슨 계정이 바뀌면 서버가 그 번호를 0 으로 본다.
 */
export const pullBody = z.object({
  cursors: z
    .object({
      nexonAccount: z.object({ id: uuidLike, changeSeq }).nullish(),
      mapleIds: z.record(mapleId, changeSeq).default({}),
    })
    .default({ mapleIds: {} }),
})
export type PullBody = z.infer<typeof pullBody>

/** 데이터 삭제 화면의 기록 묶음. 앱의 `CacheDataGroupId` 가운데 서버에 올리는 넷이다. */
export const CLEAR_GROUPS = ['cashbook', 'enhancement', 'boss', 'manual'] as const
export type ClearGroup = (typeof CLEAR_GROUPS)[number]

/** 데이터 삭제 본문 */
export const clearBody = z.object({ groups: z.array(z.enum(CLEAR_GROUPS)).min(1).max(4) })
export type ClearBody = z.infer<typeof clearBody>
