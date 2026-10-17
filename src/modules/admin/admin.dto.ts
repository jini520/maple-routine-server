import { z } from 'zod'

import { BOSS_DIFFICULTIES } from '../bosses/bosses.dto'
import {
  CONTENT_CATEGORIES,
  CONTENT_SECTIONS,
  CONTENT_TYPES,
  SHARE_SCOPES,
} from '../contents/contents.repository'
import { PERIOD_TEXT } from '../crystal-prices/period-boundary'
import {
  POTENTIAL_GRADES,
  POTENTIAL_RESET_TYPES,
} from '../enhancement-costs/enhancement-costs.repository'
import { MVP_GRADES } from '../mvp-grades/mvp-grades.repository'
import {
  SPEND_CATEGORIES,
  SPEND_CURRENCIES,
  SPEND_FORMS,
} from '../spend-catalog/spend-catalog.repository'

/** 보스를 연다. key 는 bosses 표에 있어야 하고 날짜는 KST YYYY-MM-DD 다. */
export const openBody = z.object({
  boss: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type OpenBody = z.infer<typeof openBody>

export const rowId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

/** 알림 문구. 비우면 공지 제목과 본문을 쓴다. 본문은 FCM 의 4KB 안에 들게 200자다. */
const pushText = z.object({
  title: z.string().min(1).max(100).nullish(),
  body: z.string().min(1).max(200).nullish(),
})

/** 공지를 쓴다. push 가 null 이면 안 알리고, scheduledAt 이 있으면 그 시각에 알린다. */
export const noticeCreateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  link: z.url().nullish(),
  push: pushText.extend({ scheduledAt: z.iso.datetime({ offset: true }).nullish() }).nullish(),
})
export type NoticeCreateBody = z.infer<typeof noticeCreateBody>

/** 고친다. 예약은 없다. push 가 있으면 지금 다시 보낸다. */
export const noticeUpdateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  link: z.url().nullish(),
  push: pushText.nullish(),
})
export type NoticeUpdateBody = z.infer<typeof noticeUpdateBody>

/** 드롭 가격 보기의 필터. 비우면 전부다. limit 은 줄 목록에만 쓴다. */
export const dropPriceQuery = z.object({
  itemKey: z.string().min(1).max(200).optional(),
  periodKey: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
})
export type DropPriceQuery = z.infer<typeof dropPriceQuery>

/** 난이도 줄 하나의 본문. 난이도는 경로가 든다. 유효 기간은 새 줄을 더할 때 함께 적고, 있는 줄은 period 끝점으로 고친다. */
export const requiredLevelBody = z
  .object({
    requiredLevel: z.number().int().min(1),
    from: z.string().regex(PERIOD_TEXT).nullish(),
    until: z.string().regex(PERIOD_TEXT).nullish(),
  })
  .refine((d) => d.from == null || d.until == null || d.from < d.until, {
    message: '끝이 시작보다 뒤여야 한다',
    path: ['until'],
  })
export type RequiredLevelBody = z.infer<typeof requiredLevelBody>

/** 앱의 snake_case key. 아이템 · 보스가 같은 모양이다. */
export const snakeKey = z.string().regex(/^[a-z][a-z0-9_]*$/)
/** KST 기간 글자. 없으면 null 이다. */
const periodText = z.string().regex(PERIOD_TEXT).nullish()
const levelRange = <T extends { levelMin?: number | null; levelMax?: number | null }>(b: T) =>
  (b.levelMin == null) === (b.levelMax == null) &&
  (b.levelMin == null || b.levelMin <= (b.levelMax ?? 0))
const LEVEL_MESSAGE = '레벨 범위는 둘 다 있거나 둘 다 없고, min 이 max 를 안 넘는다'

export const dropItemCreateBody = z.object({
  key: snakeKey,
  name: z.string().min(1).max(100),
  iconFile: z.string().min(1).max(200).nullish(),
  valuable: z.boolean().default(false),
})
export type DropItemCreateBody = z.infer<typeof dropItemCreateBody>
export const dropItemUpdateBody = dropItemCreateBody.omit({ key: true })
export type DropItemUpdateBody = z.infer<typeof dropItemUpdateBody>

export const dropBoxCreateBody = z
  .object({
    item: snakeKey,
    levelMin: z.number().int().min(1).nullish(),
    levelMax: z.number().int().min(1).nullish(),
  })
  .refine(levelRange, { message: LEVEL_MESSAGE })
