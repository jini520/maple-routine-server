import { Module } from '@nestjs/common'

import { BossDropsModule } from '../boss-drops/boss-drops.module'
import { BossesModule } from '../bosses/bosses.module'
import { ContentsModule } from '../contents/contents.module'
import { CrystalPricesModule } from '../crystal-prices/crystal-prices.module'
import { DropItemsModule } from '../drop-items/drop-items.module'
import { DropPricesModule } from '../drop-prices/drop-prices.module'
import { ManualCompletionModule } from '../manual-completion/manual-completion.module'
import { NoticesModule } from '../notices/notices.module'
import { SpendCatalogModule } from '../spend-catalog/spend-catalog.module'
import { SymbolCostsModule } from '../symbol-costs/symbol-costs.module'
import { WorldsModule } from '../worlds/worlds.module'
import { AdminController } from './admin.controller'

/** 운영자 화면 열둘. 공지 · 보스 · 직접 완료 · 드롭 가격 보기 · 드롭 아이템 · 상자 · 드롭 표 · 결정석 가격 · 월드 · 지출 카탈로그 · 심볼 비용 · 컨텐츠. nginx basic auth 뒤. */
@Module({
  imports: [
    BossesModule,
    ManualCompletionModule,
    NoticesModule,
    DropPricesModule,
    DropItemsModule,
    BossDropsModule,
    CrystalPricesModule,
    WorldsModule,
    SpendCatalogModule,
    SymbolCostsModule,
    ContentsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
