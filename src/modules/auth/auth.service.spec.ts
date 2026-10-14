import type { ConfigService } from '@nestjs/config'

import { sha256 } from '../../common/hash'
import { NexonOpenIdClient, NexonTokenRejected } from '../../clients/nexon-open-id.client'
import type { Env } from '../../config/env.schema'
import type { UsersRepository } from '../users/users.repository'
import type { AttemptsRepository } from './attempts.repository'
import { AuthService } from './auth.service'
import { SealService } from './seal.service'
import type { SessionsRepository } from './sessions.repository'

const KEY = 'ab'.repeat(32)
const seal = new SealService({ get: () => KEY } as unknown as ConfigService<Env, true>)

function build() {
  const attempts = {
    create: jest.fn().mockResolvedValue({ id: 'aid' }),
    claim: jest.fn().mockResolvedValue({ id: 'aid', platform: 'ios' }),
    seal: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    redeem: jest.fn().mockResolvedValue(null),
    peek: jest.fn().mockResolvedValue(null),
  }
  const sessions = {
    create: jest.fn().mockResolvedValue({ id: 'sid' }),
    delete: jest.fn().mockResolvedValue(undefined),
    deleteByHash: jest.fn().mockResolvedValue(undefined),
  }
  const users = { upsertByNexonUid: jest.fn().mockResolvedValue({ id: 'uid' }) }
  const nexon = {
    authorizeUrl: jest.fn().mockReturnValue('https://openid.nexon.com/oauth2/authorize?x'),
    exchange: jest.fn().mockResolvedValue({
      accessToken: 'AT',
      expiresIn: 1800,
      refreshToken: 'RT',
      refreshExpiresIn: 1209600,
    }),
    userinfo: jest.fn().mockResolvedValue({ uid: 'NEXON-UID' }),
  }
  const config = {
    get: (key: keyof Env) => (key === 'PUBLIC_BASE_URL' ? 'https://mapleroutine.store' : KEY),
  } as unknown as ConfigService<Env, true>
  const service = new AuthService(
    attempts as unknown as AttemptsRepository,
    sessions as unknown as SessionsRepository,
    users as unknown as UsersRepository,
    seal,
    nexon as unknown as NexonOpenIdClient,
    config,
  )
  return { service, attempts, sessions, users, nexon }
}

