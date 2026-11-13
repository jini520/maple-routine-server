import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { AssetNotFound } from '../assets/asset-refs'
import {
  ItemGroupExists,
  ItemGroupInUse,
  ItemGroupNameTaken,
  ItemGroupsRepository,
} from '../items/item-groups.repository'
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
  const groups = {
    tree: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    move: jest.fn(),
    remove: jest.fn(),
  }
  const tree = [{ key: 'cash', name: '캐시', groups: [{ key: 'cash', name: '캐시' }] }]

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminItemsController],
      providers: [
        { provide: ItemsRepository, useValue: items },
        { provide: ItemGroupsRepository, useValue: groups },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() =>
    [...Object.values(items), ...Object.values(groups)].forEach((m) => m.mockReset()),
  )

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
    groups.tree.mockResolvedValue(tree)
    expect((await app.inject({ method: 'GET', url: '/admin/items/rows' })).json()).toEqual({
      categories: tree,
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

  it('묶음은 POST 로 더하고 201, PUT 으로 이름 · 종류를 고치고, move 로 차례를 바꾸고, DELETE 로 지운다. 모르는 key 는 404 다', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/admin/item-groups',
      payload: { key: 'boutique', kind: 'consumable', name: ' 부티크 ' },
    })
    expect(created.statusCode).toBe(201)
    expect(groups.create).toHaveBeenCalledWith({
      key: 'boutique',
      kind: 'consumable',
      name: '부티크',
    })

    const put = () =>
      app.inject({
        method: 'PUT',
        url: '/admin/item-groups/boutique',
        payload: { kind: 'cash', name: '부티크' },
      })
    groups.update.mockResolvedValue(true)
    expect((await put()).statusCode).toBe(204)
    expect(groups.update).toHaveBeenCalledWith('boutique', { kind: 'cash', name: '부티크' })
    groups.update.mockResolvedValue(false)
    expect((await put()).statusCode).toBe(404)

    const move = () =>
      app.inject({
        method: 'POST',
        url: '/admin/item-groups/boutique/move',
        payload: { direction: 'up' },
      })
    groups.move.mockResolvedValue(true)
    expect((await move()).statusCode).toBe(204)
    expect(groups.move).toHaveBeenCalledWith('boutique', 'up')
    groups.move.mockResolvedValue(false)
    expect((await move()).statusCode).toBe(404)

    const remove = () => app.inject({ method: 'DELETE', url: '/admin/item-groups/boutique' })
    groups.remove.mockResolvedValue(true)
    expect((await remove()).statusCode).toBe(204)
    groups.remove.mockResolvedValue(false)
    expect((await remove()).statusCode).toBe(404)
  })

  it('묶음 본문 모양이 틀리면 400 이다. key 는 snake_case, 종류는 코드의 다섯 가운데 하나, 이름은 비지 않는다', async () => {
    for (const payload of [
      { key: 'Boutique', kind: 'consumable', name: '부티크' },
      { key: 'boutique', kind: 'weapon', name: '부티크' },
      { key: 'boutique', kind: 'consumable', name: '  ' },
    ])
      expect(
        (await app.inject({ method: 'POST', url: '/admin/item-groups', payload })).statusCode,
      ).toBe(400)
    expect(groups.create).not.toHaveBeenCalled()
  })

  it('묶음 저장소의 거절을 상태 코드로 옮긴다', async () => {
    groups.create.mockRejectedValueOnce(new ItemGroupExists('box'))
    const exists = await app.inject({
      method: 'POST',
      url: '/admin/item-groups',
      payload: { key: 'box', kind: 'consumable', name: '새 상자' },
    })
    expect([exists.statusCode, exists.json<{ message: string }>().message]).toEqual([
      409,
      '이미 있는 묶음이다: box',
    ])

    groups.update.mockRejectedValueOnce(new ItemGroupNameTaken('상자'))
    const taken = await app.inject({
      method: 'PUT',
      url: '/admin/item-groups/boxes',
      payload: { kind: 'consumable', name: '상자' },
    })
    expect([taken.statusCode, taken.json<{ message: string }>().message]).toEqual([
      409,
      '같은 종류에 이름이 같은 묶음이 있다: 상자',
    ])

    groups.remove.mockRejectedValueOnce(new ItemGroupInUse('cash'))
    const inUse = await app.inject({ method: 'DELETE', url: '/admin/item-groups/cash' })
    expect([inUse.statusCode, inUse.json<{ message: string }>().message]).toEqual([
      409,
      '아이템이 든 묶음은 못 지운다: cash',
    ])
  })
})
