import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import {
  assets,
  hexaCoreLevelCosts,
  hexaCores,
  hexaCoreTypes,
  hexaStats,
  jobs,
} from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface JobView {
  id: string
  name: string
  isAllJobs: boolean
}

export interface HexaCoreTypeView {
  id: string
  key: string
  name: string
  apiType: string
  isDefault: boolean
  maxLevel: number
  iconAssetId: string
  sortOrder: number
}

export interface HexaCoreView {
  id: string
  jobId: string
  name: string
  typeId: string
  iconAssetId: string
  sortOrder: number
}

export interface HexaCoreLevelCostView {
  typeId: string
  fromLevel: number
  fragmentQuantity: number
  solErdaQuantity: number
}

export interface HexaStatView {
  id: string
  key: string
  name: string
  activationFragmentQuantity: number | null
}

/**
 * GET /v1/game-data 의 hexaMatrix 칸. 배열 이름은 표 이름이고 다른 표의 줄은 줄 id 로 가리킨다. 관리 화면도 같은 것을 읽는다.
 * 한 직업의 코어 목록은 그 직업과 전직업의 코어를 섞어 종류 차례 · 코어 차례로 늘어놓아 만든다.
 */
export interface HexaMatrixSection {
  updatedAt: string | null
  jobs: JobView[]
  hexaCoreTypes: HexaCoreTypeView[]
  hexaCores: HexaCoreView[]
  hexaCoreLevelCosts: HexaCoreLevelCostView[]
  hexaStats: HexaStatView[]
}

export type HexaCoreTypeInput = Omit<HexaCoreTypeView, 'id' | 'sortOrder'>
export type HexaCoreTypeUpdate = Omit<HexaCoreTypeInput, 'key'>
export type HexaCoreCostInput = Omit<HexaCoreLevelCostView, 'typeId'>
export interface JobInput {
  name: string
}
/** 종류는 key 로 받는다. 관리 화면이 종류를 key 로 다룬다. */
export interface HexaCoreInput {
  jobId: string
  name: string
  typeKey: string
  iconAssetId: string
}
export type HexaCoreUpdate = Omit<HexaCoreInput, 'jobId'>
export type HexaStatInput = Omit<HexaStatView, 'id'>
export type HexaStatUpdate = Omit<HexaStatInput, 'key'>

export class HexaTypeExists extends Error {}
export class NoHexaType extends Error {}
/** 같은 넥슨 타입에 기본 종류가 이미 있다. */
export class DefaultTypeTaken extends Error {}
/** 만렙을 그 위에 비용 줄이 있는 값으로 내린다. */
export class LevelsAboveMax extends Error {}
/** 비용 줄이 레벨 0 부터 max_level - 1 까지 꼭 한 번씩이 아니다. 빈 레벨이 있으면 앱의 구간 합이 틀린다. */
export class CostLevelsMismatch extends Error {}
export class JobExists extends Error {}
export class NoJob extends Error {}
export class HexaCoreExists extends Error {}
export class HexaStatExists extends Error {}

/** 비용 레벨이 0 부터 max_level - 1 까지 꼭 한 번씩인지 보는 검사. 어긋나면 이유 글자, 맞으면 null. */
export function costLevelsProblem(maxLevel: number, levels: readonly number[]): string | null {
  const seen = new Set<number>()
  for (const level of levels) {
    if (!Number.isInteger(level) || level < 0 || level >= maxLevel)
      return `레벨이 범위 밖이다: ${level}`
    if (seen.has(level)) return `레벨이 겹친다: ${level}`
    seen.add(level)
  }
  for (let level = 0; level < maxLevel; level += 1) {
    if (!seen.has(level)) return `레벨 ${level} 의 비용이 없다`
  }
  return null
}

