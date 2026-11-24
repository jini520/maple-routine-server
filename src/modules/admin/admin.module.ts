import { Module } from '@nestjs/common'

import { AssetsModule } from '../assets/assets.module'
import { BossDropsModule } from '../boss-drops/boss-drops.module'
import { BossesModule } from '../bosses/bosses.module'
import { GameRulesModule } from '../game-rules/game-rules.module'
import { ContentsModule } from '../contents/contents.module'
import { CrystalPricesModule } from '../crystal-prices/crystal-prices.module'
import { DropItemsModule } from '../drop-items/drop-items.module'
import { DropMarketModule } from '../drop-market/drop-market.module'
import { DropPricesModule } from '../drop-prices/drop-prices.module'
import { EnhancementCostsModule } from '../enhancement-costs/enhancement-costs.module'
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
import { AppImagesModule } from '../app-images/app-images.module'
import { AdminAppImagesController } from './admin-app-images.controller'
import { AdminItemsController } from './admin-items.controller'
import { AdminNoticeImagesController } from './admin-notice-images.controller'
import { AdminController } from './admin.controller'
import { UsageDashboardService } from './usage-dashboard.service'

/** 운영자 화면. 메뉴는 `views/layout.ts` 의 MENU 다. admin 주소의 nginx basic auth 뒤. */
@Module({
  imports: [
    BossesModule,
    GameRulesModule,
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
    EnhancementCostsModule,
    MvpGradesModule,
    HuntingGroundsModule,
    AssetsModule,
    ItemsModule,
    AppImagesModule,
    UsageEventsModule,
    UsersModule,
  ],
  controllers: [
    AdminController,
    AdminAssetsController,
    AdminItemsController,
    AdminAppImagesController,
    AdminNoticeImagesController,
  ],
  providers: [UsageDashboardService],
})
export class AdminModule {}
