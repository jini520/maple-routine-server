import { createHash } from 'node:crypto'

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { registerImageBody } from '../../common/image-body'
import { AssetStore } from '../assets/asset-store'
import { AssetsRepository } from '../assets/assets.repository'
import { ImageCropsRepository } from '../assets/image-crops.repository'
import { AdminAssetsController } from './admin-assets.controller'

const WEBP = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'ascii'), Buffer.alloc(16, 1)])
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
])

describe('AdminAssetsController', () => {
  let app: NestFastifyApplication
  const assets = { section: jest.fn(), put: jest.fn() }
  const crops = { section: jest.fn(), put: jest.fn(), remove: jest.fn() }
  const store = { write: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAssetsController],
      providers: [
        { provide: AssetsRepository, useValue: assets },
        { provide: ImageCropsRepository, useValue: crops },
        { provide: AssetStore, useValue: store },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    registerImageBody(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    for (const mock of [...Object.values(assets), ...Object.values(crops), store.write])
      mock.mockReset()
  })

  it('GET /admin/assets 는 화면, /admin/assets/rows 는 그림 · 크롭 두 칸이다', async () => {
    const page = await app.inject({ method: 'GET', url: '/admin/assets' })
    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')

    assets.section.mockResolvedValue({ updatedAt: null, files: [] })
    crops.section.mockResolvedValue({ updatedAt: null, crops: [] })
    expect((await app.inject({ method: 'GET', url: '/admin/assets/rows' })).json()).toEqual({
      assets: { updatedAt: null, files: [] },
      crops: { updatedAt: null, crops: [] },
    })
  })

  it('PUT /admin/assets/file 은 해시 이름으로 파일을 먼저 쓰고 그다음 표에 적는다', async () => {
    const order: string[] = []
    store.write.mockImplementation(() => order.push('write'))
    assets.put.mockImplementation(() => {
      order.push('put')
      return 'created'
    })
    const sha = createHash('sha256').update(WEBP).digest('hex')

    const res = await app.inject({
      method: 'PUT',
      url: `/admin/assets/file?path=${encodeURIComponent('bosses/bellona.webp')}`,
      headers: { 'content-type': 'image/webp' },
      payload: WEBP,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ path: 'bosses/bellona.webp', sha256: sha, result: 'created' })
    expect(store.write).toHaveBeenCalledWith(`${sha}.webp`, WEBP)
    expect(assets.put).toHaveBeenCalledWith('bosses/bellona.webp', sha, WEBP.length)
    expect(order).toEqual(['write', 'put'])
  })

  it('규칙에 없는 경로 · 확장자와 다른 내용 · 그림이 아닌 본문은 400 이고 아무것도 쓰지 않는다', async () => {
    const put = (path: string, type: string, payload: Buffer) =>
      app.inject({
        method: 'PUT',
        url: `/admin/assets/file?path=${encodeURIComponent(path)}`,
        headers: { 'content-type': type },
        payload,
      })
    expect((await put('guide/a.webp', 'image/webp', WEBP)).statusCode).toBe(400)
    expect((await put('bosses/bellona.webp', 'image/png', PNG)).statusCode).toBe(400)
    expect((await put('bosses/bellona.webp', 'image/webp', Buffer.from('nope'))).statusCode).toBe(
      400,
    )
    expect(store.write).not.toHaveBeenCalled()
    expect(assets.put).not.toHaveBeenCalled()
  })

  it('PUT /admin/image-crops 는 CSS 문법만 받고, DELETE 는 없으면 404 다', async () => {
    const put = (body: object) =>
      app.inject({ method: 'PUT', url: '/admin/image-crops/boss_portrait/zakum', payload: body })
    expect((await put({ size: '100% auto', position: '50% 45%' })).statusCode).toBe(204)
    expect(crops.put).toHaveBeenCalledWith('boss_portrait', 'zakum', {
      size: '100% auto',
      position: '50% 45%',
    })
    expect((await put({ size: 'cover', position: '50% 45%' })).statusCode).toBe(400)
    expect((await put({ size: '100% auto', position: 'center' })).statusCode).toBe(400)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/admin/image-crops/nope/zakum',
          payload: { size: '100% auto', position: '50% 45%' },
        })
      ).statusCode,
    ).toBe(400)

    crops.remove.mockResolvedValue(false)
    expect(
      (await app.inject({ method: 'DELETE', url: '/admin/image-crops/boss_portrait/zakum' }))
        .statusCode,
    ).toBe(404)
  })
})
