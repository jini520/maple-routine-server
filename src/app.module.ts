import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { AppController } from './app.controller'
import { ClientsModule } from './clients/clients.module'
import { AppLoggerModule } from './common/logger.module'
import { AppConfigModule } from './config/config.module'
import { DatabaseModule } from './database/database.module'
import { AdminModule } from './modules/admin/admin.module'
import { AuthModule } from './modules/auth/auth.module'
import { BossDropsModule } from './modules/boss-drops/boss-drops.module'
import { BossesModule } from './modules/bosses/bosses.module'
import { CrystalPricesModule } from './modules/crystal-prices/crystal-prices.module'
import { DropItemsModule } from './modules/drop-items/drop-items.module'
import { EnhancementAnomaliesModule } from './modules/enhancement-anomalies/enhancement-anomalies.module'
import { DropPricesModule } from './modules/drop-prices/drop-prices.module'
import { FriendsModule } from './modules/friends/friends.module'
import { GameDataModule } from './modules/game-data/game-data.module'
import { OtaModule } from './modules/ota/ota.module'
import { IdentityModule } from './modules/identity/identity.module'
import { ManualCompletionModule } from './modules/manual-completion/manual-completion.module'
import { NoticesModule } from './modules/notices/notices.module'
import { PushModule } from './modules/push/push.module'
import { SettlementModule } from './modules/settlement/settlement.module'
import { SpendCatalogModule } from './modules/spend-catalog/spend-catalog.module'
import { SymbolCostsModule } from './modules/symbol-costs/symbol-costs.module'
import { SyncModule } from './modules/sync/sync.module'
import { UsageEventsModule } from './modules/usage-events/usage-events.module'
import { UsersModule } from './modules/users/users.module'
import { WorldsModule } from './modules/worlds/worlds.module'

/** 루트. 설정 · 로그 · 일정 · DB · 외부 클라이언트를 먼저 세우고 기능 모듈을 올린다. 모듈 수는 적지 않는다. 늘 때마다 낡는다. */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    ClientsModule,
    AuthModule,
    BossesModule,
    DropItemsModule,
    BossDropsModule,
    CrystalPricesModule,
    WorldsModule,
    SpendCatalogModule,
    SymbolCostsModule,
    GameDataModule,
    OtaModule,
    FriendsModule,
    NoticesModule,
    PushModule,
    SettlementModule,
    ManualCompletionModule,
    DropPricesModule,
    SyncModule,
    EnhancementAnomaliesModule,
    UsageEventsModule,
    UsersModule,
    IdentityModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
