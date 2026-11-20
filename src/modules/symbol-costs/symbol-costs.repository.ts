import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { assets, symbolGroups, symbolLevelCosts, symbols } from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { isPeriodText } from '../crystal-prices/period-boundary'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface SymbolGroupView {
  id: string
  key: string
  name: string
  maxLevel: number
  defaultFromLevel: number
  defaultToLevel: number
}

export interface SymbolView {
  id: string
  key: string
  groupId: string
  name: string
  requiredLevel: number
  iconAssetId: string
}

export interface SymbolLevelCostView {
  symbolId: string
  fromLevel: number
  costMeso: number
  validFrom: string | null
  validUntil: string | null
}

/** GET /v1/game-data 의 symbolCosts 칸. 비용은 강화 전 레벨마다 한 줄이고 한 조합에 기간 줄이 여럿이다. */
export interface SymbolCostsSection {
  updatedAt: string | null
  symbolGroups: SymbolGroupView[]
  symbols: SymbolView[]
  symbolLevelCosts: SymbolLevelCostView[]
}

export interface SymbolGroupInput {
  key: string
  name: string
  maxLevel: number
  defaultFromLevel: number
  defaultToLevel: number
}

/** 묶음은 key 로 가리킨다. */
export interface SymbolInput {
  key: string
  group: string
  name: string
  requiredLevel: number
  iconAssetId: string
}

/** 관리 화면의 묶음 하나. 심볼마다 강화 전 레벨 줄이 서고 레벨마다 가격 줄 전부가 든다. */
export interface SymbolAdminGroup extends SymbolGroupInput {
  symbols: (SymbolInput & {
    levels: {
      fromLevel: number
      costs: { id: string; costMeso: number; validFrom: string | null; validUntil: string | null }[]
    }[]
  })[]
}

export class SymbolGroupExists extends Error {}
export class SymbolExists extends Error {}
export class NoSymbolGroup extends Error {}
export class NoSymbol extends Error {}
/** 강화 전 레벨이 1 보다 작거나 만렙 이상이다. 비용은 max_level - 1 까지만 있다. */
export class LevelOutOfRange extends Error {}
/** 넣고 나서도 지금 서는 줄이 1 부터 max_level - 1 까지 다 있지 않다. 빈 레벨이 있으면 앱의 구간 합이 틀린다. */
export class LevelsIncomplete extends Error {}
/** 시작이 지금 줄의 시작보다 뒤가 아니거나 글자가 날짜가 아니다. */
export class NotAfterCurrent extends Error {}
/** 지금 줄이 아니다. 지난 줄은 과거 기록이 읽어 못 지운다. */
export class NotLatest extends Error {}
/** 그 레벨의 유일한 줄이다. 거두면 빈 레벨이 생긴다. */
export class OnlyRow extends Error {}
/** 만렙을 그 위에 비용 줄이 있는 값으로 내린다. */
export class LevelsAboveMax extends Error {}

