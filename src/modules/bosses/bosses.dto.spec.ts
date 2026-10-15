import { bossesImport } from './bosses.dto'

const lotus = {
  key: 'lotus',
  name: '스우',
  alias: '스우',
  cycle: 'weekly',
  portraitSlug: 'lotus',
  difficulties: [
    { difficulty: 'normal', requiredLevel: 190 },
    { difficulty: 'hard', requiredLevel: 190 },
  ],
}
const ok = { rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 }, bosses: [lotus] }

describe('bossesImport', () => {
  it('응답과 같은 모양을 받고 updatedAt 은 있어도 무시한다', () => {
    expect(bossesImport.safeParse(ok).success).toBe(true)
    expect(bossesImport.safeParse({ ...ok, updatedAt: 'x' }).success).toBe(true)
  })

  it('key 는 snake_case 이고 난이도와 주기는 ENUM 값만 받는다', () => {
    expect(bossesImport.safeParse({ ...ok, bosses: [{ ...lotus, key: 'Lotus' }] }).success).toBe(
      false,
    )
    expect(bossesImport.safeParse({ ...ok, bosses: [{ ...lotus, cycle: 'daily' }] }).success).toBe(
      false,
    )
    expect(
      bossesImport.safeParse({
        ...ok,
        bosses: [{ ...lotus, difficulties: [{ difficulty: 'hell', requiredLevel: 1 }] }],
      }).success,
    ).toBe(false)
  })

  it('같은 key 나 같은 난이도가 두 번이면 거절한다', () => {
    expect(bossesImport.safeParse({ ...ok, bosses: [lotus, lotus] }).success).toBe(false)
    expect(
      bossesImport.safeParse({
        ...ok,
        bosses: [{ ...lotus, difficulties: [lotus.difficulties[0], lotus.difficulties[0]] }],
      }).success,
    ).toBe(false)
  })

  it('난이도가 없는 보스와 빈 목록은 거절한다', () => {
    expect(
      bossesImport.safeParse({ ...ok, bosses: [{ ...lotus, difficulties: [] }] }).success,
    ).toBe(false)
    expect(bossesImport.safeParse({ ...ok, bosses: [] }).success).toBe(false)
  })
})
