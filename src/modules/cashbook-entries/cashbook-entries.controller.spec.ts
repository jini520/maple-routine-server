import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import type { BatchResult } from '../../common/batch'
import { SessionsRepository } from '../auth/sessions.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { CashbookEntriesController } from './cashbook-entries.controller'
import { CashbookEntriesRepository } from './cashbook-entries.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const body = {
  entryRecordId: RECORD,
  ocid: 'ocid-1',
  entryType: 'income',
  categoryKey: 'item_sale',
  entryDate: '2026-10-26',
  items: [
    {
      itemName: '루즈 컨트롤 머신 마크',
      itemKindKey: 'consumable',
      quantity: 10,
      amountMeso: 950_000_000,
      saleFeePercent: 5,
      saleFeeMeso: 50_000_000,
    },
  ],
}

describe('CashbookEntriesController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1', accountRecordId: null }),
    recordAccountId: jest.fn(),
  }
  const entries = { upsert: jest.fn(), markDeleted: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CashbookEntriesController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: CashbookEntriesRepository, useValue: entries },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset().mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    entries.upsert.mockReset().mockResolvedValue(undefined)
    entries.markDeleted.mockReset().mockResolvedValue(undefined)
  })

  it('신원이 없으면 401 이고 적지 않는다', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/cashbook-entries', payload: body })

    expect(res.statusCode).toBe(401)
    expect(entries.upsert).not.toHaveBeenCalled()
  })

  it('신원을 더해 그대로 적고, 빠진 계정 칸은 null 이다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cashbook-entries',
      headers: bearer,
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(entries.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        identifiedBy: 'login',
        ocid: 'ocid-1',
        accountRecordId: null,
        categoryKey: 'item_sale',
      }),
    )
  })

  it('묶음은 본문이 틀린 건만 실패로 돌려준다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cashbook-entries/batch',
      headers: bearer,
      payload: { items: [body, { ...body, items: [] }] },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ results: BatchResult[] }>().results.map((r) => r.ok)).toEqual([true, false])
    expect(entries.upsert).toHaveBeenCalledTimes(1)
  })

  it('DELETE 는 내 줄에 지운 시각을 적고 204 다', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/cashbook-entries/${RECORD}`,
      headers: bearer,
    })

    expect(res.statusCode).toBe(204)
    expect(entries.markDeleted).toHaveBeenCalledWith('u1', RECORD)
  })
})
