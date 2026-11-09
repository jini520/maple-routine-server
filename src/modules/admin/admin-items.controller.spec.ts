import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { AssetNotFound } from '../assets/asset-refs'
import { ITEM_CATEGORIES } from '../items/items'
import {
  InvalidItemCategory,
  ItemExists,
  ItemNameTaken,
  ItemRoleRemoved,
  ItemsRepository,
} from '../items/items.repository'
import { AdminItemsController } from './admin-items.controller'

const body = {
  name: '거대한 공포',
  category: 'dark_boss_set',
  iconAssetId: null,
  valuable: true,
  worldBound: false,
  level: 200,
  isDrop: true,
  isEquipment: true,
}

describe('AdminItemsController', () => {
  let app: NestFastifyApplication
  const items = { adminRows: jest.fn(), create: jest.fn(), update: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminItemsController],
      providers: [{ provide: ItemsRepository, useValue: items }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => Object.values(items).forEach((m) => m.mockReset()))

  it('GET /admin/items 는 화면, /admin/items/rows 는 분류 트리와 아이템이다', async () => {
    const page = await app.inject({ method: 'GET', url: '/admin/items' })
    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    // 메뉴의 게임데이터 묶음 맨 위에 아이템이 서고, 드롭 아이템 · 장비 메뉴는 없다
    expect(page.body.match(/<a [^>]*aria-current="page"[^>]*>/g)).toEqual([
      '<a href="/admin/items" aria-current="page">',
    ])
    expect(page.body).not.toContain('href="/admin/drop-items"')
    expect(page.body).not.toContain('href="/admin/equipment-items"')

    items.adminRows.mockResolvedValue([])
    expect((await app.inject({ method: 'GET', url: '/admin/items/rows' })).json()).toEqual({
      categories: ITEM_CATEGORIES,
      items: [],
    })
  })

  it('POST 는 더하고 201, PUT 은 고치고 204, 모르는 key 는 404 다', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/admin/items',
      payload: { key: 'giant_terror', ...body },
    })
    expect(created.statusCode).toBe(201)
    expect(items.create).toHaveBeenCalledWith('giant_terror', body)

    items.update.mockResolvedValue(true)
    expect(
      (await app.inject({ method: 'PUT', url: '/admin/items/giant_terror', payload: body }))
        .statusCode,
    ).toBe(204)
    items.update.mockResolvedValue(false)
    expect(
      (await app.inject({ method: 'PUT', url: '/admin/items/nobody', payload: body })).statusCode,
    ).toBe(404)
  })

  it('본문 모양이 틀리면 400 이다. key 는 snake_case, 레벨은 1 이상, 그림은 uuid 다', async () => {
    for (const payload of [
      { key: 'Giant', ...body },
      { key: 'giant', ...body, level: 0 },
      { key: 'giant', ...body, iconAssetId: 'items/giant.png' },
      { key: 'giant', ...body, name: '  ' },
    ])
      expect((await app.inject({ method: 'POST', url: '/admin/items', payload })).statusCode).toBe(
        400,
      )
    expect(items.create).not.toHaveBeenCalled()
  })

  it('저장소의 거절을 상태 코드로 옮긴다', async () => {
    const cases: [Error, number, string][] = [
      [new ItemExists('giant_terror'), 409, '이미 있는 아이템이다: giant_terror'],
      [
        new ItemNameTaken('great_terror'),
        409,
        '이름이 같은 아이템이 다른 key 로 있다: great_terror',
      ],
      [new ItemRoleRemoved('isDrop'), 409, '붙은 역할은 뺄 수 없다: 드롭 아이템'],
      [new InvalidItemCategory('equipment'), 400, '분류 트리에 없는 묶음이다: equipment'],
      [new AssetNotFound('x'), 400, '그림 표에 없는 그림이다: x'],
    ]
    for (const [error, status, message] of cases) {
      items.update.mockRejectedValueOnce(error)
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/items/giant_terror',
        payload: body,
      })
      expect([res.statusCode, res.json<{ message: string }>().message]).toEqual([status, message])
    }
  })
})
