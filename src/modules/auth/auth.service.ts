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

/**
 * iOS · Android 가 돌아오는 커스텀 스킴. iOS 는 인증 세션이 이것을 연 앱에만 돌려주므로 값을 실어도 안전하다.
 * 안드로이드는 다른 앱이 가로챌 수 있지만 receipt 만으로는 세션을 못 받으므로(redeem_key 가 둘째 열쇠) 그 로그인이 실패할 뿐이다.
 */
const SCHEME_RETURN = 'com.mapleroutine.app://oauth/callback'
/** 넥슨이 돌아오는 자리. iOS · Android 애플리케이션에 같은 주소를 등록한다. 웹은 `WEB_REDIRECT_URI` 가 있으면 그것이다. */
const CALLBACK_PATH = '/v1/auth/nexon/callback'
/**
 * 웹에서 시작한 짝의 state 머리. api 콜백을 받는 nginx 가 이 머리로 웹 로그인을 이 서버에 넘긴다. 바꾸면 nginx 규칙도 같이 바꾼다.
 */
export const WEB_STATE_PREFIX = 'web.'

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
  /** 넥슨 동의 화면의 `취소` 는 state · code 없이 이것 하나로 온다(`user_cancel_consent`). */
  error_name?: string
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
    // 돌아갈 웹 주소가 없으면 넥슨 화면을 다 거친 뒤에 갈 곳이 없다. 짝을 만들기 전에 멈춘다.
    if (platform === 'web' && !this.webReturnUrl()) throw new Error('WEB_RETURN_URL 이 없다')
    const state = platform === 'web' ? `${WEB_STATE_PREFIX}${randomToken()}` : randomToken()
    const redeemKey = randomToken()
    await this.attempts.create({
      state,
      redeemHash: sha256(redeemKey),
      platform,
      expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
    })
    return {
      authorizeUrl: this.nexon.authorizeUrl(platform, state, this.redirectUri(platform)),
      redeemKey,
    }
  }

  /**
   * 넥슨이 부르는 콜백. 무슨 일이 있어도 돌아갈 주소를 돌려준다. 던지면 사용자가 브라우저 에러
   * 화면에 갇히고 앱으로 못 돌아온다.
   */
  async callback(query: CallbackQuery): Promise<string> {
    // 웹이 시작했는지는 state 머리로 안다. 짝을 못 찾아도 웹 사용자를 앱 스킴으로 보내지 않기 위해서다.
    // state 가 없는 동의 취소는 어디서 시작했는지 알 수 없어 앱 스킴으로 간다.
    const web = query.state?.startsWith(WEB_STATE_PREFIX) === true
    // receipt 없이 돌아갈 때는 넥슨이 보낸 error_name 을 싣는다. 앱이 이것으로 취소와 실패를 가른다.
    const back = this.returnUrl(web, { errorName: query.error_name })
    if (!query.state) return back
    const claimed = await this.attempts.claim(query.state)
    if (claimed === null) return back
    const { id, platform } = claimed

    if (!query.code) {
      // code 없이는 교환할 수 없다. 동의 취소는 state 없이 오므로 여기가 아니라 위에서 끝난다.
      await this.attempts.delete(id)
      return back
    }

    let sessionId: string | undefined
    try {
      const tokens = await this.nexon.exchange(platform, query.code, this.redirectUri(platform))
      const { uid } = await this.nexon.userinfo(tokens.accessToken)
      const user = await this.users.upsertByNexonUid(uid)

      const sessionValue = randomToken()
      const now = Date.now()
      ;({ id: sessionId } = await this.sessions.create({
        hash: sha256(sessionValue),
        userId: user.id,
        platform,
        sealedAccessToken: this.seal.seal('access', tokens.accessToken),
        accessExpiresAt: new Date(now + tokens.expiresIn * 1000),
        sealedRefreshToken: this.seal.seal('refresh', tokens.refreshToken),
        refreshExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
      }))

      const receipt = randomToken()
      await this.attempts.seal(id, {
        receiptHash: sha256(receipt),
        sessionSealed: this.seal.seal('session', sessionValue),
        sessionId,
      })
      return this.returnUrl(platform === 'web', { receipt })
    } catch (error) {
      this.logger.warn(`콜백이 실패했다: ${String(error)}`)
      // 실패한 짝에 봉한 것이 남을 일이 없게 행을 지운다. 세션까지 만들었으면 그것도 고아라 지운다.
      await this.attempts.delete(id).catch(() => undefined)
      if (sessionId !== undefined) await this.sessions.delete(sessionId).catch(() => undefined)
      return back
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

  /** 교환에도 authorize 때와 같은 값을 실어야 넥슨이 받는다. */
  private redirectUri(platform: Platform): string {
    const web =
      platform === 'web' ? this.config.get('WEB_REDIRECT_URI', { infer: true }) : undefined
    return web || `${this.config.get('PUBLIC_BASE_URL', { infer: true })}${CALLBACK_PATH}`
  }

  private webReturnUrl(): string | undefined {
    return this.config.get('WEB_RETURN_URL', { infer: true }) || undefined
  }

  private returnUrl(web: boolean, params: { receipt?: string; errorName?: string }): string {
    const base = (web ? this.webReturnUrl() : undefined) ?? SCHEME_RETURN
    if (params.receipt !== undefined) return `${base}?receipt=${encodeURIComponent(params.receipt)}`
    if (params.errorName) return `${base}?error_name=${encodeURIComponent(params.errorName)}`
    return base
  }
}
