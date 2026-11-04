import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { type UsageEventsBody, usageEventsBody } from './usage-events.dto'
import { UsageEventsRepository } from './usage-events.repository'

/** 앱 사용 로그. 앱이 기기에 모았다가 묶어 보낸다. 대강의 양을 보는 값이라 앱은 실패해도 다시 보내지 않는다. */
@Controller()
@UseGuards(IdentityGuard)
export class UsageEventsController {
  constructor(private readonly events: UsageEventsRepository) {}

  @Post('v1/usage-events')
  @HttpCode(200)
  async report(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(usageEventsBody)) body: UsageEventsBody,
  ): Promise<{ ok: true }> {
    await this.events.insert(
      {
        userId: identity.userId,
        identifiedBy: identity.source,
        platform: body.platform,
        appVersion: body.appVersion,
      },
      body.events.map((event) => ({
        type: event.type,
        name: event.name,
        durationMs: event.durationMs ?? null,
        at: event.at,
      })),
    )
    return { ok: true }
  }
}
