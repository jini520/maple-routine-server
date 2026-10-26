import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { bossClears, worlds } from '../../database/schema'
import { NoWorld } from '../drop-prices/drop-prices.repository'
import type { IdentitySource } from '../identity/identity.guard'

/** 전송값 그대로. 보스 · 난이도는 컨트롤러가 표의 줄로 바꿔 넘기고, 월드는 여기서 key 로 찾는다. */
export interface BossClearInput {
  userId: string
  identifiedBy: IdentitySource
  periodRecordId: string
  ocid: string
  /** 보스 난이도 줄. 표에 없는 쌍이면 null. */
  bossDifficultyId: string | null
  cycle: 'weekly' | 'monthly'
  periodKey: string
  worldKey: string | null
  priceMeso: number
  payoutMeso: number
  splitMode: 'even' | 'ratio'
  partySize: number
  myShare: number | null
  sharesTotal: number | null
  splitFeePercent: number | null
  defeatedDate: string | null
  source: 'auto' | 'manual'
}

/** 처치 기간의 사본. 같은 사람의 같은 기간 행은 한 줄이고, 기기에서 처치가 사라지면 deleted_at 이 남는다. */
@Injectable()
export class BossClearsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 사람과 기간 행 id 로 덮어 적는다. 지운 줄도 다시 적으면 되살아난다. 모르는 월드 key 는 NoWorld 다. */
  async upsert(input: BossClearInput): Promise<void> {
    const { userId, periodRecordId, worldKey, ...rest } = input
    let worldId: string | null = null
    if (worldKey !== null) {
      const [world] = await this.db
        .select({ id: worlds.id })
        .from(worlds)
        .where(eq(worlds.key, worldKey))
      if (world === undefined) throw new NoWorld(worldKey)
      worldId = world.id
    }
    const values = { ...rest, worldId }
    await this.db
      .insert(bossClears)
      .values({ userId, periodRecordId, ...values })
      .onConflictDoUpdate({
        target: [bossClears.userId, bossClears.periodRecordId],
        set: { ...values, deletedAt: null, updatedAt: sql`now()` },
      })
  }

  /** 내 줄에 지운 시각을 적는다. 없는 줄이면 아무 일도 없다. 이미 적힌 시각은 안 덮는다. */
  async markDeleted(userId: string, periodRecordId: string): Promise<void> {
    await this.db
      .update(bossClears)
      .set({ deletedAt: sql`COALESCE(${bossClears.deletedAt}, now())`, updatedAt: sql`now()` })
      .where(and(eq(bossClears.userId, userId), eq(bossClears.periodRecordId, periodRecordId)))
  }
}
