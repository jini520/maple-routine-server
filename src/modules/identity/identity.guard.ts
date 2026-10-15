import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import { sha256 } from '../../common/hash'
import { bearerOf } from '../auth/session.guard'
import { SessionsRepository } from '../auth/sessions.repository'
import { UsersRepository } from '../users/users.repository'

/** 어느 헤더로 사람을 찾았나. key 는 증명이 없어 줄마다 남겨 집계 때 가른다. */
export type IdentitySource = 'login' | 'key'

export interface IdentityContext {
  userId: string
  source: IdentitySource
}

export type IdentityRequest = FastifyRequest & { identity?: IdentityContext }

export const API_KEY_HASH_HEADER = 'x-api-key-hash'
/** 앱이 만든 SHA-256 의 소문자 16진. 키 원문이 실려 오면 길이가 안 맞아 여기서 걸린다. */
const API_KEY_HASH = /^[0-9a-f]{64}$/

/**
 * 쓰기 경로의 신원. Authorization: Bearer <세션> 아니면 x-api-key-hash 다.
 *
 * 세션이 왔으면 키는 안 읽는다. 죽은 세션도 키로 안 넘어가고 401 이다. 넘어가면 같은 사람의 기록이
 * 두 열쇠로 갈라진다. 세션은 수명만 보고 넥슨을 안 부른다.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IdentityRequest>()
    const bearer = bearerOf(request)
    if (bearer !== null) {
      const row = await this.sessions.findByHash(sha256(bearer))
      if (row === null) throw new UnauthorizedException()
      request.identity = { userId: row.userId, source: 'login' }
      return true
    }
    const header = request.headers[API_KEY_HASH_HEADER]
    if (typeof header !== 'string' || !API_KEY_HASH.test(header)) throw new UnauthorizedException()
    const { id } = await this.users.upsertByApiKeyHash(sha256(header))
    request.identity = { userId: id, source: 'key' }
    return true
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
