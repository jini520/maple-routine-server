import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'

import { sha256 } from '../../common/hash'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { NexonAccountsRepository, type SubAccountEntry } from '../users/nexon-accounts.repository'
import { CurrentIdentity, type IdentityContext, IdentityGuard } from './identity.guard'
import { mapleId, type SubAccountBody, subAccountBody } from './me.dto'

/** 세션의 로그인 계정. 키 사용자에게는 부계정이 없고, 어느 로그인에 붙일지는 세션이 정한다. */
function loginAccountOf(identity: IdentityContext): string {
  if (identity.source !== 'login') throw new ForbiddenException({ code: 'login_required' })
  return identity.nexonAccountId
}

/** 넥슨 로그인의 부계정 목록 · 등록 · 지우기. 서버는 키 값을 보관하지 않고 키 해시와 메이플 ID 만 든다. */
@Controller('v1/me/sub-accounts')
@UseGuards(IdentityGuard)
export class SubAccountsController {
  constructor(private readonly accounts: NexonAccountsRepository) {}

  @Get()
  async list(
    @CurrentIdentity() identity: IdentityContext,
  ): Promise<{ subAccounts: SubAccountEntry[] }> {
    return { subAccounts: await this.accounts.listSubAccounts(loginAccountOf(identity)) }
  }

  /** 같은 넥슨 ID 면 409 `same_account`, 부계정이 이미 넷이면 409 `sub_account_limit` 이다. */
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
    if (result === 'limit') throw new ConflictException({ code: 'sub_account_limit' })
  }

  @Delete(':mapleId')
  @HttpCode(204)
  async unregister(
    @CurrentIdentity() identity: IdentityContext,
    @Param('mapleId', new ZodValidationPipe(mapleId)) id: string,
  ): Promise<void> {
    await this.accounts.unregisterSubAccount(loginAccountOf(identity), id)
  }
}
