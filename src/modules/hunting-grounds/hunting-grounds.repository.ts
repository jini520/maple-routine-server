import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { huntingGroundLevels, huntingGrounds, huntingRegions } from '../../database/schema'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

/** 앱 ForceType 그대로. 이름 · 아이콘은 앱이 든다. */
export const FORCE_TYPES = ['arcane', 'authentic'] as const
export type ForceType = (typeof FORCE_TYPES)[number]

export interface HuntingRegionView {
  key: string
  name: string
  forceType: ForceType
  /** 지역 아이콘 slug(maps/icons). 없으면 null 이다. */
  iconMap: string | null
}

export interface HuntingGroundView {
  key: string
  region: string
  name: string
  force: number
  mobs: number
}

export interface HuntingGroundLevelView {
  ground: string
  level: number
}

/** GET /v1/game-data 의 huntingGrounds 칸. 줄 표 그대로 납작하다. 셋 다 지역 · 사냥터의 sort_order 차례이고 레벨은 그 안에서 오름차순이다. */
export interface HuntingGroundsSection {
  updatedAt: string | null
  regions: HuntingRegionView[]
  grounds: HuntingGroundView[]
  groundLevels: HuntingGroundLevelView[]
}

export type HuntingRegionInput = HuntingRegionView
/** 사냥터 하나. 레벨 목록을 함께 받아 통째로 갈아 끼운다. */
export interface HuntingGroundInput extends HuntingGroundView {
  levels: number[]
}

export class RegionExists extends Error {}
export class NoRegion extends Error {}
export class GroundExists extends Error {}
/** 같은 이름의 사냥터가 이미 있다. message 가 그 줄의 key 다. */
export class GroundNameTaken extends Error {}
/** 사냥터 key 가 지역 key 로 시작하지 않는다. message 가 기대한 접두다. */
export class GroundKeyPrefix extends Error {}

