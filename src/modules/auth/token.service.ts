import { Injectable } from '@nestjs/common'

import { NexonOpenIdClient, NexonTokenRejected } from '../../clients/nexon-open-id.client'
import { SealService } from './seal.service'
import { SessionsRepository } from './sessions.repository'

/** 세션이 없거나 갱신 토큰이 죽었다. 앱은 다시 로그인하는 수밖에 없다. */
export class ReloginRequired extends Error {}

/** 이보다 적게 남았으면 미리 갱신한다. 회차 도중에 만료되는 일을 막는 여유다. */
const REFRESH_AHEAD_MS = 60_000

/**
 * 쓸 수 있는 액세스 토큰을 내는 유일한 자리.
 *
 * 세션별로 한 번에 하나만 갱신한다. 같은 갱신 토큰으로 둘이 동시에 나가면 넥슨은 하나만 받고
 * 다른 하나를 죽은 토큰으로 거절하므로, 경합을 여기서 없애면 거절은 정말 죽은 토큰뿐이다.
 * 그래서 거절되면 세션을 지워도 된다.
 */
@Injectable()
export class TokenService {
  private readonly inflight = new Map<string, Promise<string>>()

  constructor(
    private readonly sessions: SessionsRepository,
    private readonly seal: SealService,
    private readonly nexon: NexonOpenIdClient,
  ) {}

  tokenFor(sessionId: string): Promise<string> {
    const running = this.inflight.get(sessionId)
    if (running) return running
    const task = this.resolve(sessionId).finally(() => this.inflight.delete(sessionId))
    this.inflight.set(sessionId, task)
    return task
  }

  private async resolve(sessionId: string): Promise<string> {
    const session = await this.sessions.findById(sessionId)
    if (session === null) throw new ReloginRequired('세션이 없다')
    if (session.accessExpiresAt.getTime() - Date.now() > REFRESH_AHEAD_MS) {
      return this.seal.open('access', session.accessSealed)
    }

    let tokens
    try {
      tokens = await this.nexon.refresh(
        session.platform,
        this.seal.open('refresh', session.refreshSealed),
      )
    } catch (error) {
      if (error instanceof NexonTokenRejected) {
        await this.sessions.delete(sessionId)
        throw new ReloginRequired('갱신 토큰이 죽었다')
      }
      throw error
    }

    const now = Date.now()
    await this.sessions.updateTokens(sessionId, {
      accessSealed: this.seal.seal('access', tokens.accessToken),
      accessExpiresAt: new Date(now + tokens.expiresIn * 1000),
      refreshSealed: this.seal.seal('refresh', tokens.refreshToken),
      refreshExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
    })
    return tokens.accessToken
  }
}
