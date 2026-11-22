import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { SyncClearRepository } from './clear.repository'
import { type PullResponse, SyncPullRepository } from './pull.repository'
import { type PushResult, SyncPushRepository } from './push.repository'
import {
  type ClearBody,
  clearBody,
  type PullBody,
  pullBody,
  type PushBody,
  pushBody,
} from './sync.dto'

/**
 * 기기 간 기록 동기화. 받기 · 올리기 · 데이터 삭제다. 신원은 세션 아니면 메이플 ID 해시이고, 계정 삭제를 예약한 사람은 403 이다.
 * 응답의 gzip 은 앱 박스의 nginx 가 한다. 받기는 POST 다. 주인마다 번호를 실어 쿼리로 담기 어렵다.
 */
@Controller('v1/sync')
@UseGuards(IdentityGuard)
export class SyncController {
  constructor(
    private readonly pulls: SyncPullRepository,
    private readonly pushes: SyncPushRepository,
    private readonly clears: SyncClearRepository,
  ) {}

  @Post('pull')
  @HttpCode(200)
  pull(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(pullBody)) body: PullBody,
  ): Promise<PullResponse> {
    return this.pulls.pull(identity, body)
  }

  /** 거절은 기록마다 results 에 싣는다. 요청 전체를 거절하는 것은 신원과 본문의 겉모양뿐이다. */
  @Post('push')
  @HttpCode(200)
  async push(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(pushBody)) body: PushBody,
  ): Promise<{ results: PushResult[] }> {
    return { results: await this.pushes.push(identity, body.records) }
  }

  @Post('clear')
  @HttpCode(204)
  async clear(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(clearBody)) body: ClearBody,
  ): Promise<void> {
    await this.clears.clear(identity, body.groups)
  }
}
