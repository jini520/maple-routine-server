import { periodInput, bossInput, difficultyInput } from './bosses.dto'

const lotus = {
  key: 'lotus',
  name: '스우',
  shortName: '스우',
  isSeasonBoss: false,
  portraitAssetId: '00000000-0000-4000-8000-000000000001',
  difficulties: [
    { difficulty: 'normal', cycle: 'weekly', requiredLevel: 190 },
    { difficulty: 'hard', cycle: 'weekly', requiredLevel: 190 },
  ],
}

describe('bossInput', () => {
  it('새 보스 하나를 받는다', () => {
    expect(bossInput.safeParse(lotus).success).toBe(true)
  })

  it('key 는 snake_case 이고 난이도와 주기는 ENUM 값만 받는다. 시즌 보스는 주기가 아니다', () => {
    expect(bossInput.safeParse({ ...lotus, key: 'Lotus' }).success).toBe(false)
    for (const cycle of ['daily', 'event_weekly'])
      expect(
        bossInput.safeParse({
          ...lotus,
          difficulties: [{ difficulty: 'hard', cycle, requiredLevel: 1 }],
        }).success,
      ).toBe(false)
    expect(
      bossInput.safeParse({
        ...lotus,
        difficulties: [{ difficulty: 'hell', cycle: 'weekly', requiredLevel: 1 }],
      }).success,
    ).toBe(false)
  })

  it('초상은 그림 줄 id 로 받는다', () => {
    expect(bossInput.safeParse({ ...lotus, portraitAssetId: 'lotus' }).success).toBe(false)
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

describe('difficultyInput · periodInput', () => {
  it('요구 레벨은 1 이상의 정수다', () => {
    expect(
      difficultyInput.safeParse({ difficulty: 'chaos', cycle: 'weekly', requiredLevel: 265 })
        .success,
    ).toBe(true)
    expect(
      difficultyInput.safeParse({ difficulty: 'chaos', cycle: 'weekly', requiredLevel: 1.5 })
        .success,
    ).toBe(false)
  })

  it('periodInput 은 KST 글자 둘을 받고 끝이 시작보다 앞이면 거절한다', () => {
    expect(periodInput.safeParse({ validFrom: null, validUntil: '2026-11-05' }).success).toBe(true)
    expect(
      periodInput.safeParse({ validFrom: '2026-07-03', validUntil: '2026-11-05T10:00' }).success,
    ).toBe(true)
    expect(periodInput.safeParse({}).success).toBe(true)
    expect(
      periodInput.safeParse({ validFrom: '2026-11-05', validUntil: '2026-07-03' }).success,
    ).toBe(false)
    expect(periodInput.safeParse({ validUntil: '2026-11-5' }).success).toBe(false)
  })

  it('difficultyInput 도 유효 기간 둘을 받고 끝이 앞이면 거절한다', () => {
    expect(
      difficultyInput.safeParse({
        difficulty: 'extreme',
        cycle: 'weekly',
        requiredLevel: 1,
        validFrom: '2026-11-05T10:00',
      }).success,
    ).toBe(true)
    expect(
      difficultyInput.safeParse({
        difficulty: 'extreme',
        cycle: 'weekly',
        requiredLevel: 1,
        validFrom: '2026-11-05',
        validUntil: '2026-11-01',
      }).success,
    ).toBe(false)
  })
})
