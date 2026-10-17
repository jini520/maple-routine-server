import { Module } from '@nestjs/common'

import { HuntingGroundsRepository } from './hunting-grounds.repository'

/** 사냥 계산기의 참조표. 지역 · 사냥터 · 몬스터 레벨. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [HuntingGroundsRepository],
  exports: [HuntingGroundsRepository],
})
export class HuntingGroundsModule {}
