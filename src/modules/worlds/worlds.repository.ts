import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { assets, tradeGroups, worldOpenPeriods, worlds } from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

/** 월드가 열린 기간 한 줄. validFrom 은 연 날, validUntil 은 닫힌 다음 날인 KST 글자다. */
export interface WorldOpenPeriod {
  validFrom: string
  validUntil: string
}

/** 관리 화면이 고치고 지울 때 가리키는 기간 줄. */
export interface WorldOpenPeriodRow extends WorldOpenPeriod {
  id: string
}

/** 게임 데이터 worlds 칸의 월드. 칸 이름은 표를 따르고, 기록은 id 로 가리킨다. 열린 기간은 validFrom 차례다. */
export interface WorldView {
  id: string
  key: string
  name: string
  emblemAssetId: string | null
  isChallengers: boolean
  isEvent: boolean
  openPeriods: WorldOpenPeriod[]
}

/** GET /v1/game-data 의 worlds 칸. 차례가 곧 앱의 월드 차례다. */
export interface WorldsSection {
  updatedAt: string | null
  worlds: WorldView[]
}

/** 관리 화면이 보는 월드. 거래권은 앱에 안 싣고 여기에만 있다. NULL 이면 시세에서 빠진다. */
export interface WorldAdminView extends Omit<WorldView, 'openPeriods'> {
  tradeGroupKey: string | null
  openPeriods: WorldOpenPeriodRow[]
}

/** 관리 화면의 본문. 거래권은 key 로 받는다. 안 주면 새 월드는 general 이고, 고칠 때는 그대로 둔다. */
export interface WorldInput {
  key: string
  name: string
  emblemAssetId: string | null
  isChallengers: boolean
  isEvent: boolean
  tradeGroupKey?: string | null
}

export class WorldExists extends Error {}
/** 기간을 붙일 월드가 표에 없다. */
export class NoWorld extends Error {}
/** 거래권 표에 없는 거래권 key 다. message 가 그 값이다. */
export class NoTradeGroup extends Error {}
/** validUntil 이 validFrom 보다 뒤가 아니다. */
export class PeriodNotAfter extends Error {}
/** 같은 월드의 다른 기간과 겹친다. */
export class PeriodOverlap extends Error {}

/** 두 기간이 하루라도 함께 드는지. validUntil 은 그 날을 빼므로 앞 끝과 뒤 시작이 같으면 안 겹친다. */
function overlaps(a: WorldOpenPeriod, b: WorldOpenPeriod): boolean {
  return a.validFrom < b.validUntil && b.validFrom < a.validUntil
}

