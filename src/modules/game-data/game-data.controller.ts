import { Controller, Get } from '@nestjs/common'

import { GameDataService } from './game-data.service'

/** 게임 데이터 표 전부. 공개 조회다. 앱은 켤 때 한 번 받아 칸마다 updatedAt 이 다르면 그 표만 덮는다. */
@Controller()
export class GameDataController {
  constructor(private readonly gameData: GameDataService) {}

  @Get('v1/game-data')
  snapshot() {
    return this.gameData.snapshot()
  }
}
