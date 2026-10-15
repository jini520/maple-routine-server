import { Module } from '@nestjs/common'

import { BossesController } from './bosses.controller'
import { BossesRepository } from './bosses.repository'

/** 보스 목록과 규칙. 관리 화면이 채우고 앱과 직접 완료가 읽는다. */
@Module({
  controllers: [BossesController],
  providers: [BossesRepository],
  exports: [BossesRepository],
})
export class BossesModule {}
