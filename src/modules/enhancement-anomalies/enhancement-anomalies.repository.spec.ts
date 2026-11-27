import { sha256Hex } from '../../common/hash'
import { enhancementAnomalies, nexonAccounts, subAccountRegistrations } from '../../database/schema'
import { describeDb, insertNexonAccount, openTestDb, type TestDb } from '../../database/test-db'
import type { IdentityContext } from '../identity/identity.guard'
import type { EnhancementAnomalyBody } from './enhancement-anomalies.dto'
import { EnhancementAnomaliesRepository } from './enhancement-anomalies.repository'

const M_ME = sha256Hex('m-me')
const M_SUB = sha256Hex('m-sub')
const M_OTHER = sha256Hex('m-other')
const M_UNSEEN = sha256Hex('m-unseen')

describeDb('EnhancementAnomaliesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: EnhancementAnomaliesRepository
  let me: IdentityContext
  let sub: string

  const item = (over: Partial<EnhancementAnomalyBody> = {}): EnhancementAnomalyBody => ({
    mapleId: M_ME,
    historyDate: '2026-10-20',
    apiType: 'starforce',
    reason: 'no_level',
    itemName: '왕푸',
    rowCount: 2,
    detail: null,
    ...over,
  })

  const accountCounts = async () =>
    (await db.select().from(enhancementAnomalies))
      .map((row) => [row.nexonAccountId, row.rowCount])
      .sort()

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new EnhancementAnomaliesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    const login = await insertNexonAccount(db, [M_ME])
    me = { userId: login.userId, source: 'login', nexonAccountId: login.nexonAccountId }
    ;({ nexonAccountId: sub } = await insertNexonAccount(db, [M_SUB]))
    await db
      .insert(subAccountRegistrations)
      .values({ loginNexonAccountId: me.nexonAccountId, subNexonAccountId: sub })
    await insertNexonAccount(db, [M_OTHER])
  })
  afterAll(() => close())

  // 앱은 오늘처럼 굳지 않은 날을 받을 때마다 그 날 전체를 다시 센다. 쌓으면 같은 줄을 여러 번 센다.
  it('같은 날 · API 종류 · 이유 · 장비 · 상세는 한 줄을 받은 수로 덮는다', async () => {
    await repo.upsert(me, [item()])
    await repo.upsert(me, [item({ rowCount: 5 })])

    const rows = await db.select().from(enhancementAnomalies)
    expect(rows.map((row) => row.rowCount)).toEqual([5])
  })

  it('한 번에 같은 열쇠가 둘 와도 거절하지 않고 나중 것을 남긴다', async () => {
    await repo.upsert(me, [item({ rowCount: 1 }), item({ rowCount: 3 })])

    expect((await db.select().from(enhancementAnomalies)).map((row) => row.rowCount)).toEqual([3])
  })

  // 앱은 상세까지 같아야 한 줄로 묶는다. 서버가 상세를 빼고 견주면 같은 날 모르는 월드 이름이 둘이면 하나만 남는다.
  it('판정하지 못한 줄은 빈 장비 이름으로 날짜 · API 종류 · 상세마다 한 줄이다', async () => {
    const unknown = item({ reason: 'event_world_unknown', itemName: '', detail: '월드 A' })
    await repo.upsert(me, [
      unknown,
      { ...unknown, apiType: 'cube' },
      { ...unknown, detail: '월드 B' },
    ])
    await repo.upsert(me, [{ ...unknown, rowCount: 7 }])

    const rows = await db.select().from(enhancementAnomalies)
    expect(rows.map((r) => [r.apiType, r.detail, r.rowCount]).sort()).toEqual(
      [
        ['cube', '월드 A', 2],
        ['starforce', '월드 A', 7],
        ['starforce', '월드 B', 2],
      ].sort(),
    )
  })

  // 계정을 지우면 넥슨 계정 칸이 빈다. 빈 줄끼리 같은 열쇠라고 부딪치면 밤의 계정 삭제가 실패한다.
  it('넥슨 계정 칸이 빈 줄끼리는 같은 열쇠여도 부딪치지 않는다', async () => {
    await repo.upsert(me, [item(), item({ mapleId: M_SUB })])

    await db.delete(nexonAccounts)

    expect((await db.select().from(enhancementAnomalies)).map((r) => r.nexonAccountId)).toEqual([
      null,
      null,
    ])
  })

  // 강화 내역은 넥슨 계정마다 받는다. 앱은 부계정의 상황도 로그인의 세션으로 보내므로, 보낸 신원의 줄에 적으면 메인의 줄을 덮는다.
  it('메인과 부계정의 메이플 ID 로 온 같은 상황은 그 메이플 ID 의 넥슨 계정마다 한 줄씩이고 서로 덮지 않는다', async () => {
    await repo.upsert(me, [item({ rowCount: 1 }), item({ mapleId: M_SUB, rowCount: 4 })])

    expect(await accountCounts()).toEqual(
      [
        [me.nexonAccountId, 1],
        [sub, 4],
      ].sort(),
    )

    await repo.upsert(me, [item({ mapleId: M_SUB, rowCount: 6 })])

    expect(await accountCounts()).toEqual(
      [
        [me.nexonAccountId, 1],
        [sub, 6],
      ].sort(),
    )
  })

  // 앱은 실패해도 다시 보내지 않는 진단 값이다. 묶음째 거절하면 같은 묶음의 맞는 상황까지 사라진다.
  it('보낸 신원이 쓸 수 없는 메이플 ID 의 상황만 버리고 나머지는 적는다', async () => {
    await repo.upsert(me, [
      item({ mapleId: M_OTHER, itemName: '남의 장비' }),
      item({ mapleId: M_UNSEEN, itemName: '모르는 장비' }),
      item({ itemName: '내 장비' }),
    ])

    const rows = await db.select().from(enhancementAnomalies)
    expect(rows.map((row) => [row.nexonAccountId, row.itemName])).toEqual([
      [me.nexonAccountId, '내 장비'],
    ])
  })

  // 다 버린 묶음으로 빈 INSERT 를 내면 Postgres 가 거절해 요청이 500 이 된다.
  it('쓸 수 있는 메이플 ID 의 상황이 없으면 적지 않고 실패하지도 않는다', async () => {
    await repo.upsert(me, [item({ mapleId: M_OTHER })])

    expect(await db.select().from(enhancementAnomalies)).toEqual([])
  })
})
