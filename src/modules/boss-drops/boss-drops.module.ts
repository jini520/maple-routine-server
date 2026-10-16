import { Module } from '@nestjs/common'

import { BossDropsRepository } from './boss-drops.repository'

/** 드롭 표. 보스 한 난이도의 보상 줄. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [BossDropsRepository],
  exports: [BossDropsRepository],
})
export class BossDropsModule {}
