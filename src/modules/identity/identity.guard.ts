import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'

import { ERROR_CODES } from '../../common/error-codes'
import { sha256 } from '../../common/hash'
import { bearerOf } from '../auth/session.guard'
import { SessionsRepository } from '../auth/sessions.repository'
import { UsersRepository } from '../users/users.repository'

/** 어느 헤더로 사람을 찾았나. key 는 로그인 없이 쓰는 키의 메이플 ID 해시라 증명이 없어 줄마다 남겨 집계 때 가른다. */
export type IdentitySource = 'login' | 'key'

export interface IdentityContext {
  userId: string
  source: IdentitySource
  /** 이 신원의 넥슨 계정(nexon_accounts.id). 세션이면 그 사람의 로그인 계정, 메이플 ID 해시면 그 메이플 ID 가 달린 계정이다. */
  nexonAccountId: string
}

export type IdentityRequest = FastifyRequest & { identity?: IdentityContext }

/** 로그인 없이 키로 쓰는 사람의 메이플 ID 해시. 키는 다시 받으면 바뀌지만 메이플 ID 는 안 바뀐다. */
export const MAPLE_ID_HASH_HEADER = 'x-maple-id-hash'
/** 앱이 만든 SHA-256 의 소문자 16진. 원문이 실려 오면 길이가 안 맞아 여기서 걸린다. */
export const HEX_SHA256 = /^[0-9a-f]{64}$/

export const ALLOW_DELETION_PENDING = 'identity:allow-deletion-pending'

/** 삭제를 예약한 사람도 지나는 경로. 예약을 묻고 취소하는 경로만 단다. */
export const AllowDeletionPending = () => SetMetadata(ALLOW_DELETION_PENDING, true)

/**
 * 쓰기 경로의 신원. Authorization: Bearer <세션> 아니면 x-maple-id-hash 다. 키 해시는 1.0.14 까지의 앱만 보내고 1.0.15 서버는
 * 받지 않는다.
 *
 * 세션이 왔으면 메이플 ID 해시는 안 읽는다. 죽은 세션도 그쪽으로 안 넘어가고 401 이다. 넘어가면 같은 사람의 기록이
 * 두 열쇠로 갈라진다. 세션은 수명만 보고 넥슨을 안 부르고, 마지막으로 쓴 시각을 고친다.
 *
 * 삭제를 예약한 사람은 403(`account_deletion_pending`)이다. 지울 사람에게 새 기록이 붙으면 30일 뒤 익명 표본에 섞여 남는다.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.identify(context)
    const request = context.switchToHttp().getRequest<IdentityRequest>()
    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_DELETION_PENDING, [
      context.getHandler(),
      context.getClass(),
    ])
    if (
      allowed !== true &&
      (await this.users.deletionRequestedAt(request.identity!.userId)) != null
    ) {
      throw new ForbiddenException({ code: ERROR_CODES.accountDeletionPending })
    }
    return true
  }

  private async identify(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<IdentityRequest>()
    const bearer = bearerOf(request)
    if (bearer !== null) {
      const row = await this.sessions.findByHash(sha256(bearer))
      if (row === null) throw new UnauthorizedException()
      const account = await this.users.findLoginAccount(row.userId)
      // 세션은 로그인 콜백이 로그인 계정 줄을 만든 뒤에만 생긴다. 줄이 없으면 이 세션으로 적을 넥슨 계정이 없다.
      if (account === null) throw new UnauthorizedException()
      await this.sessions.touch(row.id)
      request.identity = {
        userId: row.userId,
        source: 'login',
        nexonAccountId: account.nexonAccountId,
      }
      return
    }
    const header = request.headers[MAPLE_ID_HASH_HEADER]
    if (typeof header !== 'string' || !HEX_SHA256.test(header)) throw new UnauthorizedException()
    const found = await this.users.upsertByMapleId(header)
    request.identity = { userId: found.id, source: 'key', nexonAccountId: found.nexonAccountId }
  }
}

/**
 * 가드가 실은 신원을 핸들러 인자로 받는다.
 *
 * @example upsert(@CurrentIdentity() identity: IdentityContext)
 */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IdentityContext => {
    const request = context.switchToHttp().getRequest<IdentityRequest>()
    if (request.identity === undefined) throw new UnauthorizedException()
    return request.identity
  },
)