/** 월드는 더하고 고치고 옮기기만 있다. 기록이 줄을 가리켜 지우지 않는다. */
@Injectable()
export class WorldsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<WorldsSection> {
    const rows = await this.rows()
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'worlds'),
      worlds: rows.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        emblemAssetId: r.emblemAssetId,
        isChallengers: r.isChallengers,
        isEvent: r.isEvent,
        openPeriods: r.openPeriods.map(({ validFrom, validUntil }) => ({ validFrom, validUntil })),
      })),
    }
  }

  /** 관리 화면의 표. section 에 거래권과 기간 줄 id 를 더하고, 고를 수 있는 거래권을 함께 낸다. */
  async adminSection(): Promise<{
    updatedAt: string | null
    worlds: WorldAdminView[]
    tradeGroups: { key: string; name: string }[]
  }> {
    const [rows, groups, updatedAt] = await Promise.all([
      this.rows(),
      this.db
        .select({ key: tradeGroups.key, name: tradeGroups.name })
        .from(tradeGroups)
        .orderBy(asc(tradeGroups.key)),
      sectionUpdatedAt(this.db, 'worlds'),
    ])
    return { updatedAt, worlds: rows, tradeGroups: groups }
  }

  private async rows(): Promise<WorldAdminView[]> {
    const periodRows = await this.db
      .select({
        id: worldOpenPeriods.id,
        worldId: worldOpenPeriods.worldId,
        validFrom: worldOpenPeriods.validFrom,
        validUntil: worldOpenPeriods.validUntil,
      })
      .from(worldOpenPeriods)
      .orderBy(asc(worldOpenPeriods.validFrom))
    const periodsOf = new Map<string, WorldOpenPeriodRow[]>()
    for (const { worldId, ...period } of periodRows) {
      periodsOf.set(worldId, [...(periodsOf.get(worldId) ?? []), period])
    }
    const rows = await this.db
      .select({
        id: worlds.id,
        key: worlds.key,
        name: worlds.name,
        emblemAssetId: worlds.emblemAssetId,
        isChallengers: worlds.isChallengers,
        isEvent: worlds.isEvent,
        tradeGroupKey: tradeGroups.key,
      })
      .from(worlds)
      .leftJoin(tradeGroups, eq(tradeGroups.id, worlds.tradeGroupId))
      .orderBy(asc(worlds.sortOrder), asc(worlds.key))
    return rows.map((r) => ({ ...r, openPeriods: periodsOf.get(r.id) ?? [] }))
  }

  /** 맨 뒤에 더한다. 같은 key 는 WorldExists 다. */
  async create(input: WorldInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${worlds.sortOrder})` })
        .from(worlds)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(worlds)
          .values({
            ...(await columnsOf(tx, {
              ...input,
              // null 은 시세에서 빼는 월드(스페셜)라 기본값으로 바꾸지 않는다.
              tradeGroupKey: input.tradeGroupKey === undefined ? 'general' : input.tradeGroupKey,
            })),
            key: input.key,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: worlds.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new WorldExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'worlds')
      return row
    })
  }

  /** 이름 · 엠블럼 · 챌린저스 · 이벤트 · 거래권을 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 false 다. */
  async update(key: string, input: Omit<WorldInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(worlds)
        .set({ ...(await columnsOf(tx, input)), updatedAt: new Date() })
        .where(eq(worlds.key, key))
        .returning({ id: worlds.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'worlds')
      return true
    })
  }

  /** 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async move(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: worlds.id, key: worlds.key, sortOrder: worlds.sortOrder })
        .from(worlds)
        .orderBy(asc(worlds.sortOrder), asc(worlds.key))
      const at = rows.findIndex((r) => r.key === key)
      if (at === -1) return false
      const mine = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (mine === undefined || other === undefined) return true
      await tx.update(worlds).set({ sortOrder: other.sortOrder }).where(eq(worlds.id, mine.id))
      await tx.update(worlds).set({ sortOrder: mine.sortOrder }).where(eq(worlds.id, other.id))
      await touchSection(tx, 'worlds')
      return true
    })
  }

  /** 기간을 더한다. 모르는 월드는 NoWorld, 순서가 틀리면 PeriodNotAfter, 겹치면 PeriodOverlap 이다. */
  async addPeriod(key: string, period: WorldOpenPeriod): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [world] = await tx
        .select({ id: worlds.id })
        .from(worlds)
        .where(eq(worlds.key, key))
        .for('update')
      if (world === undefined) throw new NoWorld(key)
      await assertFits(tx, world.id, period, null)
      const [row] = await tx
        .insert(worldOpenPeriods)
        .values({ worldId: world.id, ...period })
        .returning({ id: worldOpenPeriods.id })
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'worlds')
      return row
    })
  }

  /** 기간 한 줄을 갈아 끼운다. 모르면 false 이고, 거절은 addPeriod 와 같다. */
  async updatePeriod(id: string, period: WorldOpenPeriod): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ worldId: worldOpenPeriods.worldId })
        .from(worldOpenPeriods)
        .where(eq(worldOpenPeriods.id, id))
      if (current === undefined) return false
      await tx
        .select({ id: worlds.id })
        .from(worlds)
        .where(eq(worlds.id, current.worldId))
        .for('update')
      await assertFits(tx, current.worldId, period, id)
      await tx
        .update(worldOpenPeriods)
        .set({ ...period, updatedAt: new Date() })
        .where(eq(worldOpenPeriods.id, id))
      await touchSection(tx, 'worlds')
      return true
    })
  }

  /** 기간 한 줄을 지운다. 모르면 false 다. */
  async removePeriod(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(worldOpenPeriods)
        .where(eq(worldOpenPeriods.id, id))
        .returning({ id: worldOpenPeriods.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'worlds')
      return true
    })
  }
}

/**
 * 그 월드에 이 기간을 둘 수 있는지 보는 검사. 고칠 때는 자기 줄을 빼고 본다.
 *
 * @param except 고치는 기간의 id. 더할 때는 null
 */
async function assertFits(
  db: DbOrTx,
  worldId: string,
  period: WorldOpenPeriod,
  except: string | null,
): Promise<void> {
  if (period.validUntil <= period.validFrom) throw new PeriodNotAfter(period.validFrom)
  const others = await db
    .select({ validFrom: worldOpenPeriods.validFrom, validUntil: worldOpenPeriods.validUntil })
    .from(worldOpenPeriods)
    .where(
      except === null
        ? eq(worldOpenPeriods.worldId, worldId)
        : and(eq(worldOpenPeriods.worldId, worldId), ne(worldOpenPeriods.id, except)),
    )
  if (others.some((other) => overlaps(other, period))) throw new PeriodOverlap(worldId)
}

/**
 * 본문을 표의 칸으로 바꾼다. 거래권 key 를 줄 id 로 풀고, 거래권을 안 주면 그 칸은 그대로 둔다. 그림 표에 없는 엠블럼은
 * AssetNotFound, 거래권 표에 없는 key 는 NoTradeGroup 이다.
 */
async function columnsOf(db: DbOrTx, input: Omit<WorldInput, 'key'>) {
  if (input.emblemAssetId !== null) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, input.emblemAssetId))
    if (asset === undefined) throw new AssetNotFound(input.emblemAssetId)
  }
  const columns = {
    name: input.name,
    emblemAssetId: input.emblemAssetId,
    isChallengers: input.isChallengers,
    isEvent: input.isEvent,
  }
  if (input.tradeGroupKey === undefined) return columns
  if (input.tradeGroupKey === null) return { ...columns, tradeGroupId: null }
  const [group] = await db
    .select({ id: tradeGroups.id })
    .from(tradeGroups)
    .where(eq(tradeGroups.key, input.tradeGroupKey))
  if (group === undefined) throw new NoTradeGroup(input.tradeGroupKey)
  return { ...columns, tradeGroupId: group.id }
}
