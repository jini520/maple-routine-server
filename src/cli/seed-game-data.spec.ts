import { describeDb, openTestDb, type TestDb } from '../database/test-db'
import { BossesRepository } from '../modules/bosses/bosses.repository'
import { ContentsRepository } from '../modules/contents/contents.repository'
import { EnhancementCostsRepository } from '../modules/enhancement-costs/enhancement-costs.repository'
import { EquipmentItemsRepository } from '../modules/equipment-items/equipment-items.repository'
import { HuntingGroundsRepository } from '../modules/hunting-grounds/hunting-grounds.repository'
import { MvpGradesRepository } from '../modules/mvp-grades/mvp-grades.repository'
import { SpendCatalogRepository } from '../modules/spend-catalog/spend-catalog.repository'
import { SymbolCostsRepository } from '../modules/symbol-costs/symbol-costs.repository'
import {
  parseBossDropsSeed,
  parseBossesSeed,
  parseContentsSeed,
  parseCrystalPricesSeed,
  parseDropBoxesSeed,
  parseDropItemsSeed,
  parseEnhancementCostsSeed,
  parseEquipmentItemsSeed,
  parseHuntingGroundsSeed,
  parseMvpGradesSeed,
  parseSpendCatalogSeed,
  parseSymbolCostsSeed,
  parseWorldsSeed,
  seedGameData,
} from './seed-game-data'

const bossesSeed = {
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 },
  bosses: [
    {
      key: 'lotus',
      name: '스우',
      alias: '스우',
      cycle: 'weekly',
      portraitSlug: 'lotus',
      difficulties: [
        { difficulty: 'normal', requiredLevel: 190 },
        { difficulty: 'hard', requiredLevel: 190 },
      ],
    },
    {
      key: 'meirin',
      name: '시즌 보스 메이린',
      alias: '메이린',
      cycle: 'event_weekly',
      portraitSlug: 'maerin',
      difficulties: [{ difficulty: 'normal', requiredLevel: 270 }],
    },
  ],
}

describe('parseBossesSeed', () => {
  it('규칙 둘과 보스 목록을 받는다', () => {
    expect(parseBossesSeed(bossesSeed)).toEqual(bossesSeed)
  })

  // 번들 사본을 그대로 씨앗으로 쓸 수 있게 updatedAt 은 있어도 버린다. 서버가 넣는 시각이 기준이다.
  it('updatedAt 이 있어도 버린다', () => {
    expect(parseBossesSeed({ ...bossesSeed, updatedAt: '2026-10-15T01:00:00.000Z' })).toEqual(
      bossesSeed,
    )
  })

  it.each([
    ['객체가 아니다', '표'],
    ['rules 가 없다', { bosses: bossesSeed.bosses }],
    ['보스 목록이 비었다', { ...bossesSeed, bosses: [] }],
    [
      '난이도가 빈 보스',
      { ...bossesSeed, bosses: [{ ...bossesSeed.bosses[0], difficulties: [] }] },
    ],
    ['모르는 주기', { ...bossesSeed, bosses: [{ ...bossesSeed.bosses[0], cycle: 'daily' }] }],
  ])('%s → 던진다', (_name, body) => {
    expect(() => parseBossesSeed(body)).toThrow()
  })
})

const dropItemsSeed = {
  items: [
    {
      key: 'loose_control_machine_mark',
      name: '루즈 컨트롤 머신 마크',
      iconFile: 'x.png',
      valuable: true,
    },
    { key: 'red_boss_ring_box', name: '홍옥의 보스 반지 상자', iconFile: null, valuable: false },
    { key: 'restraint_ring', name: '리스트레인트 링', iconFile: null, valuable: false },
  ],
}
const bossDropsSeed = {
  rewards: [
    {
      boss: 'lotus',
      difficulty: 'hard',
      category: 'equipment',
      item: 'loose_control_machine_mark',
      amount: null,
      from: null,
      until: null,
    },
    {
      boss: 'lotus',
      difficulty: 'hard',
      category: 'consumable',
      item: 'red_boss_ring_box',
      amount: null,
      from: null,
      until: null,
    },
  ],
}
const dropBoxesSeed = {
  boxes: [{ item: 'red_boss_ring_box', levelMin: 1, levelMax: 4, contents: ['restraint_ring'] }],
}
const crystalPricesSeed = {
  defaultMaxPartySize: 6,
  maxPartySizes: [{ boss: 'lotus', difficulty: 'hard', maxPartySize: 2 }],
  prices: [
    { boss: 'lotus', difficulty: 'hard', priceMeso: 100, from: null, until: '2026-09-17T10:00' },
    { boss: 'lotus', difficulty: 'hard', priceMeso: 200, from: '2026-09-17T10:00', until: null },
  ],
}

