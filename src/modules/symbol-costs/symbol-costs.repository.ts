import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { symbolGroups, symbolLevelCosts, symbols } from '../../database/schema'
import { isPeriodText } from '../crystal-prices/period-boundary'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface SymbolGroupView {
  key: string
  name: string
  maxLevel: number
  defaultFrom: number
  defaultTo: number
}

export interface SymbolView {
  key: string
  group: string
  name: string
  requiredLevel: number
  iconFile: string
}

export interface SymbolLevelCostView {
  symbol: string
  level: number
  costMeso: number
  from: string | null
  until: string | null
}

/** GET /v1/game-data 의 symbolCosts 칸. 비용은 레벨마다 한 줄이고 한 조합에 기간 줄이 여럿이다. */
export interface SymbolCostsSection {
  updatedAt: string | null
  groups: SymbolGroupView[]
  symbols: SymbolView[]
  levelCosts: SymbolLevelCostView[]
}

/** 관리 화면의 묶음 하나. 심볼마다 레벨 줄이 서고 레벨마다 가격 줄 전부가 든다. */
export interface SymbolAdminGroup extends SymbolGroupView {
  symbols: (SymbolView & {
    levels: {
      level: number
      costs: { id: string; costMeso: number; from: string | null; until: string | null }[]
    }[]
  })[]
}

export type SymbolGroupInput = SymbolGroupView
export type SymbolInput = SymbolView

