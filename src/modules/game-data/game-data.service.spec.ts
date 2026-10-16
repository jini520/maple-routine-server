import type { BossesRepository, Catalog } from '../bosses/bosses.repository'
import { GameDataService } from './game-data.service'

const catalog: Catalog = {
  updatedAt: '2026-10-15T01:00:00.000Z',
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 },
  bosses: [],
}

describe('GameDataService', () => {
  it('표마다 칸 하나다. bosses 칸은 보스 리포지토리의 catalog 그대로다', async () => {
    const bosses = { catalog: jest.fn().mockResolvedValue(catalog) }
    const service = new GameDataService(bosses as unknown as BossesRepository)

    await expect(service.snapshot()).resolves.toEqual({ bosses: catalog })
  })

  // 아직 한 번도 안 넣은 표의 모양이다. 칸을 빼지 않고 updatedAt 이 null 인 채로 준다. 앱은 그 칸을 버린다.
  it('빈 표도 칸을 뺀 채 주지 않는다', async () => {
    const empty: Catalog = {
      updatedAt: null,
      rules: { weeklyBossSelectionLimit: null, weeklyCrystalSaleLimit: null },
      bosses: [],
    }
    const bosses = { catalog: jest.fn().mockResolvedValue(empty) }
    const service = new GameDataService(bosses as unknown as BossesRepository)

    await expect(service.snapshot()).resolves.toEqual({ bosses: empty })
  })
})