export type DropBoxCreateBody = z.infer<typeof dropBoxCreateBody>
export const dropBoxLevelsBody = z
  .object({
    levelMin: z.number().int().min(1).nullish(),
    levelMax: z.number().int().min(1).nullish(),
  })
  .refine(levelRange, { message: LEVEL_MESSAGE })
export type DropBoxLevelsBody = z.infer<typeof dropBoxLevelsBody>
export const boxContentBody = z.object({ item: snakeKey })
export const moveBody = z.object({ direction: z.enum(['up', 'down']) })
export type MoveBody = z.infer<typeof moveBody>

export const bossDropQuery = z.object({ boss: snakeKey, difficulty: z.enum(BOSS_DIFFICULTIES) })
export type BossDropQuery = z.infer<typeof bossDropQuery>
export const bossDropCreateBody = z.object({
  boss: snakeKey,
  difficulty: z.enum(BOSS_DIFFICULTIES),
  category: z.enum(['fixed', 'equipment', 'consumable']),
  item: snakeKey,
  amount: z.string().min(1).max(50).nullish(),
  from: periodText,
  until: periodText,
})
export type BossDropCreateBody = z.infer<typeof bossDropCreateBody>
export const bossDropUpdateBody = bossDropCreateBody.pick({ amount: true, from: true, until: true })
export type BossDropUpdateBody = z.infer<typeof bossDropUpdateBody>

export const crystalPriceBody = z.object({
  priceMeso: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  from: periodText,
})
export type CrystalPriceBody = z.infer<typeof crystalPriceBody>
export const maxPartySizeBody = z.object({
  maxPartySize: z.number().int().min(1).max(6).nullable(),
})
export type MaxPartySizeBody = z.infer<typeof maxPartySizeBody>

export const worldCreateBody = z.object({
  key: snakeKey,
  name: z.string().min(1).max(50),
  emblem: z.string().min(1).max(100).nullish(),
  challengers: z.boolean().default(false),
  event: z.boolean().default(false),
})
export type WorldCreateBody = z.infer<typeof worldCreateBody>
export const worldUpdateBody = worldCreateBody.omit({ key: true })
export type WorldUpdateBody = z.infer<typeof worldUpdateBody>

/* ── 지출 카탈로그 ── */

/** 관세율(%)과 세라자르 주화 판매가. game_rules 의 줄 둘이다. */
export const spendRulesBody = z.object({
  tariffPercent: z.number().int().min(0).max(100),
  rewardCoinPriceMeso: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
})
export type SpendRulesBody = z.infer<typeof spendRulesBody>

export const spendGroupCreateBody = z.object({
  key: snakeKey,
  name: z.string().min(1).max(50),
  category: z.enum(SPEND_CATEGORIES),
  active: z.boolean().default(true),
})
export type SpendGroupCreateBody = z.infer<typeof spendGroupCreateBody>
export const spendGroupUpdateBody = spendGroupCreateBody.omit({ key: true })
export type SpendGroupUpdateBody = z.infer<typeof spendGroupUpdateBody>

const spendTileBase = z.object({
  key: snakeKey,
  name: z.string().min(1).max(50),
  iconFile: z.string().min(1).max(200).nullish(),
  iconMap: z.string().min(1).max(100).nullish(),
})
const oneIcon = (t: { iconFile?: string | null; iconMap?: string | null }) =>
  t.iconFile == null || t.iconMap == null
const ICON_MESSAGE = '그림은 아이템 파일과 지역 아이콘 중 하나다'
export const spendTileCreateBody = spendTileBase.refine(oneIcon, { message: ICON_MESSAGE })
export type SpendTileCreateBody = z.infer<typeof spendTileCreateBody>
export const spendTileUpdateBody = spendTileBase
  .omit({ key: true })
  .refine(oneIcon, { message: ICON_MESSAGE })
export type SpendTileUpdateBody = z.infer<typeof spendTileUpdateBody>

