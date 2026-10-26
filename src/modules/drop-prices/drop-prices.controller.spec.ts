import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import type { BatchResult } from '../../common/batch'
import { SessionsRepository } from '../auth/sessions.repository'
import { BossesRepository } from '../bosses/bosses.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { DropPricesController } from './drop-prices.controller'
import { DropPricesRepository, NoDropItem, NoWorld } from './drop-prices.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const body = {
  dropRecordId: RECORD,
  itemKey: 'ring',
  priceMeso: 100,
  periodKey: '2026-10-08',
  worldKey: null,
  ringLevel: null,
}

describe('DropPricesController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1', accountRecordId: null }),
    recordAccountId: jest.fn(),
  }
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
      bossDifficultyId: null,
      periodRecordId: null,
      recordStatus: 'completed',
      pricedAt: null,
    })
  })

  // 미입력 · 기록 안함도 줄이 된다. 가격이 없는 기록을 서버가 알아야 먹었는데 안 판 것이 보인다.
  it('pending · skipped 는 가격 없이 그 상태로 적힌다', async () => {
    const pending = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, priceMeso: null, status: 'pending' },
    })
    expect(pending.statusCode).toBe(200)
    expect(prices.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ priceMeso: null, recordStatus: 'pending' }),
    )

    const skipped = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, priceMeso: null, status: 'skipped' },
    })
    expect(skipped.statusCode).toBe(200)
    expect(prices.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ priceMeso: null, recordStatus: 'skipped' }),
    )
  })

  it('상태와 가격의 유무가 어긋나면 400 이고 저장하지 않는다', async () => {
    const pricedPending = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, status: 'pending' },
    })
    expect(pricedPending.statusCode).toBe(400)

    const unpricedCompleted = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, priceMeso: null },
    })
    expect(unpricedCompleted.statusCode).toBe(400)
    expect(prices.upsert).not.toHaveBeenCalled()
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
    users.upsertByApiKeyHash.mockResolvedValue({
      id: 'u2',
      nexonAccountId: 'a2',
      accountRecordId: null,
    })

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

  // 앱은 서버 표를 받아 쓰므로 서버가 모르는 key 는 틀린 본문이다. 거절된 건은 앱이 5회 뒤 버린다.
  it('표에 없는 아이템 · 월드 key 는 400 이다', async () => {
    prices.upsert.mockRejectedValueOnce(new NoDropItem('nobody'))
    const item = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, itemKey: 'nobody' },
    })
    expect(item.statusCode).toBe(400)
    expect(item.json<{ message: string }>().message).toContain('nobody')

    prices.upsert.mockRejectedValueOnce(new NoWorld('nowhere'))
    const world = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices',
      headers: bearer,
      payload: { ...body, worldKey: 'nowhere' },
    })
    expect(world.statusCode).toBe(400)
  })

  // 기기에서 기록이 사라진 때다. 줄은 남고 deleted 로 표시된다.
  it('DELETE 는 내 줄을 deleted 로 표시하고 204 다', async () => {
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

  // 과거 드롭 묶음이다. 표에 없는 아이템 한 건이 나머지를 막으면 그 사용자의 과거 올리기가 멈춘다.
  it('묶음은 건마다 결과를 돌려주고, 표에 없는 아이템은 그 건만 실패다', async () => {
    const other = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
    prices.upsert.mockImplementation(async (input: { dropRecordId: string }) => {
      if (input.dropRecordId === other) throw new NoDropItem('nothing')
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/drop-prices/batch',
      headers: bearer,
      payload: {
        items: [
          { ...body, periodRecordId: other },
          { ...body, dropRecordId: other },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ results: BatchResult[] }>().results).toEqual([
      { recordId: RECORD, ok: true },
      { recordId: other, ok: false, reason: '모르는 아이템 key 다: nothing' },
    ])
    expect(prices.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ dropRecordId: RECORD, periodRecordId: other }),
    )
  })
})
