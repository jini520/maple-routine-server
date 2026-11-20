import { sha256Hex } from '../../common/hash'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { SessionsRepository } from '../auth/sessions.repository'
import { NexonAccountsRepository } from '../users/nexon-accounts.repository'
import { UsersRepository } from '../users/users.repository'
import { IdentityGuard } from './identity.guard'
import { MeController } from './me.controller'

const M1 = sha256Hex('m1')
const M2 = sha256Hex('m2')
const M3 = sha256Hex('m3')

describe('MeController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn(), touch: jest.fn(), deleteByUserId: jest.fn() }
  const users = {
    upsertByMapleId: jest.fn(),
    requestDeletion: jest.fn(),
    cancelDeletion: jest.fn(),
    deletionRequestedAt: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1' }),
  }
  const accounts = { reportMapleIds: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: NexonAccountsRepository, useValue: accounts },
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
    users.upsertByMapleId.mockReset()
    users.requestDeletion.mockReset().mockResolvedValue(undefined)
    users.cancelDeletion.mockReset().mockResolvedValue(undefined)
    users.deletionRequestedAt.mockReset().mockResolvedValue(null)
    accounts.reportMapleIds.mockReset().mockResolvedValue([M1, M2])
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
    users.upsertByMapleId.mockResolvedValue({
      id: 'u2',
      nexonAccountId: 'a2',
    })

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: { 'x-maple-id-hash': 'cd'.repeat(32) },
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

  // 1.0.15 의 키 사용자는 메이플 ID 해시로 밝혀지고, 로그인한 기기가 메이플 ID 를 알리면 같은 넥슨 ID 의 줄이 합쳐진다.
  it('키를 로그인에 다는 경로는 없다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/api-key-links',
      headers: bearer,
      payload: { apiKeyHash: 'ab'.repeat(32) },
    })

    expect(res.statusCode).toBe(404)
  })

  describe('PUT /v1/me/maple-ids', () => {
    // 앱은 이 답을 마지막으로 알린 목록으로 적고, 자기 목록이 그 안에 다 없으면 다음에 다시 보낸다.
    it('그 신원의 넥슨 계정에 메이플 ID 를 알리고, 계정이 가진 메이플 ID 전부를 돌려준다', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/v1/me/maple-ids',
        headers: bearer,
        payload: { mapleIds: [M1, M2] },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ mapleIds: [M1, M2] })
      expect(accounts.reportMapleIds).toHaveBeenCalledWith('a1', [M1, M2])
    })

    // 부계정의 메이플 ID 는 그 키의 신원으로 알린다. 계정마다 자기 줄에 적어야 같은 넥슨 ID 를 알아본다.
    it('키 해시로 오면 그 키의 넥슨 계정에 적는다', async () => {
      users.upsertByMapleId.mockResolvedValue({
        id: 'u2',
        nexonAccountId: 'a2',
      })

      await app.inject({
        method: 'PUT',
        url: '/v1/me/maple-ids',
        headers: { 'x-maple-id-hash': 'cd'.repeat(32) },
        payload: { mapleIds: [M3] },
      })

      expect(accounts.reportMapleIds).toHaveBeenCalledWith('a2', [M3])
    })

    it('목록이 아니거나 빈 글자 · 너무 긴 값이 들면 400 이다', async () => {
      for (const mapleIds of ['m1', [''], ['a'.repeat(65)], ['m 1']]) {
        const res = await app.inject({
          method: 'PUT',
          url: '/v1/me/maple-ids',
          headers: bearer,
          payload: { mapleIds },
        })
        expect(res.statusCode).toBe(400)
      }
      expect(accounts.reportMapleIds).not.toHaveBeenCalled()
    })
  })
})
