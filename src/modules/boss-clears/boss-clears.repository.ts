import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { bossClears, worlds } from '../../database/schema'
import { NoWorld } from '../drop-prices/drop-prices.repository'
import type { IdentityContext, IdentitySource } from '../identity/identity.guard'
import { assertOwnsMapleId, ownedMapleIds } from '../users/maple-id-ownership'

/** 전송값 그대로. 보스 · 난이도는 컨트롤러가 표의 줄로 바꿔 넘기고, 월드는 여기서 key 로 찾는다. */
export interface BossClearInput {
  /** 보낸 신원의 넥슨 계정. 메이플 ID 가 이 계정의 것이어야 적는다. */
  nexonAccountId: string
  identifiedBy: IdentitySource
  periodRecordId: string
  mapleId: string
  ocid: string
  /** 같은 처치를 가리는 보스 줄. 표에 없는 보스면 null. */
  bossId: string | null
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

/**
 * 처치 기간의 사본. 같은 처치(ocid · 보스 · 기간)는 한 줄이고, 다시 보낸 기간은 메이플 ID · 기간 행 id 로 찾는다. 기기에서 처치가
 * 사라지면 deleted_at 이 남는다.
 */
@Injectable()
export class BossClearsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 메이플 ID 와 기간 행 id 로 덮어 적는다. 리프로 ocid 가 바뀌어도 같은 줄이다. 지운 줄도 다시 적으면 되살아난다. 같은 처치가
   * 다른 줄로 이미 있으면 적지 않는다. 모르는 월드 key 는 NoWorld, 남의 메이플 ID 는 MapleIdNotOwned 다.
   */
  async upsert(input: BossClearInput): Promise<void> {
    const { nexonAccountId, periodRecordId, mapleId, worldKey, ...rest } = input
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
    try {
      await this.db.transaction(async (tx) => {
        await assertOwnsMapleId(tx, nexonAccountId, mapleId)
        if (input.bossId !== null) {
          const [same] = await tx
            .select({ id: bossClears.id })
            .from(bossClears)
            .where(
              and(
                eq(bossClears.ocid, input.ocid),
                eq(bossClears.bossId, input.bossId),
                eq(bossClears.periodKey, input.periodKey),
                isNull(bossClears.deletedAt),
                or(ne(bossClears.mapleId, mapleId), ne(bossClears.periodRecordId, periodRecordId)),
              ),
            )
          if (same !== undefined) return
        }
        await tx
          .insert(bossClears)
          .values({ mapleId, periodRecordId, ...values })
          .onConflictDoUpdate({
            target: [bossClears.mapleId, bossClears.periodRecordId],
            set: { ...values, deletedAt: null, updatedAt: sql`now()` },
          })
      })
    } catch (error) {
      // 같은 처치가 동시에 들어와 진 쪽이다. 같은 처치는 적지 않는다.
      if (isUniqueViolation(error, 'boss_clears_same_clear_unique')) return
      throw error
    }
  }

  /** 내 계정의 메이플 ID 줄에 지운 시각을 적는다. 없는 줄이면 아무 일도 없다. 이미 적힌 시각은 안 덮는다. */
  async markDeleted(
    identity: Pick<IdentityContext, 'nexonAccountId'>,
    periodRecordId: string,
  ): Promise<void> {
    await this.db
      .update(bossClears)
      .set({ deletedAt: sql`COALESCE(${bossClears.deletedAt}, now())`, updatedAt: sql`now()` })
      .where(
        and(
          eq(bossClears.periodRecordId, periodRecordId),
          sql`${bossClears.mapleId} IN ${ownedMapleIds(identity.nexonAccountId)}`,
        ),
      )
  }
}
