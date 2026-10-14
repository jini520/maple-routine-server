import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import { sha256 } from '../../common/hash'
import type { Platform } from './attempts.repository'
import { SessionsRepository } from './sessions.repository'

/** 가드가 요청에 싣는 것. 신원 확인만 했고 넥슨 토큰은 안 건드렸다. */
export interface SessionContext {
  id: string
  userId: string
  platform: Platform
}

export type SessionRequest = FastifyRequest & { session?: SessionContext }

/**
 * Authorization: Bearer <세션> 으로 사람을 가린다.
 *
 * 해시로 행을 찾아 수명만 본다. 넥슨을 부르지 않는다. 토큰이 필요한 경로만 TokenService 를 따로 부른다.
 * 신원 확인과 갱신을 한 자리에 묶으면 토큰을 안 쓰는 경로가 갱신을 일으킨다.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>()
    const value = bearerOf(request)
    if (value === null) throw new UnauthorizedException()
    const row = await this.sessions.findByHash(sha256(value))
    if (row === null) throw new UnauthorizedException()
    request.session = { id: row.id, userId: row.userId, platform: row.platform }
    return true
  }
}

/** Authorization 헤더의 Bearer 값. 없거나 모양이 다르면 null. */
export function bearerOf(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null
  const value = header.slice('Bearer '.length).trim()
  return value.length > 0 ? value : null
}

/**
 * 가드가 실은 세션을 핸들러 인자로 받는다.
 *
 * @example logout(@CurrentSession() session: SessionContext)
 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionContext => {
    const request = context.switchToHttp().getRequest<SessionRequest>()
    if (request.session === undefined) throw new UnauthorizedException()
    return request.session
  },
)
