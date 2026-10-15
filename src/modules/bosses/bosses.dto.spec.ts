import { bossInput, difficultyInput, rulesInput } from './bosses.dto'

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

describe('bossInput', () => {
  it('새 보스 하나를 받는다', () => {
    expect(bossInput.safeParse(lotus).success).toBe(true)
  })

  it('key 는 snake_case 이고 난이도와 주기는 ENUM 값만 받는다', () => {
    expect(bossInput.safeParse({ ...lotus, key: 'Lotus' }).success).toBe(false)
    expect(bossInput.safeParse({ ...lotus, cycle: 'daily' }).success).toBe(false)
    expect(
      bossInput.safeParse({ ...lotus, difficulties: [{ difficulty: 'hell', requiredLevel: 1 }] })
        .success,
    ).toBe(false)
  })

  it('같은 난이도가 두 번이거나 난이도가 없으면 거절한다', () => {
    expect(
      bossInput.safeParse({
        ...lotus,
        difficulties: [lotus.difficulties[0], lotus.difficulties[0]],
      }).success,
    ).toBe(false)
    expect(bossInput.safeParse({ ...lotus, difficulties: [] }).success).toBe(false)
  })
})

describe('rulesInput · difficultyInput', () => {
  it('한도 둘과 요구 레벨은 1 이상의 정수다', () => {
    expect(
      rulesInput.safeParse({ weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 }).success,
    ).toBe(true)
    expect(
      rulesInput.safeParse({ weeklyBossSelectionLimit: 0, weeklyCrystalSaleLimit: 90 }).success,
    ).toBe(false)
    expect(difficultyInput.safeParse({ difficulty: 'chaos', requiredLevel: 265 }).success).toBe(
      true,
    )
    expect(difficultyInput.safeParse({ difficulty: 'chaos', requiredLevel: 1.5 }).success).toBe(
      false,
    )
  })
})
