import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { BossesRepository } from '../bosses/bosses.repository'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { type DropPriceBody, dropPriceBody, uuidLike } from './drop-prices.dto'
import { DropPricesRepository, NoDropItem, NoWorld } from './drop-prices.repository'

/** 드롭 판매가 둘. 신원이 있어야 하고, 4xx 는 본문이 틀릴 때만이다. 표에 없는 아이템 · 월드 key 도 틀린 본문이다. */
@Controller()
@UseGuards(IdentityGuard)
export class DropPricesController {
  constructor(
    private readonly prices: DropPricesRepository,
    private readonly bosses: BossesRepository,
  ) {}

  /**
   * 한 건을 적는다. 같은 값을 다시 보내도 줄이 안 늘고 200 이다. 보스 · 난이도는 표의 줄로 바꿔 적고 못 찾으면 NULL 이다.
   * 아이템 · 월드도 표의 줄로 바꿔 적는데 못 찾으면 400 이다. 앱은 서버 표를 받아 쓰므로 모르는 key 는 틀린 본문이다.
   */
  @Post('v1/drop-prices')
  @HttpCode(200)
  async upsert(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(dropPriceBody)) body: DropPriceBody,
  ): Promise<{ ok: true }> {
    const difficultyRow =
      body.boss != null && body.difficulty != null
        ? await this.bosses.findDifficulty(body.boss, body.difficulty)
        : null
    try {
      await this.prices.upsert({
        userId: identity.userId,
        identifiedBy: identity.source,
        dropRecordId: body.dropRecordId,
        itemKey: body.itemKey,
        priceMeso: body.priceMeso,
        periodKey: body.periodKey,
        worldKey: body.worldKey ?? null,
        ringLevel: body.ringLevel ?? null,
        bossDifficultyId: difficultyRow?.id ?? null,
      })
    } catch (error) {
      if (error instanceof NoDropItem)
        throw new BadRequestException(`모르는 아이템 key 다: ${error.message}`)
      if (error instanceof NoWorld)
        throw new BadRequestException(`모르는 월드 key 다: ${error.message}`)
      throw error
    }
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
