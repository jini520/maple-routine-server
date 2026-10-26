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
import { NoWorld } from '../drop-prices/drop-prices.repository'
import { uuidLike } from '../drop-prices/drop-prices.dto'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { type BossClearBody, bossClearBody } from './boss-clears.dto'
import { BossClearsRepository } from './boss-clears.repository'

const reasonOf = (error: unknown) =>
  error instanceof NoWorld ? `모르는 월드 key 다: ${error.message}` : null

/**
 * 보스 처치 기간 기록. 드롭 가격과 같은 규칙이다. 신원이 있어야 하고, 보스 · 난이도는 표의 줄로 바꿔 적되 못 찾으면 NULL,
 * 모르는 월드는 400 이다. DELETE 는 기기에서 처치가 사라진 때다.
 */
@Controller()
@UseGuards(IdentityGuard)
export class BossClearsController {
  constructor(
    private readonly clears: BossClearsRepository,
    private readonly bosses: BossesRepository,
  ) {}

  /** 한 건을 적는다. 같은 값을 다시 보내도 줄이 안 늘고 200 이다. */
  @Post('v1/boss-clears')
  @HttpCode(200)
  async upsert(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(bossClearBody)) body: BossClearBody,
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
  @Post('v1/boss-clears/batch')
  @HttpCode(200)
  async batch(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(batchBody)) body: BatchBody,
  ): Promise<{ results: BatchResult[] }> {
    const results = await eachInBatch(
      body.items,
      bossClearBody,
      (raw) => recordIdOf(raw, 'periodRecordId'),
      (item) => this.save(identity, item),
      reasonOf,
    )
    return { results }
  }

  /** 기기에서 그 처치가 사라졌다. 줄은 남고 지운 시각이 적힌다. 없어도 204 다. */
  @Delete('v1/boss-clears/:periodRecordId')
  @HttpCode(204)
  async remove(
    @CurrentIdentity() identity: IdentityContext,
    @Param('periodRecordId', new ZodValidationPipe(uuidLike)) periodRecordId: string,
  ): Promise<void> {
    await this.clears.markDeleted(identity.userId, periodRecordId)
  }

  private async save(identity: IdentityContext, body: BossClearBody): Promise<void> {
    const difficulty = await this.bosses.findDifficulty(body.boss, body.difficulty)
    await this.clears.upsert({
      userId: identity.userId,
      identifiedBy: identity.source,
      periodRecordId: body.periodRecordId,
      ocid: body.ocid,
      bossDifficultyId: difficulty?.id ?? null,
      cycle: body.cycle,
      periodKey: body.periodKey,
      worldKey: body.worldKey ?? null,
      priceMeso: body.priceMeso,
      payoutMeso: body.payoutMeso,
      splitMode: body.splitMode,
      partySize: body.partySize,
      myShare: body.myShare ?? null,
      sharesTotal: body.sharesTotal ?? null,
      splitFeePercent: body.splitFeePercent ?? null,
      defeatedDate: body.defeatedDate ?? null,
      source: body.source,
    })
  }
}
