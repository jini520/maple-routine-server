import { count, eq } from 'drizzle-orm'

import { faqItems, gameDataSectionUpdates } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { FaqSheetExists, FaqsRepository, NoFaqSheet } from './faqs.repository'

const addBoss = { question: '보스는 어떻게 더하나요?', answer: '추가 버튼을 누릅니다.' }
const hideBoss = {
  question: '보스를 숨길 수 있나요?',
  answer: '꺼 두면 숨겨집니다.\n\n다시 켜면 보입니다.',
}
const whatToday = { question: 'today에서는 무엇을 할 수 있나요?', answer: '오늘 할 일' }

describeDb('FaqsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: FaqsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new FaqsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  /** 묶음 셋과 문항 셋. 보스 관리의 문항이 today 의 문항을 사이에 두고 들어간다. */
  async function seed(): Promise<{ addBoss: string; hideBoss: string; whatToday: string }> {
    await repo.createSheet({ key: 'today', title: 'today' })
    await repo.createSheet({ key: 'boss-manage', title: '보스 관리' })
    await repo.createSheet({ key: 'settings-theme', title: '테마' })
    const a = await repo.createItem('boss-manage', addBoss)
    const t = await repo.createItem('today', whatToday)
    const h = await repo.createItem('boss-manage', hideBoss)
    return { addBoss: a.id, hideBoss: h.id, whatToday: t.id }
  }

  it('칸은 표 이름의 배열에 묶음 차례 · 문항 차례로 내고 문항은 묶음을 줄 id 로 가리킨다. 문항이 없는 묶음도 낸다', async () => {
    expect(await repo.section()).toEqual({ updatedAt: null, faqSheets: [], faqItems: [] })
    await seed()

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.faqSheets.map((s) => [s.key, s.title])).toEqual([
      ['today', 'today'],
      ['boss-manage', '보스 관리'],
      ['settings-theme', '테마'],
    ])
    const id = (key: string) => section.faqSheets.find((s) => s.key === key)?.id
    expect(section.faqItems).toEqual([
      { sheetId: id('today'), ...whatToday },
      { sheetId: id('boss-manage'), ...addBoss },
      { sheetId: id('boss-manage'), ...hideBoss },
    ])
    // 관리 화면은 같은 줄을 묶음 key 로 잇는다.
    expect((await repo.adminRows()).items.map((i) => [i.sheet, i.question])).toEqual([
      ['today', whatToday.question],
      ['boss-manage', addBoss.question],
      ['boss-manage', hideBoss.question],
    ])
  })

  it('묶음과 문항은 한 칸씩 옮긴다. 끝이면 그대로 true 이고 모르면 false 다', async () => {
    const ids = await seed()

    expect(await repo.moveSheet('boss-manage', 'up')).toBe(true)
    expect(await repo.moveSheet('settings-theme', 'down')).toBe(true)
    expect(await repo.moveSheet('nobody', 'up')).toBe(false)
    expect(await repo.moveItem(ids.hideBoss, 'up')).toBe(true)
    expect(await repo.moveItem(ids.whatToday, 'up')).toBe(true)
    expect(await repo.moveItem('00000000-0000-4000-8000-000000000000', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.faqSheets.map((s) => s.key)).toEqual(['boss-manage', 'today', 'settings-theme'])
    expect(section.faqItems.map((i) => i.question)).toEqual([
      hideBoss.question,
      addBoss.question,
      whatToday.question,
    ])
  })

  it('같은 key 의 묶음은 FaqSheetExists 다. 묶음은 제목만 고치고, 모르는 묶음에 문항을 더하면 NoFaqSheet 다', async () => {
    const ids = await seed()

    await expect(repo.createSheet({ key: 'today', title: '오늘' })).rejects.toBeInstanceOf(
      FaqSheetExists,
    )
    await expect(repo.createItem('nobody', addBoss)).rejects.toBeInstanceOf(NoFaqSheet)
    expect(await repo.updateSheet('today', { title: '오늘' })).toBe(true)
    expect(await repo.updateSheet('nobody', { title: '누구' })).toBe(false)
    expect(await repo.updateItem(ids.addBoss, { question: '보스 추가', answer: '버튼' })).toBe(true)
    expect(await repo.updateItem('00000000-0000-4000-8000-000000000000', addBoss)).toBe(false)

    const rows = await repo.adminRows()
    expect(rows.sheets[0]).toEqual({ key: 'today', title: '오늘' })
    expect(rows.items.find((i) => i.id === ids.addBoss)).toEqual({
      id: ids.addBoss,
      sheet: 'boss-manage',
      question: '보스 추가',
      answer: '버튼',
    })
  })

  it('묶음을 지우면 그 묶음의 문항도 지워진다', async () => {
    const ids = await seed()

    expect(await repo.removeItem(ids.whatToday)).toBe(true)
    expect(await repo.removeItem(ids.whatToday)).toBe(false)
    expect(await repo.removeSheet('boss-manage')).toBe(true)
    expect(await repo.removeSheet('boss-manage')).toBe(false)

    const section = await repo.section()
    expect(section.faqSheets.map((s) => s.key)).toEqual(['today', 'settings-theme'])
    expect(section.faqItems).toEqual([])
    const [left] = await db.select({ n: count() }).from(faqItems)
    expect(left?.n).toBe(0)
  })

  it('쓰기마다 칸의 시각이 오른다. 지우기도 같다', async () => {
    const ids = await seed()
    const past = new Date(0).toISOString()
    /** 칸 시각을 과거로 돌려 두고 쓰기 하나를 부른 뒤 지금 쪽으로 올랐는지 본다. */
    const raises = async (write: () => Promise<unknown>): Promise<boolean> => {
      await db
        .update(gameDataSectionUpdates)
        .set({ updatedAt: new Date(0) })
        .where(eq(gameDataSectionUpdates.key, 'faqs'))
      await write()
      return (await repo.section()).updatedAt !== past
    }

    expect(await raises(() => repo.createSheet({ key: 'settings-about', title: '정보' }))).toBe(
      true,
    )
    expect(await raises(() => repo.updateSheet('today', { title: '오늘' }))).toBe(true)
    expect(await raises(() => repo.moveSheet('today', 'down'))).toBe(true)
    expect(await raises(() => repo.createItem('today', whatToday))).toBe(true)
    expect(await raises(() => repo.updateItem(ids.addBoss, addBoss))).toBe(true)
    expect(await raises(() => repo.moveItem(ids.hideBoss, 'up'))).toBe(true)
    expect(await raises(() => repo.removeItem(ids.hideBoss))).toBe(true)
    expect(await raises(() => repo.removeSheet('boss-manage'))).toBe(true)
  })
})
