import { Module } from '@nestjs/common'

import { AssetsModule } from '../assets/assets.module'
import { BossDropsModule } from '../boss-drops/boss-drops.module'
import { BossesModule } from '../bosses/bosses.module'
import { ContentsModule } from '../contents/contents.module'
import { CrystalPricesModule } from '../crystal-prices/crystal-prices.module'
import { DropItemsModule } from '../drop-items/drop-items.module'
import { DropMarketModule } from '../drop-market/drop-market.module'
import { DropPricesModule } from '../drop-prices/drop-prices.module'
import { EnhancementCostsModule } from '../enhancement-costs/enhancement-costs.module'
import { EquipmentItemsModule } from '../equipment-items/equipment-items.module'
import { HuntingGroundsModule } from '../hunting-grounds/hunting-grounds.module'
import { ManualCompletionModule } from '../manual-completion/manual-completion.module'
import { MvpGradesModule } from '../mvp-grades/mvp-grades.module'
import { NoticesModule } from '../notices/notices.module'
import { SpendCatalogModule } from '../spend-catalog/spend-catalog.module'
import { CashbookCategoriesModule } from '../cashbook-categories/cashbook-categories.module'
import { SymbolCostsModule } from '../symbol-costs/symbol-costs.module'
import { WorldsModule } from '../worlds/worlds.module'
import { AdminAssetsController } from './admin-assets.controller'
import { AdminController } from './admin.controller'

/** 운영자 화면 열아홉. 공지 · 보스 · 직접 완료 · 드롭 가격 보기 · 드롭 시세 둘 · 드롭 아이템 · 상자 · 드롭 표 · 결정석 가격 · 월드 · 지출 카탈로그 · 심볼 비용 · 컨텐츠 · 장비 · 강화 비용 · MVP 등급 · 사냥터 · 그림. nginx basic auth 뒤. */
@Module({
  imports: [
    BossesModule,
    ManualCompletionModule,
    NoticesModule,
    DropPricesModule,
    DropMarketModule,
    DropItemsModule,
    BossDropsModule,
    CrystalPricesModule,
    WorldsModule,
    SpendCatalogModule,
    CashbookCategoriesModule,
    SymbolCostsModule,
    ContentsModule,
    EquipmentItemsModule,
    EnhancementCostsModule,
    MvpGradesModule,
    HuntingGroundsModule,
    AssetsModule,
  ],
  controllers: [AdminController, AdminAssetsController],
})
export class AdminModule {}
