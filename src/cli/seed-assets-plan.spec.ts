import { planSeed } from './seed-assets-plan'

describe('planSeed', () => {
  it('서버에 없는 그림 · 크롭만 고르고, 규칙에 없는 파일은 버린다', () => {
    const plan = planSeed(
      ['bosses/zakum.webp', 'bosses/bellona.webp', 'themes/a.webp', 'items/.DS_Store'],
      new Set(['bosses/zakum.webp']),
      {
        boss_portrait: {
          zakum: { size: '100% auto', position: '50% 45%' },
          bellona: { size: '100% auto', position: '50% 50%' },
        },
      },
      [{ kind: 'boss_portrait', slug: 'zakum' }],
    )
    expect(plan.files).toEqual(['bosses/bellona.webp'])
    expect(plan.crops).toEqual([
      {
        kind: 'boss_portrait',
        slug: 'bellona',
        crop: { size: '100% auto', position: '50% 50%' },
      },
    ])
  })
})
