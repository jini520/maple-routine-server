import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { AppController } from './app.controller'
import { ClientsModule } from './clients/clients.module'
import { AppLoggerModule } from './common/logger.module'
import { AppConfigModule } from './config/config.module'
import { DatabaseModule } from './database/database.module'
import { AdminModule } from './modules/admin/admin.module'
import { AuthModule } from './modules/auth/auth.module'
import { DropPricesModule } from './modules/drop-prices/drop-prices.module'
import { FriendsModule } from './modules/friends/friends.module'
import { ManualCompletionModule } from './modules/manual-completion/manual-completion.module'
import { NoticesModule } from './modules/notices/notices.module'
import { PushModule } from './modules/push/push.module'
import { SettlementModule } from './modules/settlement/settlement.module'
import { UsersModule } from './modules/users/users.module'

/** 루트. 가로 부품 넷을 먼저 세우고 기능 모듈 아홉을 올린다. */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    ClientsModule,
    AuthModule,
    FriendsModule,
    NoticesModule,
    PushModule,
    SettlementModule,
    ManualCompletionModule,
    DropPricesModule,
    UsersModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
