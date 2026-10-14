import type { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.schema'
import {
  NexonCredentialMissing,
  NexonOpenIdClient,
  NexonTokenRejected,
  NexonUnavailable,
} from './nexon-open-id.client'

const ENV: Partial<Env> = {
  NEXON_IOS_CLIENT_ID: 'ios-id',
  NEXON_IOS_CLIENT_SECRET: 'ios-secret',
  NEXON_OPENID_SCOPES: 'scope.a,scope.b',
}

function client(env: Partial<Env> = ENV): NexonOpenIdClient {
  const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>
  return new NexonOpenIdClient(config)
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const TOKENS = {
  token_type: 'Bearer',
  access_token: 'AT',
  expires_in: 1800,
  refresh_token: 'RT',
  refresh_token_expires_in: 1209600,
}

describe('NexonOpenIdClient', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('authorizeUrl 은 플랫폼의 client_id 와 state 와 쉼표로 이은 scope 를 싣는다', () => {
    const url = client().authorizeUrl('ios', 'ST', 'https://x/cb')

    expect(url.startsWith('https://openid.nexon.com/oauth2/authorize?')).toBe(true)
    expect(url).toContain('response_type=code')
    expect(url).toContain('client_id=ios-id')
    expect(url).toContain('state=ST')
    expect(url).toContain('redirect_uri=https%3A%2F%2Fx%2Fcb')
    expect(url).toContain('scope=scope.a,scope.b')
  })

  it('exchange 는 code 를 form 으로 보내고 토큰을 돌려준다', async () => {
    fetchSpy.mockResolvedValue(reply(200, TOKENS))

    const tokens = await client().exchange('ios', 'CODE', 'https://x/cb')

    expect(tokens).toEqual({
      accessToken: 'AT',
      expiresIn: 1800,
      refreshToken: 'RT',
      refreshExpiresIn: 1209600,
    })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://openid.nexon.com/oauth2/token')
    expect(init?.method).toBe('POST')
    const form = new URLSearchParams(init?.body as string)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('client_id')).toBe('ios-id')
    expect(form.get('client_secret')).toBe('ios-secret')
    expect(form.get('code')).toBe('CODE')
    expect(form.get('redirect_uri')).toBe('https://x/cb')
  })

  it('refresh 가 400 을 받으면 NexonTokenRejected 를 던진다', async () => {
    fetchSpy.mockResolvedValue(
      reply(400, { error: { name: 'OPENAPI00012', message: 'Invalid Token' } }),
    )

    await expect(client().refresh('ios', 'RT')).rejects.toBeInstanceOf(NexonTokenRejected)
    const form = new URLSearchParams(fetchSpy.mock.calls[0][1]?.body as string)
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe('RT')
  })

  it('같은 400 이라도 OPENAPI00004 는 자격이나 파라미터 탓이라 NexonUnavailable 이다', async () => {
    fetchSpy.mockResolvedValue(
      reply(400, { error: { name: 'OPENAPI00004', message: 'Invalid ClientID or ClientSecret' } }),
    )

    await expect(client().refresh('ios', 'RT')).rejects.toBeInstanceOf(NexonUnavailable)
  })

  it('5xx 나 통신 실패는 NexonUnavailable 이다', async () => {
    fetchSpy.mockResolvedValueOnce(reply(503, {}))
    await expect(client().refresh('ios', 'RT')).rejects.toBeInstanceOf(NexonUnavailable)

    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(client().refresh('ios', 'RT')).rejects.toBeInstanceOf(NexonUnavailable)
  })

  it('userinfo 는 Bearer 로 불러 uid 를 돌려준다', async () => {
    fetchSpy.mockResolvedValue(reply(200, { result: { uid: 'UID', scope: 'scope.a' } }))

    expect(await client().userinfo('AT')).toEqual({ uid: 'UID' })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://openid.nexon.com/oauth2/userinfo')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer AT')
  })

  it('자격이 없는 플랫폼은 부를 수 없다', () => {
    expect(() => client().authorizeUrl('android', 'ST', 'https://x/cb')).toThrow(
      NexonCredentialMissing,
    )
  })
})
