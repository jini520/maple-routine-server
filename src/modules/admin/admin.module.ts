import { Module } from '@nestjs/common'

import { BossesModule } from '../bosses/bosses.module'
import { DropPricesModule } from '../drop-prices/drop-prices.module'
import { ManualCompletionModule } from '../manual-completion/manual-completion.module'
import { NoticesModule } from '../notices/notices.module'
import { AdminController } from './admin.controller'

/** 운영자 화면 넷. 공지 작성 · 보스 불러오기 · 수동 완료 · 드롭 가격 보기. nginx basic auth 뒤. */
@Module({
  imports: [BossesModule, ManualCompletionModule, NoticesModule, DropPricesModule],
  controllers: [AdminController],
})
export class AdminModule {}
