import { Module } from '@nestjs/common'

import { BossDropsModule } from '../boss-drops/boss-drops.module'
import { BossesModule } from '../bosses/bosses.module'
import { ContentsModule } from '../contents/contents.module'
import { CrystalPricesModule } from '../crystal-prices/crystal-prices.module'
import { DropItemsModule } from '../drop-items/drop-items.module'
import { EnhancementCostsModule } from '../enhancement-costs/enhancement-costs.module'
import { EquipmentItemsModule } from '../equipment-items/equipment-items.module'
import { MvpGradesModule } from '../mvp-grades/mvp-grades.module'
import { SpendCatalogModule } from '../spend-catalog/spend-catalog.module'
import { SymbolCostsModule } from '../symbol-costs/symbol-costs.module'
import { WorldsModule } from '../worlds/worlds.module'
import { GameDataController } from './game-data.controller'
import { GameDataService } from './game-data.service'

/** 게임 데이터 표를 한 응답으로 모은다. 표 자체는 각 모듈의 리포지토리가 든다. */
@Module({
  imports: [
    BossesModule,
    DropItemsModule,
    BossDropsModule,
    CrystalPricesModule,
    WorldsModule,
    SpendCatalogModule,
    SymbolCostsModule,
    ContentsModule,
    EquipmentItemsModule,
    EnhancementCostsModule,
    MvpGradesModule,
  ],
  controllers: [GameDataController],
  providers: [GameDataService],
})
export class GameDataModule {}
