import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import {
  hexaCoreKinds,
  hexaCoreLevelCosts,
  hexaCoreNameKinds,
  hexaJobCores,
  hexaStats,
} from '../../database/schema'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

export interface HexaCoreKindView {
  key: string
  name: string
  apiType: string
  isDefault: boolean
  maxLevel: number
  iconFile: string
}

export interface HexaCoreLevelCostView {
  kind: string
  level: number
  fragments: number
  solErda: number
}

export interface HexaCoreNameKindView {
  name: string
  kind: string
}

export interface HexaJobCoreView {
  job: string
  name: string
  apiType: string
  iconFile: string
}

export interface HexaStatView {
  key: string
  name: string
  activationFragments: number | null
}

/** GET /v1/game-data 의 hexaMatrix 칸. 참조는 전부 key 이고 비용은 종류 · 레벨마다 한 줄이다. */
export interface HexaMatrixSection {
  updatedAt: string | null
  kinds: HexaCoreKindView[]
  levelCosts: HexaCoreLevelCostView[]
  nameKinds: HexaCoreNameKindView[]
  jobCores: HexaJobCoreView[]
  stats: HexaStatView[]
}

/** 관리 화면의 줄. 이름 표와 직업별 코어는 이름이 key 가 아니라서 id 로 고르고 지운다. */
export interface HexaMatrixAdminRows extends Omit<HexaMatrixSection, 'nameKinds' | 'jobCores'> {
  nameKinds: (HexaCoreNameKindView & { id: string })[]
  jobCores: (HexaJobCoreView & { id: string })[]
}

export type HexaCoreKindUpdate = Omit<HexaCoreKindView, 'key'>
export type HexaCoreCostInput = Omit<HexaCoreLevelCostView, 'kind'>
export type HexaJobCoreUpdate = Omit<HexaJobCoreView, 'job'>
export type HexaStatUpdate = Omit<HexaStatView, 'key'>

export class HexaKindExists extends Error {}
export class NoHexaKind extends Error {}
/** 같은 API 타입에 기본 종류가 이미 있다. */
export class DefaultKindTaken extends Error {}
/** 만렙을 그 위에 비용 줄이 있는 값으로 내린다. */
export class LevelsAboveMax extends Error {}
/** 비용 줄이 레벨 0 부터 max_level - 1 까지 꼭 한 번씩이 아니다. 빈 레벨이 있으면 앱의 구간 합이 틀린다. */
export class CostLevelsMismatch extends Error {}
export class NameKindExists extends Error {}
export class JobCoreExists extends Error {}
export class HexaStatExists extends Error {}

/**
 * 비용 레벨이 0 부터 max_level - 1 까지 꼭 한 번씩인지 보는 검사. 어긋나면 이유 글자, 맞으면 null.
 * 관리 화면의 쓰기와 씨앗이 같은 규칙을 쓴다.
 */
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

