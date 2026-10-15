import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, inArray, notInArray, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { bossDifficulties, bosses, gameRules } from '../../database/schema'
import { type BossesImport, RULE_KEYS, type RuleField } from './bosses.dto'

export interface BossView {
  key: string
  name: string
  alias: string
  cycle: 'weekly' | 'event_weekly' | 'monthly'
  portraitSlug: string
  difficulties: {
    difficulty: 'easy' | 'normal' | 'hard' | 'chaos' | 'extreme'
    requiredLevel: number
  }[]
}

/** GET /v1/bosses 의 몸체. 한 번도 안 넣었으면 updatedAt 과 규칙이 null 이고 목록이 빈다. */
export interface Catalog {
  updatedAt: string | null
  rules: Record<RuleField, number | null>
  bosses: BossView[]
}

export interface ImportResult {
  bosses: number
  difficulties: number
  /** 표에는 있는데 JSON 에 없던 보스. 지우지 않고 알린다. */
  leftover: string[]
}

@Injectable()
export class BossesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * JSON 을 한 트랜잭션으로 넣는다. 보스는 key 로 upsert, 난이도는 그 보스 안에서 갈아 끼운다.
   * JSON 에 없는 보스는 직접 완료 줄이 참조할 수 있어 지우지 않는다.
   */
  async import(input: BossesImport): Promise<ImportResult> {
    return this.db.transaction(async (tx) => {
      const now = new Date()
      for (const field of Object.keys(RULE_KEYS) as RuleField[]) {
        await tx
          .insert(gameRules)
          .values({ key: RULE_KEYS[field], value: input.rules[field], updatedAt: now })
          .onConflictDoUpdate({
            target: gameRules.key,
            set: { value: input.rules[field], updatedAt: now },
          })
      }

      let difficulties = 0
      for (const [index, boss] of input.bosses.entries()) {
        const values = {
          name: boss.name,
          alias: boss.alias,
          cycle: boss.cycle,
          portraitSlug: boss.portraitSlug,
          sortOrder: index,
          updatedAt: now,
        }
        const [row] = await tx
          .insert(bosses)
          .values({ key: boss.key, ...values })
          .onConflictDoUpdate({ target: bosses.key, set: values })
          .returning({ id: bosses.id })
        if (row === undefined) throw new Error('upsert 가 행을 안 돌려줬다')

        const kept = boss.difficulties.map((d) => d.difficulty)
        await tx
          .delete(bossDifficulties)
          .where(
            sql`${bossDifficulties.bossId} = ${row.id} AND ${notInArray(bossDifficulties.difficulty, kept)}`,
          )
        for (const d of boss.difficulties) {
          await tx
            .insert(bossDifficulties)
            .values({ bossId: row.id, difficulty: d.difficulty, requiredLevel: d.requiredLevel })
            .onConflictDoUpdate({
              target: [bossDifficulties.bossId, bossDifficulties.difficulty],
              set: { requiredLevel: d.requiredLevel },
            })
          difficulties += 1
        }
      }

      const leftover = await tx
        .select({ key: bosses.key })
        .from(bosses)
        .where(
          notInArray(
            bosses.key,
            input.bosses.map((b) => b.key),
          ),
        )
        .orderBy(asc(bosses.sortOrder))
      return { bosses: input.bosses.length, difficulties, leftover: leftover.map((r) => r.key) }
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
      },
      bosses: rows.map((r) => ({
        key: r.key,
        name: r.name,
        alias: r.alias,
        cycle: r.cycle,
        portraitSlug: r.portraitSlug,
        difficulties: difficultyRows
          .filter((d) => d.bossId === r.id)
          .map((d) => ({ difficulty: d.difficulty, requiredLevel: d.requiredLevel })),
      })),
    }
  }

  /** 관리 화면의 드롭다운. */
  async options(): Promise<{ id: string; key: string; name: string }[]> {
    return this.db
      .select({ id: bosses.id, key: bosses.key, name: bosses.name })
      .from(bosses)
      .orderBy(asc(bosses.sortOrder), asc(bosses.key))
  }

  async findByKey(key: string): Promise<{ id: string } | null> {
    const [row] = await this.db.select({ id: bosses.id }).from(bosses).where(eq(bosses.key, key))
    return row ?? null
  }
}
