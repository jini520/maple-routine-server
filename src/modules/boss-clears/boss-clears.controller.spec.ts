import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import type { BatchResult } from '../../common/batch'
import { sha256Hex } from '../../common/hash'
import { SessionsRepository } from '../auth/sessions.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import { UsersRepository } from '../users/users.repository'
import { BossClearsController } from './boss-clears.controller'
import {
  BossClearsRepository,
  NoBossDifficulty,
  PeriodCycleMismatch,
} from './boss-clears.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const OTHER = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const DIFFICULTY = '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const body = {
  id: RECORD,
  mapleId: sha256Hex('m1'),
  ocid: sha256Hex('ocid-1'),
  bossDifficultyId: DIFFICULTY,
  periodCode: 'W202647',
  worldId: null,
  crystalPriceMeso: 300,
  crystalReceivedMeso: 150,
  splitType: 'even',
  partySize: 2,
  splitShareMillipercent: null,
  splitFeePercent: null,
  splitFeeFollowsMvpGrade: true,
  clearedDate: '2026-11-20',
  clearRecordedBy: 'auto',
}

describe('BossClearsController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn(), touch: jest.fn() }
  const users = {
    upsertByMapleId: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1' }),
    deletionRequestedAt: jest.fn().mockResolvedValue(null),
  }
  const clears = { upsert: jest.fn(), markDeleted: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BossClearsController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: BossClearsRepository, useValue: clears },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset().mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    clears.upsert.mockReset().mockResolvedValue(undefined)
    clears.markDeleted.mockReset().mockResolvedValue(undefined)
  })

  it('신원이 없으면 401 이고 적지 않는다', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/boss-clears', payload: body })

    expect(res.statusCode).toBe(401)
    expect(clears.upsert).not.toHaveBeenCalled()
  })

  it('신원의 넥슨 계정을 더해 그대로 적는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/boss-clears',
      headers: bearer,
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(clears.upsert).toHaveBeenCalledWith({ ...body, nexonAccountId: 'a1' })
  })

  // 앱은 거절 이유로 다시 보낼지 정한다. 몸이 틀리면 400, 남의 메이플 ID 면 409 다.
  it('모르는 난이도 · 주기가 다른 기간 · 옛 기간 모양은 400, 남의 메이플 ID 는 409 maple_id_not_registered 다', async () => {
    const post = (payload: object) =>
      app.inject({ method: 'POST', url: '/v1/boss-clears', headers: bearer, payload })

    clears.upsert.mockRejectedValueOnce(new NoBossDifficulty(DIFFICULTY))
    expect((await post(body)).statusCode).toBe(400)
    clears.upsert.mockRejectedValueOnce(new PeriodCycleMismatch('M202611'))
    expect((await post(body)).statusCode).toBe(400)
    expect((await post({ ...body, periodCode: '2026-11-19' })).statusCode).toBe(400)
    clears.upsert.mockRejectedValueOnce(new MapleIdNotOwned(body.mapleId))
    const owned = await post(body)
    expect([owned.statusCode, owned.json<{ code: string }>().code]).toEqual([
      409,
      'maple_id_not_registered',
    ])
  })

  it('묶음은 건마다 결과를 돌려주고 받을 수 있는 건은 받는다', async () => {
    clears.upsert.mockImplementation((input: { id: string }) =>
      input.id === OTHER ? Promise.reject(new NoBossDifficulty(DIFFICULTY)) : Promise.resolve(),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/boss-clears/batch',
      headers: bearer,
      payload: { items: [body, { ...body, id: OTHER }, { ...body, splitType: 'half' }] },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ results: BatchResult[] }>().results.map((r) => r.ok)).toEqual([
      true,
      false,
      false,
    ])
  })

  it('DELETE 는 내 줄에 지운 시각을 적고 204 다', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/boss-clears/${RECORD}`,
      headers: bearer,
    })

    expect(res.statusCode).toBe(204)
    expect(clears.markDeleted).toHaveBeenCalledWith(
      { userId: 'u1', source: 'login', nexonAccountId: 'a1' },
      RECORD,
    )
  })
})
