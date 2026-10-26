import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { SessionsRepository } from '../auth/sessions.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { EnhancementAnomaliesController } from './enhancement-anomalies.controller'
import { EnhancementAnomaliesRepository } from './enhancement-anomalies.repository'

const item = {
  historyDate: '2026-10-20',
  enhancementType: 'starforce',
  anomalyType: 'no_level',
  itemKey: null,
  itemName: '왕푸',
  rowCount: 2,
}

describe('EnhancementAnomaliesController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1', accountRecordId: null }),
    recordAccountId: jest.fn(),
  }
  const anomalies = { upsert: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EnhancementAnomaliesController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: EnhancementAnomaliesRepository, useValue: anomalies },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset().mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    anomalies.upsert.mockReset().mockResolvedValue(undefined)
  })

  it('신원이 없으면 401 이고 적지 않는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/enhancement-anomalies',
      payload: { items: [item] },
    })

    expect(res.statusCode).toBe(401)
    expect(anomalies.upsert).not.toHaveBeenCalled()
  })

  it('신원을 더해 적는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/enhancement-anomalies',
      headers: bearer,
      payload: { items: [item] },
    })

    expect(res.statusCode).toBe(200)
    expect(anomalies.upsert).toHaveBeenCalledWith('u1', 'login', [expect.objectContaining(item)])
  })

  // 모르는 이유를 받으면 운영자가 뜻을 모르는 줄이 쌓인다. 앱은 실패를 버리므로 이 건만 사라진다.
  it('모르는 이유는 400 이다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/enhancement-anomalies',
      headers: bearer,
      payload: { items: [{ ...item, anomalyType: 'flame' }] },
    })

    expect(res.statusCode).toBe(400)
  })
})
