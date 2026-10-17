import { Module } from '@nestjs/common'

import { EquipmentItemsRepository } from './equipment-items.repository'

/** 강화 비용을 매길 장비 마스터 표. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [EquipmentItemsRepository],
  exports: [EquipmentItemsRepository],
})
export class EquipmentItemsModule {}
