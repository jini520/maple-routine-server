import { eq } from 'drizzle-orm'

import {
  dropBoxes,
  dropPrices,
  items,
  nexonAccountMapleIds,
  nexonAccounts,
  users,
  worlds,
} from '../../database/schema'
import { isUniqueViolation } from '../../common/pg-errors'
import { BossesRepository } from '../bosses/bosses.repository'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import {
  type DropPriceInput,
  DropPricesRepository,
  NoDropBox,
  NoDropItem,
  NoWorld,
} from './drop-prices.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['bosses/lucid.webp']

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

/** 관리 화면 필터의 빈 값. 아이템 · 기간을 안 고르고 모든 획득처다. */
const ALL = { itemKey: null, periodKey: null, source: 'all' }

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
    boxOriginKey: null,
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
    const rows = await repo.recent(ALL, 10)
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

    const rows = await repo.recent(ALL, 10)
    expect(rows.map((r) => [r.priceMeso, r.boss, r.bossName, r.difficulty])).toEqual([
      [5, null, null, null],
      [100, 'lucid', '루시드', 'hard'],
    ])
  })

  // 미입력 · 기록 안함도 줄이 된다. 가격은 completed 만 갖고, 분포는 completed 만 센다.
  it('pending · skipped 는 가격 없이 그 상태로 서고, 아이템 목록의 기록 수에는 들지만 값에는 안 든다', async () => {
    const pendingId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a61'
    const skippedId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a62'
    await repo.upsert(input({ dropRecordId: pendingId, priceMeso: null, recordStatus: 'pending' }))
    await repo.upsert(input({ dropRecordId: skippedId, priceMeso: null, recordStatus: 'skipped' }))
    await repo.upsert(input({ priceMeso: 300 }))

    const rows = await repo.recent(ALL, 10)
    expect(rows.map((r) => [r.dropRecordId, r.recordStatus, r.priceMeso])).toEqual([
      [RECORD, 'completed', 300],
      [skippedId, 'skipped', null],
      [pendingId, 'pending', null],
    ])
    expect(await repo.items(ALL)).toEqual([
      expect.objectContaining({ itemKey: 'ring', count: 3, completed: 1, min: 300, max: 300 }),
    ])

    // 가격이 들어오면 같은 줄이 completed 로 바뀐다
    await repo.upsert(input({ dropRecordId: pendingId, priceMeso: 500 }))
    const [priced] = await repo.recent(ALL, 1)
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

    const all = await repo.recent(ALL, 10)
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

    expect((await repo.recent({ ...ALL, itemKey: 'ring' }, 10)).map((r) => r.priceMeso)).toEqual([
      null,
      30,
    ])
    // 화면이 이름을 보이므로 이름으로도 거른다
    expect((await repo.recent({ ...ALL, itemKey: '망토' }, 10)).map((r) => r.priceMeso)).toEqual([
      20,
    ])
    expect(
      (await repo.recent({ ...ALL, itemKey: 'ring', periodKey: '2026-10' }, 10)).map(
        (r) => r.priceMeso,
      ),
    ).toEqual([30])
    expect(await repo.recent(ALL, 1)).toHaveLength(1)
  })

  describe('넥슨이 준 값으로 가린다', () => {
    const R1 = '1a1a1a1a-0000-4000-8000-00000000001a'
    const R2 = '2b2b2b2b-0000-4000-8000-00000000002b'
    let lucid: string
    let ringBox: string

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
      // 반지 상자. 기기는 상자에서 나온 드롭에 상자의 아이템 key 를 단다.
      const [box] = await db
        .insert(items)
        .values({ key: 'ring-box', name: '반지 상자', valuable: false, isDrop: true })
        .returning({ id: items.id })
      ringBox = box.id
      await db.insert(dropBoxes).values({ itemId: ringBox, levelMin: 1, levelMax: 4 })
    })

    const drop = (
      over: Partial<DropPriceInput> = {},
      owner: Partial<DropPriceInput['owner'] & object> = {},
    ) =>
      input({
        bossId: lucid,
        owner: { mapleId: 'm-me', ocid: 'o1', ...owner },
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
    it('같은 드롭(ocid · 보스 · 기간 · 아이템 · 획득처)이 이미 있으면 누가 보냈든 적지 않는다', async () => {
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

    // 한 캐릭터는 한 기간에 한 보스에게서 같은 아이템을 둘 얻지 못한다. 같은 아이템이 두 줄이 되는 것은
    // 직접 떨군 것과 상자에서 나온 것뿐이다(사용자 확인 2026-11-11).
    it('같은 아이템도 획득처가 다르면 따로 적는다', async () => {
      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 100 }))

      await repo.upsert(drop({ dropRecordId: R2, priceMeso: 200, boxOriginKey: 'ring-box' }))

      expect((await rows()).map((r) => [r.dropRecordId, r.boxOriginItemId])).toEqual([
        [R1, null],
        [R2, ringBox],
      ])
    })

    // 동시에 들어온 두 건은 위 판정을 함께 지나칠 수 있어 표가 막는다. 직접 떨군 드롭은 획득처가 비어 있다.
    it('표도 직접 떨군 같은 드롭을 두 줄로 두지 않는다', async () => {
      await repo.upsert(drop({ dropRecordId: R1 }))
      const [first] = await rows()

      const error = await db
        .insert(dropPrices)
        .values({ ...first, id: undefined, dropRecordId: R2 })
        .then(
          () => null,
          (e: unknown) => e,
        )

      expect(isUniqueViolation(error, 'drop_prices_same_drop_unique')).toBe(true)
    })

    it('표에 없는 상자 key 는 NoDropBox 로 거절하고 적지 않는다', async () => {
      await expect(
        repo.upsert(drop({ dropRecordId: R1, boxOriginKey: 'no-box' })),
      ).rejects.toBeInstanceOf(NoDropBox)
      await expect(
        repo.upsert(drop({ dropRecordId: R1, boxOriginKey: 'ring' })),
      ).rejects.toBeInstanceOf(NoDropBox)
      expect(await rows()).toEqual([])
    })

    // 리프하면 기기가 기록을 새 ocid 로 옮긴다. 메이플 ID 는 그대로라 같은 줄을 찾아 ocid 를 고친다.
    it('같은 메이플 ID · 같은 기록 id 로 다시 오면 그 줄을 고치고, 리프로 ocid 가 바뀌어도 같은 줄이다', async () => {
      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 100 }))

      await repo.upsert(drop({ dropRecordId: R1, priceMeso: 200 }, { ocid: 'o2' }))

      expect((await rows()).map((r) => [r.ocid, r.priceMeso, r.bossId])).toEqual([
        ['o2', 200, lucid],
      ])
    })

    it('고친 값이 다른 줄과 같은 드롭이 되면 그 고침을 적지 않는다', async () => {
      await repo.upsert(drop({ dropRecordId: R1 }))
      await repo.upsert(drop({ dropRecordId: R2, priceMeso: 300, boxOriginKey: 'ring-box' }))

      await repo.upsert(drop({ dropRecordId: R2, priceMeso: 400 }))

      expect((await rows()).map((r) => [r.dropRecordId, r.boxOriginItemId, r.priceMeso])).toEqual([
        [R1, null, 100],
        [R2, ringBox, 300],
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

  describe('관리 화면이 읽는 값', () => {
    const R = ['31', '32', '33', '34', '35'].map((t) => `3c3c3c3c-0000-4000-8000-0000000000${t}`)

    beforeEach(async () => {
      const created = await new BossesRepository(db).createBoss({
        key: 'lucid',
        name: '루시드',
        alias: '루시드',
        cycle: 'weekly',
        portraitSlug: 'lucid',
        difficulties: [{ difficulty: 'hard', requiredLevel: 220 }],
      })
      const [box] = await db
        .insert(items)
        .values({ key: 'ring-box', name: '반지 상자', valuable: false, isDrop: true })
        .returning({ id: items.id })
      await db.insert(dropBoxes).values({ itemId: box.id, levelMin: 1, levelMax: 4 })
      const owned = (ocid: string) => ({ bossId: created.id, owner: { mapleId: 'm-me', ocid } })
      // 차례대로 옛 줄 · 직접 드롭 · 상자 · 직접 드롭 대기 · 다른 기간의 망토다.
      await repo.upsert(input({ dropRecordId: R[0], priceMeso: 7 }))
      await repo.upsert(input({ dropRecordId: R[1], priceMeso: 100, ...owned('o1') }))
      await repo.upsert(
        input({ dropRecordId: R[2], priceMeso: 300, boxOriginKey: 'ring-box', ...owned('o1') }),
      )
      await repo.upsert(
        input({ dropRecordId: R[3], priceMeso: null, recordStatus: 'pending', ...owned('o2') }),
      )
      await repo.upsert(
        input({
          dropRecordId: R[4],
          priceMeso: 50,
          itemKey: 'cape',
          periodKey: '2026-10',
          ...owned('o1'),
        }),
      )
    })

    it('items 는 아이템마다 기록 수를 모든 상태로, 중앙값 · 최소 · 최대를 completed 로 세고 기간 · 획득처로 거른다', async () => {
      expect(await repo.items(ALL)).toEqual([
        {
          itemKey: 'ring',
          itemName: '반지',
          count: 4,
          completed: 3,
          min: 7,
          median: 100,
          max: 300,
        },
        { itemKey: 'cape', itemName: '망토', count: 1, completed: 1, min: 50, median: 50, max: 50 },
      ])
      expect(await repo.items({ ...ALL, periodKey: '2026-10' })).toEqual([
        expect.objectContaining({ itemKey: 'cape' }),
      ])
      const ring = async (source: string) =>
        (await repo.items({ ...ALL, periodKey: '2026-10-08', source }))[0]
      expect(await ring('direct')).toMatchObject({ count: 2, completed: 1, min: 100, max: 100 })
      expect(await ring('box')).toMatchObject({ count: 1, min: 300 })
      expect(await ring('ring-box')).toMatchObject({ count: 1, min: 300 })
      expect(await ring('unknown')).toMatchObject({ count: 1, min: 7 })
      // 가격이 하나도 없는 아이템은 값 셋이 빈다
      await db.update(dropPrices).set({ recordStatus: 'pending', priceMeso: null, pricedAt: null })
      expect((await repo.items(ALL))[0]).toMatchObject({
        completed: 0,
        min: null,
        median: null,
        max: null,
      })
    })

    // 직접 떨군 드롭도 상자 칸이 비어 있다. 넥슨이 준 값이 없는 옛 줄을 직접 드롭으로 보이면 틀린 정보가 된다.
    it('recent · points 는 획득처를 상자 · 직접 드롭 · 모름으로 가르고, 계정을 지워 메이플 ID 가 빈 줄도 ocid 가 있으면 직접 드롭이다', async () => {
      await db.update(dropPrices).set({ mapleId: null }).where(eq(dropPrices.dropRecordId, R[1]))

      const rows = await repo.recent({ ...ALL, itemKey: 'ring' }, 10)
      expect(rows.map((r) => [r.dropRecordId, r.source, r.boxKey, r.boxName])).toEqual([
        [R[3], 'direct', null, null],
        [R[2], 'box', 'ring-box', '반지 상자'],
        [R[1], 'direct', null, null],
        [R[0], 'unknown', null, null],
      ])
      expect(
        (await repo.recent({ ...ALL, source: 'unknown' }, 10)).map((r) => r.dropRecordId),
      ).toEqual([R[0]])

      const points = await repo.points({ ...ALL, itemKey: 'ring' })
      // 점그림은 차례를 쓰지 않는다
      expect(points).toHaveLength(4)
      expect(points.map((p) => [p.priceMeso, p.source, p.boxName])).toEqual(
        expect.arrayContaining([
          [100, 'direct', null],
          [300, 'box', '반지 상자'],
          [7, 'unknown', null],
          [null, 'direct', null],
        ]),
      )
    })

    it('recent 는 offset 만큼 건너뛰어 더 보기를 잇는다', async () => {
      const first = await repo.recent({ ...ALL, itemKey: 'ring' }, 2)
      const next = await repo.recent({ ...ALL, itemKey: 'ring' }, 2, 2)

      expect([...first, ...next].map((r) => r.dropRecordId)).toEqual([R[3], R[2], R[1], R[0]])
    })
  })
})