/** 지역 · 사냥터는 더하고 고치고 옮기기만 있다. 기록이 사냥터 key 를 들고 사냥터가 지역을 들어 지우지 않는다. */
@Injectable()
export class HuntingGroundsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<HuntingGroundsSection> {
    const [regions, grounds, levels, updatedAt] = await Promise.all([
      this.db
        .select({
          key: huntingRegions.key,
          name: huntingRegions.name,
          forceType: huntingRegions.forceType,
          iconMap: huntingRegions.iconMap,
        })
        .from(huntingRegions)
        .orderBy(asc(huntingRegions.sortOrder), asc(huntingRegions.key)),
      this.db
        .select({
          key: huntingGrounds.key,
          region: huntingRegions.key,
          name: huntingGrounds.name,
          force: huntingGrounds.force,
          mobs: huntingGrounds.mobs,
        })
        .from(huntingGrounds)
        .innerJoin(huntingRegions, eq(huntingGrounds.regionId, huntingRegions.id))
        .orderBy(
          asc(huntingRegions.sortOrder),
          asc(huntingRegions.key),
          asc(huntingGrounds.sortOrder),
          asc(huntingGrounds.key),
        ),
      this.db
        .select({ ground: huntingGrounds.key, level: huntingGroundLevels.level })
        .from(huntingGroundLevels)
        .innerJoin(huntingGrounds, eq(huntingGroundLevels.groundId, huntingGrounds.id))
        .innerJoin(huntingRegions, eq(huntingGrounds.regionId, huntingRegions.id))
        .orderBy(
          asc(huntingRegions.sortOrder),
          asc(huntingRegions.key),
          asc(huntingGrounds.sortOrder),
          asc(huntingGrounds.key),
          asc(huntingGroundLevels.level),
        ),
      sectionUpdatedAt(this.db, 'huntingGrounds'),
    ])
    return { updatedAt, regions, grounds, groundLevels: levels }
  }

  /** 지역을 맨 뒤에 더한다. 같은 key 는 RegionExists 다. */
  async createRegion(input: HuntingRegionInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${huntingRegions.sortOrder})` })
        .from(huntingRegions)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(huntingRegions)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: huntingRegions.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new RegionExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'huntingGrounds')
      return row
    })
  }

  /** 이름 · 힘 종류 · 아이콘을 갈아 끼운다. key 는 사냥터가 들어 못 바꾼다. 모르면 false 다. */
  async updateRegion(key: string, input: Omit<HuntingRegionInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(huntingRegions)
        .set({ name: input.name, forceType: input.forceType, iconMap: input.iconMap })
        .where(eq(huntingRegions.key, key))
        .returning({ id: huntingRegions.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'huntingGrounds')
      return true
    })
  }

  /** 지역의 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveRegion(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: huntingRegions.id,
          key: huntingRegions.key,
          sortOrder: huntingRegions.sortOrder,
        })
        .from(huntingRegions)
        .orderBy(asc(huntingRegions.sortOrder), asc(huntingRegions.key))
      return this.swap(tx, huntingRegions, rows, key, direction)
    })
  }

  /**
   * 사냥터를 지역 맨 뒤에 더한다. 모르는 지역은 NoRegion, 지역 key 로 안 시작하는 key 는 GroundKeyPrefix, 같은 이름은
   * GroundNameTaken, 같은 key 는 GroundExists 다.
   */
  async createGround(input: HuntingGroundInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const regionId = await this.regionId(tx, input.region)
      if (regionId === null) throw new NoRegion(input.region)
      if (!input.key.startsWith(`${input.region}_`)) throw new GroundKeyPrefix(`${input.region}_`)
      await this.checkName(tx, input.name, null)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${huntingGrounds.sortOrder})` })
        .from(huntingGrounds)
        .where(eq(huntingGrounds.regionId, regionId))
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(huntingGrounds)
          .values({
            key: input.key,
            regionId,
            name: input.name,
            force: input.force,
            mobs: input.mobs,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: huntingGrounds.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new GroundExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await this.writeLevels(tx, row.id, input.levels)
      await touchSection(tx, 'huntingGrounds')
      return row
    })
  }

  /** 사냥터를 갈아 끼운다. key 와 지역은 못 바꾼다. 레벨 목록은 통째로 바뀐다. 모르면 false 다. */
  async updateGround(
    key: string,
    input: Omit<HuntingGroundInput, 'key' | 'region'>,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: huntingGrounds.id })
        .from(huntingGrounds)
        .where(eq(huntingGrounds.key, key))
      if (row === undefined) return false
      await this.checkName(tx, input.name, row.id)
      await tx
        .update(huntingGrounds)
        .set({ name: input.name, force: input.force, mobs: input.mobs })
        .where(eq(huntingGrounds.id, row.id))
      await tx.delete(huntingGroundLevels).where(eq(huntingGroundLevels.groundId, row.id))
      await this.writeLevels(tx, row.id, input.levels)
      await touchSection(tx, 'huntingGrounds')
      return true
    })
  }

  /** 사냥터의 차례를 지역 안에서 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveGround(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ regionId: huntingGrounds.regionId })
        .from(huntingGrounds)
        .where(eq(huntingGrounds.key, key))
      if (row === undefined) return false
      const rows = await tx
        .select({
          id: huntingGrounds.id,
          key: huntingGrounds.key,
          sortOrder: huntingGrounds.sortOrder,
        })
        .from(huntingGrounds)
        .where(eq(huntingGrounds.regionId, row.regionId))
        .orderBy(asc(huntingGrounds.sortOrder), asc(huntingGrounds.key))
      return this.swap(tx, huntingGrounds, rows, key, direction)
    })
  }

  private async regionId(db: DbOrTx, key: string): Promise<string | null> {
    const [row] = await db
      .select({ id: huntingRegions.id })
      .from(huntingRegions)
      .where(eq(huntingRegions.key, key))
    return row?.id ?? null
  }

  /** 이름은 UNIQUE 가 잡지만 어느 줄과 겹쳤는지를 말하려고 먼저 본다. */
  private async checkName(db: DbOrTx, name: string, selfId: string | null): Promise<void> {
    const [clash] = await db
      .select({ id: huntingGrounds.id, key: huntingGrounds.key })
      .from(huntingGrounds)
      .where(eq(huntingGrounds.name, name))
    if (clash !== undefined && clash.id !== selfId) throw new GroundNameTaken(clash.key)
  }

  /** 레벨은 하나 이상이고 겹치지 않는다. 겹침은 UNIQUE 가 잡고 빈 목록은 DTO 가 막는다. */
  private async writeLevels(db: DbOrTx, groundId: string, levels: number[]): Promise<void> {
    await db.insert(huntingGroundLevels).values(levels.map((level) => ({ groundId, level })))
  }

  private async swap(
    tx: DbOrTx,
    table: typeof huntingRegions | typeof huntingGrounds,
    rows: { id: string; key: string; sortOrder: number }[],
    key: string,
    direction: 'up' | 'down',
  ): Promise<boolean> {
    const at = rows.findIndex((r) => r.key === key)
    if (at === -1) return false
    const mine = rows[at]
    const other = rows[direction === 'up' ? at - 1 : at + 1]
    if (mine === undefined || other === undefined) return true
    await tx.update(table).set({ sortOrder: other.sortOrder }).where(eq(table.id, mine.id))
    await tx.update(table).set({ sortOrder: mine.sortOrder }).where(eq(table.id, other.id))
    await touchSection(tx, 'huntingGrounds')
    return true
  }
}
