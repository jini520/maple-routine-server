import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common'

import { sha256 } from '../../common/hash'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { NexonAccountsRepository } from '../users/nexon-accounts.repository'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from './identity.guard'
import { type SubAccountBody, subAccountBody } from './me.dto'

/** 세션의 로그인 계정. 키 사용자에게는 부계정이 없고, 어느 로그인에 붙일지는 세션이 정한다. */
function loginAccountOf(identity: IdentityContext): string {
  if (identity.source !== 'login') throw new ForbiddenException({ code: 'login_required' })
  return identity.nexonAccountId
}

/**
 * 넥슨 로그인의 부계정 등록. 서버는 어느 키가 그 사람의 부계정인지만 적고, 키 값은 보관하지 않는다.
 *
 * 목록 · 지우기 경로는 없다. 앱이 부계정을 기기마다 따로 관리해 서버의 목록을 받지도, 서버에서 지우지도 않는다.
 */
@Controller('v1/me/sub-accounts')
@UseGuards(IdentityGuard)
export class SubAccountsController {
  constructor(private readonly accounts: NexonAccountsRepository) {}

  /** 같은 넥슨 ID 면 409 `same_account` 다. */
  @Post()
  @HttpCode(204)
  async register(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(subAccountBody)) body: SubAccountBody,
  ): Promise<void> {
    const result = await this.accounts.registerSubAccount(
      loginAccountOf(identity),
      sha256(body.apiKeyHash),
      body.mapleIds,
    )
    if (result === 'same_account') throw new ConflictException({ code: 'same_account' })
  }
}
