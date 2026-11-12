/**
 * 관리 화면의 가격 표기. layout 의 도우미 스크립트에 그대로 들어가는 글자다.
 * 1억 이상은 억과 만까지, 1만 이상은 만까지 쓰고 만 아래는 버린다. 반올림하면 2,999,999,999 와 3,000,000,000 이 같아 보인다.
 */
export const MONEY_JS = `
  function money(n) {
    if (n === null || n === undefined) return '-';
    var sign = n < 0 ? '-' : '';
    var v = Math.floor(Math.abs(n));
    if (v >= 1e8) {
      var man = Math.floor((v % 1e8) / 1e4);
      return sign + Math.floor(v / 1e8).toLocaleString('ko-KR') + '억' + (man ? ' ' + man.toLocaleString('ko-KR') + '만' : '');
    }
    if (v >= 1e4) return sign + Math.floor(v / 1e4).toLocaleString('ko-KR') + '만';
    return sign + v.toLocaleString('ko-KR');
  }
  function moneyDiff(n) { return n === null || n === undefined ? '-' : n > 0 ? '+' + money(n) : money(n); }
`
