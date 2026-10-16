import { Injectable } from '@nestjs/common'

import { BossesRepository, type Catalog } from '../bosses/bosses.repository'

/**
 * GET /v1/game-data 의 몸체. 칸 하나가 표 하나이고 칸마다 updatedAt 을 든다.
 *
 * 표가 비어도 칸을 빼지 않는다. 앱이 칸마다 사본과 비교해 바뀐 표만 덮으므로 칸의 자리가 늘 같아야 한다.
 */
export interface GameDataSnapshot {
  bosses: Catalog
}

@Injectable()
export class GameDataService {
  constructor(private readonly bosses: BossesRepository) {}

  async snapshot(): Promise<GameDataSnapshot> {
    return { bosses: await this.bosses.catalog() }
  }
}