/** 항목 하나. 축 값과 형태를 함께 받아 통째로 갈아 끼운다. 모양 검사는 리포지토리가 한다. */
const spendItemBase = z.object({
  key: snakeKey,
  group: snakeKey,
  tile: snakeKey,
  name: z.string().min(1).max(100),
  tier: z.string().min(1).max(50).nullish(),
  currency: z.enum(SPEND_CURRENCIES),
  unitPrice: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullish(),
  unit: z.string().min(1).max(10),
  maxQuantity: z.number().int().min(1).nullish(),
  rewardCoins: z.number().int().min(1).nullish(),
  from: periodText,
  until: periodText,
  options: z
    .array(z.object({ axis: z.string().min(1).max(20), value: z.string().min(1).max(50) }))
    .max(5)
    .default([]),
  forms: z.array(z.enum(SPEND_FORMS)).max(2).default([]),
})
const periodOrder = (d: { from?: string | null; until?: string | null }) =>
  d.from == null || d.until == null || d.from < d.until
const PERIOD_MESSAGE = { message: '끝이 시작보다 뒤여야 한다', path: ['until'] }
export const spendItemCreateBody = spendItemBase.refine(periodOrder, PERIOD_MESSAGE)
export type SpendItemCreateBody = z.infer<typeof spendItemCreateBody>
export const spendItemUpdateBody = spendItemBase
  .omit({ key: true, group: true })
  .refine(periodOrder, PERIOD_MESSAGE)
export type SpendItemUpdateBody = z.infer<typeof spendItemUpdateBody>

/* ── 심볼 비용 ── */

const symbolGroupBase = z.object({
  key: snakeKey,
  name: z.string().min(1).max(50),
  maxLevel: z.number().int().min(2).max(100),
  defaultFrom: z.number().int().min(1),
  defaultTo: z.number().int().min(2),
})
const rangeOk = (g: { maxLevel: number; defaultFrom: number; defaultTo: number }) =>
  g.defaultFrom < g.defaultTo && g.defaultTo <= g.maxLevel
const RANGE_MESSAGE = { message: '기본 범위는 시작 < 끝 ≤ 만렙이다' }
export const symbolGroupCreateBody = symbolGroupBase.refine(rangeOk, RANGE_MESSAGE)
export type SymbolGroupCreateBody = z.infer<typeof symbolGroupCreateBody>
export const symbolGroupUpdateBody = symbolGroupBase
  .omit({ key: true })
  .refine(rangeOk, RANGE_MESSAGE)
export type SymbolGroupUpdateBody = z.infer<typeof symbolGroupUpdateBody>

export const symbolCreateBody = z.object({
  key: snakeKey,
  group: snakeKey,
  name: z.string().min(1).max(50),
  requiredLevel: z.number().int().min(1),
  iconFile: z.string().min(1).max(200),
})
export type SymbolCreateBody = z.infer<typeof symbolCreateBody>
export const symbolUpdateBody = symbolCreateBody.omit({ key: true, group: true })
export type SymbolUpdateBody = z.infer<typeof symbolUpdateBody>

