import type { ConfigService } from '@nestjs/config'

import {
  NexonOpenIdClient,
  NexonTokenRejected,
  NexonUnavailable,
} from '../../clients/nexon-open-id.client'
import type { Env } from '../../config/env.schema'
import { SealService } from './seal.service'
import type { SessionRow, SessionsRepository } from './sessions.repository'
import { ReloginRequired, TokenService } from './token.service'

const seal = new SealService({ get: () => 'ab'.repeat(32) } as unknown as ConfigService<Env, true>)

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sid',
    userId: 'uid',
    platform: 'ios',
    sealedAccessToken: seal.seal('access', 'AT-old'),
    accessExpiresAt: new Date(Date.now() + 3_600_000),
    sealedRefreshToken: seal.seal('refresh', 'RT-old'),
    refreshExpiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  }
}

function build(session: SessionRow | null) {
  const sessions = {
    findById: jest.fn().mockResolvedValue(session),
    updateTokens: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }
  const nexon = {
    refresh: jest.fn().mockResolvedValue({
      accessToken: 'AT-new',
      expiresIn: 1800,
      refreshToken: 'RT-new',
      refreshExpiresIn: 1209600,
    }),
  }
  const service = new TokenService(
    sessions as unknown as SessionsRepository,
    seal,
    nexon as unknown as NexonOpenIdClient,
  )
  return { service, sessions, nexon }
}

describe('TokenService', () => {
  it('액세스 토큰이 살아 있으면 그대로 돌려주고 넥슨을 부르지 않는다', async () => {
    const { service, nexon } = build(row())

    expect(await service.tokenFor('sid')).toBe('AT-old')
    expect(nexon.refresh).not.toHaveBeenCalled()
  })

  it('만료됐으면 한 번만 갱신하고, 동시에 온 호출은 같은 결과를 기다린다', async () => {
    const { service, sessions, nexon } = build(
      row({ accessExpiresAt: new Date(Date.now() + 10_000) }),
    )

    const results = await Promise.all([
      service.tokenFor('sid'),
      service.tokenFor('sid'),
      service.tokenFor('sid'),
    ])

    expect(results).toEqual(['AT-new', 'AT-new', 'AT-new'])
    expect(nexon.refresh).toHaveBeenCalledTimes(1)
    expect(nexon.refresh).toHaveBeenCalledWith('ios', 'RT-old')
    expect(sessions.updateTokens).toHaveBeenCalledTimes(1)
    const [, saved] = sessions.updateTokens.mock.calls[0] as [
      string,
      { sealedAccessToken: Buffer; sealedRefreshToken: Buffer },
    ]
    expect(seal.open('access', saved.sealedAccessToken)).toBe('AT-new')
    expect(seal.open('refresh', saved.sealedRefreshToken)).toBe('RT-new')
  })

  it('갱신이 거절되면 세션을 지우고 ReloginRequired 를 던진다', async () => {
    const { service, sessions, nexon } = build(row({ accessExpiresAt: new Date() }))
    nexon.refresh.mockRejectedValue(new NexonTokenRejected(400, 'OPENAPI00012'))

    await expect(service.tokenFor('sid')).rejects.toBeInstanceOf(ReloginRequired)
    expect(sessions.delete).toHaveBeenCalledWith('sid')
  })

  it('넥슨이 불통이면 지우지 않고 그대로 던진다', async () => {
    const { service, sessions, nexon } = build(row({ accessExpiresAt: new Date() }))
    nexon.refresh.mockRejectedValue(new NexonUnavailable('down'))

    await expect(service.tokenFor('sid')).rejects.toBeInstanceOf(NexonUnavailable)
    expect(sessions.delete).not.toHaveBeenCalled()
  })

  // 세션 암호 키가 봉한 때의 키와 다르면 토큰을 열지 못한다. 그대로 던지면 프렌즈 조회가 500 이라 앱이 다시 로그인하라고 하지 않는다.
  it('봉한 토큰을 열 수 없으면 넥슨을 부르지 않고 세션을 지운 뒤 ReloginRequired 를 던진다', async () => {
    const otherKey = new SealService({ get: () => 'cd'.repeat(32) } as unknown as ConfigService<
      Env,
      true
    >)
    const alive = build(row({ sealedAccessToken: otherKey.seal('access', 'AT-old') }))

    await expect(alive.service.tokenFor('sid')).rejects.toBeInstanceOf(ReloginRequired)
    expect(alive.sessions.delete).toHaveBeenCalledWith('sid')

    const expired = build(
      row({
        accessExpiresAt: new Date(),
        sealedRefreshToken: otherKey.seal('refresh', 'RT-old'),
      }),
    )

    await expect(expired.service.tokenFor('sid')).rejects.toBeInstanceOf(ReloginRequired)
    expect(expired.nexon.refresh).not.toHaveBeenCalled()
    expect(expired.sessions.delete).toHaveBeenCalledWith('sid')
  })

  it('세션이 없으면 ReloginRequired 다', async () => {
    const { service } = build(null)

    await expect(service.tokenFor('sid')).rejects.toBeInstanceOf(ReloginRequired)
  })
})
