import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { registerImageBody } from '../../common/image-body'
import { AssetStore } from '../assets/asset-store'
import { AssetNotFound } from '../assets/asset-refs'
import { AssetInUse, AssetsRepository } from '../assets/assets.repository'
import { ImageCropsRepository } from '../assets/image-crops.repository'
import { ItemGroupsRepository } from '../items/item-groups.repository'
import { AdminAssetsController } from './admin-assets.controller'

const WEBP = readFileSync(join(__dirname, '../assets/__fixtures__/vp8.webp'))
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
])

describe('AdminAssetsController', () => {
  let app: NestFastifyApplication
  const assets = {
    section: jest.fn(),
    put: jest.fn(),
    adminRows: jest.fn(),
    rename: jest.fn(),
    remove: jest.fn(),
  }
  const crops = { section: jest.fn(), put: jest.fn(), remove: jest.fn() }
  const store = { write: jest.fn() }
  const groups = { tree: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAssetsController],
      providers: [
        { provide: AssetsRepository, useValue: assets },
        { provide: ImageCropsRepository, useValue: crops },
        { provide: AssetStore, useValue: store },
        { provide: ItemGroupsRepository, useValue: groups },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    registerImageBody(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    for (const mock of [
      ...Object.values(assets),
      ...Object.values(crops),
      store.write,
      groups.tree,
    ])
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
    expect(assets.put).toHaveBeenCalledWith('bosses/bellona.webp', sha, {
      size: WEBP.length,
      width: 1000,
      height: 405,
    })
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

  it('PUT /admin/image-crops 는 크롭이 가리킬 그림이 그림 표에 없으면 400 이다', async () => {
    crops.put.mockRejectedValue(new AssetNotFound('nope'))
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/image-crops/boss_portrait/nope',
      payload: { size: '100% auto', position: '50% 45%' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ message: '그림 표에 없는 그림이다: nope' })
  })

  it('GET /admin/assets/list 는 분류 트리 · 그림 줄 · 크롭이다', async () => {
    assets.section.mockResolvedValue({ updatedAt: '2026-11-09T00:00:00.000Z', files: [] })
    assets.adminRows.mockResolvedValue([{ id: 'a', label: '벨로나' }])
    crops.section.mockResolvedValue({ updatedAt: null, crops: [] })
    groups.tree.mockResolvedValue([
      { key: 'cash', name: '캐시', groups: [{ key: 'cash', name: '캐시' }] },
    ])
    const body = (await app.inject({ method: 'GET', url: '/admin/assets/list' })).json<{
      updatedAt: string
      rows: unknown[]
      crops: unknown[]
      categories: unknown[]
    }>()
    expect(body.updatedAt).toBe('2026-11-09T00:00:00.000Z')
    expect(body.rows).toEqual([{ id: 'a', label: '벨로나' }])
    expect(body.crops).toEqual([])
    expect(body.categories).toEqual([
      { key: 'cash', name: '캐시', groups: [{ key: 'cash', name: '캐시' }] },
    ])
  })

  it('PUT /admin/assets/:id/name 은 이름을 적거나 비우고, 모르는 그림은 404 다', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    assets.rename.mockResolvedValue(true)
    const put = (name: string | null) =>
      app.inject({ method: 'PUT', url: `/admin/assets/${id}/name`, payload: { name } })
    expect((await put('  벨로나 초상 ')).statusCode).toBe(204)
    expect(assets.rename).toHaveBeenLastCalledWith(id, '벨로나 초상')
    expect((await put('')).statusCode).toBe(204)
    expect(assets.rename).toHaveBeenLastCalledWith(id, null)
    assets.rename.mockResolvedValue(false)
    expect((await put('x')).statusCode).toBe(404)
  })

  it('DELETE /admin/assets/:id 는 쓰는 곳이 있으면 409 로 그 목록을 알리고, 모르는 그림은 404 다', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    assets.remove.mockResolvedValue(true)
    expect((await app.inject({ method: 'DELETE', url: `/admin/assets/${id}` })).statusCode).toBe(
      204,
    )
    assets.remove.mockRejectedValue(
      new AssetInUse([{ kind: '아이템', name: '그린 펜던트', itemCategory: 'pendant' }]),
    )
    const used = await app.inject({ method: 'DELETE', url: `/admin/assets/${id}` })
    expect(used.statusCode).toBe(409)
    expect(used.json<{ message: string }>().message).toContain('아이템 그린 펜던트')
    assets.remove.mockResolvedValue(false)
    expect((await app.inject({ method: 'DELETE', url: `/admin/assets/${id}` })).statusCode).toBe(
      404,
    )
    expect(
      (await app.inject({ method: 'DELETE', url: '/admin/assets/not-a-uuid' })).statusCode,
    ).toBe(400)
  })
})
