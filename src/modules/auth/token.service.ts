import { Injectable } from '@nestjs/common'

import { NexonOpenIdClient, NexonTokenRejected } from '../../clients/nexon-open-id.client'
import { SealError, SealService } from './seal.service'
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

  /**
   * 이 세션의 토큰을 쓸 수 없다. 갱신 거절 · 데이터 조회의 거절(동의 철회) · 열 수 없는 봉인이 함께 쓰는 유일한 삭제 자리.
   * 다음 tokenFor 는 ReloginRequired 다.
   */
  async rejected(sessionId: string): Promise<void> {
    await this.sessions.delete(sessionId)
  }

  /**
   * 봉한 토큰을 연다. 세션 암호 키가 봉한 때의 키와 다르면 열리지 않고, 그 세션으로는 넥슨을 부를 수 없어 세션을 지운다.
   * 그대로 던지면 프렌즈 조회가 500 이 되어 앱이 다시 로그인하라고 하지 않는다.
   */
  private async open(
    sessionId: string,
    purpose: 'access' | 'refresh',
    blob: Buffer,
  ): Promise<string> {
    try {
      return this.seal.open(purpose, blob)
    } catch (error) {
      if (!(error instanceof SealError)) throw error
      await this.rejected(sessionId)
      throw new ReloginRequired('봉한 토큰을 열 수 없다')
    }
  }

  private async resolve(sessionId: string): Promise<string> {
    const session = await this.sessions.findById(sessionId)
    if (session === null) throw new ReloginRequired('세션이 없다')
    if (session.accessExpiresAt.getTime() - Date.now() > REFRESH_AHEAD_MS) {
      return this.open(sessionId, 'access', session.sealedAccessToken)
    }

    const refreshToken = await this.open(sessionId, 'refresh', session.sealedRefreshToken)
    let tokens
    try {
      tokens = await this.nexon.refresh(session.platform, refreshToken)
    } catch (error) {
      if (error instanceof NexonTokenRejected) {
        await this.rejected(sessionId)
        throw new ReloginRequired('갱신 토큰이 죽었다')
      }
      throw error
    }

    const now = Date.now()
    await this.sessions.updateTokens(sessionId, {
      sealedAccessToken: this.seal.seal('access', tokens.accessToken),
      accessExpiresAt: new Date(now + tokens.expiresIn * 1000),
      sealedRefreshToken: this.seal.seal('refresh', tokens.refreshToken),
      refreshExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
    })
    return tokens.accessToken
  }
}
