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

import {
  type BatchBody,
  type BatchResult,
  batchBody,
  eachInBatch,
  recordIdOf,
} from '../../common/batch'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { BossesRepository } from '../bosses/bosses.repository'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { type DropPriceBody, dropPriceBody, uuidLike } from './drop-prices.dto'
import { DropPricesRepository, NoDropItem, NoWorld } from './drop-prices.repository'

function reasonOf(error: unknown): string | null {
  if (error instanceof NoDropItem) return `모르는 아이템 key 다: ${error.message}`
  if (error instanceof NoWorld) return `모르는 월드 key 다: ${error.message}`
  return null
}

/**
 * 드롭 가격 기록 둘. 신원이 있어야 하고, 4xx 는 본문이 틀릴 때만이다. 표에 없는 아이템 · 월드 key 도 틀린 본문이다.
 * 가격이 없는 기록(pending · skipped)도 줄이 되고, DELETE 는 기기에서 기록이 사라진 때다.
 */
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
    try {
      await this.save(identity, body)
    } catch (error) {
      const reason = reasonOf(error)
      if (reason !== null) throw new BadRequestException(reason)
      throw error
    }
    return { ok: true }
  }

  /** 과거 기록 묶음. 건마다 결과를 돌려주고 받을 수 있는 건은 받는다. */
  @Post('v1/drop-prices/batch')
  @HttpCode(200)
  async batch(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(batchBody)) body: BatchBody,
  ): Promise<{ results: BatchResult[] }> {
    const results = await eachInBatch(
      body.items,
      dropPriceBody,
      (raw) => recordIdOf(raw, 'dropRecordId'),
      (item) => this.save(identity, item),
      reasonOf,
    )
    return { results }
  }

  /** 기기에서 그 기록이 사라졌다. 줄은 남고 deleted 로 표시되며 가격이 비워진다. 없어도 204 다. */
  @Delete('v1/drop-prices/:dropRecordId')
  @HttpCode(204)
  async remove(
    @CurrentIdentity() identity: IdentityContext,
    @Param('dropRecordId', new ZodValidationPipe(uuidLike)) dropRecordId: string,
  ): Promise<void> {
    await this.prices.markDeleted(identity.userId, dropRecordId)
  }

  private async save(identity: IdentityContext, body: DropPriceBody): Promise<void> {
    const difficultyRow =
      body.boss != null && body.difficulty != null
        ? await this.bosses.findDifficulty(body.boss, body.difficulty)
        : null
    await this.prices.upsert({
      userId: identity.userId,
      identifiedBy: identity.source,
      dropRecordId: body.dropRecordId,
      itemKey: body.itemKey,
      priceMeso: body.priceMeso ?? null,
      periodKey: body.periodKey,
      worldKey: body.worldKey ?? null,
      ringLevel: body.ringLevel ?? null,
      bossDifficultyId: difficultyRow?.id ?? null,
      periodRecordId: body.periodRecordId ?? null,
      recordStatus: body.status,
      pricedAt: body.pricedAt == null ? null : new Date(body.pricedAt),
    })
  }
}
