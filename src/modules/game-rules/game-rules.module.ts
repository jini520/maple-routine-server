import { Module } from '@nestjs/common'

import { GameRulesRepository } from './game-rules.repository'

/** 게임 규칙 한 줄. 관리 화면은 규칙을 쓰는 화면에서 고치고 앱은 게임 데이터의 gameRules 칸으로 받는다. */
@Module({
  providers: [GameRulesRepository],
  exports: [GameRulesRepository],
})
export class GameRulesModule {}