/** 레벨 여럿의 새 비용. 시작은 전부 같다. 첫 줄은 비워도 된다. */
export const symbolCostsBody = z.object({
  from: periodText,
  costs: z
    .array(
      z.object({
        level: z.number().int().min(1),
        costMeso: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .min(1)
    .max(100),
})
export type SymbolCostsBody = z.infer<typeof symbolCostsBody>

/* ── 컨텐츠 ── */

/** 갈래의 글자 · 태그 · 한도 · 공유 차례. key 는 ENUM 이라 경로가 든다. 태그는 글자와 숨김 중 하나다. */
export const contentCategoryUpdateBody = z
  .object({
    name: z.string().min(1).max(50),
    countTag: z.string().min(1).max(50).nullish(),
    hideCountTag: z.boolean().default(false),
    weeklyLimit: z.number().int().min(1).nullish(),
    sharedOrder: z.number().int().min(0).nullish(),
  })
  .refine((c) => c.countTag == null || !c.hideCountTag, {
    message: '태그는 글자와 숨김 중 하나다',
    path: ['hideCountTag'],
  })
export type ContentCategoryUpdateBody = z.infer<typeof contentCategoryUpdateBody>
export const contentCategoryParam = z.enum(CONTENT_CATEGORIES)

/** 컨텐츠 한 줄. 공유 줄만 위젯 글자와 스위치 둘을 들고, 그림은 지도와 초상 중 하나다. */
const contentBase = z.object({
  key: snakeKey,
  section: z.enum(CONTENT_SECTIONS),
  apiName: z.string().min(1).max(100),
  category: z.enum(CONTENT_CATEGORIES),
  displayName: z.string().min(1).max(100),
  shortName: z.string().min(1).max(100),
  backgroundMap: z.string().min(1).max(100).nullish(),
  backgroundPortrait: z.string().min(1).max(100).nullish(),
  countTag: z.string().min(1).max(50).nullish(),
  type: z.enum(CONTENT_TYPES),
  maxCount: z.number().int().min(0),
  requiredLevel: z.number().int().min(1).nullish(),
  from: periodText,
  until: periodText,
  shareScope: z.enum(SHARE_SCOPES).default('character'),
  sharedShortName: z.string().min(1).max(50).nullish(),
  onlyWhenScheduled: z.boolean().default(false),
  trustRegistrationFlag: z.boolean().default(false),
  cumulativeScore: z.boolean().default(false),
  maxCountOverride: z.number().int().min(1).nullish(),
})
/** 규칙은 key · 섹션을 안 보므로 더하기와 고치기가 같은 검사를 쓴다. */
type ContentRuleShape = Omit<z.infer<typeof contentBase>, 'key' | 'section'>
const contentRules = <T extends z.ZodType<ContentRuleShape>>(schema: T) =>
  schema
    .refine(periodOrder, PERIOD_MESSAGE)
    .refine((c) => c.backgroundMap == null || c.backgroundPortrait == null, {
      message: '그림은 지도와 초상 중 하나다',
      path: ['backgroundPortrait'],
    })
    .refine((c) => (c.shareScope === 'character') === (c.sharedShortName == null), {
      message: '공유 줄은 위젯 글자를 들고 캐릭터 줄은 못 든다',
      path: ['sharedShortName'],
    })
    .refine(
      (c) => c.shareScope !== 'character' || (!c.onlyWhenScheduled && !c.trustRegistrationFlag),
      {
        message: '캐릭터 줄은 스위치 둘을 못 켠다',
        path: ['shareScope'],
      },
    )
export const contentCreateBody = contentRules(contentBase)
export type ContentCreateBody = z.infer<typeof contentCreateBody>
export const contentUpdateBody = contentRules(contentBase.omit({ key: true, section: true }))
export type ContentUpdateBody = z.infer<typeof contentUpdateBody>

/* ── 장비 · 강화 비용 · MVP 등급 ── */

export const equipmentItemCreateBody = z.object({
  key: snakeKey,
  name: z.string().min(1).max(100),
  level: z.number().int().min(1).max(300).nullish(),
})
export type EquipmentItemCreateBody = z.infer<typeof equipmentItemCreateBody>
export const equipmentItemUpdateBody = equipmentItemCreateBody.omit({ key: true })
export type EquipmentItemUpdateBody = z.infer<typeof equipmentItemUpdateBody>

/** 규칙 셋. 감정비용 무료 상한 · 감정비용 계수 · 파괴 방지 추가분(%). game_rules 의 줄 셋이다. */
export const enhancementRulesBody = z.object({
  cubeAppraisalFreeMaxLevel: z.number().int().min(0).max(300),
  cubeAppraisalCoefficient: z.number().int().min(0),
  starforceDestroyDefenceSurchargePercent: z.number().int().min(0).max(1000),
})
export type EnhancementRulesBody = z.infer<typeof enhancementRulesBody>
export const potentialTypeParam = z.enum(POTENTIAL_RESET_TYPES)
export const potentialGradeParam = z.enum(POTENTIAL_GRADES)
export const minLevelParam = z.coerce.number().int().min(1)
export const fromStarParam = z.coerce.number().int().min(0)
export const costBody = z.object({ costMeso: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })
export type CostBody = z.infer<typeof costBody>
const meso = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
/** 구간 하나. 등급 넷을 한 번에 받는다. */
export const potentialBandBody = z.object({
  type: potentialTypeParam,
  minLevel: z.number().int().min(1),
  costs: z.object({ rare: meso, epic: meso, unique: meso, legendary: meso }),
})
export type PotentialBandBody = z.infer<typeof potentialBandBody>
export const starforceStepBody = z.object({
  exponent: z.number().min(0).max(10),
  divisor: z.number().int().min(1),
})
export type StarforceStepBody = z.infer<typeof starforceStepBody>

export const mvpGradeParam = z.enum(MVP_GRADES)
export const mvpGradeUpdateBody = z.object({
  name: z.string().min(1).max(20),
  auctionFeePercent: z.number().int().min(0).max(100),
  starforceDiscountPercent: z.number().int().min(0).max(100),
})
export type MvpGradeUpdateBody = z.infer<typeof mvpGradeUpdateBody>
