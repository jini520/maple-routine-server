import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { GameDataController } from './game-data.controller'
import { GameDataService } from './game-data.service'

describe('GameDataController', () => {
  let app: NestFastifyApplication
  const service = { snapshot: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GameDataController],
      providers: [{ provide: GameDataService, useValue: service }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())

  it('GET /v1/game-data 는 snapshot 을 그대로 낸다', async () => {
    const snapshot = {
      bosses: {
        updatedAt: '2026-10-15T01:00:00.000Z',
        rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 },
        bosses: [],
      },
    }
    service.snapshot.mockResolvedValue(snapshot)

    const res = await app.inject({ method: 'GET', url: '/v1/game-data' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(snapshot)
  })

  it('ETag 를 달고, If-None-Match 가 같으면 몸 없이 304 를 낸다', async () => {
    service.snapshot.mockResolvedValue({ worlds: { updatedAt: null, worlds: [] } })

    const first = await app.inject({ method: 'GET', url: '/v1/game-data' })
    const etag = first.headers.etag as string
    expect(etag).toMatch(/^"[0-9a-f]{40}"$/)
    expect(first.headers['cache-control']).toBe('no-cache')

    const again = await app.inject({
      method: 'GET',
      url: '/v1/game-data',
      headers: { 'if-none-match': etag },
    })
    expect(again.statusCode).toBe(304)
    expect(again.body).toBe('')

    const weak = await app.inject({
      method: 'GET',
      url: '/v1/game-data',
      headers: { 'if-none-match': `W/${etag}` },
    })
    expect(weak.statusCode).toBe(304)

    service.snapshot.mockResolvedValue({
      worlds: { updatedAt: '2026-10-26T00:00:00.000Z', worlds: [] },
    })
    const changed = await app.inject({
      method: 'GET',
      url: '/v1/game-data',
      headers: { 'if-none-match': etag },
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.headers.etag).not.toBe(etag)
  })
})
