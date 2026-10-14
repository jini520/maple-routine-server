import { Module } from '@nestjs/common'

import { ClientsModule } from '../../clients/clients.module'
import { UsersModule } from '../users/users.module'
import { AttemptsRepository } from './attempts.repository'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { CleanupJob } from './cleanup.job'
import { SealService } from './seal.service'
import { SessionGuard } from './session.guard'
import { SessionsRepository } from './sessions.repository'
import { TokenService } from './token.service'

/** 넥슨 로그인. 콜백 · 짝 · 세션 · 토큰 갱신 · 1분 청소. 다른 모듈은 가드와 TokenService 만 쓴다. */
@Module({
  imports: [ClientsModule, UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SealService,
    AttemptsRepository,
    SessionsRepository,
    CleanupJob,
    SessionGuard,
  ],
  exports: [TokenService, SessionGuard, SessionsRepository],
})
export class AuthModule {}
