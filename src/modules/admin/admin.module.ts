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
import { FaqsModule } from '../faqs/faqs.module'
import { HexaMatrixModule } from '../hexa-matrix/hexa-matrix.module'
import { HuntingGroundsModule } from '../hunting-grounds/hunting-grounds.module'
import { HuntLootModule } from '../hunt-loot/hunt-loot.module'
import { ItemsModule } from '../items/items.module'
import { ManualCompletionModule } from '../manual-completion/manual-completion.module'
import { MvpGradesModule } from '../mvp-grades/mvp-grades.module'
import { NoticesModule } from '../notices/notices.module'
import { SpendCatalogModule } from '../spend-catalog/spend-catalog.module'
import { CashbookCategoriesModule } from '../cashbook-categories/cashbook-categories.module'
import { SymbolCostsModule } from '../symbol-costs/symbol-costs.module'
import { UsageEventsModule } from '../usage-events/usage-events.module'
import { UsersModule } from '../users/users.module'
import { WorldsModule } from '../worlds/worlds.module'
import { AdminAssetsController } from './admin-assets.controller'
import { AdminItemsController } from './admin-items.controller'
import { AdminController } from './admin.controller'
import { UsageDashboardService } from './usage-dashboard.service'

/** 운영자 화면 스물넷. 공지 · FAQ 둘 · 보스 · 직접 완료 · 드롭 가격 보기 · 드롭 시세 둘 · 사용자 · 사용 로그 · 아이템 · 상자 · 드롭 표 · 결정석 가격 · 월드 · 사냥 전리품 · 지출 카탈로그 · 심볼 비용 · 헥사 매트릭스 · 컨텐츠 · 강화 비용 · MVP 등급 · 사냥터 · 그림. nginx basic auth 뒤. */
@Module({
  imports: [
    BossesModule,
    ManualCompletionModule,
    NoticesModule,
    FaqsModule,
    DropPricesModule,
    DropMarketModule,
    DropItemsModule,
    BossDropsModule,
    CrystalPricesModule,
    WorldsModule,
    SpendCatalogModule,
    CashbookCategoriesModule,
    HuntLootModule,
    SymbolCostsModule,
    HexaMatrixModule,
    ContentsModule,
    EquipmentItemsModule,
    EnhancementCostsModule,
    MvpGradesModule,
    HuntingGroundsModule,
    AssetsModule,
    ItemsModule,
    UsageEventsModule,
    UsersModule,
  ],
  controllers: [AdminController, AdminAssetsController, AdminItemsController],
  providers: [UsageDashboardService],
})
export class AdminModule {}
