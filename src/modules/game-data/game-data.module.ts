import { Module } from '@nestjs/common'

import { BossesModule } from '../bosses/bosses.module'
import { GameDataController } from './game-data.controller'
import { GameDataService } from './game-data.service'

/** 게임 데이터 표를 한 응답으로 모은다. 표 자체는 각 모듈의 리포지토리가 든다. */
@Module({
  imports: [BossesModule],
  controllers: [GameDataController],
  providers: [GameDataService],
})
export class GameDataModule {}
