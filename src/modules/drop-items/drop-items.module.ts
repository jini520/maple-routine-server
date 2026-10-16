import { Module } from '@nestjs/common'

import { DropBoxesRepository } from './drop-boxes.repository'
import { DropItemsRepository } from './drop-items.repository'

/** 드롭 아이템 마스터 표와 랜덤 상자. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [DropItemsRepository, DropBoxesRepository],
  exports: [DropItemsRepository, DropBoxesRepository],
})
export class DropItemsModule {}
