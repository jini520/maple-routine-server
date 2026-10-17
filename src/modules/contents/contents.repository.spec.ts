import { contentCategories } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  ApiNameTaken,
  comparableApiName,
  type ContentInput,
  ContentExists,
  ContentsRepository,
  NoContentCategory,
} from './contents.repository'

describe('comparableApiName', () => {
  it('NFC 로 맞추고 공백을 모두 지운다. 앱이 key 를 얻는 모양이다', () => {
    expect(comparableApiName('[일일 퀘스트] 소멸의 여로 조사')).toBe('[일일퀘스트]소멸의여로조사')
    expect(comparableApiName('에픽 던전 : 하이마운틴'.normalize('NFD'))).toBe('에픽던전:하이마운틴')
  })
})

describeDb('ContentsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: ContentsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new ContentsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    // 갈래 줄은 ENUM 과 일대일이라 리포지토리가 더하지 않는다. 씨앗이 넣는 모양 그대로 둘만 둔다.
    await db.insert(contentCategories).values([
      {
        key: 'epic_dungeon',
        name: '에픽 던전',
        countTag: 'ID당 1회',
        weeklyLimit: 3,
        sharedOrder: 2,
        sortOrder: 0,
      },
      { key: 'monster_park', name: '몬스터파크', sharedOrder: 0, sortOrder: 1 },
    ])
  })
  afterAll(() => close())

  const base: ContentInput = {
    key: 'monster_park',
    section: 'daily',
    apiName: '몬스터파크',
    category: 'monster_park',
    displayName: '몬스터파크',
    shortName: '몬스터파크',
    backgroundMap: 'monsterPark',
    backgroundPortrait: null,
    countTag: '월드 당 최대 14회',
    type: 'contents',
    maxCount: 14,
    requiredLevel: 105,
    from: null,
    until: null,
    shareScope: 'world',
    sharedShortName: '일간',
    onlyWhenScheduled: false,
    trustRegistrationFlag: false,
    cumulativeScore: false,
    maxCountOverride: null,
  }
  const highMountain: ContentInput = {
    ...base,
    key: 'epic_dungeon_high_mountain',
    section: 'weekly',
    apiName: '에픽 던전 : 하이마운틴',
    category: 'epic_dungeon',
    displayName: '하이마운틴',
    shortName: '에픽 던전 : 하이마운틴',
    backgroundMap: null,
    backgroundPortrait: 'ancientGodMitra',
    countTag: null,
    maxCount: 5,
    requiredLevel: 260,
    shareScope: 'account',
    sharedShortName: '하이마운틴',
  }
  const aurumRegis: ContentInput = {
    ...highMountain,
    key: 'epic_dungeon_aurum_regis',
    apiName: '에픽 던전 : 아우룸 레기스',
    displayName: '아우룸 레기스',
    shortName: '에픽 던전 : 아우룸 레기스',
    backgroundPortrait: 'lesa',
    requiredLevel: 290,
    from: '2026-09-17',
    sharedShortName: '아우룸레기스',
  }

  it('갈래는 sort_order 차례로 내고, 컨텐츠는 일간 뒤 주간이며 섹션 안은 더한 차례다', async () => {
    expect(await repo.section()).toMatchObject({ updatedAt: null, contents: [] })
    await repo.createContent(highMountain)
    await repo.createContent(aurumRegis)
    await repo.createContent(base)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.categories.map((c) => c.key)).toEqual(['epic_dungeon', 'monster_park'])
    expect(section.categories[0]).toEqual({
      key: 'epic_dungeon',
      name: '에픽 던전',
      countTag: 'ID당 1회',
      hideCountTag: false,
      weeklyLimit: 3,
      sharedOrder: 2,
    })
    expect(section.contents).toEqual([base, highMountain, aurumRegis])
  })

  it('모르는 갈래는 NoContentCategory, 같은 key 는 ContentExists, 공백만 다른 API 이름은 ApiNameTaken 이다', async () => {
    await repo.createContent(highMountain)
    await expect(repo.createContent({ ...aurumRegis, category: 'guild' })).rejects.toBeInstanceOf(
      NoContentCategory,
    )
    await expect(
      repo.createContent({ ...aurumRegis, key: 'epic_dungeon_high_mountain' }),
    ).rejects.toBeInstanceOf(ContentExists)
    await expect(
      repo.createContent({ ...aurumRegis, apiName: '에픽 던전: 하이마운틴' }),
    ).rejects.toThrow(new ApiNameTaken('epic_dungeon_high_mountain'))
    expect((await repo.section()).contents.map((c) => c.key)).toEqual([
      'epic_dungeon_high_mountain',
    ])
  })

  it('컨텐츠를 고치고 섹션 안에서 옮긴다. key 와 섹션은 그대로이고 자기 API 이름은 겹침이 아니다', async () => {
    await repo.createContent(highMountain)
    await repo.createContent(aurumRegis)
    await repo.createContent(base)

    const fields = { ...aurumRegis }
    delete (fields as { key?: string }).key
    delete (fields as { section?: string }).section
    expect(
      await repo.updateContent('epic_dungeon_aurum_regis', { ...fields, until: '2027-01-01' }),
    ).toBe(true)
    await expect(
      repo.updateContent('epic_dungeon_aurum_regis', {
        ...fields,
        apiName: '에픽던전 : 하이마운틴',
      }),
    ).rejects.toBeInstanceOf(ApiNameTaken)
    expect(await repo.updateContent('nobody', fields)).toBe(false)
    expect(await repo.moveContent('epic_dungeon_aurum_regis', 'up')).toBe(true)
    expect(await repo.moveContent('epic_dungeon_aurum_regis', 'up')).toBe(true)
    expect(await repo.moveContent('monster_park', 'down')).toBe(true)
    expect(await repo.moveContent('nobody', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.contents.map((c) => [c.key, c.until])).toEqual([
      ['monster_park', null],
      ['epic_dungeon_aurum_regis', '2027-01-01'],
      ['epic_dungeon_high_mountain', null],
    ])
  })

  it('갈래의 글자 · 태그 · 한도 · 공유 차례를 고치고 차례를 옮긴다. 모르는 key 는 false 다', async () => {
    expect(
      await repo.updateCategory('epic_dungeon', {
        name: '에픽던전',
        countTag: null,
        hideCountTag: true,
        weeklyLimit: 4,
        sharedOrder: null,
      }),
    ).toBe(true)
    expect(
      await repo.updateCategory('guild', {
        name: '길드',
        countTag: null,
        hideCountTag: false,
        weeklyLimit: null,
        sharedOrder: null,
      }),
    ).toBe(false)
    expect(await repo.moveCategory('monster_park', 'up')).toBe(true)
    expect(await repo.moveCategory('monster_park', 'up')).toBe(true)
    expect(await repo.moveCategory('guild', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.categories).toEqual([
      {
        key: 'monster_park',
        name: '몬스터파크',
        countTag: null,
        hideCountTag: false,
        weeklyLimit: null,
        sharedOrder: 0,
      },
      {
        key: 'epic_dungeon',
        name: '에픽던전',
        countTag: null,
        hideCountTag: true,
        weeklyLimit: 4,
        sharedOrder: null,
      },
    ])
  })
})
