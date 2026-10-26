import { bossClearBody } from './boss-clears.dto'

const ok = {
  periodRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  ocid: 'ocid-1',
  boss: 'lucid',
  difficulty: 'hard',
  cycle: 'weekly',
  periodKey: '2026-10-22',
  worldKey: 'scania',
  priceMeso: 300_000_000,
  payoutMeso: 145_500_000,
  splitMode: 'even',
  partySize: 2,
  splitFeePercent: 3,
  defeatedDate: '2026-10-23',
  source: 'auto',
}

describe('bossClearBody', () => {
  it('앱이 보내는 모양을 받는다. 월간 · 비율 분배 · 날짜 모름도 된다', () => {
    expect(bossClearBody.safeParse(ok).success).toBe(true)
    expect(
      bossClearBody.safeParse({
        ...ok,
        cycle: 'monthly',
        periodKey: '2026-10',
        splitMode: 'ratio',
        myShare: 1,
        sharesTotal: 3,
        defeatedDate: null,
      }).success,
    ).toBe(true)
  })

  // 비율 1:3 과 균등 3인은 두 수가 같아 분배 방식과 비율 칸이 함께 맞아야 한다. 어긋나면 받은 몫을 다시 셀 수 없다.
  it('분배 방식과 비율 칸이 어긋나면 거절한다', () => {
    expect(bossClearBody.safeParse({ ...ok, splitMode: 'ratio' }).success).toBe(false)
    expect(bossClearBody.safeParse({ ...ok, myShare: 1, sharesTotal: 3 }).success).toBe(false)
  })
})
