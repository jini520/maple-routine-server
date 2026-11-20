import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { GameDataController } from './game-data.controller'
import { GameDataService } from './game-data.service'

describe('GameDataController', () => {
  let app: NestFastifyApplication
  const service = { response: jest.fn() }

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

  it('GET /v1/game-data 는 서비스가 낸 몸과 ETag 를 그대로 낸다', async () => {
    const body = JSON.stringify({ worlds: { updatedAt: null, worlds: [] } })
    service.response.mockResolvedValue({ body, etag: '"a1"' })

    const res = await app.inject({ method: 'GET', url: '/v1/game-data' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(body)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.headers.etag).toBe('"a1"')
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('If-None-Match 가 같으면 W/ 가 붙어도 몸 없이 304 를 내고, 다르면 몸을 낸다', async () => {
    const etag = '"a1"'
    service.response.mockResolvedValue({ body: '{}', etag })

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

    service.response.mockResolvedValue({ body: '{"a":1}', etag: '"b2"' })
    const changed = await app.inject({
      method: 'GET',
      url: '/v1/game-data',
      headers: { 'if-none-match': etag },
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.body).toBe('{"a":1}')
  })
})
