import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { assets, worldPeriods, worlds } from '../../database/schema'
import { optionalRefValueOf, resolveOptionalAssetId } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface WorldView {
  key: string
  name: string
  emblem: string | null
  challengers: boolean
  event: boolean
}

/** 월드가 열린 기간 한 줄. from 은 연 날, until 은 닫힌 다음 날인 KST 글자다. */
export interface WorldPeriod {
  from: string
  until: string
}

/** 관리 화면이 고치고 지울 때 가리키는 기간 줄. */
export interface WorldPeriodRow extends WorldPeriod {
  id: string
}

/** GET /v1/game-data 의 worlds 칸. 차례가 곧 앱의 월드 차례다. */
export interface WorldsSection {
  updatedAt: string | null
  /** emblem 은 옛 앱이 읽는 그림 이름이다. periods 는 from 차례이고 없으면 빈 배열이다 */
  worlds: (WorldView & { emblemAssetId: string | null; periods: WorldPeriod[] })[]
}

/** 관리 화면이 보는 월드. 거래권은 앱에 안 싣고 여기에만 있다. NULL 이면 시세에서 빠진다. */
export interface WorldAdminView extends WorldView {
  emblemAssetId: string | null
  priceGroup: string | null
  periods: WorldPeriodRow[]
}

/** 거래권을 안 주면 새 월드는 general 이고, 고칠 때는 그대로 둔다. */
export type WorldInput = WorldView & { priceGroup?: string | null }

export class WorldExists extends Error {}
/** 기간을 붙일 월드가 표에 없다. */
export class NoWorld extends Error {}
/** until 이 from 보다 뒤가 아니다. */
export class PeriodNotAfter extends Error {}
/** 같은 월드의 다른 기간과 겹친다. */
export class PeriodOverlap extends Error {}

/** 두 기간이 하루라도 함께 드는지. until 은 그 날을 빼므로 앞 until 과 뒤 from 이 같으면 안 겹친다. */
function overlaps(a: WorldPeriod, b: WorldPeriod): boolean {
  return a.from < b.until && b.from < a.until
}

/** 월드는 더하고 고치고 옮기기만 있다. 기록이 key 를 들어 지우지 않는다. */
@Injectable()
export class WorldsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<WorldsSection> {
    const rows = await this.rows()
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'worlds'),
      worlds: rows.map((r) => ({
        key: r.key,
        name: r.name,
        emblem: r.emblem,
        emblemAssetId: r.emblemAssetId,
        challengers: r.challengers,
        event: r.event,
        periods: r.periods.map(({ from, until }) => ({ from, until })),
      })),
    }
  }

  /** 관리 화면의 표. section 에 거래권을 더한 것이다. */
  async adminSection(): Promise<{ updatedAt: string | null; worlds: WorldAdminView[] }> {
    return { updatedAt: await sectionUpdatedAt(this.db, 'worlds'), worlds: await this.rows() }
  }

  private async rows(): Promise<WorldAdminView[]> {
    const periodRows = await this.db
      .select({
        id: worldPeriods.id,
        worldId: worldPeriods.worldId,
        from: worldPeriods.from,
        until: worldPeriods.until,
      })
      .from(worldPeriods)
      .orderBy(asc(worldPeriods.from))
    const periodsOf = new Map<string, WorldPeriodRow[]>()
    for (const { worldId, ...period } of periodRows) {
      periodsOf.set(worldId, [...(periodsOf.get(worldId) ?? []), period])
    }
    const rows = await this.db
      .select({
        id: worlds.id,
        key: worlds.key,
        name: worlds.name,
        emblemPath: assets.path,
        emblemAssetId: worlds.emblemAssetId,
        challengers: worlds.challengers,
        event: worlds.event,
        priceGroup: worlds.priceGroup,
      })
      .from(worlds)
      .leftJoin(assets, eq(assets.id, worlds.emblemAssetId))
      .orderBy(asc(worlds.sortOrder), asc(worlds.key))
    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      emblem: optionalRefValueOf('worldEmblem', r.emblemPath),
      emblemAssetId: r.emblemAssetId,
      challengers: r.challengers,
      event: r.event,
      priceGroup: r.priceGroup,
      periods: periodsOf.get(r.id) ?? [],
    }))
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
          .values({ ...(await columnsOf(tx, input)), sortOrder: (last?.max ?? -1) + 1 })
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
  async addPeriod(key: string, period: WorldPeriod): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [world] = await tx
        .select({ id: worlds.id })
        .from(worlds)
        .where(eq(worlds.key, key))
        .for('update')
      if (world === undefined) throw new NoWorld(key)
      await assertFits(tx, world.id, period, null)
      const [row] = await tx
        .insert(worldPeriods)
        .values({ worldId: world.id, ...period })
        .returning({ id: worldPeriods.id })
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'worlds')
      return row
    })
  }

  /** 기간 한 줄을 갈아 끼운다. 모르면 false 이고, 거절은 addPeriod 와 같다. */
  async updatePeriod(id: string, period: WorldPeriod): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ worldId: worldPeriods.worldId })
        .from(worldPeriods)
        .where(eq(worldPeriods.id, id))
      if (current === undefined) return false
      await tx
        .select({ id: worlds.id })
        .from(worlds)
        .where(eq(worlds.id, current.worldId))
        .for('update')
      await assertFits(tx, current.worldId, period, id)
      await tx
        .update(worldPeriods)
        .set({ ...period, updatedAt: new Date() })
        .where(eq(worldPeriods.id, id))
      await touchSection(tx, 'worlds')
      return true
    })
  }

  /** 기간 한 줄을 지운다. 모르면 false 다. */
  async removePeriod(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(worldPeriods)
        .where(eq(worldPeriods.id, id))
        .returning({ id: worldPeriods.id })
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
  period: WorldPeriod,
  except: string | null,
): Promise<void> {
  if (period.until <= period.from) throw new PeriodNotAfter(period.from)
  const others = await db
    .select({ from: worldPeriods.from, until: worldPeriods.until })
    .from(worldPeriods)
    .where(
      except === null
        ? eq(worldPeriods.worldId, worldId)
        : and(eq(worldPeriods.worldId, worldId), ne(worldPeriods.id, except)),
    )
  if (others.some((other) => overlaps(other, period))) throw new PeriodOverlap(worldId)
}

/** 입력의 엠블럼 이름을 그림 id 로 푼 표의 칸. 그림이 표에 없으면 AssetNotFound 다. */
async function columnsOf<T extends { emblem: string | null }>(db: DbOrTx, input: T) {
  const { emblem, ...rest } = input
  return { ...rest, emblemAssetId: await resolveOptionalAssetId(db, 'worldEmblem', emblem) }
}