describe('AuthService', () => {
  it('start 는 짝을 만들고 authorizeUrl 과 redeemKey 를 돌려준다. state 는 앱에 주지 않는다', async () => {
    const { service, attempts, nexon } = build()

    const result = await service.start('android')

    expect(result.authorizeUrl).toBe('https://openid.nexon.com/oauth2/authorize?x')
    expect(result.redeemKey).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(result).not.toHaveProperty('state')
    const [input] = attempts.create.mock.calls[0] as [
      { state: string; redeemHash: Buffer; platform: string; expiresAt: Date },
    ]
    expect(input.platform).toBe('android')
    expect(input.redeemHash.equals(sha256(result.redeemKey))).toBe(true)
    expect(input.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000)
    expect(nexon.authorizeUrl).toHaveBeenCalledWith(
      'android',
      input.state,
      'https://mapleroutine.store/v1/auth/nexon/callback',
    )
  })

  it('callback 은 짝을 집어 교환하고 세션을 만들어 봉한 뒤 receipt 를 실은 돌아갈 주소를 돌려준다', async () => {
    const { service, attempts, sessions, users, nexon } = build()

    const url = await service.callback({ code: 'CODE', state: 'ST' })

    expect(attempts.claim).toHaveBeenCalledWith('ST')
    expect(nexon.exchange).toHaveBeenCalledWith(
      'ios',
      'CODE',
      'https://mapleroutine.store/v1/auth/nexon/callback',
    )
    expect(users.upsertByNexonUid).toHaveBeenCalledWith('NEXON-UID')
    const [created] = sessions.create.mock.calls[0] as [
      {
        userId: string
        platform: string
        accessSealed: Buffer
        refreshSealed: Buffer
        sessionHash: Buffer
      },
    ]
    expect(created.userId).toBe('uid')
    expect(seal.open('access', created.accessSealed)).toBe('AT')
    expect(seal.open('refresh', created.refreshSealed)).toBe('RT')
    const [aid, sealed] = attempts.seal.mock.calls[0] as [
      string,
      { receiptHash: Buffer; sessionSealed: Buffer; sessionId: string },
    ]
    expect(aid).toBe('aid')
    expect(sealed.sessionId).toBe('sid')
    const sessionValue = seal.open('session', sealed.sessionSealed)
    expect(created.sessionHash.equals(sha256(sessionValue))).toBe(true)
    const receipt = new URL(url).searchParams.get('receipt')
    expect(url.startsWith('com.mapleroutine.app://oauth/callback?receipt=')).toBe(true)
    expect(sealed.receiptHash.equals(sha256(receipt!))).toBe(true)
  })

  it('안드로이드는 App Link 주소로 돌아간다', async () => {
    const { service, attempts } = build()
    attempts.claim.mockResolvedValue({ id: 'aid', platform: 'android' })

    const url = await service.callback({ code: 'CODE', state: 'ST' })

    expect(url.startsWith('https://mapleroutine.store/app/oauth/return?receipt=')).toBe(true)
  })

  it('state 를 못 집으면 스킴 주소만 돌려준다', async () => {
    const { service, attempts, nexon } = build()
    attempts.claim.mockResolvedValue(null)

    expect(await service.callback({ code: 'CODE', state: 'ST' })).toBe(
      'com.mapleroutine.app://oauth/callback',
    )
    expect(await service.callback({})).toBe('com.mapleroutine.app://oauth/callback')
    expect(nexon.exchange).not.toHaveBeenCalled()
  })

  it('넥슨이 code 대신 error 로 끝내면 짝을 지우고 receipt 없이 돌려보낸다', async () => {
    const { service, attempts, nexon } = build()

    const url = await service.callback({ error: 'access_denied', state: 'ST' })

    expect(url).toBe('com.mapleroutine.app://oauth/callback')
    expect(attempts.delete).toHaveBeenCalledWith('aid')
    expect(nexon.exchange).not.toHaveBeenCalled()
  })

  it('교환에 실패하면 짝을 지우고 receipt 없이 돌려보낸다', async () => {
    const { service, attempts, sessions, nexon } = build()
    nexon.exchange.mockRejectedValue(new NexonTokenRejected(400, 'bad code'))

    const url = await service.callback({ code: 'CODE', state: 'ST' })

    expect(url).toBe('com.mapleroutine.app://oauth/callback')
    expect(attempts.delete).toHaveBeenCalledWith('aid')
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('세션을 만든 뒤에 실패하면 그 세션도 지운다', async () => {
    const { service, attempts, sessions } = build()
    attempts.seal.mockRejectedValue(new Error('db down'))

    const url = await service.callback({ code: 'CODE', state: 'ST' })

    expect(url).toBe('com.mapleroutine.app://oauth/callback')
    expect(sessions.delete).toHaveBeenCalledWith('sid')
    expect(attempts.delete).toHaveBeenCalledWith('aid')
  })

  it('redeem 은 봉한 세션을 열어 돌려준다', async () => {
    const { service, attempts } = build()
    attempts.redeem.mockResolvedValue(seal.seal('session', 'SESSION-VALUE'))

    expect(await service.redeem('rk', 'rc')).toEqual({ status: 'ok', session: 'SESSION-VALUE' })
    expect(attempts.redeem).toHaveBeenCalledWith(sha256('rk'), sha256('rc'))
  })

  it('redeem 의 답은 짝의 단계에 따라 취소 · 진행 중 · 없음으로 갈린다', async () => {
    const { service, attempts } = build()

    attempts.peek.mockResolvedValue({ claimedAt: null, sealedAt: null })
    expect(await service.redeem('rk', 'rc')).toEqual({ status: 'cancelled' })

    attempts.peek.mockResolvedValue({ claimedAt: new Date(), sealedAt: null })
    expect(await service.redeem('rk', 'rc')).toEqual({ status: 'pending' })

    attempts.peek.mockResolvedValue({ claimedAt: new Date(), sealedAt: new Date() })
    expect(await service.redeem('rk', 'rc')).toEqual({ status: 'gone' })

    attempts.peek.mockResolvedValue(null)
    expect(await service.redeem('rk', 'rc')).toEqual({ status: 'gone' })
  })

  it('logout 은 해시로 행을 지운다', async () => {
    const { service, sessions } = build()

    await service.logout('SESSION-VALUE')

    expect(sessions.deleteByHash).toHaveBeenCalledWith(sha256('SESSION-VALUE'))
  })
})
