import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import {
  type EnhancementAnomaliesBody,
  enhancementAnomaliesBody,
} from './enhancement-anomalies.dto'
import { EnhancementAnomaliesRepository } from './enhancement-anomalies.repository'

/**
 * 앱이 강화 합계에서 빼거나 판정하지 못한 줄의 수. 기록이 아니라 운영자가 예상하지 못한 상황을 보는 값이라, 앱은 실패해도 다시
 * 보내지 않는다.
 */
@Controller()
@UseGuards(IdentityGuard)
export class EnhancementAnomaliesController {
  constructor(private readonly anomalies: EnhancementAnomaliesRepository) {}

  @Post('v1/enhancement-anomalies')
  @HttpCode(200)
  async report(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(enhancementAnomaliesBody)) body: EnhancementAnomaliesBody,
  ): Promise<{ ok: true }> {
    await this.anomalies.upsert(identity.userId, identity.source, body.items)
    return { ok: true }
  }
}
