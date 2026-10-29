import { Module } from '@nestjs/common'

import { HuntLootRepository } from './hunt-loot.repository'

/** 가계부 사냥 전리품 판매의 아이템. 관리 화면이 고치고 앱이 받는다. */
@Module({
  providers: [HuntLootRepository],
  exports: [HuntLootRepository],
})
export class HuntLootModule {}
