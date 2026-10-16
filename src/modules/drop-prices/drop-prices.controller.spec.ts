import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { SessionsRepository } from '../auth/sessions.repository'
import { BossesRepository } from '../bosses/bosses.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { DropPricesController } from './drop-prices.controller'
import { DropPricesRepository } from './drop-prices.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const body = {
  dropRecordId: RECORD,
  itemKey: 'ring',
  priceMeso: 100,
  periodKey: '2026-10-08',
  worldKey: null,
  ringLevel: null,
  slot: null,
}

describe('DropPricesController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = { upsertByApiKeyHash: jest.fn() }
  const prices = { upsert: jest.fn(), markDeleted: jest.fn() }
  const bosses = { findDifficulty: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DropPricesController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: DropPricesRepository, useValue: prices },
        { provide: BossesRepository, useValue: bosses },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset()
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    users.upsertByApiKeyHash.mockReset()
    prices.upsert.mockReset().mockResolvedValue(undefined)
    prices.markDeleted.mockReset().mockResolvedValue(undefined)
    bosses.findDifficulty.mockReset().mockResolvedValue(null)
  })

  it('신원이 없으면 401 이고 저장하지 않는다', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/drop-prices', payload: body })

    expect(res.statusCode).toBe(401)
    expect(prices.upsert).not.toHaveBeenCalled()
  })

  it('POST 는 신원과 본문으로 upsert 하고 200 { ok: true } 다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, worldKey: 'scania', ringLevel: 4 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(prices.upsert).toHaveBeenCalledWith({
      userId: 'u1',
      identifiedBy: 'login',
      dropRecordId: RECORD,
      itemKey: 'ring',
      priceMeso: 100,
      periodKey: '2026-10-08',
      worldKey: 'scania',
      ringLevel: 4,
      slot: null,
      bossDifficultyId: null,
    })
  })

  it('보스 · 난이도를 받으면 그 줄의 id 를 적는다', async () => {
    bosses.findDifficulty.mockResolvedValue({ id: 'bd-1' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, boss: 'lucid', difficulty: 'hard' },
    })

    expect(res.statusCode).toBe(200)
    expect(bosses.findDifficulty).toHaveBeenCalledWith('lucid', 'hard')
    expect(prices.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ bossDifficultyId: 'bd-1' }),
    )
  })

  // 표에 없는 쌍이라도 본문이 틀린 것은 아니다. 거절하면 앱이 5회 뒤 그 건을 버린다.
  it('표에 없는 보스 · 난이도면 NULL 로 적고 200 이다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, boss: 'nobody', difficulty: 'ultra' },
    })

    expect(res.statusCode).toBe(200)
    expect(prices.upsert).toHaveBeenCalledWith(expect.objectContaining({ bossDifficultyId: null }))
  })

  it('키 사용자는 key 로 적힌다', async () => {
    users.upsertByApiKeyHash.mockResolvedValue({ id: 'u2' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: { 'x-api-key-hash': 'ab'.repeat(32) },
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(prices.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', identifiedBy: 'key' }),
    )
  })

  it('본문이 틀리면 400 이고 저장하지 않는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, priceMeso: 0 },
    })

    expect(res.statusCode).toBe(400)
    expect(prices.upsert).not.toHaveBeenCalled()
  })

  it('DELETE 는 내 줄의 가격을 빼고 204 다', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/drop-prices/${RECORD}`,
      headers: bearer,
    })

    expect(res.statusCode).toBe(204)
    expect(prices.markDeleted).toHaveBeenCalledWith('u1', RECORD)
  })

  it('DELETE 의 id 가 uuid 모양이 아니면 400 이다', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/drop-prices/not-a-uuid',
      headers: bearer,
    })

    expect(res.statusCode).toBe(400)
    expect(prices.markDeleted).not.toHaveBeenCalled()
  })
})
