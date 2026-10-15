import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.schema'
import { errorNameOf } from './nexon-error'

export type Platform = 'ios' | 'android'

export interface NexonTokens {
  accessToken: string
  /** 초. 넥슨은 1800 을 준다. */
  expiresIn: number
  refreshToken: string
  /** 초. 넥슨은 1209600 을 준다. 갱신마다 새 refresh_token 이 오고 옛것은 즉시 죽는다. */
  refreshExpiresIn: number
}

/** 넥슨이 토큰이나 코드를 거절했다(OPENAPI00012). 죽은 갱신 토큰, 틀린 인가 코드가 여기다. */
export class NexonTokenRejected extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`넥슨이 거절했다 ${status}: ${body}`)
  }
}

/** 넥슨에 닿지 못했거나 넥슨 쪽이 고장났거나 우리 요청이 틀렸다(OPENAPI00004). 토큰의 문제가 아니다. */
export class NexonUnavailable extends Error {}

/** 그 플랫폼의 자격 쌍이 env 에 없다. */
export class NexonCredentialMissing extends Error {}

/**
 * 넥슨 Open ID 의 주소 셋. 개발 가이드(openapi.nexon.com/ko/open-id/development-guide)의 요청 URL 그대로다.
 * 가이드의 curl 예시는 token 을 /openid/oauth2/token 으로 적는데 둘 다 같은 답을 준다(2026-10-14 확인).
 */
const AUTHORIZE_URL = 'https://openid.nexon.com/oauth2/authorize'
const TOKEN_URL = 'https://openid.nexon.com/oauth2/token'
const USERINFO_URL = 'https://openid.nexon.com/oauth2/userinfo'

/** 넥슨이 답을 안 주면 이만큼 기다리고 끊는다. 매달린 호출 하나가 회차 슬롯을 영구히 쥐지 않게. */
const TIMEOUT_MS = 10_000

/** 죽은 토큰과 틀린 인가 코드의 에러 이름. 같은 400 이라도 OPENAPI00004 는 파라미터나 자격 쌍이 틀린 것이라 토큰 탓이 아니다. */
const TOKEN_REJECTED = 'OPENAPI00012'

interface TokenBody {
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_token_expires_in: number
}

/**
 * 플랫폼별 자격 쌍으로 부르는 넥슨 Open ID. 인가 코드 교환 · 토큰 갱신 · userinfo.
 *
 * 자격이 플랫폼마다 갈리는 것은 넥슨 애플리케이션을 iOS 와 Android 로 따로 등록하기 때문이다.
 * 갱신도 발급한 쌍으로 해야 넥슨이 받는다.
 */
@Injectable()
export class NexonOpenIdClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  authorizeUrl(platform: Platform, state: string, redirectUri: string): string {
    const { clientId } = this.credentials(platform)
    const scopes = this.config.get('NEXON_OPENID_SCOPES', { infer: true })
    if (!scopes) throw new NexonCredentialMissing('NEXON_OPENID_SCOPES 가 없다')
    // scope 는 쉼표로 잇는다. 표준 OAuth2 는 공백이지만 넥슨은 쉼표이고, 공백으로 보내면 화면이 안 뜬다.
    const query = [
      'response_type=code',
      `client_id=${encodeURIComponent(clientId)}`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      `scope=${scopes}`,
      `state=${encodeURIComponent(state)}`,
    ].join('&')
    return `${AUTHORIZE_URL}?${query}`
  }

  exchange(platform: Platform, code: string, redirectUri: string): Promise<NexonTokens> {
    const { clientId, clientSecret } = this.credentials(platform)
    return this.token({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      // 규격 표에는 없지만 RFC 6749 4.1.3 이 authorize 에 넣었으면 교환에도 넣으라 한다.
      redirect_uri: redirectUri,
    })
  }

  refresh(platform: Platform, refreshToken: string): Promise<NexonTokens> {
    const { clientId, clientSecret } = this.credentials(platform)
    return this.token({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    })
  }

  /** 토큰 응답에는 식별자가 없어 이 경로가 사람을 아는 유일한 길이다. uid 는 플랫폼을 가로질러 같다. */
  async userinfo(accessToken: string): Promise<{ uid: string }> {
    const res = await this.call(USERINFO_URL, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    const body = (await res.json()) as { result?: { uid?: string } }
    const uid = body.result?.uid
    if (!uid) throw new NexonUnavailable('userinfo 응답에 uid 가 없다')
    return { uid }
  }

  private async token(form: Record<string, string>): Promise<NexonTokens> {
    const res = await this.call(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
    const body = (await res.json()) as TokenBody
    return {
      accessToken: body.access_token,
      expiresIn: body.expires_in,
      refreshToken: body.refresh_token,
      refreshExpiresIn: body.refresh_token_expires_in,
    }
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      throw new NexonUnavailable(`넥슨에 닿지 못했다: ${String(error)}`)
    }
    if (res.ok) return res
    const text = await res.text()
    if (errorNameOf(text) === TOKEN_REJECTED) throw new NexonTokenRejected(res.status, text)
    throw new NexonUnavailable(`넥슨이 ${res.status} 를 냈다: ${text}`)
  }

  private credentials(platform: Platform): { clientId: string; clientSecret: string } {
    const clientId =
      platform === 'ios'
        ? this.config.get('NEXON_IOS_CLIENT_ID', { infer: true })
        : this.config.get('NEXON_ANDROID_CLIENT_ID', { infer: true })
    const clientSecret =
      platform === 'ios'
        ? this.config.get('NEXON_IOS_CLIENT_SECRET', { infer: true })
        : this.config.get('NEXON_ANDROID_CLIENT_SECRET', { infer: true })
    if (!clientId || !clientSecret) {
      throw new NexonCredentialMissing(`${platform} 의 넥슨 자격 쌍이 env 에 없다`)
    }
    return { clientId, clientSecret }
  }
}