@Injectable()
export class SymbolCostsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<SymbolCostsSection> {
    const [groups, symbolRows, costs, updatedAt] = await Promise.all([
      this.groupRows(),
      this.symbolRows(),
      this.db
        .select({
          symbolId: symbolLevelCosts.symbolId,
          fromLevel: symbolLevelCosts.fromLevel,
          costMeso: symbolLevelCosts.costMeso,
          validFrom: symbolLevelCosts.validFrom,
          validUntil: symbolLevelCosts.validUntil,
        })
        .from(symbolLevelCosts)
        .innerJoin(symbols, eq(symbolLevelCosts.symbolId, symbols.id))
        .innerJoin(symbolGroups, eq(symbols.groupId, symbolGroups.id))
        .orderBy(
          asc(symbolGroups.sortOrder),
          asc(symbols.sortOrder),
          asc(symbols.key),
          asc(symbolLevelCosts.fromLevel),
          sql`${symbolLevelCosts.validFrom} asc nulls first`,
        ),
      sectionUpdatedAt(this.db, 'symbolCosts'),
    ])
    return {
      updatedAt,
      symbolGroups: groups,
      symbols: symbolRows.map((s) => ({
        id: s.id,
        key: s.key,
        groupId: s.groupId,
        name: s.name,
        requiredLevel: s.requiredLevel,
        iconAssetId: s.iconAssetId,
      })),
      symbolLevelCosts: costs,
    }
  }

  /** 관리 화면이 부른다. 묶음 → 심볼 → 강화 전 레벨 → 가격 줄이고 레벨은 1 부터 max_level - 1 까지 빈 것도 선다. */
  async adminRows(): Promise<{ updatedAt: string | null; groups: SymbolAdminGroup[] }> {
    const [groups, symbolRows, costs, updatedAt] = await Promise.all([
      this.groupRows(),
      this.symbolRows(),
      this.db
        .select()
        .from(symbolLevelCosts)
        .orderBy(
          asc(symbolLevelCosts.fromLevel),
          sql`${symbolLevelCosts.validFrom} asc nulls first`,
        ),
      sectionUpdatedAt(this.db, 'symbolCosts'),
    ])
    return {
      updatedAt,
      groups: groups.map((g) => ({
        key: g.key,
        name: g.name,
        maxLevel: g.maxLevel,
        defaultFromLevel: g.defaultFromLevel,
        defaultToLevel: g.defaultToLevel,
        symbols: symbolRows
          .filter((s) => s.groupId === g.id)
          .map((s) => ({
            key: s.key,
            group: g.key,
            name: s.name,
            requiredLevel: s.requiredLevel,
            iconAssetId: s.iconAssetId,
            levels: Array.from({ length: Math.max(0, g.maxLevel - 1) }, (_, i) => i + 1).map(
              (fromLevel) => ({
                fromLevel,
                costs: costs
                  .filter((r) => r.symbolId === s.id && r.fromLevel === fromLevel)
                  .map((r) => ({
                    id: r.id,
                    costMeso: r.costMeso,
                    validFrom: r.validFrom,
                    validUntil: r.validUntil,
                  })),
              }),
            ),
          })),
      })),
    }
  }

  /** 묶음을 맨 뒤에 더한다. 같은 key 는 SymbolGroupExists 다. */
  async createGroup(input: SymbolGroupInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${symbolGroups.sortOrder})` })
        .from(symbolGroups)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(symbolGroups)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: symbolGroups.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new SymbolGroupExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'symbolCosts')
      return row
    })
  }

  /** 이름 · 만렙 · 기본 범위를 갈아 끼운다. 만렙 위에 비용 줄이 있으면 LevelsAboveMax 다. 모르면 false 다. */
  async updateGroup(key: string, input: Omit<SymbolGroupInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: symbolGroups.id })
        .from(symbolGroups)
        .where(eq(symbolGroups.key, key))
      if (group === undefined) return false
      const [top] = await tx
        .select({ max: sql<number | null>`max(${symbolLevelCosts.fromLevel})` })
        .from(symbolLevelCosts)
        .innerJoin(symbols, eq(symbolLevelCosts.symbolId, symbols.id))
        .where(eq(symbols.groupId, group.id))
      if (top?.max != null && top.max >= input.maxLevel) throw new LevelsAboveMax(`${top.max}`)
      await tx
        .update(symbolGroups)
        .set({
          name: input.name,
          maxLevel: input.maxLevel,
          defaultFromLevel: input.defaultFromLevel,
          defaultToLevel: input.defaultToLevel,
        })
        .where(eq(symbolGroups.id, group.id))
      await touchSection(tx, 'symbolCosts')
      return true
    })
  }

  /**
   * 심볼을 묶음 맨 뒤에 더한다. 비용은 addCosts 가 한 번에 넣는다. 모르는 묶음은 NoSymbolGroup, 같은 key 는 SymbolExists,
   * 그림 표에 없는 그림은 AssetNotFound 다.
   */
  async createSymbol(input: SymbolInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: symbolGroups.id })
        .from(symbolGroups)
        .where(eq(symbolGroups.key, input.group))
      if (group === undefined) throw new NoSymbolGroup(input.group)
      await requireAsset(tx, input.iconAssetId)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${symbols.sortOrder})` })
        .from(symbols)
        .where(eq(symbols.groupId, group.id))
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(symbols)
          .values({
            key: input.key,
            groupId: group.id,
            name: input.name,
            requiredLevel: input.requiredLevel,
            iconAssetId: input.iconAssetId,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: symbols.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new SymbolExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'symbolCosts')
      return row
    })
  }

  /** 이름 · 착용 레벨 · 그림을 갈아 끼운다. key 와 묶음은 못 바꾼다. 모르면 false, 그림 표에 없는 그림은 AssetNotFound 다. */
  async updateSymbol(key: string, input: Omit<SymbolInput, 'key' | 'group'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await requireAsset(tx, input.iconAssetId)
      const rows = await tx
        .update(symbols)
        .set({
          name: input.name,
          requiredLevel: input.requiredLevel,
          iconAssetId: input.iconAssetId,
        })
        .where(eq(symbols.key, key))
        .returning({ id: symbols.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'symbolCosts')
      return true
    })
  }

  /** 심볼의 차례를 묶음 안에서 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveSymbol(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [mine] = await tx
        .select({ groupId: symbols.groupId })
        .from(symbols)
        .where(eq(symbols.key, key))
      if (mine === undefined) return false
      const rows = await tx
        .select({ id: symbols.id, key: symbols.key, sortOrder: symbols.sortOrder })
        .from(symbols)
        .where(eq(symbols.groupId, mine.groupId))
        .orderBy(asc(symbols.sortOrder), asc(symbols.key))
      const at = rows.findIndex((r) => r.key === key)
      const me = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (me === undefined || other === undefined) return true
      await tx.update(symbols).set({ sortOrder: other.sortOrder }).where(eq(symbols.id, me.id))
      await tx.update(symbols).set({ sortOrder: me.sortOrder }).where(eq(symbols.id, other.id))
      await touchSection(tx, 'symbolCosts')
      return true
    })
  }

  /**
   * 강화 전 레벨 여럿의 새 비용을 한 번에 적는다. 레벨마다 지금 줄이 있으면 그 줄의 valid_until 을 새 시작으로 닫고 새 줄을 연다.
   *
   * 첫 줄은 시작이 없어도 된다(처음부터). 지금 줄이 있는 레벨은 시작이 있어야 하고 지금 줄의 시작보다 뒤여야 한다.
   * 넣고 나서 지금 서는 줄이 1 부터 max_level - 1 까지 다 있어야 한다. 새 심볼은 전부를 한 번에 넣는다.
   */
  async addCosts(
    symbolKey: string,
    input: { validFrom: string | null; costs: { fromLevel: number; costMeso: number }[] },
  ): Promise<{ inserted: number }> {
    const found = await this.symbol(symbolKey)
    if (found === null) throw new NoSymbol(symbolKey)
    const { validFrom } = input
    if (validFrom !== null && !isPeriodText(validFrom)) throw new NotAfterCurrent(validFrom)
    const levels = new Set<number>()
    for (const c of input.costs) {
      if (c.fromLevel < 1 || c.fromLevel >= found.maxLevel)
        throw new LevelOutOfRange(`${c.fromLevel}`)
      if (levels.has(c.fromLevel)) throw new LevelOutOfRange(`레벨이 겹친다: ${c.fromLevel}`)
      levels.add(c.fromLevel)
    }
    return this.db.transaction(async (tx) => {
      const open = await tx
        .select()
        .from(symbolLevelCosts)
        .where(and(eq(symbolLevelCosts.symbolId, found.id), isNull(symbolLevelCosts.validUntil)))
      for (const c of input.costs) {
        const current = open.find((r) => r.fromLevel === c.fromLevel)
        if (current !== undefined) {
          if (validFrom === null) throw new NotAfterCurrent('지금 비용이 있어 시작이 있어야 한다')
          if (current.validFrom !== null && validFrom <= current.validFrom)
            throw new NotAfterCurrent(validFrom)
          await tx
            .update(symbolLevelCosts)
            .set({ validUntil: validFrom })
            .where(eq(symbolLevelCosts.id, current.id))
        }
        await tx.insert(symbolLevelCosts).values({
          symbolId: found.id,
          fromLevel: c.fromLevel,
          costMeso: c.costMeso,
          validFrom,
          validUntil: null,
        })
      }
      const after = await tx
        .select({ fromLevel: symbolLevelCosts.fromLevel })
        .from(symbolLevelCosts)
        .where(and(eq(symbolLevelCosts.symbolId, found.id), isNull(symbolLevelCosts.validUntil)))
      const standing = new Set(after.map((r) => r.fromLevel))
      for (let level = 1; level < found.maxLevel; level += 1) {
        if (!standing.has(level)) throw new LevelsIncomplete(`${level}`)
      }
      await touchSection(tx, 'symbolCosts')
      return { inserted: input.costs.length }
    })
  }

  /** 지금 비용 줄을 거둔다. 바로 앞 줄이 다시 열린다. 없으면 false, 지난 줄이면 NotLatest, 유일한 줄이면 OnlyRow 다. */
  async removeLatest(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(symbolLevelCosts).where(eq(symbolLevelCosts.id, id))
      if (row === undefined) return false
      if (row.validUntil !== null) throw new NotLatest(id)
      const [previous] =
        row.validFrom === null
          ? []
          : await tx
              .select({ id: symbolLevelCosts.id })
              .from(symbolLevelCosts)
              .where(
                and(
                  eq(symbolLevelCosts.symbolId, row.symbolId),
                  eq(symbolLevelCosts.fromLevel, row.fromLevel),
                  eq(symbolLevelCosts.validUntil, row.validFrom),
                ),
              )
      if (previous === undefined) throw new OnlyRow(id)
      await tx.delete(symbolLevelCosts).where(eq(symbolLevelCosts.id, id))
      await tx
        .update(symbolLevelCosts)
        .set({ validUntil: null })
        .where(eq(symbolLevelCosts.id, previous.id))
      await touchSection(tx, 'symbolCosts')
      return true
    })
  }

  private groupRows(): Promise<SymbolGroupView[]> {
    return this.db
      .select({
        id: symbolGroups.id,
        key: symbolGroups.key,
        name: symbolGroups.name,
        maxLevel: symbolGroups.maxLevel,
        defaultFromLevel: symbolGroups.defaultFromLevel,
        defaultToLevel: symbolGroups.defaultToLevel,
      })
      .from(symbolGroups)
      .orderBy(asc(symbolGroups.sortOrder), asc(symbolGroups.key))
  }

  private symbolRows() {
    return this.db
      .select({
        id: symbols.id,
        key: symbols.key,
        groupId: symbols.groupId,
        name: symbols.name,
        requiredLevel: symbols.requiredLevel,
        iconAssetId: symbols.iconAssetId,
      })
      .from(symbols)
      .innerJoin(symbolGroups, eq(symbols.groupId, symbolGroups.id))
      .orderBy(asc(symbolGroups.sortOrder), asc(symbols.sortOrder), asc(symbols.key))
  }

  private async symbol(key: string): Promise<{ id: string; maxLevel: number } | null> {
    const [row] = await this.db
      .select({ id: symbols.id, maxLevel: symbolGroups.maxLevel })
      .from(symbols)
      .innerJoin(symbolGroups, eq(symbols.groupId, symbolGroups.id))
      .where(eq(symbols.key, key))
    return row ?? null
  }
}

/** 그림 표에 없는 그림 id 는 AssetNotFound 다. FK 오류로 두면 관리 화면에 500 이 난다. */
async function requireAsset(tx: DbOrTx, id: string): Promise<void> {
  const [asset] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, id))
  if (asset === undefined) throw new AssetNotFound(id)
}
