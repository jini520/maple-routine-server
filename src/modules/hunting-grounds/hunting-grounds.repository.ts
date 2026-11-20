import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { assets, huntingGroundLevels, huntingGrounds, huntingRegions } from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

/** 앱 ForceType 그대로. 이름 · 아이콘은 앱이 든다. */
export const FORCE_TYPES = ['arcane', 'authentic'] as const
export type ForceType = (typeof FORCE_TYPES)[number]

export interface HuntingRegionView {
  id: string
  key: string
  name: string
  forceType: ForceType
  /** 지역 아이콘. 없으면 null 이다. */
  iconAssetId: string | null
}

export interface HuntingGroundView {
  id: string
  key: string
  regionId: string
  name: string
  requiredForce: number
  mobQuantity: number
  isPopular: boolean
}

export interface HuntingGroundLevelView {
  groundId: string
  mobLevel: number
}

/** GET /v1/game-data 의 huntingGrounds 칸. 셋 다 지역 · 사냥터의 sort_order 차례이고 레벨은 그 안에서 오름차순이다. */
export interface HuntingGroundsSection {
  updatedAt: string | null
  huntingRegions: HuntingRegionView[]
  huntingGrounds: HuntingGroundView[]
  huntingGroundLevels: HuntingGroundLevelView[]
}

export interface HuntingRegionInput {
  key: string
  name: string
  forceType: ForceType
  iconAssetId: string | null
}

/** 사냥터 하나. 지역은 key 로 가리키고, 몬스터 레벨 목록을 함께 받아 통째로 갈아 끼운다. 인기 여부는 목록 줄에서만 바뀐다. */
export interface HuntingGroundInput {
  key: string
  region: string
  name: string
  requiredForce: number
  mobQuantity: number
  mobLevels: number[]
}

/** 관리 화면의 줄. 다른 표의 줄은 key 로 가리킨다. 쓰기 경로가 key 로 받아서다. */
export interface HuntingGroundsAdminRows {
  updatedAt: string | null
  regions: Omit<HuntingRegionView, 'id'>[]
  grounds: (Omit<HuntingGroundView, 'id' | 'regionId'> & { region: string })[]
  groundLevels: { ground: string; mobLevel: number }[]
}

export class RegionExists extends Error {}
export class NoRegion extends Error {}
export class GroundExists extends Error {}
/** 같은 이름의 사냥터가 이미 있다. message 가 그 줄의 key 다. */
export class GroundNameTaken extends Error {}
/** 사냥터 key 가 지역 key 로 시작하지 않는다. message 가 기대한 접두다. */
export class GroundKeyPrefix extends Error {}

