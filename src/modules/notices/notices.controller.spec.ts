import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { NoticesController } from './notices.controller'
import { NoticesService } from './notices.service'

describe('NoticesController', () => {
  let app: NestFastifyApplication
  const service = { list: jest.fn(), detail: jest.fn(), sunday: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NoticesController],
      providers: [{ provide: NoticesService, useValue: service }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    service.list.mockReset()
    service.detail.mockReset()
    service.sunday.mockReset()
  })

  it('GET /v1/notices 는 kind 를 쉼표로 받고 items 와 nextCursor null 을 낸다', async () => {
    service.list.mockResolvedValue([{ id: 'game-1' }])

    const res = await app.inject({ method: 'GET', url: '/v1/notices?limit=5&kind=game,update' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [{ id: 'game-1' }], nextCursor: null })
    expect(service.list).toHaveBeenCalledWith(['game', 'update'], 5)
  })

  it('kind 가 없으면 전 분류이고 limit 기본은 20 이다', async () => {
    service.list.mockResolvedValue([])

    await app.inject({ method: 'GET', url: '/v1/notices' })

    expect(service.list).toHaveBeenCalledWith(null, 20)
  })

  it('모르는 kind 나 limit 0 은 400 이다', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/notices?kind=web' })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/v1/notices?limit=0' })).statusCode).toBe(400)
    expect(service.list).not.toHaveBeenCalled()
  })

  it('GET /v1/notices/:id 는 하나를 내고 없으면 404 다', async () => {
    service.detail.mockResolvedValueOnce({ id: 'notice-1' }).mockResolvedValueOnce(null)

    const found = await app.inject({ method: 'GET', url: '/v1/notices/notice-1' })
    expect(found.statusCode).toBe(200)
    expect(found.json()).toEqual({ id: 'notice-1' })
    expect(service.detail).toHaveBeenCalledWith('notice-1')

    expect((await app.inject({ method: 'GET', url: '/v1/notices/nope' })).statusCode).toBe(404)
  })

  it('GET /v1/sunday-maple 은 items 를 낸다', async () => {
    service.sunday.mockResolvedValue([{ id: 'event-1' }])

    const res = await app.inject({ method: 'GET', url: '/v1/sunday-maple?limit=3' })

    expect(res.json()).toEqual({ items: [{ id: 'event-1' }] })
    expect(service.sunday).toHaveBeenCalledWith(3)
  })
})