const worldsSeed = {
  worlds: [
    { key: 'scania', name: '스카니아', emblem: 'scania', challengers: false, event: false },
    { key: 'special', name: '스페셜', emblem: null, challengers: false, event: true },
  ],
}

const spendCatalogSeed = {
  rules: { tariffPercent: 10, rewardCoinPriceMeso: 40_000_000 },
  groups: [
    {
      key: 'epic_dungeon_bonus_reward',
      name: '에픽던전 추가 리워드',
      category: 'content',
      active: true,
    },
    { key: 'maple_point_shop', name: '메이플 포인트 샵', category: 'event_bm', active: false },
  ],
  tiles: [
    { key: 'high_mountain', name: '하이마운틴', iconFile: null, iconMap: 'highMountain' },
    { key: 'mihoroid', name: '미호로이드', iconFile: 'mihoroid.webp', iconMap: null },
  ],
  items: [
    {
      key: 'high_mountain_1',
      group: 'epic_dungeon_bonus_reward',
      tile: 'high_mountain',
      name: '하이마운틴 1단계',
      tier: '1단계',
      currency: 'point',
      unitPrice: 7500,
      unit: '회',
      maxQuantity: 1,
      rewardCoins: 4,
      from: null,
      until: null,
    },
    {
      key: 'mihoroid',
      group: 'maple_point_shop',
      tile: 'mihoroid',
      name: '미호로이드',
      tier: null,
      currency: 'point',
      unitPrice: 40000,
      unit: '개',
      maxQuantity: 1,
      rewardCoins: null,
      from: null,
      until: null,
    },
  ],
  itemOptions: [],
  itemForms: [
    { item: 'high_mountain_1', form: 'exp' },
    { item: 'high_mountain_1', form: 'sol_erda' },
  ],
}
const symbolCostsSeed = {
  groups: [
    {
      key: 'grand_authentic',
      name: '그랜드 어센틱 심볼',
      maxLevel: 3,
      defaultFrom: 1,
      defaultTo: 2,
    },
  ],
  symbols: [
    {
      key: 'tallahart',
      group: 'grand_authentic',
      name: '탈라하트',
      requiredLevel: 290,
      iconFile: 't.webp',
    },
  ],
  levelCosts: [
    { symbol: 'tallahart', level: 1, costMeso: 100, from: '2026-09-17', until: null },
    { symbol: 'tallahart', level: 2, costMeso: 200, from: '2026-09-17', until: null },
  ],
}

const category = (key: string, name: string, extra: object = {}) => ({
  key,
  name,
  countTag: null,
  hideCountTag: false,
  weeklyLimit: null,
  sharedOrder: null,
  ...extra,
})
const contentsSeed = {
  // 갈래 줄은 ENUM 과 일대일이라 여덟을 다 든다.
  categories: [
    category('epic_dungeon', '에픽 던전', { countTag: 'ID당 1회', weeklyLimit: 3, sharedOrder: 2 }),
    category('monster_park', '몬스터파크', { sharedOrder: 0 }),
    category('guild', '길드'),
    category('arcane_river_quest', '아케인리버 지역 퀘스트', { hideCountTag: true }),
    category('weekly_quest', '주간 퀘스트'),
    category('mu_lung_dojo', '무릉도장'),
    category('maple_union', '메이플 유니온', { sharedOrder: 1 }),
    category('daily_quest', '일일 퀘스트'),
  ],
  contents: [
    {
      key: 'epic_dungeon_high_mountain',
      section: 'weekly',
      apiName: '에픽 던전 : 하이마운틴',
      category: 'epic_dungeon',
      displayName: '하이마운틴',
      shortName: '에픽 던전 : 하이마운틴',
      backgroundMap: null,
      backgroundPortrait: 'ancientGodMitra',
      countTag: null,
      type: 'contents',
      maxCount: 5,
      requiredLevel: 260,
      from: null,
      until: null,
      shareScope: 'account',
      sharedShortName: '하이마운틴',
      onlyWhenScheduled: false,
      trustRegistrationFlag: false,
      cumulativeScore: false,
      maxCountOverride: null,
    },
    {
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
    },
  ],
}

