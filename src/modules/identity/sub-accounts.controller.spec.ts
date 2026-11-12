import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { sha256, sha256Hex } from '../../common/hash'
import { SessionsRepository } from '../auth/sessions.repository'
import { NexonAccountsRepository } from '../users/nexon-accounts.repository'
import { UsersRepository } from '../users/users.repository'
import { IdentityGuard } from './identity.guard'
import { SubAccountsController } from './sub-accounts.controller'

const M1 = sha256Hex('m1')
const M2 = sha256Hex('m2')

describe('SubAccountsController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    deletionRequestedAt: jest.fn(),
    findLoginAccount: jest.fn(),
  }
  const accounts = { registerSubAccount: jest.fn() }
  const bearer = { authorization: 'Bearer S' }
  const keyHeader = { 'x-api-key-hash': 'cd'.repeat(32) }
  const hash = 'ab'.repeat(32)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SubAccountsController],
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
    users.upsertByApiKeyHash.mockReset().mockResolvedValue({ id: 'u2', nexonAccountId: 'a2' })
    users.deletionRequestedAt.mockReset().mockResolvedValue(null)
    users.findLoginAccount.mockReset().mockResolvedValue({ nexonAccountId: 'a1' })
    accounts.registerSubAccount.mockReset().mockResolvedValue('registered')
  })

  it('등록은 받은 키 해시를 한 번 더 해시해 로그인 계정에 잇는다. 204 다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/sub-accounts',
      headers: bearer,
      payload: { apiKeyHash: hash, mapleIds: [M1, M2] },
    })

    expect(res.statusCode).toBe(204)
    expect(accounts.registerSubAccount).toHaveBeenCalledWith('a1', sha256(hash), [M1, M2])
  })

  it('같은 넥슨 ID 면 409 same_account 다', async () => {
    accounts.registerSubAccount.mockResolvedValueOnce('same_account')

    const same = await app.inject({
      method: 'POST',
      url: '/v1/me/sub-accounts',
      headers: bearer,
      payload: { apiKeyHash: hash, mapleIds: [M1] },
    })

    expect(same.statusCode).toBe(409)
    expect(same.json()).toEqual(expect.objectContaining({ code: 'same_account' }))
  })

  // 메이플 ID 가 없으면 같은 넥슨 계정인지 가를 수 없다. 앱도 그런 키는 등록하지 않는다.
  it('키 해시 모양이 틀리거나 메이플 ID 가 없으면 400 이다', async () => {
    for (const payload of [
      { apiKeyHash: 'test_' + 'a'.repeat(40), mapleIds: [M1] },
      { apiKeyHash: hash, mapleIds: [] },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/me/sub-accounts',
        headers: bearer,
        payload,
      })
      expect(res.statusCode).toBe(400)
    }
    expect(accounts.registerSubAccount).not.toHaveBeenCalled()
  })

  // 키 사용자에게는 부계정이 없다. 어느 로그인에 붙일지는 세션이 정한다.
  it('키 해시로 오면 403 login_required 다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/sub-accounts',
      headers: keyHeader,
      payload: { apiKeyHash: hash, mapleIds: [M1] },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual(expect.objectContaining({ code: 'login_required' }))
    expect(accounts.registerSubAccount).not.toHaveBeenCalled()
  })

  // 앱은 부계정을 기기마다 따로 관리해 목록을 받지도, 서버에서 지우지도 않는다.
  it('목록 · 지우기 경로는 없다', async () => {
    const list = await app.inject({ method: 'GET', url: '/v1/me/sub-accounts', headers: bearer })
    const remove = await app.inject({
      method: 'DELETE',
      url: `/v1/me/sub-accounts/${M1}`,
      headers: bearer,
    })

    expect(list.statusCode).toBe(404)
    expect(remove.statusCode).toBe(404)
  })
})
