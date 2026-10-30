import { cashbookEntryBody } from './cashbook-entries.dto'

const ok = {
  entryRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  ocid: null,
  accountRecordId: '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  entryType: 'spend',
  categoryKey: 'content',
  entryDate: '2026-10-26',
  items: [
    { itemKey: 'high_mountain_1', formKey: 'exp', amountPoint: 20_000, pointPer100mMeso: 1_180 },
    {
      itemKey: 'high_mountain_2',
      formKey: 'sol_erda',
      amountPoint: 17_501,
      pointPer100mMeso: 1_180,
    },
  ],
}

describe('cashbookEntryBody', () => {
  it('앱이 보내는 모양을 받는다. 캐릭터 기록은 계정 없이도 된다', () => {
    expect(cashbookEntryBody.safeParse(ok).success).toBe(true)
    expect(
      cashbookEntryBody.safeParse({ ...ok, ocid: 'ocid-1', accountRecordId: undefined }).success,
    ).toBe(true)
  })

  it('헥사 강화 품목은 조각 칸 셋과 활성화 여부를 받고, 조각 수나 가격이 음수면 거절한다', () => {
    const hexa = {
      ...ok,
      categoryKey: 'hexa_matrix',
      items: [
        {
          itemKey: 'hexa_stat_1',
          amountMeso: 1_000_000_000,
          fragmentCount: 20,
          untradableFragmentCount: 10,
          fragmentPriceMeso: 100_000_000,
          hexaActivation: true,
        },
      ],
    }
    expect(cashbookEntryBody.safeParse(hexa).success).toBe(true)
    for (const bad of [
      { fragmentCount: -1 },
      { untradableFragmentCount: -1 },
      { fragmentPriceMeso: -1 },
      { fragmentCount: 1.5 },
    ]) {
      const items = [{ ...hexa.items[0], ...bad }]
      expect(cashbookEntryBody.safeParse({ ...hexa, items }).success).toBe(false)
    }
  })

  // 금액은 품목에 있다. 품목 없는 기록은 합계가 0 으로 둔갑한다.
  it('품목이 없거나 날짜 모양이 틀리면 거절한다', () => {
    expect(cashbookEntryBody.safeParse({ ...ok, items: [] }).success).toBe(false)
    expect(cashbookEntryBody.safeParse({ ...ok, entryDate: '2026-10' }).success).toBe(false)
  })
})