const equipmentItemsSeed = {
  items: [
    { key: 'absolab_ancient_bow', name: '앱솔랩스에인션트보우', level: 160 },
    { key: 'ascendant_pulse_ring', name: '어센던트펄스링', level: null },
  ],
}
const band = (type: string, minLevel: number, rare: number) => [
  { type, minLevel, grade: 'rare', costMeso: rare },
  { type, minLevel, grade: 'epic', costMeso: rare * 4 },
  { type, minLevel, grade: 'unique', costMeso: rare * 8 },
  { type, minLevel, grade: 'legendary', costMeso: rare * 10 },
]
const enhancementCostsSeed = {
  rules: {
    cubeAppraisalFreeMaxLevel: 120,
    cubeAppraisalCoefficient: 20,
    starforceDestroyDefenceSurchargePercent: 200,
  },
  potentialResetCosts: [
    ...band('potential', 1, 4_000_000),
    ...band('potential', 250, 5_000_000),
    ...band('additional', 1, 9_750_000),
  ],
  soulPotentialResetCosts: [
    { grade: 'rare', costMeso: 20_000_000 },
    { grade: 'legendary', costMeso: 88_000_000 },
  ],
  starforceSteps: [
    { fromStar: 0, exponent: 1, divisor: 36 },
    { fromStar: 1, exponent: 2.7, divisor: 571 },
  ],
}
const grade = (key: string, name: string, fee: number, discount: number) => ({
  key,
  name,
  auctionFeePercent: fee,
  starforceDiscountPercent: discount,
})
const mvpGradesSeed = {
  // 등급 줄은 ENUM 과 일대일이라 일곱을 다 든다.
  grades: [
    grade('normal', '일반', 5, 0),
    grade('bronze', '브론즈', 5, 0),
    grade('silver', '실버', 3, 3),
    grade('gold', '골드', 3, 5),
    grade('diamond', '다이아', 3, 10),
    grade('red', '레드', 3, 10),
    grade('black', '블랙', 3, 10),
  ],
}

const huntingGroundsSeed = {
  regions: [
    { key: 'road_of_vanishing', name: '소멸의 여로', forceType: 'arcane' },
    { key: 'cernium', name: '세르니움', forceType: 'authentic' },
  ],
  grounds: [
    {
      key: 'road_of_vanishing_weathered_land_of_joy',
      region: 'road_of_vanishing',
      name: '풍화된 기쁨의 땅',
      force: 30,
      mobs: 22,
    },
    {
      key: 'cernium_royal_library_1',
      region: 'cernium',
      name: '왕립 도서관 제1구역',
      force: 160,
      mobs: 36,
    },
  ],
  groundLevels: [
    { ground: 'road_of_vanishing_weathered_land_of_joy', level: 200 },
    { ground: 'cernium_royal_library_1', level: 260 },
    { ground: 'cernium_royal_library_1', level: 261 },
  ],
}