/** 헥사 매트릭스 표 다섯. 지우기는 이름 표와 직업별 코어에만 있다. 종류와 스탯은 기록이 key 를 들어 안 지운다. */
@Injectable()
export class HexaMatrixRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<HexaMatrixSection> {
    const rows = await this.adminRows()
    return {
      ...rows,
      nameKinds: rows.nameKinds.map(({ name, kind }) => ({ name, kind })),
      jobCores: rows.jobCores.map(({ job, name, apiType, iconFile }) => ({
        job,
        name,
        apiType,
        iconFile,
      })),
    }
  }

  async adminRows(): Promise<HexaMatrixAdminRows> {
    const [kinds, levelCosts, nameKinds, jobCores, stats, updatedAt] = await Promise.all([
      this.db
        .select({
          key: hexaCoreKinds.key,
          name: hexaCoreKinds.name,
          apiType: hexaCoreKinds.apiType,
          isDefault: hexaCoreKinds.isDefault,
          maxLevel: hexaCoreKinds.maxLevel,
          iconFile: hexaCoreKinds.iconFile,
        })
        .from(hexaCoreKinds)
        .orderBy(asc(hexaCoreKinds.sortOrder), asc(hexaCoreKinds.key)),
      this.db
        .select({
          kind: hexaCoreKinds.key,
          level: hexaCoreLevelCosts.level,
          fragments: hexaCoreLevelCosts.fragments,
          solErda: hexaCoreLevelCosts.solErda,
        })
        .from(hexaCoreLevelCosts)
        .innerJoin(hexaCoreKinds, eq(hexaCoreLevelCosts.kindId, hexaCoreKinds.id))
        .orderBy(
          asc(hexaCoreKinds.sortOrder),
          asc(hexaCoreKinds.key),
          asc(hexaCoreLevelCosts.level),
        ),
      this.db
        .select({ id: hexaCoreNameKinds.id, name: hexaCoreNameKinds.name, kind: hexaCoreKinds.key })
        .from(hexaCoreNameKinds)
        .innerJoin(hexaCoreKinds, eq(hexaCoreNameKinds.kindId, hexaCoreKinds.id))
        .orderBy(asc(hexaCoreNameKinds.name)),
      this.db
        .select({
          id: hexaJobCores.id,
          job: hexaJobCores.job,
          name: hexaJobCores.name,
          apiType: hexaJobCores.apiType,
          iconFile: hexaJobCores.iconFile,
        })
        .from(hexaJobCores)
        .orderBy(asc(hexaJobCores.job), asc(hexaJobCores.sortOrder), asc(hexaJobCores.name)),
      this.db
        .select({
          key: hexaStats.key,
          name: hexaStats.name,
          activationFragments: hexaStats.activationFragments,
        })
        .from(hexaStats)
        .orderBy(asc(hexaStats.sortOrder), asc(hexaStats.key)),
      sectionUpdatedAt(this.db, 'hexaMatrix'),
    ])
    return { updatedAt, kinds, levelCosts, nameKinds, jobCores, stats }
  }

  /** 종류를 맨 뒤에 더한다. 비용은 replaceCosts 가 넣는다. 같은 key 는 HexaKindExists, 기본 종류가 겹치면 DefaultKindTaken 이다. */
  async createKind(input: HexaCoreKindView): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [same] = await tx
        .select({ id: hexaCoreKinds.id })
        .from(hexaCoreKinds)
        .where(eq(hexaCoreKinds.key, input.key))
      if (same !== undefined) throw new HexaKindExists(input.key)
      if (input.isDefault) await this.requireNoOtherDefault(tx, input.apiType, null)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${hexaCoreKinds.sortOrder})` })
        .from(hexaCoreKinds)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(hexaCoreKinds)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: hexaCoreKinds.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new HexaKindExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'hexaMatrix')
      return row
    })
  }

  /** key 를 빼고 갈아 끼운다. 모르면 false 다. 기본 종류가 겹치면 DefaultKindTaken, 만렙 위에 비용 줄이 있으면 LevelsAboveMax 다. */
  async updateKind(key: string, input: HexaCoreKindUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [kind] = await tx
        .select({ id: hexaCoreKinds.id })
        .from(hexaCoreKinds)
        .where(eq(hexaCoreKinds.key, key))
      if (kind === undefined) return false
      if (input.isDefault) await this.requireNoOtherDefault(tx, input.apiType, kind.id)
      const [top] = await tx
        .select({ max: sql<number | null>`max(${hexaCoreLevelCosts.level})` })
        .from(hexaCoreLevelCosts)
        .where(eq(hexaCoreLevelCosts.kindId, kind.id))
      if (top?.max != null && top.max >= input.maxLevel) throw new LevelsAboveMax(`${top.max}`)
      await tx
        .update(hexaCoreKinds)
        .set({
          name: input.name,
          apiType: input.apiType,
          isDefault: input.isDefault,
          maxLevel: input.maxLevel,
          iconFile: input.iconFile,
        })
        .where(eq(hexaCoreKinds.id, kind.id))
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 종류의 비용 줄 전부를 갈아 끼운다. 모르는 종류는 NoHexaKind, 레벨이 0 부터 만렙 - 1 까지 꼭 한 번씩이 아니면 CostLevelsMismatch 다. */
  async replaceCosts(key: string, costs: readonly HexaCoreCostInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [kind] = await tx
        .select({ id: hexaCoreKinds.id, maxLevel: hexaCoreKinds.maxLevel })
        .from(hexaCoreKinds)
        .where(eq(hexaCoreKinds.key, key))
      if (kind === undefined) throw new NoHexaKind(key)
      const problem = costLevelsProblem(
        kind.maxLevel,
        costs.map((c) => c.level),
      )
      if (problem !== null) throw new CostLevelsMismatch(problem)
      await tx.delete(hexaCoreLevelCosts).where(eq(hexaCoreLevelCosts.kindId, kind.id))
      await tx.insert(hexaCoreLevelCosts).values(
        costs.map((c) => ({
          kindId: kind.id,
          level: c.level,
          fragments: c.fragments,
          solErda: c.solErda,
        })),
      )
      await touchSection(tx, 'hexaMatrix')
    })
  }

  /** 이름 표에 한 줄 더한다. 이름은 앞뒤 공백을 걷는다. 모르는 종류는 NoHexaKind, 같은 이름은 NameKindExists 다. */
  async addNameKind(input: HexaCoreNameKindView): Promise<{ id: string }> {
    const name = input.name.trim()
    return this.db.transaction(async (tx) => {
      const [kind] = await tx
        .select({ id: hexaCoreKinds.id })
        .from(hexaCoreKinds)
        .where(eq(hexaCoreKinds.key, input.kind))
      if (kind === undefined) throw new NoHexaKind(input.kind)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(hexaCoreNameKinds)
          .values({ name, kindId: kind.id })
          .returning({ id: hexaCoreNameKinds.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new NameKindExists(name)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'hexaMatrix')
      return row
    })
  }

  /** 없으면 false 다. */
  async removeNameKind(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(hexaCoreNameKinds)
        .where(eq(hexaCoreNameKinds.id, id))
        .returning({ id: hexaCoreNameKinds.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 직업 안 맨 뒤에 더한다. 같은 직업에 같은 이름이 있으면 JobCoreExists 다. */
  async createJobCore(input: HexaJobCoreView): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${hexaJobCores.sortOrder})` })
        .from(hexaJobCores)
        .where(eq(hexaJobCores.job, input.job))
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(hexaJobCores)
          .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
          .returning({ id: hexaJobCores.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new JobCoreExists(`${input.job}/${input.name}`)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'hexaMatrix')
      return row
    })
  }

  /** 이름 · API 타입 · 그림을 갈아 끼운다. 직업은 못 바꾼다. 모르면 false, 같은 직업에 같은 이름이 있으면 JobCoreExists 다. */
  async updateJobCore(id: string, input: HexaJobCoreUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let rows: { id: string }[]
      try {
        rows = await tx
          .update(hexaJobCores)
          .set({ name: input.name, apiType: input.apiType, iconFile: input.iconFile })
          .where(eq(hexaJobCores.id, id))
          .returning({ id: hexaJobCores.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new JobCoreExists(input.name)
        throw error
      }
      if (rows.length === 0) return false
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 없으면 false 다. */
  async removeJobCore(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(hexaJobCores)
        .where(eq(hexaJobCores.id, id))
        .returning({ id: hexaJobCores.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 직업 안 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveJobCore(id: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [mine] = await tx
        .select({ job: hexaJobCores.job })
        .from(hexaJobCores)
        .where(eq(hexaJobCores.id, id))
      if (mine === undefined) return false
      const rows = await tx
        .select({ id: hexaJobCores.id, sortOrder: hexaJobCores.sortOrder })
        .from(hexaJobCores)
        .where(eq(hexaJobCores.job, mine.job))
        .orderBy(asc(hexaJobCores.sortOrder), asc(hexaJobCores.name))
      const at = rows.findIndex((r) => r.id === id)
      const me = rows[at]
      const other = rows[direction === 'up' ? at - 1 : at + 1]
      if (me === undefined || other === undefined) return true
      await tx
        .update(hexaJobCores)
        .set({ sortOrder: other.sortOrder })
        .where(eq(hexaJobCores.id, me.id))
      await tx
        .update(hexaJobCores)
        .set({ sortOrder: me.sortOrder })
        .where(eq(hexaJobCores.id, other.id))
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  /** 스탯을 맨 뒤에 더한다. 같은 key 는 HexaStatExists 다. */
  async createStat(input: HexaStatView): Promise<{ id: string }> {
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

  /** 이름 · 활성화 비용을 갈아 끼운다. 모르면 false 다. */
  async updateStat(key: string, input: HexaStatUpdate): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(hexaStats)
        .set({ name: input.name, activationFragments: input.activationFragments })
        .where(eq(hexaStats.key, key))
        .returning({ id: hexaStats.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'hexaMatrix')
      return true
    })
  }

  private async requireNoOtherDefault(
    tx: DbOrTx,
    apiType: string,
    selfId: string | null,
  ): Promise<void> {
    const [other] = await tx
      .select({ key: hexaCoreKinds.key })
      .from(hexaCoreKinds)
      .where(
        and(
          eq(hexaCoreKinds.apiType, apiType),
          eq(hexaCoreKinds.isDefault, true),
          selfId === null ? undefined : ne(hexaCoreKinds.id, selfId),
        ),
      )
    if (other !== undefined) throw new DefaultKindTaken(other.key)
  }
}
