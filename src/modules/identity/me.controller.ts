import { Controller, Delete, Get, HttpCode, UseGuards } from '@nestjs/common'

import { SessionsRepository } from '../auth/sessions.repository'
import { ACCOUNT_DELETION_GRACE_DAYS } from '../users/account-deletion.job'
import { UsersRepository } from '../users/users.repository'
import {
  AllowDeletionPending,
  CurrentIdentity,
  type IdentityContext,
  IdentityGuard,
} from './identity.guard'

const DAY_MS = 86_400_000

/** 나. 계정 삭제 예약 · 예약 확인 · 취소다. */
@Controller()
@UseGuards(IdentityGuard)
export class MeController {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
  ) {}

  /** 계정 삭제를 예약하고 세션을 지운다. 사람과 열쇠는 유예가 끝난 밤에 지운다. */
  @Delete('v1/me')
  @HttpCode(204)
  @AllowDeletionPending()
  async requestDeletion(@CurrentIdentity() identity: IdentityContext): Promise<void> {
    await this.users.requestDeletion(identity.userId)
    await this.sessions.deleteByUserId(identity.userId)
  }

  /** 다시 로그인한 앱이 묻는다. 예약이 있으면 취소를 권한다. */
  @Get('v1/me/deletion')
  @AllowDeletionPending()
  async deletion(
    @CurrentIdentity() identity: IdentityContext,
  ): Promise<{ deletion: { requestedAt: string; deletesAt: string } | null }> {
    const requestedAt = await this.users.deletionRequestedAt(identity.userId)
    if (requestedAt === null) return { deletion: null }
    const deletesAt = new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS)
    return {
      deletion: { requestedAt: requestedAt.toISOString(), deletesAt: deletesAt.toISOString() },
    }
  }

  @Delete('v1/me/deletion')
  @HttpCode(204)
  @AllowDeletionPending()
  async cancelDeletion(@CurrentIdentity() identity: IdentityContext): Promise<void> {
    await this.users.cancelDeletion(identity.userId)
  }
}
