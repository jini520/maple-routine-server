import { Module } from '@nestjs/common'

import { IdentityModule } from '../identity/identity.module'
import { CashbookEntriesController } from './cashbook-entries.controller'
import { CashbookEntriesRepository } from './cashbook-entries.repository'

/** 가계부 기록의 사본. 신원은 identity 의 가드가 가린다. */
@Module({
  imports: [IdentityModule],
  controllers: [CashbookEntriesController],
  providers: [CashbookEntriesRepository],
})
export class CashbookEntriesModule {}
