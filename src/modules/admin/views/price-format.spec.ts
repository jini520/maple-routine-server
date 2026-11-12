import { runInNewContext } from 'node:vm'

import { MONEY_JS } from './price-format'

/** 관리 화면 스크립트에 그대로 들어가는 글자라, 브라우저처럼 그 글자를 실행해 함수를 꺼낸다. */
const { money, moneyDiff } = runInNewContext(`${MONEY_JS}; ({ money, moneyDiff })`) as {
  money: (n: number) => string
  moneyDiff: (n: number) => string
}

describe('관리 화면 가격 표기', () => {
  // 반올림하면 2,999,999,999 와 3,000,000,000 이 둘 다 30억으로 보여 다른 값인지 표에서 알 수 없다.
  it('만 아래를 버리고 1억 · 1만 경계 아래는 아래 단위로 쓴다', () => {
    expect(money(2_999_999_999)).toBe('29억 9,999만')
    expect(money(3_000_000_000)).toBe('30억')
    expect(money(99_999_999)).toBe('9,999만')
    expect(money(9_999)).toBe('9,999')
  })

  it('전일 대비는 늘면 +, 줄면 - 를 붙이고 0 은 부호 없이 쓴다', () => {
    expect(moneyDiff(900_000_000)).toBe('+9억')
    expect(moneyDiff(-22_222_221)).toBe('-2,222만')
    expect(moneyDiff(0)).toBe('0')
  })
})
