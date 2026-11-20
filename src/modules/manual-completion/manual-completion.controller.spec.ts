import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { ManualCompletionController } from './manual-completion.controller'
import { ManualCompletionRepository } from './manual-completion.repository'

describe('ManualCompletionController', () => {
  let app: NestFastifyApplication
  const repo = { open: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ManualCompletionController],
      providers: [{ provide: ManualCompletionRepository, useValue: repo }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())

  it('GET /v1/manual-completion 은 표 이름의 배열로 감싼다', async () => {
    const period = { bossId: '00000000-0000-4000-8000-000000000001', fromDate: '2026-09-17' }
    repo.open.mockResolvedValue([period])

    const res = await app.inject({ method: 'GET', url: '/v1/manual-completion' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ bossManualCompletionPeriods: [period] })
  })
})
