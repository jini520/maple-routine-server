import { Module } from '@nestjs/common'

import { ClientsModule } from '../../clients/clients.module'
import { SettlementController } from './settlement.controller'
import { SettlementService } from './settlement.service'

/** 결산 감시. 밤마다 낟낟 캐릭터로 결산 중인지 들고 앱에 준다. */
@Module({
  imports: [ClientsModule],
  controllers: [SettlementController],
  providers: [SettlementService],
})
export class SettlementModule {}
