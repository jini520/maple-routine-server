import { sql } from 'drizzle-orm'

import { mapleIds, subAccountRegistrations } from '../../database/schema'
import { describeDb, insertNexonAccount, openTestDb, type TestDb } from '../../database/test-db'
import { assertOwnsMapleId, MapleIdNotOwned, ownedMapleIds } from './maple-id-ownership'

describeDb('메이플 ID 의 주인', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let login: string
  let sub: string
  let other: string

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(async () => {
    await truncate()
    login = (await insertNexonAccount(db, ['m-login'])).nexonAccountId
    sub = (await insertNexonAccount(db, ['m-sub'])).nexonAccountId
    other = (await insertNexonAccount(db, ['m-other'])).nexonAccountId
    await db
      .insert(subAccountRegistrations)
      .values({ loginNexonAccountId: login, subNexonAccountId: sub })
  })
  afterAll(() => close())

  async function ownedBy(nexonAccountId: string): Promise<string[]> {
    const rows = await db
      .select({ hash: mapleIds.hash })
      .from(mapleIds)
      .where(sql`${mapleIds.hash} IN ${ownedMapleIds(nexonAccountId)}`)
    return rows.map((row) => row.hash).sort()
  }

  // 부계정의 기록은 1.0.15 부터 로그인의 세션으로 온다. 이 기기에 키가 없는 부계정의 기록도 세션으로 받는다.
  it('로그인은 자기 메이플 ID 와 등록한 부계정의 메이플 ID 를 쓴다', async () => {
    await expect(assertOwnsMapleId(db, login, 'm-login')).resolves.toBeUndefined()
    await expect(assertOwnsMapleId(db, login, 'm-sub')).resolves.toBeUndefined()
    expect(await ownedBy(login)).toEqual(['m-login', 'm-sub'])
  })

  // 남의 메이플 ID 를 아는 사람이 그 기록을 덮거나 막지 못하게 한다. 부계정 쪽에서 메인을 쓰는 길도 없다.
  it('남의 메이플 ID 와, 부계정에서 본 메인의 메이플 ID 는 받지 않는다', async () => {
    await expect(assertOwnsMapleId(db, login, 'm-other')).rejects.toBeInstanceOf(MapleIdNotOwned)
    await expect(assertOwnsMapleId(db, sub, 'm-login')).rejects.toBeInstanceOf(MapleIdNotOwned)
    expect(await ownedBy(sub)).toEqual(['m-sub'])
    expect(await ownedBy(other)).toEqual(['m-other'])
  })
})
