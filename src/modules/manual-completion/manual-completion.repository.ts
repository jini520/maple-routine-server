import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { bosses, manualCompletionBosses } from '../../database/schema'

/** 앱 계약 ManualCompletionBoss. 서버는 boss_id 를 key 로 바꿔 낸다. */
export interface OpenBoss {
  boss: string
  from: string
}

export interface ManualCompletionRow {
  id: string
  boss: string
  name: string
  from: string
  openedAt: string
  closedAt: string | null
}

/** 같은 보스가 이미 열려 있다. 부분 유니크가 막은 것이다. */
export class AlreadyOpen extends Error {}

const ROW = {
  id: manualCompletionBosses.id,
  boss: bosses.key,
  name: bosses.name,
  from: manualCompletionBosses.fromDate,
  openedAt: manualCompletionBosses.openedAt,
  closedAt: manualCompletionBosses.closedAt,
}

@Injectable()
export class ManualCompletionRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 열린 보스. 앱이 읽는다. */
  async open(): Promise<OpenBoss[]> {
    const rows = await this.db
      .select({ boss: bosses.key, from: manualCompletionBosses.fromDate })
      .from(manualCompletionBosses)
      .innerJoin(bosses, eq(bosses.id, manualCompletionBosses.bossId))
      .where(isNull(manualCompletionBosses.closedAt))
      .orderBy(asc(manualCompletionBosses.openedAt))
    return rows
  }

  /** 열린 것과 닫은 것 전부. 관리 화면이 읽는다. 최근 것이 앞이다. */
  async rows(): Promise<ManualCompletionRow[]> {
    const rows = await this.db
      .select(ROW)
      .from(manualCompletionBosses)
      .innerJoin(bosses, eq(bosses.id, manualCompletionBosses.bossId))
      .orderBy(desc(manualCompletionBosses.openedAt))
    return rows.map((r) => ({
      ...r,
      openedAt: r.openedAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
    }))
  }

  /** 연다. 그 보스가 이미 열려 있으면 AlreadyOpen 이다. */
  async openBoss(bossId: string, fromDate: string): Promise<{ id: string }> {
    try {
      const [row] = await this.db
        .insert(manualCompletionBosses)
        .values({ bossId, fromDate })
        .returning({ id: manualCompletionBosses.id })
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      return row
    } catch (error) {
      if (isUniqueViolation(error)) throw new AlreadyOpen()
      throw error
    }
  }

  /** 닫는다. 줄은 남고 closed_at 만 찬다. 이미 닫혔거나 없으면 false 다. */
  async close(id: string): Promise<boolean> {
    const rows = await this.db
      .update(manualCompletionBosses)
      .set({ closedAt: sql`now()` })
      .where(and(eq(manualCompletionBosses.id, id), isNull(manualCompletionBosses.closedAt)))
      .returning({ id: manualCompletionBosses.id })
    return rows.length > 0
  }
}

/** pg 의 unique_violation. drizzle 이 DrizzleQueryError 로 감싸므로 cause 까지 내려가 SQLSTATE 를 본다. */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; typeof current === 'object' && current !== null;) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
