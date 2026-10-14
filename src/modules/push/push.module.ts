import { Module } from '@nestjs/common'

import { ClientsModule } from '../../clients/clients.module'
import { PushService } from './push.service'

/** 푸시. 문구 조립과 FCM 토픽 발송만 맡고 무엇을 언제 보낼지는 notices 가 정한다. */
@Module({
  imports: [ClientsModule],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
