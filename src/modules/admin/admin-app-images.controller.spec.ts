import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { AppImagesRepository } from '../app-images/app-images.repository'
import { AssetNotFound } from '../assets/asset-refs'
import { AdminAppImagesController } from './admin-app-images.controller'

describe('AdminAppImagesController', () => {
  let app: NestFastifyApplication
  const images = { section: jest.fn(), set: jest.fn() }
  const ID = '11111111-1111-4111-8111-111111111111'

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAppImagesController],
      providers: [{ provide: AppImagesRepository, useValue: images }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => Object.values(images).forEach((m) => m.mockReset()))

  it('GET /admin/app-images 는 화면, rows 는 key 와 그림 id 다', async () => {
    const page = await app.inject({ method: 'GET', url: '/admin/app-images' })
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('openAssetPicker')
    images.section.mockResolvedValue({
      updatedAt: null,
      images: [{ key: 'meso_pouch', assetId: ID }],
    })
    expect((await app.inject({ method: 'GET', url: '/admin/app-images/rows' })).json()).toEqual({
      updatedAt: null,
      images: [{ key: 'meso_pouch', assetId: ID }],
    })
  })

  it('PUT /admin/app-images/:key 는 그림을 바꾸고, 모르는 key 는 404 · 없는 그림은 400 이다', async () => {
    const put = (key: string, assetId: string) =>
      app.inject({ method: 'PUT', url: `/admin/app-images/${key}`, payload: { assetId } })
    images.set.mockResolvedValue(true)
    expect((await put('meso_pouch', ID)).statusCode).toBe(204)
    expect(images.set).toHaveBeenCalledWith('meso_pouch', ID)
    images.set.mockResolvedValue(false)
    expect((await put('nobody', ID)).statusCode).toBe(404)
    images.set.mockRejectedValue(new AssetNotFound(ID))
    expect((await put('meso_pouch', ID)).statusCode).toBe(400)
    expect((await put('meso_pouch', 'not-a-uuid')).statusCode).toBe(400)
    expect((await put('Bad-Key', ID)).statusCode).toBe(400)
  })
})
