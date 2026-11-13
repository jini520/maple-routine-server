import { Module } from '@nestjs/common'

import { ItemGroupsRepository } from './item-groups.repository'
import { ItemsRepository } from './items.repository'

/** 아이템 표와 묶음 표. 관리 화면의 아이템 화면이 고친다. */
@Module({
  providers: [ItemsRepository, ItemGroupsRepository],
  exports: [ItemsRepository, ItemGroupsRepository],
})
export class ItemsModule {}
