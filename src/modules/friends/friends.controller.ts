import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply } from 'fastify'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentSession, type SessionContext, SessionGuard } from '../auth/session.guard'
import { type StreamBody, streamBody } from './friends.dto'
import { FriendsService } from './friends.service'
import { RunSlots } from './run-slots'

/** 상한에 걸린 앱이 다시 오기까지의 초. nginx 의 속도 제한도 503 이라 앱의 처리가 하나다. */
const RETRY_AFTER_S = 30

@Controller()
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly slots: RunSlots,
  ) {}

  /** 작업 목록 하나를 받아 NDJSON 으로 흘린다. 상한을 넘으면 몸체 없이 503 이고, 세션이 죽었으면 401 이다. */
  @Post('v1/friends/stream')
  @UseGuards(SessionGuard)
  async stream(
    @CurrentSession() session: SessionContext,
    @Body(new ZodValidationPipe(streamBody)) body: StreamBody,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const release = this.slots.tryAcquire()
    if (release === null) {
      await reply
        .code(503)
        .header('retry-after', String(RETRY_AFTER_S))
        .header('cache-control', 'no-store')
        .send()
      return
    }
    try {
      await this.friends.stream(session, body.tasks, reply)
    } finally {
      release()
    }
  }
}
