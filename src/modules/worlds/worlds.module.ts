import { Module } from '@nestjs/common'

import { WorldsRepository } from './worlds.repository'

/** 월드 마스터 표. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [WorldsRepository],
  exports: [WorldsRepository],
})
export class WorldsModule {}
