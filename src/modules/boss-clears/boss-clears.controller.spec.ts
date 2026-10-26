import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import type { BatchResult } from '../../common/batch'
import { SessionsRepository } from '../auth/sessions.repository'
import { BossesRepository } from '../bosses/bosses.repository'
import { NoWorld } from '../drop-prices/drop-prices.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { BossClearsController } from './boss-clears.controller'
import { BossClearsRepository } from './boss-clears.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const OTHER = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const body = {
  periodRecordId: RECORD,
  ocid: 'ocid-1',
  boss: 'lucid',
  difficulty: 'hard',
  cycle: 'weekly',
  periodKey: '2026-10-22',
  worldKey: 'scania',
  priceMeso: 300,
  payoutMeso: 150,
  splitMode: 'even',
  partySize: 2,
  source: 'auto',
}

describe('BossClearsController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1', accountRecordId: null }),
    recordAccountId: jest.fn(),
  }
  const clears = { upsert: jest.fn(), markDeleted: jest.fn() }
  const bosses = { findDifficulty: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BossClearsController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: BossClearsRepository, useValue: clears },
        { provide: BossesRepository, useValue: bosses },
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
    bosses.findDifficulty.mockReset().mockResolvedValue({ id: 'diff-1' })
  })

  it('신원이 없으면 401 이고 적지 않는다', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/boss-clears', payload: body })

    expect(res.statusCode).toBe(401)
    expect(clears.upsert).not.toHaveBeenCalled()
  })

  it('보스 · 난이도를 표의 줄로 바꿔 적고, 빠진 nullable 칸은 null 이다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/boss-clears',
      headers: bearer,
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(bosses.findDifficulty).toHaveBeenCalledWith('lucid', 'hard')
    expect(clears.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        identifiedBy: 'login',
        bossDifficultyId: 'diff-1',
        myShare: null,
        sharesTotal: null,
        defeatedDate: null,
      }),
    )
  })

  // 보스 표에 없는 쌍이어도 기록은 받는다. 드롭 가격과 같은 규칙이다.
  it('표에 없는 보스 · 난이도는 빈 칸으로 받는다', async () => {
    bosses.findDifficulty.mockResolvedValue(null)

    await app.inject({ method: 'POST', url: '/v1/boss-clears', headers: bearer, payload: body })

    expect(clears.upsert).toHaveBeenCalledWith(expect.objectContaining({ bossDifficultyId: null }))
  })

  it('모르는 월드는 400 이다', async () => {
    clears.upsert.mockRejectedValue(new NoWorld('nowhere'))

    const res = await app.inject({
      method: 'POST',
      url: '/v1/boss-clears',
      headers: bearer,
      payload: body,
    })

    expect(res.statusCode).toBe(400)
  })

  it('묶음은 건마다 결과를 돌려주고 받을 수 있는 건은 받는다', async () => {
    clears.upsert.mockImplementation(async (input: { periodRecordId: string }) => {
      if (input.periodRecordId === OTHER) throw new NoWorld('nowhere')
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/boss-clears/batch',
      headers: bearer,
      payload: {
        items: [
          body,
          { ...body, periodRecordId: OTHER },
          { ...body, periodRecordId: 'bad', partySize: 0 },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ results: BatchResult[] }>().results.map((r) => [r.recordId, r.ok])).toEqual([
      [RECORD, true],
      [OTHER, false],
      ['bad', false],
    ])
  })

  it('묶음이 비었거나 100 건을 넘으면 400 이다', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/v1/boss-clears/batch',
      headers: bearer,
      payload: { items: [] },
    })
    const many = await app.inject({
      method: 'POST',
      url: '/v1/boss-clears/batch',
      headers: bearer,
      payload: { items: Array.from({ length: 101 }, () => body) },
    })

    expect(empty.statusCode).toBe(400)
    expect(many.statusCode).toBe(400)
  })

  it('DELETE 는 내 줄에 지운 시각을 적고 204 다', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/boss-clears/${RECORD}`,
      headers: bearer,
    })

    expect(res.statusCode).toBe(204)
    expect(clears.markDeleted).toHaveBeenCalledWith('u1', RECORD)
  })
})
