import type { BossDropsRepository } from '../boss-drops/boss-drops.repository'
import type { BossesRepository, Catalog } from '../bosses/bosses.repository'
import type { CrystalPricesRepository } from '../crystal-prices/crystal-prices.repository'
import type { DropBoxesRepository } from '../drop-items/drop-boxes.repository'
import type { DropItemsRepository } from '../drop-items/drop-items.repository'
import { GameDataService } from './game-data.service'

const empty = (body: object) => ({
  section: jest.fn().mockResolvedValue({ updatedAt: null, ...body }),
})
function service(bosses: { catalog: jest.Mock }): GameDataService {
  return new GameDataService(
    bosses as unknown as BossesRepository,
    empty({ items: [] }) as unknown as DropItemsRepository,
    empty({ rewards: [] }) as unknown as BossDropsRepository,
    empty({ boxes: [] }) as unknown as DropBoxesRepository,
    empty({ prices: [] }) as unknown as CrystalPricesRepository,
  )
}

const catalog: Catalog = {
  updatedAt: '2026-10-15T01:00:00.000Z',
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 },
  bosses: [],
}

describe('GameDataService', () => {
  it('표마다 칸 하나다. bosses 칸은 보스 리포지토리의 catalog 그대로이고 나머지 넷은 각 리포지토리의 section 이다', async () => {
    const bosses = { catalog: jest.fn().mockResolvedValue(catalog) }

    await expect(service(bosses).snapshot()).resolves.toEqual({
      bosses: catalog,
      dropItems: { updatedAt: null, items: [] },
      bossDrops: { updatedAt: null, rewards: [] },
      dropBoxes: { updatedAt: null, boxes: [] },
      crystalPrices: { updatedAt: null, prices: [] },
    })
  })

  // 아직 한 번도 안 넣은 표의 모양이다. 칸을 빼지 않고 updatedAt 이 null 인 채로 준다. 앱은 그 칸을 버린다.
  it('빈 표도 칸을 뺀 채 주지 않는다', async () => {
    const emptyCatalog: Catalog = {
      updatedAt: null,
      rules: {
        weeklyBossSelectionLimit: null,
        weeklyCrystalSaleLimit: null,
        defaultMaxPartySize: null,
      },
      bosses: [],
    }
    const bosses = { catalog: jest.fn().mockResolvedValue(emptyCatalog) }

    await expect(service(bosses).snapshot()).resolves.toMatchObject({ bosses: emptyCatalog })
  })
})