/** 헥사 매트릭스 표 다섯. 지우기는 코어에만 있다. 종류 · 스탯은 기록이 가리켜 안 지우고, 직업은 코어가 가리킨다. */
@Injectable()
export class HexaMatrixRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<HexaMatrixSection> {
    const [jobRows, types, cores, costs, stats, updatedAt] = await Promise.all([
      this.db
        .select({ id: jobs.id, name: jobs.name, isAllJobs: jobs.isAllJobs })
        .from(jobs)
        .orderBy(asc(jobs.name)),
      this.db
        .select({
          id: hexaCoreTypes.id,
          key: hexaCoreTypes.key,
          name: hexaCoreTypes.name,
          apiType: hexaCoreTypes.apiType,
          isDefault: hexaCoreTypes.isDefault,
          maxLevel: hexaCoreTypes.maxLevel,
          iconAssetId: hexaCoreTypes.iconAssetId,
          sortOrder: hexaCoreTypes.sortOrder,
        })
        .from(hexaCoreTypes)
        .orderBy(asc(hexaCoreTypes.sortOrder), asc(hexaCoreTypes.key)),
      this.db
        .select({
          id: hexaCores.id,
          jobId: hexaCores.jobId,
          name: hexaCores.name,
          typeId: hexaCores.typeId,
          iconAssetId: hexaCores.iconAssetId,
          sortOrder: hexaCores.sortOrder,
        })
        .from(hexaCores)
        .innerJoin(jobs, eq(jobs.id, hexaCores.jobId))
        .innerJoin(hexaCoreTypes, eq(hexaCoreTypes.id, hexaCores.typeId))
        .orderBy(
          asc(jobs.name),
          asc(hexaCoreTypes.sortOrder),
          asc(hexaCores.sortOrder),
          asc(hexaCores.name),
        ),
      this.db
        .select({
          typeId: hexaCoreLevelCosts.typeId,
          fromLevel: hexaCoreLevelCosts.fromLevel,
          fragmentQuantity: hexaCoreLevelCosts.fragmentQuantity,
          solErdaQuantity: hexaCoreLevelCosts.solErdaQuantity,
        })
        .from(hexaCoreLevelCosts)
        .innerJoin(hexaCoreTypes, eq(hexaCoreTypes.id, hexaCoreLevelCosts.typeId))
        .orderBy(
          asc(hexaCoreTypes.sortOrder),
          asc(hexaCoreTypes.key),
          asc(hexaCoreLevelCosts.fromLevel),
        ),
      this.db
        .select({
          id: hexaStats.id,
          key: hexaStats.key,
          name: hexaStats.name,
          activationFragmentQuantity: hexaStats.activationFragmentQuantity,
        })
        .from(hexaStats)
        .orderBy(asc(hexaStats.sortOrder), asc(hexaStats.key)),
      sectionUpdatedAt(this.db, 'hexaMatrix'),
    ])
    return {
      updatedAt,
      jobs: jobRows,
      hexaCoreTypes: types,
      hexaCores: cores,
      hexaCoreLevelCosts: costs,
      hexaStats: stats,
    }
  }

  /** 종류를 맨 뒤에 더한다. 비용은 replaceCosts 가 넣는다. 같은 key 는 HexaTypeExists, 기본 종류가 겹치면 DefaultTypeTaken 이다. */
  async createType(input: HexaCoreTypeInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [same] = await tx
        .select({ id: hexaCoreTypes.id })
        .from(hexaCoreTypes)
        .where(eq(hexaCoreTypes.key, input.key))
      if (same !== undefined) throw new HexaTypeExists(input.key)
      if (input.isDefault) await this.requireNoOtherDefault(tx, input.apiType, null)
      await requireAsset(tx, input.iconAssetId)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${hexaCoreTypes.sortOrder})` })
        .from(hexaCoreTypes)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(hexaCoreTypes)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: hexaCoreTypes.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new HexaTypeExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'hexaMatrix')
      return row
    })
  }

  /** key 를 빼고 갈아 끼운다. 모르면 false 다. 기본 종류가 겹치면 DefaultTypeTaken, 만렙 위에 비용 줄이 있으면 LevelsAboveMax 다. */
  async updateType(key: string, input: HexaCoreTypeUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [type] = await tx
        .select({ id: hexaCoreTypes.id })
        .from(hexaCoreTypes)
        .where(eq(hexaCoreTypes.key, key))
      if (type === undefined) return false
      if (input.isDefault) await this.requireNoOtherDefault(tx, input.apiType, type.id)
      const [top] = await tx
        .select({ max: sql<number | null>`max(${hexaCoreLevelCosts.fromLevel})` })
        .from(hexaCoreLevelCosts)
        .where(eq(hexaCoreLevelCosts.typeId, type.id))
      if (top?.max != null && top.max >= input.maxLevel) throw new LevelsAboveMax(`${top.max}`)
      await requireAsset(tx, input.iconAssetId)
      await tx
        .update(hexaCoreTypes)
        .set({
          name: input.name,
          apiType: input.apiType,
          isDefault: input.isDefault,
          maxLevel: input.maxLevel,
          iconAssetId: input.iconAssetId,
        })
        .where(eq(hexaCoreTypes.id, type.id))
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 종류의 비용 줄 전부를 갈아 끼운다. 모르는 종류는 NoHexaType, 레벨이 0 부터 만렙 - 1 까지 꼭 한 번씩이 아니면 CostLevelsMismatch 다. */
  async replaceCosts(key: string, costs: readonly HexaCoreCostInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [type] = await tx
        .select({ id: hexaCoreTypes.id, maxLevel: hexaCoreTypes.maxLevel })
        .from(hexaCoreTypes)
        .where(eq(hexaCoreTypes.key, key))
      if (type === undefined) throw new NoHexaType(key)
      const problem = costLevelsProblem(
        type.maxLevel,
        costs.map((c) => c.fromLevel),
      )
      if (problem !== null) throw new CostLevelsMismatch(problem)
      await tx.delete(hexaCoreLevelCosts).where(eq(hexaCoreLevelCosts.typeId, type.id))
      await tx.insert(hexaCoreLevelCosts).values(costs.map((c) => ({ typeId: type.id, ...c })))
      await touchSection(tx, 'hexaMatrix')
    })
  }

  /** 새 직업. 전직업 줄은 옮기기가 만들고 여기서는 안 만든다. 같은 이름은 JobExists 다. */
  async createJob(input: JobInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      let row: { id: string } | undefined
      try {
        ;[row] = await tx.insert(jobs).values({ name: input.name }).returning({ id: jobs.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new JobExists(input.name)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'hexaMatrix')
      return row
    })
  }

  /** 이름만 고친다. 모르면 false, 같은 이름이 있으면 JobExists 다. */
  async updateJob(id: string, input: JobInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let rows: { id: string }[]
      try {
        rows = await tx
          .update(jobs)
          .set({ name: input.name })
          .where(eq(jobs.id, id))
          .returning({ id: jobs.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new JobExists(input.name)
        throw error
      }
      if (rows.length === 0) return false
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 그 직업 · 종류 안 맨 뒤에 더한다. 모르는 직업은 NoJob, 모르는 종류는 NoHexaType, 같은 직업에 같은 이름이 있으면 HexaCoreExists 다. */
  async createCore(input: HexaCoreInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [job] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, input.jobId))
      if (job === undefined) throw new NoJob(input.jobId)
      const typeId = await this.typeIdOf(tx, input.typeKey)
      await requireAsset(tx, input.iconAssetId)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(hexaCores)
          .values({
            jobId: job.id,
            name: input.name,
            typeId,
            iconAssetId: input.iconAssetId,
            sortOrder: await this.nextOrder(tx, job.id, typeId),
          })
          .returning({ id: hexaCores.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new HexaCoreExists(input.name)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'hexaMatrix')
      return row
    })
  }

  /** 이름 · 종류 · 그림을 갈아 끼운다. 직업은 못 바꾼다. 종류를 바꾸면 새 종류의 맨 뒤로 간다. 모르면 false 다. */
  async updateCore(id: string, input: HexaCoreUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [mine] = await tx
        .select({ jobId: hexaCores.jobId, typeId: hexaCores.typeId })
        .from(hexaCores)
        .where(eq(hexaCores.id, id))
      if (mine === undefined) return false
      const typeId = await this.typeIdOf(tx, input.typeKey)
      await requireAsset(tx, input.iconAssetId)
      try {
        await tx
          .update(hexaCores)
          .set({
            name: input.name,
            typeId,
            iconAssetId: input.iconAssetId,
            ...(typeId === mine.typeId
              ? {}
              : { sortOrder: await this.nextOrder(tx, mine.jobId, typeId) }),
          })
          .where(eq(hexaCores.id, id))
      } catch (error) {
        if (isUniqueViolation(error)) throw new HexaCoreExists(input.name)
        throw error
      }
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 없으면 false 다. */
  async removeCore(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(hexaCores)
        .where(eq(hexaCores.id, id))
        .returning({ id: hexaCores.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 같은 직업 · 같은 종류 안에서 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveCore(id: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [mine] = await tx
        .select({ jobId: hexaCores.jobId, typeId: hexaCores.typeId })
        .from(hexaCores)
        .where(eq(hexaCores.id, id))
      if (mine === undefined) return false
      const rows = await tx
        .select({ id: hexaCores.id, sortOrder: hexaCores.sortOrder })
        .from(hexaCores)
        .where(and(eq(hexaCores.jobId, mine.jobId), eq(hexaCores.typeId, mine.typeId)))
        .orderBy(asc(hexaCores.sortOrder), asc(hexaCores.name))
      const at = rows.findIndex((r) => r.id === id)
      const me = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (me === undefined || other === undefined) return true
      await tx.update(hexaCores).set({ sortOrder: other.sortOrder }).where(eq(hexaCores.id, me.id))
      await tx.update(hexaCores).set({ sortOrder: me.sortOrder }).where(eq(hexaCores.id, other.id))
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 스탯을 맨 뒤에 더한다. 같은 key 는 HexaStatExists 다. */
  async createStat(input: HexaStatInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${hexaStats.sortOrder})` })
        .from(hexaStats)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(hexaStats)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: hexaStats.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new HexaStatExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'hexaMatrix')
      return row
    })
  }

  /** 이름 · 활성화 조각을 갈아 끼운다. 모르면 false 다. */
  async updateStat(key: string, input: HexaStatUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(hexaStats)
        .set({ name: input.name, activationFragmentQuantity: input.activationFragmentQuantity })
        .where(eq(hexaStats.key, key))
        .returning({ id: hexaStats.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  private async typeIdOf(tx: DbOrTx, key: string): Promise<string> {
    const [type] = await tx
      .select({ id: hexaCoreTypes.id })
      .from(hexaCoreTypes)
      .where(eq(hexaCoreTypes.key, key))
    if (type === undefined) throw new NoHexaType(key)
    return type.id
  }

  private async nextOrder(tx: DbOrTx, jobId: string, typeId: string): Promise<number> {
    const [last] = await tx
      .select({ max: sql<number | null>`max(${hexaCores.sortOrder})` })
      .from(hexaCores)
      .where(and(eq(hexaCores.jobId, jobId), eq(hexaCores.typeId, typeId)))
    return (last?.max ?? -1) + 1
  }

  private async requireNoOtherDefault(
    tx: DbOrTx,
    apiType: string,
    selfId: string | null,
  ): Promise<void> {
    const [other] = await tx
      .select({ key: hexaCoreTypes.key })
      .from(hexaCoreTypes)
      .where(
        and(
          eq(hexaCoreTypes.apiType, apiType),
          eq(hexaCoreTypes.isDefault, true),
          selfId === null ? undefined : ne(hexaCoreTypes.id, selfId),
        ),
      )
    if (other !== undefined) throw new DefaultTypeTaken(other.key)
  }
}

/** 그림 표에 없는 그림 id 는 AssetNotFound 다. FK 오류로 두면 관리 화면에 500 이 난다. */
async function requireAsset(tx: DbOrTx, id: string): Promise<void> {
  const [asset] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, id))
  if (asset === undefined) throw new AssetNotFound(id)
}
