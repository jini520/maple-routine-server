import { bosses } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { AlreadyOpen, ManualCompletionRepository } from './manual-completion.repository'

describeDb('ManualCompletionRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: ManualCompletionRepository
  let kaling: string
  let blackMage: string

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new ManualCompletionRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    const rows = await db
      .insert(bosses)
      .values([
        {
          key: 'kaling',
          name: '카링',
          alias: '카링',
          cycle: 'weekly',
          portraitSlug: 'kaling',
          sortOrder: 0,
        },
        {
          key: 'black_mage',
          name: '검은 마법사',
          alias: '검은 마법사',
          cycle: 'monthly',
          portraitSlug: 'blackMage',
          sortOrder: 1,
        },
      ])
      .returning({ id: bosses.id })
    kaling = rows[0].id
    blackMage = rows[1].id
  })
  afterAll(() => close())

  it('열면 앱이 읽는 목록에 key 와 from 으로 선다', async () => {
    await repo.openBoss(kaling, '2026-09-17')
    await repo.openBoss(blackMage, '2026-09-01')

    expect(await repo.open()).toEqual([
      { boss: 'kaling', from: '2026-09-17' },
      { boss: 'black_mage', from: '2026-09-01' },
    ])
  })

  it('같은 보스를 열린 채 또 열면 AlreadyOpen 이다', async () => {
    await repo.openBoss(kaling, '2026-09-17')

    await expect(repo.openBoss(kaling, '2026-09-18')).rejects.toBeInstanceOf(AlreadyOpen)
  })

  it('닫으면 목록에서 빠지고 줄은 남아 다시 열 수 있다', async () => {
    const { id } = await repo.openBoss(blackMage, '2026-09-01')

    expect(await repo.close(id)).toBe(true)
    expect(await repo.open()).toEqual([])
    expect(await repo.close(id)).toBe(false)

    await repo.openBoss(blackMage, '2026-10-01')
    const rows = await repo.rows()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      boss: 'black_mage',
      name: '검은 마법사',
      from: '2026-10-01',
      closedAt: null,
    })
    expect(rows[1]).toMatchObject({ id, from: '2026-09-01' })
    expect(rows[1]?.closedAt).not.toBeNull()
  })

  it('없는 id 를 닫으면 false 다', async () => {
    expect(await repo.close('00000000-0000-4000-8000-000000000000')).toBe(false)
  })
})
