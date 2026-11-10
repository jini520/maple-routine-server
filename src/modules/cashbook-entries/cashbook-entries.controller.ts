import {
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
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { uuidLike } from '../drop-prices/drop-prices.dto'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from '../identity/identity.guard'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import { type CashbookEntryBody, cashbookEntryBody } from './cashbook-entries.dto'
import { CashbookEntriesRepository } from './cashbook-entries.repository'

/**
 * 가계부 기록. 신원이 있어야 하고, key 는 글자 그대로 받아 표에 없는 key 도 거절하지 않는다. DELETE 는 기기에서 기록이
 * 사라진 때다.
 */
@Controller()
@UseGuards(IdentityGuard)
export class CashbookEntriesController {
  constructor(private readonly entries: CashbookEntriesRepository) {}

  /** 한 건과 품목을 적는다. 같은 값을 다시 보내도 줄이 안 늘고 200 이다. */
  @Post('v1/cashbook-entries')
  @HttpCode(200)
  async upsert(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(cashbookEntryBody)) body: CashbookEntryBody,
  ): Promise<{ ok: true }> {
    try {
      await this.save(identity, body)
    } catch (error) {
      if (error instanceof MapleIdNotOwned)
        throw new ConflictException({ code: 'maple_id_not_registered' })
      throw error
    }
    return { ok: true }
  }

  /** 과거 기록 묶음. 건마다 결과를 돌려주고 받을 수 있는 건은 받는다. */
  @Post('v1/cashbook-entries/batch')
  @HttpCode(200)
  async batch(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(batchBody)) body: BatchBody,
  ): Promise<{ results: BatchResult[] }> {
    const results = await eachInBatch(
      body.items,
      cashbookEntryBody,
      (raw) => recordIdOf(raw, 'entryRecordId'),
      (item) => this.save(identity, item),
      (error) =>
        error instanceof MapleIdNotOwned ? `이 계정의 메이플 ID 가 아니다: ${error.message}` : null,
    )
    return { results }
  }

  /** 기기에서 그 기록이 사라졌다. 줄은 남고 지운 시각이 적힌다. 없어도 204 다. */
  @Delete('v1/cashbook-entries/:entryRecordId')
  @HttpCode(204)
  async remove(
    @CurrentIdentity() identity: IdentityContext,
    @Param('entryRecordId', new ZodValidationPipe(uuidLike)) entryRecordId: string,
  ): Promise<void> {
    await this.entries.markDeleted(identity, entryRecordId)
  }

  private save(identity: IdentityContext, body: CashbookEntryBody): Promise<void> {
    return this.entries.upsert({
      ...body,
      nexonAccountId: identity.nexonAccountId,
      identifiedBy: identity.source,
      ocid: body.ocid ?? null,
    })
  }
}
