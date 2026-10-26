import { Module } from '@nestjs/common'

import { BossesModule } from '../bosses/bosses.module'
import { IdentityModule } from '../identity/identity.module'
import { BossClearsController } from './boss-clears.controller'
import { BossClearsRepository } from './boss-clears.repository'

/** 보스 처치 기간의 사본. 신원은 identity 의 가드가 가리고, 보스 · 난이도는 bosses 의 표로 바꿔 적는다. */
@Module({
  imports: [IdentityModule, BossesModule],
  controllers: [BossClearsController],
  providers: [BossClearsRepository],
})
export class BossClearsModule {}
