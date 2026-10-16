import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { BossesController } from './bosses.controller'
import { BossesRepository } from './bosses.repository'

describe('BossesController', () => {
  let app: NestFastifyApplication
  const repo = { catalog: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BossesController],
      providers: [{ provide: BossesRepository, useValue: repo }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())

  it('GET /v1/bosses 는 catalog 를 그대로 낸다', async () => {
    const catalog = {
      updatedAt: '2026-10-15T01:00:00.000Z',
      rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 },
      bosses: [],
    }
    repo.catalog.mockResolvedValue(catalog)

    const res = await app.inject({ method: 'GET', url: '/v1/bosses' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(catalog)
  })
})
