import { Module } from '@nestjs/common'

import { BossesRepository } from './bosses.repository'

/** 보스 목록과 규칙. 관리 화면이 채우고 게임 데이터 응답과 직접 완료가 읽는다. */
@Module({
  providers: [BossesRepository],
  exports: [BossesRepository],
})
export class BossesModule {}
