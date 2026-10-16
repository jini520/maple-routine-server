import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { bossDifficulties, bosses, gameRules } from '../../database/schema'
import {
  BOSS_DIFFICULTIES,
  type BossInput,
  type DifficultyInput,
  RULE_KEYS,
  type RuleField,
  type RulesInput,
} from './bosses.dto'

export interface BossView {
  key: string
  name: string
  alias: string
  cycle: 'weekly' | 'event_weekly' | 'monthly'
  portraitSlug: string
  difficulties: {
    difficulty: 'easy' | 'normal' | 'hard' | 'chaos' | 'extreme'
    requiredLevel: number
    /** 결정석을 나누는 파티 인원 상한. null 이면 rules.defaultMaxPartySize 다. */
    maxPartySize: number | null
  }[]
}

/** GET /v1/bosses 의 몸체. 한 번도 안 넣었으면 updatedAt 과 규칙이 null 이고 목록이 빈다. */
export interface Catalog {
  updatedAt: string | null
  rules: Record<RuleField, number | null>
  bosses: BossView[]
}

/** 같은 key 의 보스가 이미 있다. */
export class BossExists extends Error {}

/** 마지막 난이도는 못 지운다. 난이도 없는 보스가 생기면 앱이 표 전체를 거절한다. */
export class LastDifficulty extends Error {}

