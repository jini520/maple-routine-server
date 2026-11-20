import { Inject, Injectable } from '@nestjs/common'

import { DB, type Db } from '../../database/database.module'
import { gameRules } from '../../database/schema'

/** 게임 규칙 아홉. 칸 이름이 표의 칸 이름이다. */
export interface GameRules {
  weeklyBossSelectionLimit: number
  weeklyCrystalSaleLimit: number
  defaultMaxPartySize: number
  spendTariffPercent: number
  rewardCoinPriceMeso: number
  mesoMarketFeePercent: number
  cubeAppraisalFreeMaxLevel: number
  cubeAppraisalCoefficient: number
  starforceDestroyDefenceSurchargePercent: number
}

/** GET /v1/game-data 의 gameRules 칸. 줄이 하나라 updatedAt 은 그 줄의 시각이다. 줄이 없으면 규칙이 null 이다. */
export interface GameRulesSection {
  updatedAt: string | null
  gameRules: GameRules | null
}

/** 규칙 줄이 없다. 새 DB 는 옮기는 스크립트가 옛 DB 의 규칙으로 줄을 만든다. */
export class NoGameRules extends Error {}

@Injectable()
export class GameRulesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<GameRulesSection> {
    const [row] = await this.db.select().from(gameRules).limit(1)
    if (row === undefined) return { updatedAt: null, gameRules: null }
    return {
      updatedAt: row.updatedAt.toISOString(),
      gameRules: {
        weeklyBossSelectionLimit: row.weeklyBossSelectionLimit,
        weeklyCrystalSaleLimit: row.weeklyCrystalSaleLimit,
        defaultMaxPartySize: row.defaultMaxPartySize,
        spendTariffPercent: row.spendTariffPercent,
        rewardCoinPriceMeso: row.rewardCoinPriceMeso,
        mesoMarketFeePercent: row.mesoMarketFeePercent,
        cubeAppraisalFreeMaxLevel: row.cubeAppraisalFreeMaxLevel,
        cubeAppraisalCoefficient: row.cubeAppraisalCoefficient,
        starforceDestroyDefenceSurchargePercent: row.starforceDestroyDefenceSurchargePercent,
      },
    }
  }

  /** 받은 규칙만 고친다. 줄이 없으면 NoGameRules 다. */
  async update(input: Partial<GameRules>): Promise<void> {
    const rows = await this.db
      .update(gameRules)
      .set({ ...input, updatedAt: new Date() })
      .returning({ id: gameRules.id })
    if (rows.length === 0) throw new NoGameRules()
  }
}