export class SymbolGroupExists extends Error {}
export class SymbolExists extends Error {}
export class NoSymbolGroup extends Error {}
export class NoSymbol extends Error {}
/** 레벨이 1 보다 작거나 만렙 이상이다. 비용은 max_level - 1 까지만 있다. */
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
      this.db
        .select()
        .from(symbolGroups)
        .orderBy(asc(symbolGroups.sortOrder), asc(symbolGroups.key)),
      this.symbolRows(),
      this.db
        .select({
          symbol: symbols.key,
          level: symbolLevelCosts.level,
          costMeso: symbolLevelCosts.costMeso,
          from: symbolLevelCosts.from,
          until: symbolLevelCosts.until,
        })
        .from(symbolLevelCosts)
        .innerJoin(symbols, eq(symbolLevelCosts.symbolId, symbols.id))
        .innerJoin(symbolGroups, eq(symbols.groupId, symbolGroups.id))
        .orderBy(
          asc(symbolGroups.sortOrder),
          asc(symbols.sortOrder),
          asc(symbols.key),
          asc(symbolLevelCosts.level),
          sql`${symbolLevelCosts.from} asc nulls first`,
        ),
      sectionUpdatedAt(this.db, 'symbolCosts'),
    ])
    return {
      updatedAt,
      groups: groups.map((g) => ({
        key: g.key,
        name: g.name,
        maxLevel: g.maxLevel,
        defaultFrom: g.defaultFrom,
        defaultTo: g.defaultTo,
      })),
      symbols: symbolRows.map((s) => ({
        key: s.key,
        group: s.group,
        name: s.name,
        requiredLevel: s.requiredLevel,
        iconFile: s.iconFile,
      })),
      levelCosts: costs,
    }
  }

  /** 관리 화면이 부른다. 묶음 → 심볼 → 레벨 → 가격 줄이고 레벨은 1 부터 max_level - 1 까지 빈 것도 선다. */
  async adminRows(): Promise<{ updatedAt: string | null; groups: SymbolAdminGroup[] }> {
    const section = await this.section()
    const ids = await this.db
      .select({ id: symbolLevelCosts.id, symbolId: symbolLevelCosts.symbolId })
      .from(symbolLevelCosts)
    const symbolRows = await this.symbolRows()
    const rowsOf = await this.db
      .select()
      .from(symbolLevelCosts)
      .orderBy(asc(symbolLevelCosts.level), sql`${symbolLevelCosts.from} asc nulls first`)
    void ids
    return {
      updatedAt: section.updatedAt,
      groups: section.groups.map((g) => ({
        ...g,
        symbols: symbolRows
          .filter((s) => s.group === g.key)
          .map((s) => ({
            key: s.key,
            group: s.group,
            name: s.name,
            requiredLevel: s.requiredLevel,
            iconFile: s.iconFile,
            levels: Array.from({ length: Math.max(0, g.maxLevel - 1) }, (_, i) => i + 1).map(
              (level) => ({
                level,
                costs: rowsOf
                  .filter((r) => r.symbolId === s.id && r.level === level)
                  .map((r) => ({ id: r.id, costMeso: r.costMeso, from: r.from, until: r.until })),
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
        .select({ max: sql<number | null>`max(${symbolLevelCosts.level})` })
        .from(symbolLevelCosts)
        .innerJoin(symbols, eq(symbolLevelCosts.symbolId, symbols.id))
        .where(eq(symbols.groupId, group.id))
      if (top?.max != null && top.max >= input.maxLevel) throw new LevelsAboveMax(`${top.max}`)
      await tx
        .update(symbolGroups)
        .set({
          name: input.name,
          maxLevel: input.maxLevel,
          defaultFrom: input.defaultFrom,
          defaultTo: input.defaultTo,
        })
        .where(eq(symbolGroups.id, group.id))
      await touchSection(tx, 'symbolCosts')
      return true
    })
  }

  /** 심볼을 묶음 맨 뒤에 더한다. 비용은 addCosts 가 한 번에 넣는다. 모르는 묶음은 NoSymbolGroup, 같은 key 는 SymbolExists 다. */
  async createSymbol(input: SymbolInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: symbolGroups.id })
        .from(symbolGroups)
        .where(eq(symbolGroups.key, input.group))
      if (group === undefined) throw new NoSymbolGroup(input.group)
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
            iconFile: input.iconFile,
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

  /** 이름 · 착용 레벨 · 그림을 갈아 끼운다. key 와 묶음은 못 바꾼다. 모르면 false 다. */
  async updateSymbol(key: string, input: Omit<SymbolInput, 'key' | 'group'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(symbols)
        .set({ name: input.name, requiredLevel: input.requiredLevel, iconFile: input.iconFile })
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
   * 레벨 여럿의 새 비용을 한 번에 적는다. 레벨마다 지금 줄이 있으면 그 줄의 until 을 새 시작으로 닫고 새 줄을 연다.
   *
   * 첫 줄은 시작이 없어도 된다(처음부터). 지금 줄이 있는 레벨은 시작이 있어야 하고 지금 줄의 시작보다 뒤여야 한다.
   * 넣고 나서 지금 서는 줄이 1 부터 max_level - 1 까지 다 있어야 한다. 새 심볼은 전부를 한 번에 넣는다.
   */
  async addCosts(
    symbolKey: string,
    input: { from: string | null; costs: { level: number; costMeso: number }[] },
  ): Promise<{ inserted: number }> {
    const found = await this.symbol(symbolKey)
    if (found === null) throw new NoSymbol(symbolKey)
    if (input.from !== null && !isPeriodText(input.from)) throw new NotAfterCurrent(input.from)
    const levels = new Set<number>()
    for (const c of input.costs) {
      if (c.level < 1 || c.level >= found.maxLevel) throw new LevelOutOfRange(`${c.level}`)
      if (levels.has(c.level)) throw new LevelOutOfRange(`레벨이 겹친다: ${c.level}`)
      levels.add(c.level)
    }
    return this.db.transaction(async (tx) => {
      const open = await tx
        .select()
        .from(symbolLevelCosts)
        .where(and(eq(symbolLevelCosts.symbolId, found.id), isNull(symbolLevelCosts.until)))
      for (const c of input.costs) {
        const current = open.find((r) => r.level === c.level)
        if (current !== undefined) {
          if (input.from === null) throw new NotAfterCurrent('지금 비용이 있어 시작이 있어야 한다')
          if (current.from !== null && input.from <= current.from)
            throw new NotAfterCurrent(input.from)
          await tx
            .update(symbolLevelCosts)
            .set({ until: input.from })
            .where(eq(symbolLevelCosts.id, current.id))
        }
        await tx.insert(symbolLevelCosts).values({
          symbolId: found.id,
          level: c.level,
          costMeso: c.costMeso,
          from: input.from,
          until: null,
        })
      }
      const after = await tx
        .select({ level: symbolLevelCosts.level })
        .from(symbolLevelCosts)
        .where(and(eq(symbolLevelCosts.symbolId, found.id), isNull(symbolLevelCosts.until)))
      const standing = new Set(after.map((r) => r.level))
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
      if (row.until !== null) throw new NotLatest(id)
      const [previous] =
        row.from === null
          ? []
          : await tx
              .select({ id: symbolLevelCosts.id })
              .from(symbolLevelCosts)
              .where(
                and(
                  eq(symbolLevelCosts.symbolId, row.symbolId),
                  eq(symbolLevelCosts.level, row.level),
                  eq(symbolLevelCosts.until, row.from),
                ),
              )
      if (previous === undefined) throw new OnlyRow(id)
      await tx.delete(symbolLevelCosts).where(eq(symbolLevelCosts.id, id))
      await tx
        .update(symbolLevelCosts)
        .set({ until: null })
        .where(eq(symbolLevelCosts.id, previous.id))
      await touchSection(tx, 'symbolCosts')
      return true
    })
  }

  private symbolRows(db: DbOrTx = this.db) {
    return db
      .select({
        id: symbols.id,
        key: symbols.key,
        group: symbolGroups.key,
        name: symbols.name,
        requiredLevel: symbols.requiredLevel,
        iconFile: symbols.iconFile,
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
