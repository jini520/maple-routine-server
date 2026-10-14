import { Module } from '@nestjs/common'

import { ClientsModule } from '../../clients/clients.module'
import { PushModule } from '../push/push.module'
import { NoticePoller } from './notice-poller'
import { NoticesController } from './notices.controller'
import { NoticesRepository } from './notices.repository'
import { NoticesService } from './notices.service'

/** 공지. 조회 셋 · 1분 폴링 · 예약 발송. 푸시 문구와 FCM 은 PushModule 이 맡는다. */
@Module({
  imports: [ClientsModule, PushModule],
  controllers: [NoticesController],
  providers: [NoticesService, NoticesRepository, NoticePoller],
  exports: [NoticesService, NoticesRepository],
})
export class NoticesModule {}
