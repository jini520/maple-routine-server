import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { sha256Hex } from '../../common/hash'
import { SessionsRepository } from '../auth/sessions.repository'
import { NexonAccountsRepository } from '../users/nexon-accounts.repository'
import { UsersRepository } from '../users/users.repository'
import { IdentityGuard } from './identity.guard'
import { SubAccountsController } from './sub-accounts.controller'

const M1 = sha256Hex('m1')
const M2 = sha256Hex('m2')

describe('SubAccountsController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn(), touch: jest.fn() }
  const users = {
    upsertByMapleId: jest.fn(),
    deletionRequestedAt: jest.fn(),
    findLoginAccount: jest.fn(),
  }
  const accounts = { registerSubAccount: jest.fn(), unregisterSubAccount: jest.fn() }
  const bearer = { authorization: 'Bearer S' }
  const keyHeader = { 'x-maple-id-hash': 'cd'.repeat(32) }

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
    users.upsertByMapleId.mockReset().mockResolvedValue({ id: 'u2', nexonAccountId: 'a2' })
    users.deletionRequestedAt.mockReset().mockResolvedValue(null)
    users.findLoginAccount.mockReset().mockResolvedValue({ nexonAccountId: 'a1' })
    accounts.registerSubAccount.mockReset().mockResolvedValue('registered')
    accounts.unregisterSubAccount.mockReset().mockResolvedValue(undefined)
  })

  it('등록은 메이플 ID 목록으로 로그인 계정에 잇는다. 204 다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/sub-accounts',
      headers: bearer,
      payload: { mapleIds: [M1, M2] },
    })

    expect(res.statusCode).toBe(204)
    expect(accounts.registerSubAccount).toHaveBeenCalledWith('a1', [M1, M2])
  })

  // 앱은 거절을 `등록할 수 없는 키예요` 모달로 알리고, 이유는 code 로 가른다.
  it.each(['same_account', 'registered_elsewhere', 'has_sub_accounts', 'login_is_sub_account'])(
    '거절은 409 이고 이유를 code 로 준다: %s',
    async (code) => {
      accounts.registerSubAccount.mockResolvedValueOnce(code)

      const res = await app.inject({
        method: 'POST',
        url: '/v1/me/sub-accounts',
        headers: bearer,
        payload: { mapleIds: [M1] },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json()).toEqual(expect.objectContaining({ code }))
    },
  )

  // 메이플 ID 가 없으면 어느 넥슨 계정인지 찾을 수 없다. 원문으로 보이는 값은 받지 않는다.
  it('메이플 ID 가 없거나 해시 모양이 아니면 400 이다', async () => {
    for (const method of ['POST', 'DELETE'] as const) {
      for (const payload of [{ mapleIds: [] }, { mapleIds: ['m1'] }, {}]) {
        const res = await app.inject({
          method,
          url: '/v1/me/sub-accounts',
          headers: bearer,
          payload,
        })
        expect(res.statusCode).toBe(400)
      }
    }
    expect(accounts.registerSubAccount).not.toHaveBeenCalled()
    expect(accounts.unregisterSubAccount).not.toHaveBeenCalled()
  })

  // 같은 해제를 여러 기기가 보낸다. 등록이 없어도 성공이다.
  it('해제는 메이플 ID 목록으로 이 로그인의 등록을 지운다. 204 다', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me/sub-accounts',
      headers: bearer,
      payload: { mapleIds: [M1] },
    })

    expect(res.statusCode).toBe(204)
    expect(accounts.unregisterSubAccount).toHaveBeenCalledWith('a1', [M1])
  })

  // 키 사용자에게는 부계정이 없다. 어느 로그인에 붙일지는 세션이 정한다.
  it('메이플 ID 해시 신원으로 오면 등록도 해제도 403 login_required 다', async () => {
    for (const method of ['POST', 'DELETE'] as const) {
      const res = await app.inject({
        method,
        url: '/v1/me/sub-accounts',
        headers: keyHeader,
        payload: { mapleIds: [M1] },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json()).toEqual(expect.objectContaining({ code: 'login_required' }))
    }
    expect(accounts.registerSubAccount).not.toHaveBeenCalled()
    expect(accounts.unregisterSubAccount).not.toHaveBeenCalled()
  })

  // 다른 기기에서 등록한 부계정은 기록 받기의 응답으로 알린다.
  it('목록 경로는 없다', async () => {
    const list = await app.inject({ method: 'GET', url: '/v1/me/sub-accounts', headers: bearer })

    expect(list.statusCode).toBe(404)
  })
})
