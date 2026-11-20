import { planSeed } from './seed-assets-plan'

describe('planSeed', () => {
  it('서버에 없는 그림만 폴더를 분류로 읽어 고르고, 규칙에 없는 파일은 버린다', () => {
    const plan = planSeed(
      [
        'bosses/zakum.webp',
        'items/rings/ring.png',
        'bosses/bellona.webp',
        'themes/a.webp',
        'items/.DS_Store',
      ],
      new Set(['boss/zakum.webp']),
    )
    expect(plan).toEqual([
      {
        path: 'bosses/bellona.webp',
        key: { category: 'boss', fileName: 'bellona', extension: 'webp' },
      },
      {
        path: 'items/rings/ring.png',
        key: { category: 'item_ring', fileName: 'ring', extension: 'png' },
      },
    ])
  })
})
