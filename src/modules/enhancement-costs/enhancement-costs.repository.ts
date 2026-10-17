import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import {
  gameRules,
  potentialResetCosts,
  soulPotentialResetCosts,
  starforceSteps,
} from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

/** API 의 '잠재능력 재설정' · '에디셔널 잠재능력 재설정' 과 등급 글자는 앱 상수가 맞춘다. */
export const POTENTIAL_RESET_TYPES = ['potential', 'additional'] as const
export type PotentialResetType = (typeof POTENTIAL_RESET_TYPES)[number]
export const POTENTIAL_GRADES = ['rare', 'epic', 'unique', 'legendary'] as const
export type PotentialGrade = (typeof POTENTIAL_GRADES)[number]

/** game_rules 의 key 와 응답 필드 이름. 둘이 짝이다. 식(계수 × L², 1000 + L³ · (S+1)^e / d)은 앱 코드가 든다. */
export const ENHANCEMENT_RULE_KEYS = {
  cubeAppraisalFreeMaxLevel: 'cube_appraisal_free_max_level',
  cubeAppraisalCoefficient: 'cube_appraisal_coefficient',
  starforceDestroyDefenceSurchargePercent: 'starforce_destroy_defence_surcharge_percent',
} as const
export type EnhancementRuleField = keyof typeof ENHANCEMENT_RULE_KEYS

export interface PotentialResetCostView {
  type: PotentialResetType
  minLevel: number
  grade: PotentialGrade
  costMeso: number
}

export interface SoulPotentialResetCostView {
  grade: PotentialGrade
  costMeso: number
}

export interface StarforceStepView {
  fromStar: number
  exponent: number
  divisor: number
}

/** GET /v1/game-data 의 enhancementCosts 칸. 기간 줄이 없다. 앱이 수집할 때 이 값으로 합계를 매긴다. */
export interface EnhancementCostsSection {
  updatedAt: string | null
  rules: Record<EnhancementRuleField, number | null>
  potentialResetCosts: PotentialResetCostView[]
  soulPotentialResetCosts: SoulPotentialResetCostView[]
  starforceSteps: StarforceStepView[]
}

export type EnhancementRulesInput = Record<EnhancementRuleField, number>
export type PotentialBandCosts = Record<PotentialGrade, number>
export type StarforceStepInput = Omit<StarforceStepView, 'fromStar'>

/** 그 종류에 그 구간이 이미 있다. */
export class BandExists extends Error {}
/** min_level 1 구간은 못 지운다. 어느 레벨이든 한 줄에 걸려야 해서다. */
export class BaseBand extends Error {}

/**
 * 잠재 · 소울 · 스타포스 비용과 규칙 셋. 칸을 제자리에서 고친다. 고친 값은 앱이 다음에 수집하는 기록부터 쓰고 이미 저장한
 * 합계는 안 바뀐다. 구간은 등급 넷을 한 번에 더하고 구간째 지우며, 단계는 끝 성수만 더하고 지운다.
 */
