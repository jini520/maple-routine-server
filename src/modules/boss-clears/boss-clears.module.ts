import { Module } from '@nestjs/common'

import { IdentityModule } from '../identity/identity.module'
import { BossClearsController } from './boss-clears.controller'
import { BossClearsRepository } from './boss-clears.repository'

/** 보스 수익 건의 사본. 신원은 identity 의 가드가 가린다. */
@Module({
  imports: [IdentityModule],
  controllers: [BossClearsController],
  providers: [BossClearsRepository],
})
export class BossClearsModule {}
