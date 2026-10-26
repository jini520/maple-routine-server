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
    markDeleted: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1', accountRecordId: null }),
    recordAccountId: jest.fn(),
  }

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
    sessions.findByHash.mockReset()
    sessions.deleteByUserId.mockReset().mockResolvedValue(undefined)
    users.upsertByApiKeyHash.mockReset()
    users.markDeleted.mockReset().mockResolvedValue(undefined)
  })

  it('신원이 없으면 401 이고 아무것도 안 적는다', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/v1/me' })

    expect(res.statusCode).toBe(401)
    expect(users.markDeleted).not.toHaveBeenCalled()
  })

  it('로그인 사용자는 탈퇴를 적고 세션을 전부 지운다. 204 다', async () => {
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: { authorization: 'Bearer S' },
    })

    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
    expect(users.markDeleted).toHaveBeenCalledWith('u1')
    expect(sessions.deleteByUserId).toHaveBeenCalledWith('u1')
  })

  it('키 사용자는 해시로 찾은 사람에게 탈퇴를 적는다', async () => {
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
    expect(users.markDeleted).toHaveBeenCalledWith('u2')
    expect(sessions.deleteByUserId).toHaveBeenCalledWith('u2')
  })
})
