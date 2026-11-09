import { type CatalogPlan, planCatalog } from './apply-item-catalog-plan'

const row = (key: string, over: Partial<Parameters<typeof planCatalog>[0][number]> = {}) => ({
  key,
  name: key,
  category: null,
  valuable: false,
  worldBound: false,
  level: null,
  isDrop: false,
  isEquipment: true,
  icon: null,
  ...over,
})

describe('planCatalog', () => {
  it('서버에 없는 그림 경로만 올리고, 같은 경로에 다른 그림이 있으면 덮지 않고 알린다', () => {
    const plan: CatalogPlan = {
      items: [
        { key: 'a', category: 'ring', icon: 'items/a.png' },
        { key: 'b', category: 'ring', icon: 'items/b.png' },
        { key: 'c', category: 'ring', icon: 'items/c.png' },
      ],
      create: [],
    }
    const result = planCatalog(
      [row('a'), row('b'), row('c')],
      [
        { path: 'items/b.png', sha256: 'bbb' },
        { path: 'items/c.png', sha256: 'old' },
      ],
      plan,
      new Map([
        ['items/a.png', 'aaa'],
        ['items/b.png', 'bbb'],
        ['items/c.png', 'new'],
      ]),
    )
    expect(result.uploads).toEqual(['items/a.png'])
    expect(result.conflicts).toEqual(['items/c.png'])
  })

  it('분류가 다르거나 그림이 빈 아이템만 고치고, 이미 있는 그림 · 이름 · 역할은 그대로 보낸다', () => {
    const current = [
      row('same', { category: 'ring' }),
      row('recat', { category: 'pendant', name: '이름', level: 160, isDrop: true }),
      row('keep_icon', {
        category: 'ring',
        icon: { id: 'old-id', path: 'items/old.png', file: 'x.png' },
      }),
      row('fill_icon', { category: 'ring' }),
    ]
    const result = planCatalog(
      current,
      [],
      {
        items: [
          { key: 'same', category: 'ring', icon: null },
          { key: 'recat', category: 'ring', icon: null },
          { key: 'keep_icon', category: 'ring', icon: 'items/new.png' },
          { key: 'fill_icon', category: 'ring', icon: 'items/f.png' },
        ],
        create: [],
      },
      new Map([
        ['items/new.png', 'n'],
        ['items/f.png', 'f'],
      ]),
    )
    expect(result.updates).toEqual([
      {
        key: 'recat',
        input: {
          name: '이름',
          category: 'ring',
          iconAssetId: null,
          valuable: false,
          worldBound: false,
          level: 160,
          isDrop: true,
          isEquipment: true,
        },
        iconPath: null,
      },
      {
        key: 'fill_icon',
        input: {
          name: 'fill_icon',
          category: 'ring',
          iconAssetId: null,
          valuable: false,
          worldBound: false,
          level: null,
          isDrop: false,
          isEquipment: true,
        },
        iconPath: 'items/f.png',
      },
    ])
    // keep_icon 의 그림은 운영자가 붙인 것일 수 있어 바꾸지 않는다. 그래서 그 그림도 올리지 않는다.
    expect(result.uploads).toEqual(['items/f.png'])
  })

  it('없는 key 는 역할 없이 더하고, 이미 있는 key 는 고치기로 돌리며, 서버에 없는 고치기 key 는 알린다', () => {
    const result = planCatalog(
      [row('exists', { category: null })],
      [],
      {
        items: [{ key: 'gone', category: 'ring', icon: null }],
        create: [
          { key: 'fresh', name: '새 아이템', category: 'soul', icon: 'items/fresh.png' },
          { key: 'exists', name: 'exists', category: 'soul', icon: null },
        ],
      },
      new Map([['items/fresh.png', 's']]),
    )
    expect(result.creates).toEqual([
      {
        key: 'fresh',
        input: {
          name: '새 아이템',
          category: 'soul',
          iconAssetId: null,
          valuable: false,
          worldBound: false,
          level: null,
          isDrop: false,
          isEquipment: false,
        },
        iconPath: 'items/fresh.png',
      },
    ])
    expect(result.updates.map((u) => [u.key, u.input.category])).toEqual([['exists', 'soul']])
    expect(result.unknown).toEqual(['gone'])
  })

  it('그림 파일이 폴더에 없으면 그 경로를 알리고 올리지 않는다', () => {
    const result = planCatalog(
      [row('a')],
      [],
      { items: [{ key: 'a', category: 'ring', icon: 'items/a.png' }], create: [] },
      new Map(),
    )
    expect(result.uploads).toEqual([])
    expect(result.missingFiles).toEqual(['items/a.png'])
  })
})
