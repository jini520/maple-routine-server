import { bosses, gameRules } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { gameDataStamp, touchSection } from './sections'

describeDb('gameDataStamp', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  // 응답을 다시 만들지 이 값으로 정한다. bosses 칸만 칸 시각이 아니라 보스 줄 · 규칙 줄의 시각을 쓴다.
  it('칸 시각 · 보스 줄 · 규칙 줄 중 하나라도 바뀌면 다른 값이고, 아무것도 안 바뀌면 같은 값이다', async () => {
    const portrait = (await insertAssets(db, ['bosses/zakum.webp']))['bosses/zakum.webp'] ?? ''
    await db.insert(bosses).values({
      key: 'zakum',
      name: '자쿰',
      alias: '자쿰',
      cycle: 'weekly',
      portraitAssetId: portrait,
      sortOrder: 0,
    })
    await db.insert(gameRules).values({ key: 'weekly_boss_selection_limit', value: 12 })
    await touchSection(db, 'worlds')

    const first = await gameDataStamp(db)
    expect(await gameDataStamp(db)).toBe(first)

    await touchSection(db, 'worlds')
    const afterSection = await gameDataStamp(db)
    expect(afterSection).not.toBe(first)

    await db.update(bosses).set({ updatedAt: new Date(Date.now() + 60_000) })
    const afterBoss = await gameDataStamp(db)
    expect(afterBoss).not.toBe(afterSection)

    await db.update(gameRules).set({ updatedAt: new Date(Date.now() + 120_000) })
    expect(await gameDataStamp(db)).not.toBe(afterBoss)
  })
})
