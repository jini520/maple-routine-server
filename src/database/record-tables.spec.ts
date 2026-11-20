import { eq, sql } from 'drizzle-orm'

import { isCheckViolation } from '../common/pg-errors'
import {
  characters,
  mapleIdNames,
  mapleIds,
  partyAppointments,
  rememberedLevels,
  users,
} from './schema'
import { describeDb, insertNexonAccount, openTestDb, type TestDb } from './test-db'

describeDb('기록 표', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  async function mapleIdOf(hash: string): Promise<string> {
    const [row] = await db.select({ id: mapleIds.id }).from(mapleIds).where(eq(mapleIds.hash, hash))
    if (row === undefined) throw new Error(`메이플 ID ${hash} 가 없다`)
    return row.id
  }

  // drizzle 은 트리거를 모르므로 새 기록 표의 마이그레이션이 손으로 건다. 빠뜨리면 그 표의 고친 줄을 다른 기기가 받지 못한다.
  it('변경 번호 칸이 있는 표는 모두 변경 번호 트리거를 건다', async () => {
    const result = await db.execute<{ table_name: string; has_trigger: boolean }>(sql`
      SELECT c.table_name,
             EXISTS (SELECT 1 FROM pg_trigger t
                      WHERE t.tgrelid = ('public.' || c.table_name)::regclass
                        AND t.tgname = c.table_name || '_change_seq') AS has_trigger
        FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.column_name = 'change_seq'`)

    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.filter((row) => !row.has_trigger)).toEqual([])
  })

  // 받기는 기기가 기억한 번호보다 큰 줄만 고른다. 고친 줄이 옛 번호를 들고 있으면 다른 기기가 받지 못한다.
  it('줄을 고치면 그 뒤에 쓴 줄보다 큰 번호를 받고, 쓰는 코드가 적은 번호는 무시한다', async () => {
    await insertNexonAccount(db, ['m-a', 'm-b'])
    const [first] = await db
      .insert(mapleIdNames)
      .values({ mapleId: await mapleIdOf('m-a'), name: '본캐', changeSeq: 1 })
      .returning()
    const [second] = await db
      .insert(mapleIdNames)
      .values({ mapleId: await mapleIdOf('m-b'), name: '부캐' })
      .returning()
    if (first === undefined || second === undefined) throw new Error('줄을 못 넣었다')

    const [edited] = await db
      .update(mapleIdNames)
      .set({ name: '메인', changeSeq: 0 })
      .where(eq(mapleIdNames.id, first.id))
      .returning()

    expect(first.changeSeq).toBeLessThan(second.changeSeq)
    expect(edited?.changeSeq).toBeGreaterThan(second.changeSeq)
  })

  // 계정을 지우면 서버의 기록도 지운다. 캐릭터 줄은 메이플 ID 줄을, 기록은 캐릭터 줄을 따라 지워진다.
  it('사람을 지우면 메이플 ID 를 따라 캐릭터와 그 기록이 지워진다', async () => {
    const gone = await insertNexonAccount(db, ['m-gone'])
    await insertNexonAccount(db, ['m-kept'])
    const [goneCharacter, keptCharacter] = await db
      .insert(characters)
      .values([
        { mapleId: await mapleIdOf('m-gone'), ocid: 'o-gone' },
        { mapleId: await mapleIdOf('m-kept'), ocid: 'o-kept' },
      ])
      .returning({ id: characters.id })
    if (goneCharacter === undefined || keptCharacter === undefined)
      throw new Error('캐릭터를 못 넣었다')
    const level = { type: 'symbol' as const, targetId: crypto.randomUUID(), level: 11 }
    await db.insert(rememberedLevels).values([
      { ...level, characterId: goneCharacter.id },
      { ...level, characterId: keptCharacter.id },
    ])

    await db.delete(users).where(eq(users.id, gone.userId))

    expect((await db.select().from(characters)).map((row) => row.ocid)).toEqual(['o-kept'])
    expect((await db.select().from(rememberedLevels)).map((row) => row.characterId)).toEqual([
      keptCharacter.id,
    ])
  })

  // 한 번과 매주는 쓰는 칸이 다르다. 둘을 함께 채운 약속은 기기마다 다르게 읽힌다.
  it('약속은 한 번이면 날짜만, 매주면 요일과 시작 주만 받는다', async () => {
    const { nexonAccountId } = await insertNexonAccount(db, ['m-a'])
    const base = { nexonAccountId, time: '21:00', durationMinutes: 60 }
    const once = { ...base, scheduleType: 'once' as const, date: '2026-11-21' }
    const weekly = { ...base, scheduleType: 'weekly' as const, weekday: 4, fromWeekCode: 'W202647' }

    await db.insert(partyAppointments).values([
      { ...once, id: crypto.randomUUID() },
      { ...weekly, id: crypto.randomUUID() },
    ])
    const mixed = [
      { ...once, id: crypto.randomUUID(), weekday: 4 },
      { ...weekly, id: crypto.randomUUID(), date: '2026-11-21' },
      { ...weekly, id: crypto.randomUUID(), fromWeekCode: null },
    ]
    for (const row of mixed) {
      const error: unknown = await db
        .insert(partyAppointments)
        .values(row)
        .then(
          () => null,
          (thrown: unknown) => thrown,
        )
      expect({ row, rejected: isCheckViolation(error) }).toEqual({ row, rejected: true })
    }
  })
})