/** 지역 · 사냥터는 더하고 고치고 옮기기만 있다. 기록이 사냥터를 가리키고 사냥터가 지역을 가리켜 지우지 않는다. */
@Injectable()
export class HuntingGroundsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<HuntingGroundsSection> {
    const [regions, grounds, levels, updatedAt] = await this.rows()
    return {
      updatedAt,
      huntingRegions: regions,
      huntingGrounds: grounds.map((g) => ({
        id: g.id,
        key: g.key,
        regionId: g.regionId,
        name: g.name,
        requiredForce: g.requiredForce,
        mobQuantity: g.mobQuantity,
        isPopular: g.isPopular,
      })),
      huntingGroundLevels: levels.map((l) => ({ groundId: l.groundId, mobLevel: l.mobLevel })),
    }
  }

  /** 관리 화면이 부른다. section 과 같은 줄을 key 로 잇는다. */
  async adminRows(): Promise<HuntingGroundsAdminRows> {
    const [regions, grounds, levels, updatedAt] = await this.rows()
    return {
      updatedAt,
      regions: regions.map((r) => ({
        key: r.key,
        name: r.name,
        forceType: r.forceType,
        iconAssetId: r.iconAssetId,
      })),
      grounds: grounds.map((g) => ({
        key: g.key,
        region: g.region,
        name: g.name,
        requiredForce: g.requiredForce,
        mobQuantity: g.mobQuantity,
        isPopular: g.isPopular,
      })),
      groundLevels: levels.map((l) => ({ ground: l.ground, mobLevel: l.mobLevel })),
    }
  }

  /** 지역을 맨 뒤에 더한다. 같은 key 는 RegionExists, 그림 표에 없는 그림은 AssetNotFound 다. */
  async createRegion(input: HuntingRegionInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      await requireAsset(tx, input.iconAssetId)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${huntingRegions.sortOrder})` })
        .from(huntingRegions)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(huntingRegions)
          .values({
            key: input.key,
            name: input.name,
            forceType: input.forceType,
            iconAssetId: input.iconAssetId,
            sortOrder: (last?.max ?? -1) + 1,
          })
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

  /** 이름 · 힘 종류 · 아이콘을 갈아 끼운다. key 는 못 바꾼다. 모르면 false, 그림 표에 없는 그림은 AssetNotFound 다. */
  async updateRegion(key: string, input: Omit<HuntingRegionInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await requireAsset(tx, input.iconAssetId)
      const rows = await tx
        .update(huntingRegions)
        .set({
          name: input.name,
          forceType: input.forceType,
          iconAssetId: input.iconAssetId,
        })
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
            requiredForce: input.requiredForce,
            mobQuantity: input.mobQuantity,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: huntingGrounds.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new GroundExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await this.writeLevels(tx, row.id, input.mobLevels)
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
        .set({
          name: input.name,
          requiredForce: input.requiredForce,
          mobQuantity: input.mobQuantity,
        })
        .where(eq(huntingGrounds.id, row.id))
      await tx.delete(huntingGroundLevels).where(eq(huntingGroundLevels.groundId, row.id))
      await this.writeLevels(tx, row.id, input.mobLevels)
      await touchSection(tx, 'huntingGrounds')
      return true
    })
  }

  /** 사냥터의 인기 여부를 바꾼다. 모르면 false 다. */
  async setGroundPopular(key: string, isPopular: boolean): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(huntingGrounds)
        .set({ isPopular })
        .where(eq(huntingGrounds.key, key))
        .returning({ id: huntingGrounds.id })
      if (rows.length === 0) return false
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

  private rows() {
    return Promise.all([
      this.db
        .select({
          id: huntingRegions.id,
          key: huntingRegions.key,
          name: huntingRegions.name,
          forceType: huntingRegions.forceType,
          iconAssetId: huntingRegions.iconAssetId,
        })
        .from(huntingRegions)
        .orderBy(asc(huntingRegions.sortOrder), asc(huntingRegions.key)),
      this.db
        .select({
          id: huntingGrounds.id,
          key: huntingGrounds.key,
          regionId: huntingGrounds.regionId,
          region: huntingRegions.key,
          name: huntingGrounds.name,
          requiredForce: huntingGrounds.requiredForce,
          mobQuantity: huntingGrounds.mobQuantity,
          isPopular: huntingGrounds.isPopular,
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
        .select({
          groundId: huntingGroundLevels.groundId,
          ground: huntingGrounds.key,
          mobLevel: huntingGroundLevels.mobLevel,
        })
        .from(huntingGroundLevels)
        .innerJoin(huntingGrounds, eq(huntingGroundLevels.groundId, huntingGrounds.id))
        .innerJoin(huntingRegions, eq(huntingGrounds.regionId, huntingRegions.id))
        .orderBy(
          asc(huntingRegions.sortOrder),
          asc(huntingRegions.key),
          asc(huntingGrounds.sortOrder),
          asc(huntingGrounds.key),
          asc(huntingGroundLevels.mobLevel),
        ),
      sectionUpdatedAt(this.db, 'huntingGrounds'),
    ])
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
  private async writeLevels(db: DbOrTx, groundId: string, mobLevels: number[]): Promise<void> {
    await db
      .insert(huntingGroundLevels)
      .values(mobLevels.map((mobLevel) => ({ groundId, mobLevel })))
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

/** 그림 표에 없는 그림 id 는 AssetNotFound 다. 비어 있으면 보지 않는다. FK 오류로 두면 관리 화면에 500 이 난다. */
async function requireAsset(tx: DbOrTx, id: string | null): Promise<void> {
  if (id === null) return
  const [asset] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, id))
  if (asset === undefined) throw new AssetNotFound(id)
}