@Injectable()
export class EnhancementCostsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<EnhancementCostsSection> {
    const [rules, potential, soul, steps, updatedAt] = await Promise.all([
      this.db
        .select()
        .from(gameRules)
        .where(inArray(gameRules.key, Object.values(ENHANCEMENT_RULE_KEYS))),
      this.db
        .select({
          type: potentialResetCosts.type,
          minLevel: potentialResetCosts.minLevel,
          grade: potentialResetCosts.grade,
          costMeso: potentialResetCosts.costMeso,
        })
        .from(potentialResetCosts)
        .orderBy(
          asc(potentialResetCosts.type),
          asc(potentialResetCosts.minLevel),
          asc(potentialResetCosts.grade),
        ),
      this.db
        .select({
          grade: soulPotentialResetCosts.grade,
          costMeso: soulPotentialResetCosts.costMeso,
        })
        .from(soulPotentialResetCosts)
        .orderBy(asc(soulPotentialResetCosts.grade)),
      this.db
        .select({
          fromStar: starforceSteps.fromStar,
          exponent: starforceSteps.exponent,
          divisor: starforceSteps.divisor,
        })
        .from(starforceSteps)
        .orderBy(asc(starforceSteps.fromStar)),
      sectionUpdatedAt(this.db, 'enhancementCosts'),
    ])
    const ruleOf = (field: EnhancementRuleField): number | null =>
      rules.find((r) => r.key === ENHANCEMENT_RULE_KEYS[field])?.value ?? null
    return {
      updatedAt,
      rules: {
        cubeAppraisalFreeMaxLevel: ruleOf('cubeAppraisalFreeMaxLevel'),
        cubeAppraisalCoefficient: ruleOf('cubeAppraisalCoefficient'),
        starforceDestroyDefenceSurchargePercent: ruleOf('starforceDestroyDefenceSurchargePercent'),
      },
      potentialResetCosts: potential,
      soulPotentialResetCosts: soul,
      starforceSteps: steps,
    }
  }

  /** 규칙 셋을 적는다. 셋 다 받아 셋 다 쓴다. 보스 · 지출 규칙과 같은 표이고 key 가 다르다. */
  async setRules(rules: EnhancementRulesInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const now = new Date()
      for (const field of Object.keys(ENHANCEMENT_RULE_KEYS) as EnhancementRuleField[]) {
        await tx
          .insert(gameRules)
          .values({ key: ENHANCEMENT_RULE_KEYS[field], value: rules[field], updatedAt: now })
          .onConflictDoUpdate({
            target: gameRules.key,
            set: { value: rules[field], updatedAt: now },
          })
      }
      await touchSection(tx, 'enhancementCosts')
    })
  }

  /** 칸 하나를 고친다. 없는 칸은 false 다. */
  async setPotentialResetCost(
    type: PotentialResetType,
    minLevel: number,
    grade: PotentialGrade,
    costMeso: number,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(potentialResetCosts)
        .set({ costMeso })
        .where(
          and(
            eq(potentialResetCosts.type, type),
            eq(potentialResetCosts.minLevel, minLevel),
            eq(potentialResetCosts.grade, grade),
          ),
        )
        .returning({ id: potentialResetCosts.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'enhancementCosts')
      return true
    })
  }

  /** 구간을 등급 넷과 함께 더한다. 같은 구간은 BandExists 다. */
  async addPotentialResetBand(
    type: PotentialResetType,
    minLevel: number,
    costs: PotentialBandCosts,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      try {
        await tx
          .insert(potentialResetCosts)
          .values(
            POTENTIAL_GRADES.map((grade) => ({ type, minLevel, grade, costMeso: costs[grade] })),
          )
      } catch (error) {
        if (isUniqueViolation(error)) throw new BandExists(`${type}/${minLevel}`)
        throw error
      }
      await touchSection(tx, 'enhancementCosts')
    })
  }

  /** 구간을 등급 넷과 함께 지운다. min_level 1 은 BaseBand 다. 없으면 false 다. */
  async removePotentialResetBand(type: PotentialResetType, minLevel: number): Promise<boolean> {
    if (minLevel === 1) throw new BaseBand(type)
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(potentialResetCosts)
        .where(and(eq(potentialResetCosts.type, type), eq(potentialResetCosts.minLevel, minLevel)))
        .returning({ id: potentialResetCosts.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'enhancementCosts')
      return true
    })
  }

  /** 등급의 비용을 적는다. 등급은 ENUM 과 일대일이라 없으면 만든다. */
  async setSoulPotentialResetCost(grade: PotentialGrade, costMeso: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(soulPotentialResetCosts)
        .values({ grade, costMeso })
        .onConflictDoUpdate({ target: soulPotentialResetCosts.grade, set: { costMeso } })
      await touchSection(tx, 'enhancementCosts')
    })
  }

  /** 단계의 지수 · 제수를 고친다. 없는 성수는 false 다. */
  async setStarforceStep(fromStar: number, input: StarforceStepInput): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(starforceSteps)
        .set({ exponent: input.exponent, divisor: input.divisor })
        .where(eq(starforceSteps.fromStar, fromStar))
        .returning({ id: starforceSteps.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'enhancementCosts')
      return true
    })
  }

  /** 끝 성수 다음 단계를 더한다. 비어 있으면 0 이다. 더한 성수를 돌려준다. */
  async addStarforceStep(input: StarforceStepInput): Promise<{ fromStar: number }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ fromStar: starforceSteps.fromStar })
        .from(starforceSteps)
        .orderBy(desc(starforceSteps.fromStar))
        .limit(1)
      const fromStar = (last?.fromStar ?? -1) + 1
      await tx.insert(starforceSteps).values({ fromStar, ...input })
      await touchSection(tx, 'enhancementCosts')
      return { fromStar }
    })
  }

  /** 끝 성수의 단계를 지운다. 비어 있으면 false 다. */
  async removeLastStarforceStep(): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ id: starforceSteps.id })
        .from(starforceSteps)
        .orderBy(desc(starforceSteps.fromStar))
        .limit(1)
      if (last === undefined) return false
      await tx.delete(starforceSteps).where(eq(starforceSteps.id, last.id))
      await touchSection(tx, 'enhancementCosts')
      return true
    })
  }
}
