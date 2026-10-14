import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { NexonOpenIdClient } from '../../clients/nexon-open-id.client'
import { randomToken, sha256 } from '../../common/hash'
import type { Env } from '../../config/env.schema'
import { UsersRepository } from '../users/users.repository'
import { AttemptsRepository, type Platform } from './attempts.repository'
import { SealService } from './seal.service'
import { SessionsRepository } from './sessions.repository'

/** 사용자가 넥슨 화면에서 쓰는 시간. 이 안에 콜백이 안 오면 짝은 죽는다. */
const ATTEMPT_TTL_MS = 10 * 60_000

/** 앱이 등록한 커스텀 스킴. iOS 는 인증 세션이 이것을 연 앱에만 돌려주므로 값을 실어도 안전하다. */
const SCHEME_RETURN = 'com.mapleroutine.app://oauth/callback'
/** 넥슨이 돌아오는 자리. 넥슨 애플리케이션 둘에 같은 주소를 등록한다. */
const CALLBACK_PATH = '/v1/auth/nexon/callback'
/** 안드로이드가 돌아오는 길. 서명을 확인한 앱만 이 주소를 열도록 App Link 로 건다. */
const ANDROID_RETURN_PATH = '/app/oauth/return'

export type RedeemResult =
  | { status: 'ok'; session: string }
  /** 콜백이 넥슨과 왕복하는 중이다. 앱은 잠시 뒤 다시 묻는다. */
  | { status: 'pending' }
  /** 사용자가 넥슨 화면을 닫았다. 아무 일도 안 일어났다. */
  | { status: 'cancelled' }
  /** 만료 · 실패 · 이미 가져감. 다시 로그인하는 수밖에 없다. */
  | { status: 'gone' }

export interface CallbackQuery {
  code?: string
  state?: string
  error?: string
}

/**
 * 넥슨 로그인 한 번. 시작 · 콜백 · 되묻기 · 로그아웃.
 *
 * 열쇠가 둘이다. redeemKey 는 이 짝을 내가 시작했다는 증명이고 https 로만 앱에 간다. receipt 는
 * 넥슨에 로그인한 그 기기가 나라는 증명이고 콜백이 만들어 돌아오는 길로만 보낸다. 되묻기가 둘 다
 * 요구하므로 한쪽만 가진 누구도 세션을 못 받는다.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly attempts: AttemptsRepository,
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
    private readonly seal: SealService,
    private readonly nexon: NexonOpenIdClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async start(platform: Platform): Promise<{ authorizeUrl: string; redeemKey: string }> {
    const state = randomToken()
    const redeemKey = randomToken()
    await this.attempts.create({
      state,
      redeemHash: sha256(redeemKey),
      platform,
      expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
    })
    return { authorizeUrl: this.nexon.authorizeUrl(platform, state, this.redirectUri()), redeemKey }
  }

  /**
   * 넥슨이 부르는 콜백. 무슨 일이 있어도 돌아갈 주소를 돌려준다. 던지면 사용자가 브라우저 에러
   * 화면에 갇히고 앱으로 못 돌아온다.
   */
  async callback(query: CallbackQuery): Promise<string> {
    if (!query.state) return SCHEME_RETURN
    const claimed = await this.attempts.claim(query.state)
    if (claimed === null) return SCHEME_RETURN
    const { id, platform } = claimed

    if (!query.code) {
      // 넥슨이 동의를 거절로 끝냈다. code 가 올 자리에 error 가 온다.
      await this.attempts.delete(id)
      return this.returnUrl(platform)
    }

    let sessionId: string | undefined
    try {
      const tokens = await this.nexon.exchange(platform, query.code, this.redirectUri())
      const { uid } = await this.nexon.userinfo(tokens.accessToken)
      const user = await this.users.upsertByNexonUid(uid)

      const sessionValue = randomToken()
      const now = Date.now()
      ;({ id: sessionId } = await this.sessions.create({
        sessionHash: sha256(sessionValue),
        userId: user.id,
        platform,
        accessSealed: this.seal.seal('access', tokens.accessToken),
        accessExpiresAt: new Date(now + tokens.expiresIn * 1000),
        refreshSealed: this.seal.seal('refresh', tokens.refreshToken),
        refreshExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
      }))

      const receipt = randomToken()
      await this.attempts.seal(id, {
        receiptHash: sha256(receipt),
        sessionSealed: this.seal.seal('session', sessionValue),
        sessionId,
      })
      return this.returnUrl(platform, receipt)
    } catch (error) {
      this.logger.warn(`콜백이 실패했다: ${String(error)}`)
      // 실패한 짝에 봉한 것이 남을 일이 없게 행을 지운다. 세션까지 만들었으면 그것도 고아라 지운다.
      await this.attempts.delete(id).catch(() => undefined)
      if (sessionId !== undefined) await this.sessions.delete(sessionId).catch(() => undefined)
      return this.returnUrl(platform)
    }
  }

  async redeem(redeemKey: string, receipt: string): Promise<RedeemResult> {
    const sealed = await this.attempts.redeem(sha256(redeemKey), sha256(receipt))
    if (sealed !== null) return { status: 'ok', session: this.seal.open('session', sealed) }

    const stage = await this.attempts.peek(sha256(redeemKey))
    if (stage === null) return { status: 'gone' }
    if (stage.claimedAt === null) return { status: 'cancelled' }
    if (stage.sealedAt === null) return { status: 'pending' }
    return { status: 'gone' }
  }

  async logout(sessionValue: string): Promise<void> {
    await this.sessions.deleteByHash(sha256(sessionValue))
  }

  private redirectUri(): string {
    return `${this.config.get('PUBLIC_BASE_URL', { infer: true })}${CALLBACK_PATH}`
  }

  private returnUrl(platform: Platform, receipt?: string): string {
    const base =
      platform === 'android'
        ? `${this.config.get('PUBLIC_BASE_URL', { infer: true })}${ANDROID_RETURN_PATH}`
        : SCHEME_RETURN
    return receipt === undefined ? base : `${base}?receipt=${encodeURIComponent(receipt)}`
  }
}
