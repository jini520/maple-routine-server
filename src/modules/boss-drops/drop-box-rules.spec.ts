import { bossDifficultyRewards, dropBoxContents } from '../../database/schema'
import {
  describeDb,
  insertAsset,
  insertItems,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { BossesRepository } from '../bosses/bosses.repository'
import { DropBoxesRepository } from '../drop-items/drop-boxes.repository'
import { BossDropsRepository } from './boss-drops.repository'
import { AmbiguousDropBox } from './drop-box-rules'

/**
 * 드롭 기록은 상자를 적지 않고 수익 건의 난이도와 아이템으로 드롭 표에서 상자를 찾는다. 한 난이도가 직접 주는 아이템이 그
 * 난이도의 상자에도 들거나, 한 난이도의 두 상자에 같은 아이템이 들면 어느 쪽에서 나왔는지 가를 수 없다.
 */
describeDb('드롭 표가 상자를 하나로 정하는 검사', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let drops: BossDropsRepository
  let boxes: DropBoxesRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    drops = new BossDropsRepository(db)
    boxes = new DropBoxesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    await new BossesRepository(db).createBoss({
      key: 'lotus',
      name: '스우',
      shortName: '스우',
      isSeasonBoss: false,
      portraitAssetId: await insertAsset(db, 'bosses/lotus.webp'),
      difficulties: [
        { difficulty: 'hard', cycle: 'weekly', requiredLevel: 190, maxPartySize: null },
        { difficulty: 'extreme', cycle: 'weekly', requiredLevel: 190, maxPartySize: null },
      ],
    })
    await insertItems(db, [
      { key: 'red_boss_ring_box', name: '홍옥의 보스 반지 상자', isDrop: true },
      { key: 'black_box', name: '칠흑 장신구 상자', isDrop: true },
      { key: 'restraint_ring', name: '리스트레인트 링', isDrop: true },
      { key: 'dreamy_belt', name: '몽환의 벨트', isDrop: true },
    ])
    await boxes.create({ item: 'red_boss_ring_box', ringLevelMin: 1, ringLevelMax: 4 })
    await boxes.create({ item: 'black_box', ringLevelMin: null, ringLevelMax: null })
    await boxes.addContent('red_boss_ring_box', 'restraint_ring')
    await boxes.addContent('black_box', 'dreamy_belt')
  })
  afterAll(() => close())

  const reward = (difficulty: 'hard' | 'extreme', item: string) =>
    drops.create({
      boss: 'lotus',
      difficulty,
      category: 'consumable',
      item,
      quantity: null,
      validFrom: null,
      validUntil: null,
    })

  it('드롭 표에 줄을 더할 때, 같은 난이도의 상자에 든 아이템을 직접 주거나 직접 주는 아이템이 든 상자를 주면 막고 적지 않는다', async () => {
    await reward('hard', 'red_boss_ring_box')
    await expect(reward('hard', 'restraint_ring')).rejects.toBeInstanceOf(AmbiguousDropBox)

    await reward('extreme', 'dreamy_belt')
    await expect(reward('extreme', 'black_box')).rejects.toBeInstanceOf(AmbiguousDropBox)

    // 다른 난이도라면 직접 주는 아이템이 상자에 들어도 상자는 하나로 정해진다.
    await reward('extreme', 'restraint_ring')
    expect((await db.select().from(bossDifficultyRewards)).length).toBe(3)
  })

  it('상자에 내용물을 더할 때, 그 상자를 주는 난이도가 직접 주거나 그 난이도의 다른 상자에 든 아이템이면 막고 적지 않는다', async () => {
    await insertItems(db, [
      { key: 'twilight_mark', name: '트와일라이트 마크', isDrop: true },
      { key: 'complete_under_control', name: '컴플리트 언더컨트롤', isDrop: true },
    ])
    await reward('hard', 'red_boss_ring_box')
    await reward('hard', 'black_box')
    await reward('hard', 'twilight_mark')
    await reward('extreme', 'complete_under_control')
    const before = (await db.select().from(dropBoxContents)).length

    await expect(boxes.addContent('black_box', 'restraint_ring')).rejects.toBeInstanceOf(
      AmbiguousDropBox,
    )
    await expect(boxes.addContent('black_box', 'twilight_mark')).rejects.toBeInstanceOf(
      AmbiguousDropBox,
    )
    expect((await db.select().from(dropBoxContents)).length).toBe(before)

    // 그 상자를 주지 않는 난이도가 직접 주는 아이템은 막지 않는다.
    expect(await boxes.addContent('black_box', 'complete_under_control')).toBe(true)
  })
})
