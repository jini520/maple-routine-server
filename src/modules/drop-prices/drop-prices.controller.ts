import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { type DropPriceBody, dropPriceBody, uuidLike } from './drop-prices.dto'
import { DropPricesRepository } from './drop-prices.repository'

/** 드롭 판매가 둘. 신원이 있어야 하고, 4xx 는 본문이 틀릴 때만이다. */
@Controller()
@UseGuards(IdentityGuard)
export class DropPricesController {
  constructor(private readonly prices: DropPricesRepository) {}

  /** 한 건을 적는다. 같은 값을 다시 보내도 줄이 안 늘고 200 이다. */
  @Post('v1/drop-prices')
  @HttpCode(200)
  async upsert(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(dropPriceBody)) body: DropPriceBody,
  ): Promise<{ ok: true }> {
    await this.prices.upsert({
      userId: identity.userId,
      identifiedBy: identity.source,
      dropRecordId: body.dropRecordId,
      itemKey: body.itemKey,
      priceMeso: body.priceMeso,
      periodKey: body.periodKey,
      worldKey: body.worldKey ?? null,
      ringLevel: body.ringLevel ?? null,
      slot: body.slot ?? null,
    })
    return { ok: true }
  }

  /** 그 기록의 가격을 뺀다. 줄은 남고 deleted_at 만 찬다. 없어도 204 다. */
  @Delete('v1/drop-prices/:dropRecordId')
  @HttpCode(204)
  async remove(
    @CurrentIdentity() identity: IdentityContext,
    @Param('dropRecordId', new ZodValidationPipe(uuidLike)) dropRecordId: string,
  ): Promise<void> {
    await this.prices.markDeleted(identity.userId, dropRecordId)
  }
}
