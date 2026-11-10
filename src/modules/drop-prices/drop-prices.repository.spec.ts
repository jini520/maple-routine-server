import { eq } from 'drizzle-orm'

import {
  dropPrices,
  items,
  nexonAccountMapleIds,
  nexonAccounts,
  users,
  worlds,
} from '../../database/schema'
import { BossesRepository } from '../bosses/bosses.repository'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import {
  type DropPriceInput,
  DropPricesRepository,
  NoDropItem,
  NoWorld,
} from './drop-prices.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['bosses/lucid.webp']

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('DropPricesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: DropPricesRepository
  let me: string
  let other: string
  let myAccount: string
  let otherAccount: string
  const mine = () => ({ userId: me, nexonAccountId: myAccount })

  const input = (over: Partial<DropPriceInput> = {}): DropPriceInput => ({
    userId: me,
    nexonAccountId: myAccount,
    identifiedBy: 'key',
    dropRecordId: RECORD,
    itemKey: 'ring',
    priceMeso: 100,
    periodKey: '2026-10-08',
    worldKey: 'scania',
    ringLevel: 4,
    bossDifficultyId: null,
    bossId: null,
    periodRecordId: null,
    recordStatus: 'completed',
    pricedAt: null,
    owner: null,
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new DropPricesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    await insertAssets(db, SPEC_ASSETS)
    const rows = await db.insert(users).values([{}, {}]).returning({ id: users.id })
    me = rows[0].id
    other = rows[1].id
    const accounts = await db
      .insert(nexonAccounts)
      .values([{ userId: me }, { userId: other }])
      .returning({ id: nexonAccounts.id })
    myAccount = accounts[0].id
    otherAccount = accounts[1].id
    await db.insert(nexonAccountMapleIds).values([
      { nexonAccountId: myAccount, mapleId: 'm-me' },
      { nexonAccountId: otherAccount, mapleId: 'm-other' },
    ])
    // 가격 줄이 아이템 · 월드 표의 줄을 가리킨다. 스펙이 쓰는 key 둘과 월드 하나를 먼저 세운다.
    await db.insert(items).values([
      { key: 'ring', name: '반지', valuable: true, isDrop: true },
      { key: 'cape', name: '망토', valuable: false, isDrop: true },
    ])
    await db.insert(worlds).values({
      key: 'scania',
      name: '스카니아',
      challengers: false,
      event: false,
      sortOrder: 0,
    })
  })
  afterAll(() => close())

  // 어느 처치에서 나온 드롭인지 잇는 칸이다. 드롭은 처치하지 않은 기간에도 있어 외래키가 아니라 기기 id 다.
  it('처치 기간 id 를 적고 다시 보내면 덮는다', async () => {
    await repo.upsert(input({ periodRecordId: '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b' }))

    expect((await db.select().from(dropPrices))[0]?.periodRecordId).toBe(
      '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
    )
  })

  it('처음은 줄을 만들고 같은 기록을 다시 적으면 값만 덮는다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ priceMeso: 250, identifiedBy: 'login' }))

    const rows = await db.select().from(dropPrices)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.priceMeso).toBe(250)
    expect(rows[0]?.recordStatus).toBe('completed')
    expect(rows[0]?.identifiedBy).toBe('login')
    expect(rows[0]?.updatedAt.getTime()).toBeGreaterThanOrEqual(rows[0]?.createdAt.getTime() ?? 0)
  })

  // 기기는 그룹을 저장할 때마다 같은 값을 다시 보낸다. 그때 거래 시각이 움직이면 시세 차트의 날이 틀어진다.
  it('priced_at 은 같은 가격이 다시 오면 그대로이고, 가격이 바뀌거나 completed 가 되면 움직이고, 아니면 비운다', async () => {
    const past = new Date('2026-10-01T00:00:00Z')
    const pricedAt = async () => (await db.select().from(dropPrices))[0]?.pricedAt ?? null

    await repo.upsert(input())
    await db.update(dropPrices).set({ pricedAt: past })
    await repo.upsert(input())
    expect(await pricedAt()).toEqual(past)

    await repo.upsert(input({ priceMeso: 200 }))
    expect((await pricedAt())?.getTime()).toBeGreaterThan(past.getTime())

    await repo.upsert(input({ priceMeso: null, recordStatus: 'pending' }))
    expect(await pricedAt()).toBeNull()
    await repo.upsert(input({ priceMeso: 200 }))
    expect(await pricedAt()).not.toBeNull()

    await repo.markDeleted(mine(), RECORD)
    expect(await pricedAt()).toBeNull()
  })

  // 과거 올리기는 몇 달 전에 판 기록을 오늘 보낸다. 받은 시각을 적으면 그 기록이 전부 오늘 거래가 된다.
  it('기기가 보낸 거래 시각은 그대로 적고, 같은 가격이 다시 와도 그 값으로 덮는다', async () => {
    const pricedAt = async () => (await db.select().from(dropPrices))[0]?.pricedAt ?? null
    const sold = new Date('2026-08-10T09:18:34.156Z')

    await repo.upsert(input())
    await repo.upsert(input({ pricedAt: sold }))
    expect(await pricedAt()).toEqual(sold)

    await repo.upsert(input({ pricedAt: null, recordStatus: 'pending', priceMeso: null }))
    expect(await pricedAt()).toBeNull()
  })

  // 기기 시계가 앞서 있으면 미래 거래가 생겨 최근 거래가가 그 값에 묶인다.
  it('미래의 거래 시각은 받은 시각으로 자른다', async () => {
    const before = Date.now()
    await repo.upsert(input({ pricedAt: new Date('2099-01-01T00:00:00Z') }))

    const stored = (await db.select().from(dropPrices))[0]?.pricedAt?.getTime() ?? 0
    expect(stored).toBeGreaterThanOrEqual(before - 1000)
    expect(stored).toBeLessThanOrEqual(Date.now() + 1000)
  })

  // 아이템 · 월드는 시세의 축이라 모르는 값을 받으면 어느 아이템의 시세인지 모르는 줄이 된다. 월드가 없는 줄은 받는다.
  it('표에 없는 아이템 · 월드 key 는 NoDropItem · NoWorld 로 거절하고 줄을 안 만든다. 월드 null 은 받는다', async () => {
    await expect(repo.upsert(input({ itemKey: 'nobody' }))).rejects.toThrow(
      new NoDropItem('nobody'),
    )
    await expect(repo.upsert(input({ worldKey: 'nowhere' }))).rejects.toThrow(
      new NoWorld('nowhere'),
    )
    expect(await db.select().from(dropPrices)).toHaveLength(0)

    await repo.upsert(input({ worldKey: null }))
    const rows = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(rows.map((r) => [r.itemKey, r.worldKey])).toEqual([['ring', null]])
  })

  it('남의 기록 id 로 적어도 남의 줄은 안 건드리고 내 줄이 따로 생긴다', async () => {
    await repo.upsert(input({ userId: other, priceMeso: 999 }))

    await repo.upsert(input({ priceMeso: 1 }))

    const rows = await db.select().from(dropPrices).orderBy(dropPrices.priceMeso)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.userId, r.priceMeso])).toEqual([
      [me, 1],
      [other, 999],
    ])
  })

  it('보스 난이도 줄을 가리킬 수 있고 recent 가 보스 key · 한글 이름 · 난이도를 함께 낸다', async () => {
    const bosses = new BossesRepository(db)
    await bosses.createBoss({
      key: 'lucid',
      name: '루시드',
      alias: '루시드',
      cycle: 'weekly',
      portraitSlug: 'lucid',
      difficulties: [{ difficulty: 'hard', requiredLevel: 220 }],
    })
    const found = await bosses.findDifficulty('lucid', 'hard')
    expect(found).not.toBeNull()
    expect(await bosses.findDifficulty('lucid', 'chaos')).toBeNull()
    expect(await bosses.findDifficulty('nobody', 'hard')).toBeNull()
    expect(await bosses.findDifficulty('lucid', 'ultra')).toBeNull()

    await repo.upsert(input({ bossDifficultyId: found?.id ?? null }))
    await repo.upsert(input({ dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a52', priceMeso: 5 }))

    const rows = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(rows.map((r) => [r.priceMeso, r.boss, r.bossName, r.difficulty])).toEqual([
      [5, null, null, null],
      [100, 'lucid', '루시드', 'hard'],
    ])
  })

  // 미입력 · 기록 안함도 줄이 된다. 가격은 completed 만 갖고, 분포는 completed 만 센다.
  it('pending · skipped 는 가격 없이 그 상태로 서고 분포에 안 든다', async () => {
    const pendingId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a61'
    const skippedId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a62'
    await repo.upsert(input({ dropRecordId: pendingId, priceMeso: null, recordStatus: 'pending' }))
    await repo.upsert(input({ dropRecordId: skippedId, priceMeso: null, recordStatus: 'skipped' }))
    await repo.upsert(input({ priceMeso: 300 }))

    const rows = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(rows.map((r) => [r.dropRecordId, r.recordStatus, r.priceMeso])).toEqual([
      [RECORD, 'completed', 300],
      [skippedId, 'skipped', null],
      [pendingId, 'pending', null],
    ])
    expect(await repo.summary({ itemKey: null, periodKey: null })).toEqual([
      expect.objectContaining({ itemKey: 'ring', count: 1, min: 300, max: 300 }),
    ])

    // 가격이 들어오면 같은 줄이 completed 로 바뀐다
    await repo.upsert(input({ dropRecordId: pendingId, priceMeso: 500 }))
    const [priced] = await repo.recent({ itemKey: null, periodKey: null }, 1)
    expect([priced?.dropRecordId, priced?.recordStatus, priced?.priceMeso]).toEqual([
      pendingId,
      'completed',
      500,
    ])
  })

  // DTO 가 먼저 막지만 표도 막는다. 0 으로 적는 길이 생기면 미입력과 구분이 사라진다.
  it('상태와 가격의 유무가 어긋나는 줄은 표의 CHECK 가 거절한다', async () => {
    await expect(repo.upsert(input({ priceMeso: null }))).rejects.toThrow()
    await expect(repo.upsert(input({ recordStatus: 'pending' }))).rejects.toThrow()
    expect(await db.select().from(dropPrices)).toHaveLength(0)
  })

  it('markDeleted 는 내 줄만 deleted 로 표시하고 가격을 비운다. 다시 적으면 completed 로 돌아온다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ userId: other }))

    await repo.markDeleted(mine(), RECORD)

    const minePrices = await db.select().from(dropPrices).where(eq(dropPrices.userId, me))
    const theirs = await db.select().from(dropPrices).where(eq(dropPrices.userId, other))
    expect([minePrices[0]?.recordStatus, minePrices[0]?.priceMeso]).toEqual(['deleted', null])
    expect([theirs[0]?.recordStatus, theirs[0]?.priceMeso]).toEqual(['completed', 100])

    await repo.upsert(input())
    const revived = await db.select().from(dropPrices).where(eq(dropPrices.userId, me))
    expect([revived[0]?.recordStatus, revived[0]?.priceMeso]).toEqual(['completed', 100])
  })

  it('markDeleted 는 없는 줄이면 조용하다', async () => {
    await expect(repo.markDeleted(mine(), RECORD)).resolves.toBeUndefined()
    expect(await db.select().from(dropPrices)).toHaveLength(0)
  })

  it('recent 는 필터대로 최근 것부터 내고 지운 줄도 deleted 로 보인다', async () => {
    await repo.upsert(
      input({ dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a51', priceMeso: 10 }),
    )
    await repo.upsert(
      input({
        dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a52',
        priceMeso: 20,
        itemKey: 'cape',
      }),
    )
    await repo.upsert(
      input({
        dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a53',
        priceMeso: 30,
        periodKey: '2026-10',
      }),
    )
    await repo.markDeleted(mine(), '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a51')

    const all = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(all).toHaveLength(3)
    expect(all.map((r) => r.priceMeso)).toEqual([null, 30, 20])
    expect(all.map((r) => r.recordStatus)).toEqual(['deleted', 'completed', 'completed'])
    expect(all[0]).toMatchObject({
      identifiedBy: 'key',
      userId: me,
      itemKey: 'ring',
      itemName: '반지',
      worldKey: 'scania',
      worldName: '스카니아',
    })

    expect(
      (await repo.recent({ itemKey: 'ring', periodKey: null }, 10)).map((r) => r.priceMeso),
    ).toEqual([null, 30])
    // 화면이 이름을 보이므로 이름으로도 거른다
    expect(
      (await repo.recent({ itemKey: '망토', periodKey: null }, 10)).map((r) => r.priceMeso),
    ).toEqual([20])
    expect(
      (await repo.recent({ itemKey: 'ring', periodKey: '2026-10' }, 10)).map((r) => r.priceMeso),
    ).toEqual([30])
    expect(await repo.recent({ itemKey: null, periodKey: null }, 1)).toHaveLength(1)
  })

  it('summary 는 아이템 × 기간의 개수 · 최소 · 중앙값 · 최대이고 지운 줄은 안 센다', async () => {
    const ids = ['51', '52', '53', '54', '55'].map((t) => `0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a${t}`)
    await repo.upsert(input({ dropRecordId: ids[0], priceMeso: 100 }))
    await repo.upsert(input({ dropRecordId: ids[1], priceMeso: 300 }))
    await repo.upsert(input({ dropRecordId: ids[2], priceMeso: 1_000_000 }))
    await repo.upsert(input({ dropRecordId: ids[3], priceMeso: 7, userId: other }))
    await repo.upsert(
      input({ dropRecordId: ids[4], priceMeso: 50, itemKey: 'cape', periodKey: '2026-10' }),
    )
    await repo.markDeleted(mine(), ids[2])

    const summary = await repo.summary({ itemKey: null, periodKey: null })

    // 기간 key 는 문자열 역순이라 '2026-10-08' 이 '2026-10' 앞이다
    expect(summary).toEqual([
      {
        itemKey: 'ring',
        itemName: '반지',
        periodKey: '2026-10-08',
        count: 3,
        min: 7,
        median: 100,
        max: 300,
      },
      {
        itemKey: 'cape',
        itemName: '망토',
        periodKey: '2026-10',
        count: 1,
        min: 50,
        median: 50,
        max: 50,
      },
    ])
    expect(await repo.summary({ itemKey: 'ring', periodKey: null })).toHaveLength(1)
    expect(await repo.summary({ itemKey: '반지', periodKey: null })).toHaveLength(1)
    expect(await repo.summary({ itemKey: 'none', periodKey: null })).toEqual([])
  })

  describe('넥슨이 준 값으로 가린다', () => {
    const R1 = '1a1a1a1a-0000-4000-8000-00000000001a'
    const R2 = '2b2b2b2b-0000-4000-8000-00000000002b'
    let lucid: string

    beforeEach(async () => {
      const created = await new BossesRepository(db).createBoss({
        key: 'lucid',
        name: '루시드',
        alias: '루시드',
        cycle: 'weekly',
        portraitSlug: 'lucid',
        difficulties: [{ difficulty: 'hard', requiredLevel: 220 }],
      })
      lucid = created.id
    })

    const drop = (
      over: Partial<DropPriceInput> = {},
      owner: Partial<DropPriceInput['owner'] & object> = {},
    ) =>
      input({
        bossId: lucid,
        owner: { mapleId: 'm-me', ocid: 'o1', itemOrdinal: 1, ...owner },
        ...over,
      })
    const rows = () => db.select().from(dropPrices).orderBy(dropPrices.createdAt)

    // 남의 메이플 ID 를 아는 사람이 그 기록을 덮거나 막으면 안 된다. 실패로 답해 앱 대기 표가 다시 보낸다.
    it('메이플 ID 가 보낸 계정의 것이 아니면 MapleIdNotOwned 로 거절하고 적지 않는다', async () => {
      await expect(repo.upsert(drop({}, { mapleId: 'm-other' }))).rejects.toBeInstanceOf(
        MapleIdNotOwned,
      )
      expect(await rows()).toEqual([])
    })

    // 시세에서 같은 드롭을 두 번 세지 않는다(사용자 지정 2026-11-09). 앱의 기록은 그대로 둔다.
    it('같은 드롭(ocid · 보스 · 기간 · 아이템 · 몇 번째)이 이미 있으면 누가 보냈든 적지 않는다', async () => {
      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 100 }))

      await repo.upsert(
        drop(
          { dropRecordId: R2, priceMeso: 999, userId: other, nexonAccountId: otherAccount },
          { mapleId: 'm-other' },
        ),
      )

      expect((await rows()).map((r) => [r.dropRecordId, r.priceMeso, r.mapleId])).toEqual([
        [R1, 100, 'm-me'],
      ])
    })

    // 리프하면 기기가 기록을 새 ocid 로 옮긴다. 메이플 ID 는 그대로라 같은 줄을 찾아 ocid 를 고친다.
    it('같은 메이플 ID · 같은 기록 id 로 다시 오면 그 줄을 고치고, 리프로 ocid 가 바뀌어도 같은 줄이다', async () => {
      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 100 }))

      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 200 }, { ocid: 'o2' }))

      expect((await rows()).map((r) => [r.ocid, r.priceMeso, r.bossId, r.itemOrdinal])).toEqual([
        ['o2', 200, lucid, 1],
      ])
    })

    it('고친 값이 다른 줄과 같은 드롭이 되면 그 고침을 적지 않는다', async () => {
      await repo.upsert(drop({ dropRecordId: R1 }))
      await repo.upsert(drop({ dropRecordId: R2, priceMeso: 300 }, { itemOrdinal: 2 }))

      await repo.upsert(drop({ dropRecordId: R2, priceMeso: 400 }, { itemOrdinal: 1 }))

      expect((await rows()).map((r) => [r.dropRecordId, r.itemOrdinal, r.priceMeso])).toEqual([
        [R1, 1, 100],
        [R2, 2, 300],
      ])
    })

    // 지운 줄이 자리를 쥐고 있으면 같은 자리에 다시 적은 드롭을 받지 못한다.
    it('기기에서 지운 줄은 같은 드롭 판정에서 빠진다', async () => {
      await repo.upsert(drop({ dropRecordId: R1 }))
      await repo.markDeleted(mine(), R1)

      await repo.upsert(drop({ dropRecordId: R2, priceMeso: 500 }))

      expect((await rows()).map((r) => [r.dropRecordId, r.recordStatus])).toEqual([
        [R1, 'deleted'],
        [R2, 'completed'],
      ])
    })

    // 1.0.14 앱이 과거 드롭을 처음부터 다시 올려 옛 줄에 넥슨이 준 값을 채운다.
    it('메이플 ID 가 없는 옛 줄은 같은 사람 · 기록 id 로 찾아 ocid · 메이플 ID 를 채운다', async () => {
      await repo.upsert(input({ dropRecordId: R1 }))

      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 150 }))

      expect((await rows()).map((r) => [r.userId, r.mapleId, r.ocid, r.priceMeso])).toEqual([
        [me, 'm-me', 'o1', 150],
      ])
    })

    it('채우다가 다른 줄과 같은 드롭이 되면 먼저 들어온 줄을 남기고 나중 줄을 지운다', async () => {
      const backdate = (id: string, at: string) =>
        db
          .update(dropPrices)
          .set({ createdAt: new Date(at) })
          .where(eq(dropPrices.dropRecordId, id))
      // 옛 줄이 먼저 들어왔다
      await repo.upsert(input({ dropRecordId: R1, priceMeso: 1 }))
      await backdate(R1, '2026-10-01T00:00:00Z')
      await repo.upsert(
        drop(
          { dropRecordId: R2, priceMeso: 2, userId: other, nexonAccountId: otherAccount },
          { mapleId: 'm-other' },
        ),
      )

      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 1 }))

      expect((await rows()).map((r) => [r.dropRecordId, r.mapleId])).toEqual([[R1, 'm-me']])

      // 다른 줄이 먼저 들어왔다
      await db.delete(dropPrices)
      await repo.upsert(
        drop(
          { dropRecordId: R2, priceMeso: 2, userId: other, nexonAccountId: otherAccount },
          { mapleId: 'm-other' },
        ),
      )
      await backdate(R2, '2026-10-01T00:00:00Z')
      await repo.upsert(input({ dropRecordId: R1, priceMeso: 1 }))

      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 1 }))

      expect((await rows()).map((r) => [r.dropRecordId, r.mapleId])).toEqual([[R2, 'm-other']])
    })

    // 남긴 ocid 가 있어야 지운 뒤 돌아온 사람이 같은 드롭을 다시 보내도 줄이 늘지 않는다(사용자 지정 2026-11-09).
    it('계정을 지우면 메이플 ID 는 비고 ocid 는 남아, 돌아와 다시 보내도 줄이 늘지 않는다', async () => {
      await repo.upsert(drop({ dropRecordId: R1 }))
      await db.delete(users).where(eq(users.id, me))

      expect((await rows()).map((r) => [r.userId, r.mapleId, r.ocid])).toEqual([[null, null, 'o1']])

      const [back] = await db.insert(users).values({}).returning({ id: users.id })
      const [account] = await db
        .insert(nexonAccounts)
        .values({ userId: back.id })
        .returning({ id: nexonAccounts.id })
      await db.insert(nexonAccountMapleIds).values({ nexonAccountId: account.id, mapleId: 'm-me' })
      await repo.upsert(drop({ dropRecordId: R1, userId: back.id, nexonAccountId: account.id }))

      expect(await rows()).toHaveLength(1)
    })

    it('markDeleted 는 내 계정의 메이플 ID 줄도 지운다', async () => {
      await repo.upsert(drop({ dropRecordId: R1 }))
      const [another] = await db.insert(users).values({}).returning({ id: users.id })
      await db.update(dropPrices).set({ userId: another.id })

      await repo.markDeleted(mine(), R1)

      expect((await rows()).map((r) => r.recordStatus)).toEqual(['deleted'])
    })
  })
})
