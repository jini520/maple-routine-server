import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ConfigService } from '@nestjs/config'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { registerImageBody } from '../../common/image-body'
import { AssetStore } from '../assets/asset-store'
import { AdminNoticeImagesController } from './admin-notice-images.controller'

const WEBP = readFileSync(join(__dirname, '../assets/__fixtures__/vp8.webp'))

describe('AdminNoticeImagesController', () => {
  let app: NestFastifyApplication
  const store = { write: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminNoticeImagesController],
      providers: [
        { provide: AssetStore, useValue: store },
        { provide: ConfigService, useValue: { get: () => 'https://base.test' } },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    registerImageBody(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => store.write.mockReset())

  it('PUT /admin/notices/images 는 내용 해시 이름으로 쓰고 그 파일의 공개 주소를 돌려준다', async () => {
    const sha = createHash('sha256').update(WEBP).digest('hex')

    const res = await app.inject({
      method: 'PUT',
      url: '/admin/notices/images',
      headers: { 'content-type': 'image/webp' },
      payload: WEBP,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ url: `https://base.test/assets/${sha}.webp` })
    expect(store.write).toHaveBeenCalledWith(`${sha}.webp`, WEBP)
  })

  it('그림이 아닌 본문은 400 이고 쓰지 않는다', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/notices/images',
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from('not an image'),
    })

    expect(res.statusCode).toBe(400)
    expect(store.write).not.toHaveBeenCalled()
  })
})
