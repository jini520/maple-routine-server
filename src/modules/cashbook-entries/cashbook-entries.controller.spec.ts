import { sha256Hex } from '../../common/hash'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import type { BatchResult } from '../../common/batch'
import { SessionsRepository } from '../auth/sessions.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { CashbookEntriesController } from './cashbook-entries.controller'
import { CashbookEntriesRepository } from './cashbook-entries.repository'

const M1 = sha256Hex('m1')
const OCID1 = sha256Hex('ocid-1')

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const CATEGORY = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const body = {
  id: RECORD,
  mapleId: M1,
  ocid: OCID1,
  categoryId: CATEGORY,
  date: '2026-10-26',
  recordedAt: '2026-10-26T12:00:00+09:00',
  items: [{ itemName: '루즈 컨트롤 머신 마크', quantity: 10, amountMeso: 950_000_000 }],
}

describe('CashbookEntriesController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn(), touch: jest.fn() }
  const users = {
    upsertByMapleId: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1' }),
    deletionRequestedAt: jest.fn().mockResolvedValue(null),
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

  // 빠진 칸은 비어 있는 칸이다. 저장소는 몸을 읽은 그대로 받아 칸마다 null 을 따로 채우지 않는다.
  it('신원의 넥슨 계정을 더하고, 빠진 칸은 비우며 저장 시각은 시각으로 읽는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cashbook-entries',
      headers: bearer,
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(entries.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        nexonAccountId: 'a1',
        id: RECORD,
        worldId: null,
        memo: null,
        huntInput: null,
        fragmentUses: [],
        recordedAt: new Date('2026-10-26T03:00:00Z'),
        items: [expect.objectContaining({ itemName: '루즈 컨트롤 머신 마크', targetId: null })],
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
    expect(entries.markDeleted).toHaveBeenCalledWith(
      { userId: 'u1', source: 'login', nexonAccountId: 'a1' },
      RECORD,
    )
  })
})
