import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common'

import {
  type BatchBody,
  type BatchResult,
  batchBody,
  eachInBatch,
  recordIdOf,
} from '../../common/batch'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { uuidLike } from '../drop-prices/drop-prices.dto'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { type EnhancementTotalBody, enhancementTotalBody } from './enhancement-totals.dto'
import { EnhancementTotalsRepository } from './enhancement-totals.repository'

/**
 * 강화 지출 합계. 가계부 기록과 같은 규칙이다. 신원이 있어야 하고, DELETE 는 기기에서 합계가 사라졌거나 이벤트 월드로
 * 판정된 때다.
 */
@Controller()
@UseGuards(IdentityGuard)
export class EnhancementTotalsController {
  constructor(private readonly totals: EnhancementTotalsRepository) {}

  /** 한 건을 적는다. 같은 값을 다시 보내도 줄이 안 늘고 200 이다. */
  @Post('v1/enhancement-totals')
  @HttpCode(200)
  async upsert(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(enhancementTotalBody)) body: EnhancementTotalBody,
  ): Promise<{ ok: true }> {
    await this.save(identity, body)
    return { ok: true }
  }

  /** 과거 기록 묶음. 건마다 결과를 돌려주고 받을 수 있는 건은 받는다. */
  @Post('v1/enhancement-totals/batch')
  @HttpCode(200)
  async batch(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(batchBody)) body: BatchBody,
  ): Promise<{ results: BatchResult[] }> {
    const results = await eachInBatch(
      body.items,
      enhancementTotalBody,
      (raw) => recordIdOf(raw, 'totalRecordId'),
      (item) => this.save(identity, item),
      () => null,
    )
    return { results }
  }

  /** 기기에서 그 합계가 사라졌다. 줄은 남고 지운 시각이 적힌다. 없어도 204 다. */
  @Delete('v1/enhancement-totals/:totalRecordId')
  @HttpCode(204)
  async remove(
    @CurrentIdentity() identity: IdentityContext,
    @Param('totalRecordId', new ZodValidationPipe(uuidLike)) totalRecordId: string,
  ): Promise<void> {
    await this.totals.markDeleted(identity.userId, totalRecordId)
  }

  private async save(identity: IdentityContext, body: EnhancementTotalBody): Promise<void> {
    await this.totals.upsert({
      ...body,
      userId: identity.userId,
      identifiedBy: identity.source,
      accountRecordId: body.accountRecordId ?? null,
      itemKey: body.itemKey ?? null,
    })
  }
}
