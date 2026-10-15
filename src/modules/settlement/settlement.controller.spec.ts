import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { SettlementController } from './settlement.controller'
import { SettlementService } from './settlement.service'

describe('SettlementController', () => {
  let app: NestFastifyApplication
  const settlement = { current: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SettlementController],
      providers: [{ provide: SettlementService, useValue: settlement }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())

  it('GET /v1/settlement 은 서비스의 판정을 그대로 내고 캐시하지 않는다', async () => {
    settlement.current.mockReturnValue({ settling: true, startedAt: '2026-10-14T15:00:00.000Z' })

    const res = await app.inject({ method: 'GET', url: '/v1/settlement' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ settling: true, startedAt: '2026-10-14T15:00:00.000Z' })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('결산 아님이면 startedAt 이 null 이다', async () => {
    settlement.current.mockReturnValue({ settling: false, startedAt: null })

    const res = await app.inject({ method: 'GET', url: '/v1/settlement' })

    expect(res.json()).toEqual({ settling: false, startedAt: null })
  })
})
