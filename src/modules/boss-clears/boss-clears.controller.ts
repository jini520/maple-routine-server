import {
  BadRequestException,
  Body,
  ConflictException,
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
import { isCheckViolation, isForeignKeyViolation } from '../../common/pg-errors'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { uuidLike } from '../../common/uuid-like'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import { type BossClearBody, bossClearBody } from './boss-clears.dto'
import {
  BossClearsRepository,
  NoBossDifficulty,
  PeriodCycleMismatch,
} from './boss-clears.repository'

function reasonOf(error: unknown): string | null {
  if (error instanceof NoBossDifficulty) return `모르는 난이도다: ${error.message}`
  if (error instanceof PeriodCycleMismatch) return `난이도의 주기와 다른 기간이다: ${error.message}`
  if (isCheckViolation(error)) return '함께 있을 수 없는 칸 값이다'
  if (isForeignKeyViolation(error)) return '모르는 월드다'
  if (error instanceof MapleIdNotOwned) return `이 계정의 메이플 ID 가 아니다: ${error.message}`
  return null
}

/**
 * 보스 수익 건 기록. 신원이 있어야 하고, 모르는 난이도 · 월드와 칸끼리 맞지 않는 값은 400 이다. DELETE 는 기기에서 그 기간 행이
 * 사라진 때다.
 */
@Controller()
@UseGuards(IdentityGuard)
export class BossClearsController {
  constructor(private readonly clears: BossClearsRepository) {}

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
      if (error instanceof MapleIdNotOwned)
        throw new ConflictException({ code: 'maple_id_not_registered' })
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
      (raw) => recordIdOf(raw, 'id'),
      (item) => this.save(identity, item),
      reasonOf,
    )
    return { results }
  }

  /** 기기에서 그 기간 행이 사라졌다. 줄은 남고 지운 시각이 적힌다. 없어도 204 다. */
  @Delete('v1/boss-clears/:id')
  @HttpCode(204)
  async remove(
    @CurrentIdentity() identity: IdentityContext,
    @Param('id', new ZodValidationPipe(uuidLike)) id: string,
  ): Promise<void> {
    await this.clears.markDeleted(identity, id)
  }

  private async save(identity: IdentityContext, body: BossClearBody): Promise<void> {
    await this.clears.upsert({ ...body, nexonAccountId: identity.nexonAccountId })
  }
}
