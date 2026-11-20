import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common'

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
 * 넥슨 로그인의 부계정 등록과 해제. 부계정은 메이플 ID 로 찾는다. 키는 다시 받으면 바뀌고, 서버는 키 값을 보관하지 않는다.
 *
 * 목록 경로는 없다. 다른 기기에서 등록한 부계정은 기록 받기의 응답으로 알린다.
 */
@Controller('v1/me/sub-accounts')
@UseGuards(IdentityGuard)
export class SubAccountsController {
  constructor(private readonly accounts: NexonAccountsRepository) {}

  /** 거절은 409 이고 이유를 `code` 로 준다(`same_account` · `registered_elsewhere` · `has_sub_accounts` · `login_is_sub_account`). */
  @Post()
  @HttpCode(204)
  async register(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(subAccountBody)) body: SubAccountBody,
  ): Promise<void> {
    const result = await this.accounts.registerSubAccount(loginAccountOf(identity), body.mapleIds)
    if (result !== 'registered') throw new ConflictException({ code: result })
  }

  /** 등록이 없어도 204 다. 같은 해제를 여러 기기가 보낸다. */
  @Delete()
  @HttpCode(204)
  async unregister(
    @CurrentIdentity() identity: IdentityContext,
    @Body(new ZodValidationPipe(subAccountBody)) body: SubAccountBody,
  ): Promise<void> {
    await this.accounts.unregisterSubAccount(loginAccountOf(identity), body.mapleIds)
  }
}
