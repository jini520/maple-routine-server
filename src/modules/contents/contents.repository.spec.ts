import { contentCategories } from '../../database/schema'
import { describeDb, insertAssets, openTestDb, type TestDb } from '../../database/test-db'
import { AssetNotFound } from '../assets/asset-refs'
import {
  ApiNameTaken,
  comparableApiName,
  type ContentInput,
  ContentExists,
  ContentsRepository,
  NoContentCategory,
} from './contents.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = [
  'bosses/ancientGodMitra.webp',
  'bosses/lesa.webp',
  'maps/monsterPark.webp',
  'maps/icons/monsterPark.png',
]
const NO_ASSET = '00000000-0000-4000-8000-000000000000'

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
  let assetIds: Record<string, string>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new ContentsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    assetIds = await insertAssets(db, SPEC_ASSETS)
    // 갈래 줄은 ENUM 과 일대일이라 리포지토리가 더하지 않는다. 씨앗이 넣는 모양 그대로 둘만 둔다.
    await db.insert(contentCategories).values([
      {
        key: 'epic_dungeon',
        name: '에픽 던전',
        countTag: 'ID당 1회',
        weeklyMaxCount: 3,
        sharedSortOrder: 2,
        sortOrder: 0,
      },
      { key: 'monster_park', name: '몬스터파크', sharedSortOrder: 0, sortOrder: 1 },
    ])
  })
  afterAll(() => close())

  const base: ContentInput = {
    key: 'monster_park',
    cycle: 'daily',
    apiName: '몬스터파크',
    category: 'monster_park',
    name: '몬스터파크',
    shortName: '일간',
    countTag: '월드 당 최대 14회',
    type: 'contents',
    checkType: 'count_only',
    maxCount: 14,
    requiredLevel: 105,
    validFrom: null,
    validUntil: null,
    shareScope: 'world',
    backgroundMapAssetId: null,
    backgroundPortraitAssetId: null,
    regionIconAssetId: null,
  }
  const highMountain: ContentInput = {
    ...base,
    key: 'epic_dungeon_high_mountain',
    cycle: 'weekly',
    apiName: '에픽 던전 : 하이마운틴',
    category: 'epic_dungeon',
    name: '하이마운틴',
    shortName: '하이마운틴',
    countTag: null,
    maxCount: 5,
    requiredLevel: 260,
    shareScope: 'account',
  }
  const aurumRegis: ContentInput = {
    ...highMountain,
    key: 'epic_dungeon_aurum_regis',
    apiName: '에픽 던전 : 아우룸 레기스',
    name: '아우룸 레기스',
    shortName: '아우룸레기스',
    requiredLevel: 290,
    validFrom: '2026-09-17',
  }
  const withAssets = () => ({
    ...base,
    backgroundMapAssetId: assetIds['maps/monsterPark.webp'] ?? null,
    regionIconAssetId: assetIds['maps/icons/monsterPark.png'] ?? null,
  })
  const fieldsOf = (input: ContentInput) => {
    const fields: Partial<ContentInput> = { ...input }
    delete fields.key
    delete fields.cycle
    return fields as Omit<ContentInput, 'key' | 'cycle'>
  }
  const categoryId = async (key: 'epic_dungeon' | 'monster_park') =>
    (await repo.section()).contentCategories.find((c) => c.key === key)?.id

  it('칸은 표 이름의 배열 둘이고, 컨텐츠는 분류를 줄 id 로 가리키며 일간 뒤 주간 · 그 안은 더한 차례로 선다', async () => {
    expect(await repo.section()).toMatchObject({ updatedAt: null, contents: [] })
    const high = await repo.createContent({
      ...highMountain,
      backgroundPortraitAssetId: assetIds['bosses/ancientGodMitra.webp'] ?? null,
    })
    await repo.createContent(aurumRegis)
    const park = await repo.createContent(withAssets())

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.contentCategories).toEqual([
      {
        id: await categoryId('epic_dungeon'),
        key: 'epic_dungeon',
        name: '에픽 던전',
        countTag: 'ID당 1회',
        hidesCountTag: false,
        weeklyMaxCount: 3,
        sharedSortOrder: 2,
      },
      {
        id: await categoryId('monster_park'),
        key: 'monster_park',
        name: '몬스터파크',
        countTag: null,
        hidesCountTag: false,
        weeklyMaxCount: null,
        sharedSortOrder: 0,
      },
    ])
    expect(section.contents.map((c) => c.key)).toEqual([
      'monster_park',
      'epic_dungeon_high_mountain',
      'epic_dungeon_aurum_regis',
    ])
    const parkFields: Partial<ContentInput> = withAssets()
    delete parkFields.category
    expect(section.contents[0]).toEqual({
      ...parkFields,
      id: park.id,
      categoryId: await categoryId('monster_park'),
    })
    expect(section.contents[1]).toMatchObject({
      id: high.id,
      categoryId: await categoryId('epic_dungeon'),
      backgroundPortraitAssetId: assetIds['bosses/ancientGodMitra.webp'],
    })
    expect((await repo.adminRows()).contents[0]).toMatchObject({
      key: 'monster_park',
      category: 'monster_park',
    })
  })

  it('모르는 갈래는 NoContentCategory, 같은 key 는 ContentExists, 공백만 다른 API 이름은 ApiNameTaken, 없는 그림은 AssetNotFound 다', async () => {
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
    await expect(
      repo.createContent({ ...aurumRegis, regionIconAssetId: NO_ASSET }),
    ).rejects.toBeInstanceOf(AssetNotFound)
    expect((await repo.section()).contents.map((c) => c.key)).toEqual([
      'epic_dungeon_high_mountain',
    ])
  })

  // 완료 조건이 횟수인 줄만 완료로 세는 횟수를 든다. 다른 줄에 값이 있으면 앱이 그 값을 완료 판정에 쓸 수 있다.
  it('최대 횟수는 완료 조건이 count_only 인 줄에만 있고, 어기면 DB 가 거절한다', async () => {
    await expect(repo.createContent({ ...base, maxCount: null })).rejects.toThrow()
    await expect(
      repo.createContent({ ...base, checkType: 'state_only', type: 'quest' }),
    ).rejects.toThrow()
    await repo.createContent({ ...base, checkType: 'both', type: 'quest', maxCount: null })
    expect((await repo.section()).contents[0]).toMatchObject({ checkType: 'both', maxCount: null })
  })

  it('컨텐츠를 고치고 같은 주기 안에서 옮긴다. key 와 주기는 그대로이고 자기 API 이름은 겹침이 아니다', async () => {
    await repo.createContent(highMountain)
    await repo.createContent(aurumRegis)
    await repo.createContent(base)

    const fields = fieldsOf(aurumRegis)
    expect(
      await repo.updateContent('epic_dungeon_aurum_regis', { ...fields, validUntil: '2027-01-01' }),
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
    expect(section.contents.map((c) => [c.key, c.validUntil])).toEqual([
      ['monster_park', null],
      ['epic_dungeon_aurum_regis', '2027-01-01'],
      ['epic_dungeon_high_mountain', null],
    ])
  })

  it('갈래의 글자 · 태그 · 주간 최대 횟수 · 공유 차례를 고치고 차례를 옮긴다. 모르는 key 는 false 다', async () => {
    expect(
      await repo.updateCategory('epic_dungeon', {
        name: '에픽던전',
        countTag: null,
        hidesCountTag: true,
        weeklyMaxCount: 4,
        sharedSortOrder: null,
      }),
    ).toBe(true)
    expect(
      await repo.updateCategory('guild', {
        name: '길드',
        countTag: null,
        hidesCountTag: false,
        weeklyMaxCount: null,
        sharedSortOrder: null,
      }),
    ).toBe(false)
    expect(await repo.moveCategory('monster_park', 'up')).toBe(true)
    expect(await repo.moveCategory('monster_park', 'up')).toBe(true)
    expect(await repo.moveCategory('guild', 'up')).toBe(false)

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(
      section.contentCategories.map((c) => [c.key, c.name, c.hidesCountTag, c.weeklyMaxCount]),
    ).toEqual([
      ['monster_park', '몬스터파크', false, null],
      ['epic_dungeon', '에픽던전', true, 4],
    ])
  })
})
