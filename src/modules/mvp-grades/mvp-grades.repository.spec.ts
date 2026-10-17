import { mvpGrades } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { MvpGradesRepository } from './mvp-grades.repository'

describeDb('MvpGradesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: MvpGradesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new MvpGradesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    // 등급 줄은 ENUM 과 일대일이라 리포지토리가 더하지 않는다. 씨앗이 넣는 모양 그대로 셋만 둔다.
    await db.insert(mvpGrades).values([
      {
        key: 'normal',
        name: '일반',
        auctionFeePercent: 5,
        starforceDiscountPercent: 0,
        sortOrder: 0,
      },
      {
        key: 'silver',
        name: '실버',
        auctionFeePercent: 3,
        starforceDiscountPercent: 3,
        sortOrder: 1,
      },
      {
        key: 'gold',
        name: '골드',
        auctionFeePercent: 3,
        starforceDiscountPercent: 5,
        sortOrder: 2,
      },
    ])
  })
  afterAll(() => close())

  it('sort_order 차례로 내고, 이름 · 퍼센트 둘을 고치고 차례를 옮긴다. 모르는 key 는 false 다', async () => {
    expect((await repo.section()).grades.map((g) => g.key)).toEqual(['normal', 'silver', 'gold'])
    expect(
      await repo.update('gold', {
        name: '골드',
        auctionFeePercent: 3,
        starforceDiscountPercent: 7,
      }),
    ).toBe(true)
    expect(
      await repo.update('black', {
        name: '블랙',
        auctionFeePercent: 3,
        starforceDiscountPercent: 10,
      }),
    ).toBe(false)
    expect(await repo.move('gold', 'up')).toBe(true)
    expect(await repo.move('normal', 'up')).toBe(true)
    expect(await repo.move('black', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.grades).toEqual([
      { key: 'normal', name: '일반', auctionFeePercent: 5, starforceDiscountPercent: 0 },
      { key: 'gold', name: '골드', auctionFeePercent: 3, starforceDiscountPercent: 7 },
      { key: 'silver', name: '실버', auctionFeePercent: 3, starforceDiscountPercent: 3 },
    ])
  })
})
