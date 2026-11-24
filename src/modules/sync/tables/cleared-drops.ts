import { and, eq, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'

import {
  bossDifficulties,
  bossDifficultyEnum,
  bossDifficultyRewards,
  bossDrops,
  bossProfitEntries,
  dropBoxContents,
  dropBoxes,
  dropSalePrices,
  ringLevelItems,
  sameItemLinks,
} from '../../../database/schema'
import type { Tx } from '../../users/nexon-account-store'
import type { WriteContext } from '../sync-write'

/** 같은 캐릭터 · 보스 · 기간의 수익 건 묶음. 처치한 수익 건은 묶음에 하나 */
export interface EntryGroup {
  characterId: string
  bossId: string
  periodCode: string
}

/** 묶음의 처치한 수익 건 */
export interface ClearedEntry {
  id: string
  bossDifficultyId: string
  worldId: string | null
}

/** 묶음 안의 살아 있는 드롭 한 개 */
interface GroupDrop {
  id: string
  itemId: string
  category: string
  profitEntryId: string
  difficulty: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 기간 값의 첫날(KST `YYYY-MM-DD`). 주간은 그 주가 시작한 목요일, 월간은 그 달 1일. 앱 `lib/boss/period-code.ts` 와 같은 셈
 *
 * @example periodStartDateOf('W202647') // '2026-11-19'
 */
export function periodStartDateOf(periodCode: string): string | null {
  const monthly = /^M(\d{4})(\d{2})$/.exec(periodCode)
  if (monthly !== null) return `${monthly[1]}-${monthly[2]}-01`
  const weekly = /^W(\d{4})(\d{2})$/.exec(periodCode)
  if (weekly === null) return null
  const januaryFirst = Date.UTC(Number(weekly[1]), 0, 1)
  const firstThursday = januaryFirst + ((4 - new Date(januaryFirst).getUTCDay() + 7) % 7) * DAY_MS
  return new Date(firstThursday + (Number(weekly[2]) - 1) * 7 * DAY_MS).toISOString().slice(0, 10)
}

/**
 * 드롭 표 줄이 그 기간 어느 때라도 유효했는지 가리는 술어. 시각 대신 기간 첫날과 견줘야 패치 전에 먹은 기록이 남음. 앱
 * `isEffectiveAnytimeIn` 과 같은 셈
 */
function effectiveAnytime(
  row: { validFrom: string | null; validUntil: string | null },
  start: string,
): boolean {
  return (
    (row.validFrom === null || row.validFrom.slice(0, 10) <= start) &&
    (row.validUntil === null || start < row.validUntil)
  )
}

/** 드롭에 삭제 표식을 적고 판매가 줄까지 지우는 쓰기. 판매가 줄이 남으면 지운 드롭이 시세에 남음 */
export async function markDropsDeleted(tx: Tx, userId: string, where: SQL): Promise<void> {
  const gone = await tx
    .update(bossDrops)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(where, isNull(bossDrops.deletedAt)))
    .returning({ id: bossDrops.id })
  if (gone.length === 0) return
  await tx.delete(dropSalePrices).where(
    and(
      inArray(
        dropSalePrices.id,
        gone.map((row) => row.id),
      ),
      or(isNull(dropSalePrices.userId), eq(dropSalePrices.userId, userId)),
    ),
  )
}

/** 묶음의 살아 있는 처치한 수익 건. 없으면 undefined */
export async function clearedEntryOf(tx: Tx, group: EntryGroup): Promise<ClearedEntry | undefined> {
  const [found] = await tx
    .select({
      id: bossProfitEntries.id,
      bossDifficultyId: bossProfitEntries.bossDifficultyId,
      worldId: bossProfitEntries.worldId,
    })
    .from(bossProfitEntries)
    .where(
      and(
        eq(bossProfitEntries.characterId, group.characterId),
        eq(bossProfitEntries.bossId, group.bossId),
        eq(bossProfitEntries.periodCode, group.periodCode),
        isNotNull(bossProfitEntries.clearRecordedBy),
        isNull(bossProfitEntries.deletedAt),
      ),
    )
    .limit(1)
  return found
}

/**
 * 처치한 난이도에서 아이템 줄을 얻는 자리를 내는 함수. 직접이면 `item:<아이템 줄 id>`, 상자에서면 `box:<상자 아이템 줄 id>`, 못
 * 얻으면 null. 자리가 같은 드롭은 같은 드롭
 */
async function placeFinder(
  tx: Tx,
  bossDifficultyId: string,
  start: string,
): Promise<(itemId: string) => string | null> {
  const rewards = (
    await tx
      .select({
        itemId: bossDifficultyRewards.itemId,
        validFrom: bossDifficultyRewards.validFrom,
        validUntil: bossDifficultyRewards.validUntil,
      })
      .from(bossDifficultyRewards)
      .where(eq(bossDifficultyRewards.bossDifficultyId, bossDifficultyId))
  ).filter((row) => effectiveAnytime(row, start))
  const direct = new Set(rewards.map((row) => row.itemId))
  const boxes =
    direct.size === 0
      ? []
      : await tx
          .select({
            boxItemId: dropBoxes.itemId,
            ringLevelMin: dropBoxes.ringLevelMin,
            ringLevelMax: dropBoxes.ringLevelMax,
            contentId: dropBoxContents.itemId,
          })
          .from(dropBoxes)
          .innerJoin(dropBoxContents, eq(dropBoxContents.boxId, dropBoxes.id))
          .where(inArray(dropBoxes.itemId, [...direct]))
  const levels = new Map(
    (await tx.select().from(ringLevelItems)).map((row) => [row.itemId, row] as const),
  )
  return (itemId) => {
    if (direct.has(itemId)) return `item:${itemId}`
    const level = levels.get(itemId)
    const box = boxes.find((row) =>
      level === undefined
        ? row.contentId === itemId
        : row.contentId === level.ringItemId &&
          row.ringLevelMin !== null &&
          row.ringLevelMax !== null &&
          level.ringLevel >= row.ringLevelMin &&
          level.ringLevel <= row.ringLevelMax,
    )
    return box === undefined ? null : `box:${box.boxItemId}`
  }
}

/** 같은 물건의 다른 줄을 원래 줄, 따로 둔 줄(줄 id 차례) 순으로 내는 함수. 자기 줄은 빠짐 */
async function sameItemFinder(tx: Tx): Promise<(itemId: string) => string[]> {
  const links = await tx.select().from(sameItemLinks)
  return (itemId) => {
    const original = links.find((link) => link.itemId === itemId)?.originalItemId ?? itemId
    const separate = links
      .filter((link) => link.originalItemId === original)
      .map((link) => link.itemId)
      .sort()
    return [original, ...separate].filter((id) => id !== itemId)
  }
}

/**
 * 묶음의 드롭마다 남길 아이템 줄과 지울 드롭을 정하는 계산. 앱 `planClearedDrops` 와 차례 · 규칙이 같아야 받기가 기기가 먼저 고친
 * 값을 되돌리지 않음
 */
function planClearedDrops(
  targetId: string,
  drops: readonly GroupDrop[],
  placeOf: (itemId: string) => string | null,
  sameItemsOf: (itemId: string) => string[],
): { keep: { id: string; itemId: string }[]; remove: string[] } {
  const order = (drop: GroupDrop) =>
    drop.profitEntryId === targetId
      ? -1
      : bossDifficultyEnum.enumValues.indexOf(drop.difficulty as never)
  const sorted = [...drops].sort(
    (a, b) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const seen = new Set<string>()
  const keep: { id: string; itemId: string }[] = []
  const remove: string[] = []
  for (const drop of sorted) {
    let itemId = drop.itemId
    let place = drop.category === 'fixed' ? `item:${itemId}` : placeOf(itemId)
    if (place === null) {
      for (const other of sameItemsOf(drop.itemId)) {
        place = placeOf(other)
        if (place !== null) {
          itemId = other
          break
        }
      }
    }
    if (place === null || seen.has(place)) {
      remove.push(drop.id)
      continue
    }
    seen.add(place)
    keep.push({ id: drop.id, itemId })
  }
  return { keep, remove }
}

/**
 * 처치한 수익 건이 있는 묶음의 드롭을 그 수익 건으로 모으고, 비운 수익 건을 기기처럼 지우는 쓰기. 같은 주인의 잠금 안에서 부를 것.
 * 잠금 밖이면 같은 묶음의 다른 쓰기와 엇갈려 변경 번호 차례가 커밋 차례와 어긋남
 */
export async function settleClearedDrops(ctx: WriteContext, group: EntryGroup): Promise<void> {
  const { tx, identity } = ctx
  const target = await clearedEntryOf(tx, group)
  const start = periodStartDateOf(group.periodCode)
  if (target === undefined || start === null) return
  const drops: GroupDrop[] = await tx
    .select({
      id: bossDrops.id,
      itemId: bossDrops.itemId,
      category: bossDrops.category,
      profitEntryId: bossDrops.profitEntryId,
      difficulty: bossDifficulties.difficulty,
    })
    .from(bossDrops)
    .innerJoin(bossProfitEntries, eq(bossProfitEntries.id, bossDrops.profitEntryId))
    .innerJoin(bossDifficulties, eq(bossDifficulties.id, bossProfitEntries.bossDifficultyId))
    .where(
      and(
        eq(bossProfitEntries.characterId, group.characterId),
        eq(bossProfitEntries.bossId, group.bossId),
        eq(bossProfitEntries.periodCode, group.periodCode),
        isNull(bossProfitEntries.deletedAt),
        isNull(bossDrops.deletedAt),
      ),
    )
  if (drops.length === 0) return
  const plan = planClearedDrops(
    target.id,
    drops,
    await placeFinder(tx, target.bossDifficultyId, start),
    await sameItemFinder(tx),
  )
  if (plan.remove.length > 0) {
    await markDropsDeleted(tx, identity.userId, inArray(bossDrops.id, plan.remove))
  }
  const before = new Map(drops.map((drop) => [drop.id, drop]))
  for (const { id, itemId } of plan.keep) {
    const drop = before.get(id)
    if (drop === undefined || (drop.profitEntryId === target.id && drop.itemId === itemId)) continue
    await tx
      .update(bossDrops)
      .set({ profitEntryId: target.id, itemId, updatedAt: sql`now()` })
      .where(eq(bossDrops.id, id))
    if (drop.itemId === itemId) continue
    await tx
      .update(dropSalePrices)
      .set({ itemId, updatedAt: sql`now()` })
      .where(
        and(
          eq(dropSalePrices.id, id),
          or(isNull(dropSalePrices.userId), eq(dropSalePrices.userId, identity.userId)),
        ),
      )
  }
  const emptied = [...new Set(drops.map((drop) => drop.profitEntryId))].filter(
    (id) => id !== target.id,
  )
  if (emptied.length === 0) return
  await tx
    .update(bossProfitEntries)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        inArray(bossProfitEntries.id, emptied),
        isNull(bossProfitEntries.clearRecordedBy),
        isNull(bossProfitEntries.splitType),
        isNull(bossProfitEntries.deletedAt),
        sql`NOT EXISTS (SELECT 1 FROM ${bossDrops}
                         WHERE ${bossDrops.profitEntryId} = ${bossProfitEntries.id}
                           AND ${bossDrops.deletedAt} IS NULL)`,
      ),
    )
}
