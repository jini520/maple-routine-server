import { Body, Controller, Delete, Get, HttpCode, Put, UseGuards } from '@nestjs/common'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { SessionsRepository } from '../auth/sessions.repository'
import { ACCOUNT_DELETION_GRACE_DAYS } from '../users/account-deletion.job'
import { NexonAccountsRepository } from '../users/nexon-accounts.repository'
import { UsersRepository } from '../users/users.repository'
import {
  AllowDeletionPending,
  CurrentIdentity,
  type IdentityContext,
  IdentityGuard,
} from './identity.guard'
import { type MapleIdsBody, mapleIdsBody } from './me.dto'

const DAY_MS = 86_400_000

/**
 * 나. 계정 삭제 예약 · 예약 확인 · 취소, 메이플 ID 알리기다.
 *
 * 키를 로그인 계정에 다는 경로는 없다. 1.0.15 의 키 사용자는 메이플 ID 해시로 밝혀지고, 로그인한 기기가 메이플 ID 를 알리면
 * 같은 넥슨 ID 의 줄이 메이플 ID 로 합쳐진다.
 */
@Controller()
@UseGuards(IdentityGuard)
export class MeController {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly accounts: NexonAccountsRepository,
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

  /**
   * 그 신원의 넥슨 계정에 메이플 ID 를 알린다. 앱은 계정마다 그 계정의 신원으로 보낸다. 답은 그 계정이 가진 메이플 ID 전부다.
   * 앱은 자기 목록이 그 안에 다 없으면 다음에 다시 보낸다.
   */
  @Put('v1/me/maple-ids')
  async reportMapleIds(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(mapleIdsBody)) body: MapleIdsBody,
  ): Promise<{ mapleIds: string[] }> {
    return { mapleIds: await this.accounts.reportMapleIds(identity.nexonAccountId, body.mapleIds) }
  }
}
