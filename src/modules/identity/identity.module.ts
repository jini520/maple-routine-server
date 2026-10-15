import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { IdentityGuard } from './identity.guard'
import { MeController } from './me.controller'

/**
 * 쓰기 경로의 신원 한 겹과 탈퇴. auth 가 users 를 가져오고 가드는 둘을 다 쓰므로 둘 위에 따로 선다.
 * users 안에 두면 두 모듈이 서로를 가져온다.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [MeController],
  providers: [IdentityGuard],
  // 가드는 @UseGuards 를 쓴 모듈 안에서 조립되므로 그 의존(세션 · 사람)도 함께 보여야 한다.
  exports: [IdentityGuard, AuthModule, UsersModule],
})
export class IdentityModule {}
