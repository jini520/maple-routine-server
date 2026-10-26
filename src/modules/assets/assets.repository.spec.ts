import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { AssetsRepository } from './assets.repository'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)

describeDb('AssetsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: AssetsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new AssetsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('빈 표는 updatedAt null 이고, 넣으면 경로 차례로 디스크 파일 이름과 함께 낸다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, files: [] })
    await repo.put('worlds/reboot.png', SHA_B, 10)
    await repo.put('bosses/bellona.webp', SHA_A, 20)
    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.files).toEqual([
      { path: 'bosses/bellona.webp', file: `${SHA_A}.webp`, sha256: SHA_A, size: 20 },
      { path: 'worlds/reboot.png', file: `${SHA_B}.png`, sha256: SHA_B, size: 10 },
    ])
  })

  it('같은 내용이면 칸 시각을 밀지 않고, 다른 내용이면 해시를 바꾸고 민다', async () => {
    expect(await repo.put('bosses/bellona.webp', SHA_A, 20)).toBe('created')
    const first = (await repo.section()).updatedAt
    expect(await repo.put('bosses/bellona.webp', SHA_A, 20)).toBe('same')
    expect((await repo.section()).updatedAt).toBe(first)
    expect(await repo.put('bosses/bellona.webp', SHA_B, 30)).toBe('updated')
    const after = await repo.section()
    expect(after.files[0]?.sha256).toBe(SHA_B)
    expect(after.updatedAt).not.toBe(first)
  })

  it('칸 값마다 그림이 없는 것만 돌려준다', async () => {
    await repo.put('bosses/bellona.webp', SHA_A, 20)
    await repo.put('items/rings/ring.png', SHA_A, 20)
    expect(
      await repo.missing([
        { ref: 'bossPortrait', value: 'bellona' },
        { ref: 'itemIcon', value: 'ring.png' },
        { ref: 'bossPortrait', value: 'nobody' },
      ]),
    ).toEqual(['nobody'])
  })
})