describe('씨앗 넷의 모양', () => {
  it('받고, 모양이 어긋나면 던진다', () => {
    expect(parseDropItemsSeed(dropItemsSeed)).toEqual(dropItemsSeed)
    expect(parseBossDropsSeed(bossDropsSeed)).toEqual(bossDropsSeed)
    expect(parseDropBoxesSeed(dropBoxesSeed)).toEqual(dropBoxesSeed)
    expect(parseCrystalPricesSeed(crystalPricesSeed)).toEqual(crystalPricesSeed)
    expect(parseWorldsSeed(worldsSeed)).toEqual(worldsSeed)
    expect(parseSpendCatalogSeed(spendCatalogSeed)).toEqual(spendCatalogSeed)
    expect(parseSymbolCostsSeed(symbolCostsSeed)).toEqual(symbolCostsSeed)
    expect(parseContentsSeed(contentsSeed)).toEqual(contentsSeed)
    expect(parseEquipmentItemsSeed(equipmentItemsSeed)).toEqual(equipmentItemsSeed)
    expect(parseEnhancementCostsSeed(enhancementCostsSeed)).toEqual(enhancementCostsSeed)
    expect(parseMvpGradesSeed(mvpGradesSeed)).toEqual(mvpGradesSeed)
    expect(parseHuntingGroundsSeed(huntingGroundsSeed)).toEqual(huntingGroundsSeed)
    expect(() =>
      parseSpendCatalogSeed({
        ...spendCatalogSeed,
        groups: [{ ...spendCatalogSeed.groups[0], category: 'misc' }],
      }),
    ).toThrow()
    expect(() =>
      parseSymbolCostsSeed({
        ...symbolCostsSeed,
        levelCosts: [{ ...symbolCostsSeed.levelCosts[0], level: 0 }],
      }),
    ).toThrow()
    expect(() =>
      parseWorldsSeed({ worlds: [{ ...worldsSeed.worlds[0], key: 'Scania' }] }),
    ).toThrow()
    expect(() =>
      parseContentsSeed({
        ...contentsSeed,
        contents: [{ ...contentsSeed.contents[0], shareScope: 'guild' }],
      }),
    ).toThrow()
    expect(() =>
      parseEquipmentItemsSeed({ items: [{ ...equipmentItemsSeed.items[0], level: 0 }] }),
    ).toThrow()
    expect(() =>
      parseEnhancementCostsSeed({
        ...enhancementCostsSeed,
        potentialResetCosts: [{ ...enhancementCostsSeed.potentialResetCosts[0], grade: 'normal' }],
      }),
    ).toThrow()
    expect(() =>
      parseMvpGradesSeed({ grades: [{ ...mvpGradesSeed.grades[0], auctionFeePercent: 101 }] }),
    ).toThrow()
    expect(() =>
      parseHuntingGroundsSeed({
        ...huntingGroundsSeed,
        regions: [{ ...huntingGroundsSeed.regions[0], forceType: 'sacred' }],
      }),
    ).toThrow()
    expect(() =>
      parseDropItemsSeed({
        items: [{ key: 'Bad Key', name: 'x', iconFile: null, valuable: false }],
      }),
    ).toThrow()
    expect(() =>
      parseBossDropsSeed({ rewards: [{ ...bossDropsSeed.rewards[0], category: 'misc' }] }),
    ).toThrow()
    expect(() =>
      parseDropBoxesSeed({ boxes: [{ ...dropBoxesSeed.boxes[0], levelMax: null }] }),
    ).toThrow()
    expect(() =>
      parseCrystalPricesSeed({
        ...crystalPricesSeed,
        prices: [{ ...crystalPricesSeed.prices[0], from: '2026-9-17' }],
      }),
    ).toThrow()
  })
})

