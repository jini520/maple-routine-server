import { sha256 } from '../../common/hash'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { SessionsRepository } from '../auth/sessions.repository'
import { UsersRepository } from '../users/users.repository'
import { IdentityGuard } from './identity.guard'
import { MeController } from './me.controller'

describe('MeController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn(), deleteByUserId: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    requestDeletion: jest.fn(),
    cancelDeletion: jest.fn(),
    deletionRequestedAt: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1', accountRecordId: null }),
    recordAccountId: jest.fn(),
    linkApiKey: jest.fn(),
  }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset().mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    sessions.deleteByUserId.mockReset().mockResolvedValue(undefined)
    users.upsertByApiKeyHash.mockReset()
    users.requestDeletion.mockReset().mockResolvedValue(undefined)
    users.cancelDeletion.mockReset().mockResolvedValue(undefined)
    users.deletionRequestedAt.mockReset().mockResolvedValue(null)
    users.linkApiKey.mockReset().mockResolvedValue(undefined)
  })

  it('신원이 없으면 401 이고 아무것도 안 적는다', async () => {
    sessions.findByHash.mockResolvedValue(null)

    const res = await app.inject({ method: 'DELETE', url: '/v1/me' })

    expect(res.statusCode).toBe(401)
    expect(users.requestDeletion).not.toHaveBeenCalled()
  })

  // 세션은 기록이 아니라 지금도 쓸 수 있는 자격이라, 남기면 다른 기기의 로그인이 계속 쓰인다.
  it('계정 삭제는 예약을 적고 세션을 전부 지운다. 204 다', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/v1/me', headers: bearer })

    expect(res.statusCode).toBe(204)
    expect(users.requestDeletion).toHaveBeenCalledWith('u1')
    expect(sessions.deleteByUserId).toHaveBeenCalledWith('u1')
  })

  it('키 사용자는 해시로 찾은 사람에게 예약을 적는다', async () => {
    users.upsertByApiKeyHash.mockResolvedValue({
      id: 'u2',
      nexonAccountId: 'a2',
      accountRecordId: null,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: { 'x-api-key-hash': 'cd'.repeat(32) },
    })

    expect(res.statusCode).toBe(204)
    expect(users.requestDeletion).toHaveBeenCalledWith('u2')
  })

  // 유예 중인 사람이 다시 로그인하면 앱이 이 둘로 묻고 취소한다. 가드가 막으면 취소할 길이 없다.
  it('유예 중에도 예약을 묻고 취소할 수 있다', async () => {
    users.deletionRequestedAt.mockResolvedValue(new Date('2026-11-04T03:00:00Z'))

    const asked = await app.inject({ method: 'GET', url: '/v1/me/deletion', headers: bearer })
    const cancelled = await app.inject({
      method: 'DELETE',
      url: '/v1/me/deletion',
      headers: bearer,
    })

    expect(asked.statusCode).toBe(200)
    expect(asked.json()).toEqual({
      deletion: { requestedAt: '2026-11-04T03:00:00.000Z', deletesAt: '2026-12-04T03:00:00.000Z' },
    })
    expect(cancelled.statusCode).toBe(204)
    expect(users.cancelDeletion).toHaveBeenCalledWith('u1')
  })

  it('예약이 없으면 deletion 은 null 이다', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/deletion', headers: bearer })

    expect(res.json()).toEqual({ deletion: null })
  })

  describe('POST /v1/me/api-key-links', () => {
    const hash = 'ab'.repeat(32)

    it('세션의 사람에 키 해시를 한 번 더 해시해 잇는다. 204 다', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/me/api-key-links',
        headers: bearer,
        payload: { apiKeyHash: hash },
      })

      expect(res.statusCode).toBe(204)
      expect(users.linkApiKey).toHaveBeenCalledWith('u1', sha256(hash))
    })

    // 어느 사람에 합칠지는 세션이 정한다. 키 해시 헤더로는 합칠 사람이 없다.
    it('키 해시 헤더로 오면 403 이고 잇지 않는다', async () => {
      users.upsertByApiKeyHash.mockResolvedValue({
        id: 'u2',
        nexonAccountId: 'a2',
        accountRecordId: null,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/me/api-key-links',
        headers: { 'x-api-key-hash': 'cd'.repeat(32) },
        payload: { apiKeyHash: hash },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json()).toEqual(expect.objectContaining({ code: 'login_required' }))
      expect(users.linkApiKey).not.toHaveBeenCalled()
    })

    // 키 원문이 실려 오면 길이가 안 맞아 여기서 걸린다.
    it('해시 모양이 틀리면 400 이다', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/me/api-key-links',
        headers: bearer,
        payload: { apiKeyHash: 'test_' + 'a'.repeat(40) },
      })

      expect(res.statusCode).toBe(400)
      expect(users.linkApiKey).not.toHaveBeenCalled()
    })

    it('삭제를 예약한 사람이면 403 이다', async () => {
      users.deletionRequestedAt.mockResolvedValue(new Date('2026-11-04T03:00:00Z'))

      const res = await app.inject({
        method: 'POST',
        url: '/v1/me/api-key-links',
        headers: bearer,
        payload: { apiKeyHash: hash },
      })

      expect(res.statusCode).toBe(403)
      expect(users.linkApiKey).not.toHaveBeenCalled()
    })
  })
})