@Injectable()
export class BossesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 규칙 둘을 적는다. 둘 다 받아 둘 다 쓴다. */
  async setRules(rules: RulesInput): Promise<void> {
    const now = new Date()
    for (const field of Object.keys(RULE_KEYS) as RuleField[]) {
      await this.db
        .insert(gameRules)
        .values({ key: RULE_KEYS[field], value: rules[field], updatedAt: now })
        .onConflictDoUpdate({ target: gameRules.key, set: { value: rules[field], updatedAt: now } })
    }
  }

  /** 새 보스를 맨 뒤에 더한다. 난이도 줄도 함께 넣는다. 같은 key 가 있으면 BossExists 다. */
  async createBoss(input: BossInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${bosses.sortOrder})` })
        .from(bosses)
      const sortOrder = (last?.max ?? -1) + 1
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(bosses)
          .values({
            key: input.key,
            name: input.name,
            alias: input.alias,
            cycle: input.cycle,
            portraitSlug: input.portraitSlug,
            sortOrder,
            updatedAt: new Date(),
          })
          .returning({ id: bosses.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new BossExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await tx.insert(bossDifficulties).values(
        input.difficulties.map((d) => ({
          bossId: row.id,
          difficulty: d.difficulty,
          requiredLevel: d.requiredLevel,
          maxPartySize: d.maxPartySize ?? null,
        })),
      )
      return row
    })
  }

  /** 난이도 줄을 더하거나 요구 레벨을 갈아 끼운다. 보스의 updated_at 이 움직여 앱이 표를 다시 받는다. 모르는 보스면 false 다. */
  async upsertDifficulty(key: string, input: DifficultyInput): Promise<boolean> {
    const boss = await this.findByKey(key)
    if (boss === null) return false
    await this.db.transaction(async (tx) => {
      await tx
        .insert(bossDifficulties)
        .values({
          bossId: boss.id,
          difficulty: input.difficulty,
          requiredLevel: input.requiredLevel,
          maxPartySize: input.maxPartySize ?? null,
        })
        .onConflictDoUpdate({
          target: [bossDifficulties.bossId, bossDifficulties.difficulty],
          set: { requiredLevel: input.requiredLevel },
        })
      await tx.update(bosses).set({ updatedAt: new Date() }).where(eq(bosses.id, boss.id))
    })
    return true
  }

  /** 난이도 줄을 지운다. 없으면 false, 마지막 줄이면 LastDifficulty 다. */
  async deleteDifficulty(key: string, difficulty: DifficultyInput['difficulty']): Promise<boolean> {
    const boss = await this.findByKey(key)
    if (boss === null) return false
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ difficulty: bossDifficulties.difficulty })
        .from(bossDifficulties)
        .where(eq(bossDifficulties.bossId, boss.id))
      if (!rows.some((r) => r.difficulty === difficulty)) return false
      if (rows.length === 1) throw new LastDifficulty(key)
      await tx
        .delete(bossDifficulties)
        .where(
          and(eq(bossDifficulties.bossId, boss.id), eq(bossDifficulties.difficulty, difficulty)),
        )
      await tx.update(bosses).set({ updatedAt: new Date() }).where(eq(bosses.id, boss.id))
      return true
    })
  }

  async catalog(): Promise<Catalog> {
    const rows = await this.db.select().from(bosses).orderBy(asc(bosses.sortOrder), asc(bosses.key))
    const ids = rows.map((r) => r.id)
    const difficultyRows =
      ids.length === 0
        ? []
        : await this.db
            .select()
            .from(bossDifficulties)
            .where(inArray(bossDifficulties.bossId, ids))
            .orderBy(asc(bossDifficulties.difficulty))
    const rules = await this.db.select().from(gameRules)

    const ruleOf = (field: RuleField): number | null =>
      rules.find((r) => r.key === RULE_KEYS[field])?.value ?? null
    const stamps = [...rows.map((r) => r.updatedAt), ...rules.map((r) => r.updatedAt)]
    const latest =
      stamps.length === 0 ? null : new Date(Math.max(...stamps.map((d) => d.getTime())))

    return {
      updatedAt: latest?.toISOString() ?? null,
      rules: {
        weeklyBossSelectionLimit: ruleOf('weeklyBossSelectionLimit'),
        weeklyCrystalSaleLimit: ruleOf('weeklyCrystalSaleLimit'),
        defaultMaxPartySize: ruleOf('defaultMaxPartySize'),
      },
      bosses: rows.map((r) => ({
        key: r.key,
        name: r.name,
        alias: r.alias,
        cycle: r.cycle,
        portraitSlug: r.portraitSlug,
        difficulties: difficultyRows
          .filter((d) => d.bossId === r.id)
          .map((d) => ({
            difficulty: d.difficulty,
            requiredLevel: d.requiredLevel,
            maxPartySize: d.maxPartySize,
          })),
      })),
    }
  }

  /**
   * 난이도 줄의 파티 인원 상한을 적는다. null 이면 기본값으로 돌아간다. 보스의 updated_at 이 움직여 앱이 표를
   * 다시 받는다. 모르는 조합이면 false 다.
   */
  async setMaxPartySize(
    key: string,
    difficulty: DifficultyInput['difficulty'],
    maxPartySize: number | null,
  ): Promise<boolean> {
    const row = await this.findDifficulty(key, difficulty)
    if (row === null) return false
    await this.db.transaction(async (tx) => {
      await tx.update(bossDifficulties).set({ maxPartySize }).where(eq(bossDifficulties.id, row.id))
      await tx
        .update(bosses)
        .set({ updatedAt: new Date() })
        .where(eq(bosses.id, sql`(select boss_id from boss_difficulties where id = ${row.id})`))
    })
    return true
  }

  /** 관리 화면의 드롭다운. */
  async options(): Promise<{ id: string; key: string; name: string }[]> {
    return this.db
      .select({ id: bosses.id, key: bosses.key, name: bosses.name })
      .from(bosses)
      .orderBy(asc(bosses.sortOrder), asc(bosses.key))
  }

  /** 보스 key 와 난이도로 난이도 줄 하나. 표에 없는 쌍이거나 난이도가 ENUM 밖이면 null 이다. */
  async findDifficulty(key: string, difficulty: string): Promise<{ id: string } | null> {
    if (!(BOSS_DIFFICULTIES as readonly string[]).includes(difficulty)) return null
    const [row] = await this.db
      .select({ id: bossDifficulties.id })
      .from(bossDifficulties)
      .innerJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .where(
        and(
          eq(bosses.key, key),
          eq(bossDifficulties.difficulty, difficulty as DifficultyInput['difficulty']),
        ),
      )
    return row ?? null
  }

  async findByKey(key: string): Promise<{ id: string } | null> {
    const [row] = await this.db.select({ id: bosses.id }).from(bosses).where(eq(bosses.key, key))
    return row ?? null
  }
}
