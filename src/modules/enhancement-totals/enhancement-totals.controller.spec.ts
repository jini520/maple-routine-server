import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import type { BatchResult } from '../../common/batch'
import { SessionsRepository } from '../auth/sessions.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { EnhancementTotalsController } from './enhancement-totals.controller'
import { EnhancementTotalsRepository } from './enhancement-totals.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const body = {
  totalRecordId: RECORD,
  accountRecordId: '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  characterName: '낟낟',
  historyDate: '2026-10-20',
  enhancementCategory: 'starforce',
  itemKey: 'arcane_umbra_knuckle',
  itemName: '아케인셰이드 클로',
  attempts: 3,
  attemptCostMeso: 1_000_000,
  destroyDefenceCostMeso: 2_000_000,
}

describe('EnhancementTotalsController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1', accountRecordId: null }),
    recordAccountId: jest.fn(),
  }
  const totals = { upsert: jest.fn(), markDeleted: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EnhancementTotalsController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: EnhancementTotalsRepository, useValue: totals },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset().mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    totals.upsert.mockReset().mockResolvedValue(undefined)
    totals.markDeleted.mockReset().mockResolvedValue(undefined)
  })

  it('신원이 없으면 401 이고 적지 않는다', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/enhancement-totals', payload: body })

    expect(res.statusCode).toBe(401)
    expect(totals.upsert).not.toHaveBeenCalled()
  })

  it('신원을 더해 그대로 적고, 빠진 장비 key 는 null 이다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/enhancement-totals',
      headers: bearer,
      payload: { ...body, itemKey: undefined },
    })

    expect(res.statusCode).toBe(200)
    expect(totals.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        identifiedBy: 'login',
        totalRecordId: RECORD,
        itemKey: null,
        attemptCostMeso: 1_000_000,
        destroyDefenceCostMeso: 2_000_000,
      }),
    )
  })

  // 분류는 앱 화면의 다섯뿐이다. 모르는 값을 받으면 통계에 이름 없는 분류가 생긴다.
  it('묶음은 모르는 분류 같은 틀린 건만 실패로 돌려준다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/enhancement-totals/batch',
      headers: bearer,
      payload: { items: [body, { ...body, enhancementCategory: 'flame' }] },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ results: BatchResult[] }>().results.map((r) => r.ok)).toEqual([true, false])
    expect(totals.upsert).toHaveBeenCalledTimes(1)
  })

  it('DELETE 는 내 줄에 지운 시각을 적고 204 다', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/enhancement-totals/${RECORD}`,
      headers: bearer,
    })

    expect(res.statusCode).toBe(204)
    expect(totals.markDeleted).toHaveBeenCalledWith('u1', RECORD)
  })
})
