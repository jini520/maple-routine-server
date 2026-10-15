import { Controller, Delete, HttpCode, UseGuards } from '@nestjs/common'

import { SessionsRepository } from '../auth/sessions.repository'
import { UsersRepository } from '../users/users.repository'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from './identity.guard'

/** 나. 탈퇴 하나다. */
@Controller()
export class MeController {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
  ) {}

  /** 탈퇴. 행은 안 지우고 deleted_at 을 적고 세션만 지운다. 시세 표본은 그대로 남는다. */
  @Delete('v1/me')
  @HttpCode(204)
  @UseGuards(IdentityGuard)
  async withdraw(@CurrentIdentity() identity: IdentityContext): Promise<void> {
    await this.users.markDeleted(identity.userId)
    await this.sessions.deleteByUserId(identity.userId)
  }
}