describeDb('seedGameData', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('빈 표를 씨앗으로 채운다. 차례는 씨앗 파일 순이고 규칙도 함께 든다', async () => {
    const result = await seedGameData(db, { bosses: parseBossesSeed(bossesSeed) })

    expect(result).toEqual({ bosses: 'seeded' })
    const catalog = await new BossesRepository(db).catalog()
    expect(catalog.rules).toEqual(bossesSeed.rules)
    expect(catalog.bosses.map((b) => b.key)).toEqual(['lotus', 'meirin'])
    expect(catalog.bosses[0]?.difficulties).toEqual(
      bossesSeed.bosses[0]?.difficulties.map((d) => ({
        ...d,
        maxPartySize: null,
        from: null,
        until: null,
      })),
    )
  })

  // 운영자가 폼으로 고친 값을 배포 때 씨앗이 되돌리면 안 된다. 줄이 하나라도 있으면 그 표는 건너뛴다.
  it('줄이 있는 표는 건드리지 않는다', async () => {
    const repo = new BossesRepository(db)
    await repo.setRules({
      weeklyBossSelectionLimit: 10,
      weeklyCrystalSaleLimit: 80,
      defaultMaxPartySize: 6,
    })
    await repo.createBoss({
      ...bossesSeed.bosses[1],
      cycle: 'event_weekly',
      difficulties: [{ difficulty: 'hard', requiredLevel: 280 }],
    })

    const result = await seedGameData(db, { bosses: parseBossesSeed(bossesSeed) })

    expect(result).toEqual({ bosses: 'skipped' })
    const catalog = await repo.catalog()
    expect(catalog.rules).toEqual({
      weeklyBossSelectionLimit: 10,
      weeklyCrystalSaleLimit: 80,
      defaultMaxPartySize: 6,
    })
    expect(catalog.bosses.map((b) => b.key)).toEqual(['meirin'])
  })

  it('열셋을 차례로 채운다. 가격 줄이 차 있어도 상한과 기본값 규칙은 본다', async () => {
    const result = await seedGameData(db, {
      bosses: parseBossesSeed(bossesSeed),
      dropItems: parseDropItemsSeed(dropItemsSeed),
      bossDrops: parseBossDropsSeed(bossDropsSeed),
      dropBoxes: parseDropBoxesSeed(dropBoxesSeed),
      crystalPrices: parseCrystalPricesSeed(crystalPricesSeed),
      worlds: parseWorldsSeed(worldsSeed),
      spendCatalog: parseSpendCatalogSeed(spendCatalogSeed),
      symbolCosts: parseSymbolCostsSeed(symbolCostsSeed),
      contents: parseContentsSeed(contentsSeed),
      equipmentItems: parseEquipmentItemsSeed(equipmentItemsSeed),
      enhancementCosts: parseEnhancementCostsSeed(enhancementCostsSeed),
      mvpGrades: parseMvpGradesSeed(mvpGradesSeed),
      huntingGrounds: parseHuntingGroundsSeed(huntingGroundsSeed),
    })
    expect(result).toEqual({
      bosses: 'seeded',
      dropItems: 'seeded',
      bossDrops: 'seeded',
      dropBoxes: 'seeded',
      crystalPrices: 'seeded',
      worlds: 'seeded',
      spendCatalog: 'seeded',
      symbolCosts: 'seeded',
      contents: 'seeded',
      equipmentItems: 'seeded',
      enhancementCosts: 'seeded',
      mvpGrades: 'seeded',
      huntingGrounds: 'seeded',
    })

    const spend = await new SpendCatalogRepository(db).section()
    expect(spend.rules).toEqual({ tariffPercent: 10, rewardCoinPriceMeso: 40_000_000 })
    expect(spend.groups.map((g) => [g.key, g.active])).toEqual([
      ['epic_dungeon_bonus_reward', true],
      ['maple_point_shop', false],
    ])
    expect(spend.items.map((i) => i.key)).toEqual(['high_mountain_1', 'mihoroid'])
    expect(spend.itemForms).toHaveLength(2)
    const symbol = await new SymbolCostsRepository(db).section()
    expect(symbol.levelCosts.map((c) => c.costMeso)).toEqual([100, 200])
    const content = await new ContentsRepository(db).section()
    expect(content.categories.map((c) => c.key)).toEqual(contentsSeed.categories.map((c) => c.key))
    expect(content.contents).toEqual([contentsSeed.contents[1], contentsSeed.contents[0]])
    expect((await new EquipmentItemsRepository(db).section()).items).toEqual(
      equipmentItemsSeed.items,
    )
    const enhancement = await new EnhancementCostsRepository(db).section()
    expect(enhancement.rules).toEqual(enhancementCostsSeed.rules)
    expect(enhancement.potentialResetCosts).toHaveLength(12)
    expect(enhancement.soulPotentialResetCosts).toEqual(
      enhancementCostsSeed.soulPotentialResetCosts,
    )
    expect(enhancement.starforceSteps).toEqual(enhancementCostsSeed.starforceSteps)
    expect((await new MvpGradesRepository(db).section()).grades).toEqual(mvpGradesSeed.grades)
    const hunting = await new HuntingGroundsRepository(db).section()
    expect(hunting.regions).toEqual(huntingGroundsSeed.regions)
    expect(hunting.grounds).toEqual(huntingGroundsSeed.grounds)
    expect(hunting.groundLevels).toEqual(huntingGroundsSeed.groundLevels)

    const catalog = await new BossesRepository(db).catalog()
    expect(catalog.rules.defaultMaxPartySize).toBe(6)
    expect(catalog.bosses[0]?.difficulties.find((d) => d.difficulty === 'hard')?.maxPartySize).toBe(
      2,
    )

    const again = await seedGameData(db, {
      dropItems: parseDropItemsSeed(dropItemsSeed),
      crystalPrices: parseCrystalPricesSeed(crystalPricesSeed),
      spendCatalog: parseSpendCatalogSeed(spendCatalogSeed),
      symbolCosts: parseSymbolCostsSeed(symbolCostsSeed),
      contents: parseContentsSeed(contentsSeed),
      enhancementCosts: parseEnhancementCostsSeed(enhancementCostsSeed),
      mvpGrades: parseMvpGradesSeed(mvpGradesSeed),
      huntingGrounds: parseHuntingGroundsSeed(huntingGroundsSeed),
    })
    expect(again).toEqual({
      dropItems: 'skipped',
      crystalPrices: 'skipped',
      spendCatalog: 'skipped',
      symbolCosts: 'skipped',
      contents: 'skipped',
      enhancementCosts: 'skipped',
      mvpGrades: 'skipped',
      huntingGrounds: 'skipped',
    })
  })

  // 갈래 줄은 ENUM 과 일대일이다. 빠진 갈래의 컨텐츠는 관리 화면에서 영영 못 더하므로 채우지 않고 던진다.
  it('MVP 씨앗이 등급 일곱을 다 안 들거나 잠재 씨앗에 1 구간이 없으면 던지고 아무것도 안 넣는다', async () => {
    await expect(
      seedGameData(db, {
        mvpGrades: parseMvpGradesSeed({ grades: mvpGradesSeed.grades.slice(1) }),
      }),
    ).rejects.toThrow('씨앗의 MVP 등급이 ENUM 을 다 안 든다: normal')
    expect((await new MvpGradesRepository(db).section()).grades).toEqual([])
    await expect(
      seedGameData(db, {
        enhancementCosts: parseEnhancementCostsSeed({
          ...enhancementCostsSeed,
          potentialResetCosts: band('potential', 1, 4_000_000),
        }),
      }),
    ).rejects.toThrow('잠재 재설정 씨앗에 min_level 1 구간이 없다: additional')
    const enhancement = await new EnhancementCostsRepository(db).section()
    expect(enhancement.potentialResetCosts).toEqual([])
    // 규칙 셋은 표보다 먼저 들어가고 그대로 남는다. 다른 표의 씨앗과 같은 규칙이다.
    expect(enhancement.rules.cubeAppraisalCoefficient).toBe(20)
  })

  it('사냥터 씨앗에 레벨 없는 사냥터나 지역 key 로 안 시작하는 key 가 있으면 던지고 아무것도 안 넣는다', async () => {
    await expect(
      seedGameData(db, {
        huntingGrounds: parseHuntingGroundsSeed({
          ...huntingGroundsSeed,
          groundLevels: huntingGroundsSeed.groundLevels.slice(1),
        }),
      }),
    ).rejects.toThrow('레벨이 없는 사냥터가 있다: road_of_vanishing_weathered_land_of_joy')
    await expect(
      seedGameData(db, {
        huntingGrounds: parseHuntingGroundsSeed({
          ...huntingGroundsSeed,
          grounds: [{ ...huntingGroundsSeed.grounds[0], key: 'weathered_land_of_joy' }],
        }),
      }),
    ).rejects.toThrow('사냥터 key 가 지역 key 로 시작하지 않는다: weathered_land_of_joy')
    expect((await new HuntingGroundsRepository(db).section()).regions).toEqual([])
  })

  it('컨텐츠 씨앗의 갈래가 ENUM 을 다 안 들면 던지고 아무것도 안 넣는다', async () => {
    await expect(
      seedGameData(db, {
        contents: parseContentsSeed({
          ...contentsSeed,
          categories: contentsSeed.categories.slice(1),
        }),
      }),
    ).rejects.toThrow('씨앗의 갈래가 ENUM 을 다 안 든다: epic_dungeon')
    expect(await new ContentsRepository(db).section()).toEqual({
      updatedAt: null,
      categories: [],
      contents: [],
    })
  })

  it('씨앗이 표에 없는 조합이나 아이템을 가리키면 던지고 아무것도 안 넣는다', async () => {
    await seedGameData(db, {
      bosses: parseBossesSeed(bossesSeed),
      dropItems: parseDropItemsSeed(dropItemsSeed),
    })
    await expect(
      seedGameData(db, {
        bossDrops: parseBossDropsSeed({
          rewards: [{ ...bossDropsSeed.rewards[0], item: 'nobody' }],
        }),
      }),
    ).rejects.toThrow('씨앗이 가리키는 아이템이 표에 없다')
    expect(await seedGameData(db, { bossDrops: parseBossDropsSeed(bossDropsSeed) })).toEqual({
      bossDrops: 'seeded',
    })
  })
})
