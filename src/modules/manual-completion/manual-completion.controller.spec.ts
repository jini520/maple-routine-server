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

  it('GET /v1/manual-completion 은 { bosses } 로 감싼다', async () => {
    repo.open.mockResolvedValue([{ boss: 'kaling', from: '2026-09-17' }])

    const res = await app.inject({ method: 'GET', url: '/v1/manual-completion' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ bosses: [{ boss: 'kaling', from: '2026-09-17' }] })
  })
})
