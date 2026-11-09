import { Module } from '@nestjs/common'

import { ItemsRepository } from './items.repository'

/** 아이템 표 하나. 관리 화면의 아이템 화면이 고친다. */
@Module({
  providers: [ItemsRepository],
  exports: [ItemsRepository],
})
export class ItemsModule {}
