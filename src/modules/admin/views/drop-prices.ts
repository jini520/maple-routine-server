import { layout } from './layout'

/**
 * 드롭 가격 보기. 읽기만 한다. 위는 아이템 × 기간의 분포, 아래는 최근 줄이다.
 * 노이즈를 눈으로 보는 자리라 뺀 가격도 줄에는 흐리게 남는다. 분포에는 안 들어간다.
 */
export const DROP_PRICES_HTML = layout(
  '/admin/drop-prices',
  '드롭 가격',
  `<div class="head"><div><h1>드롭 가격</h1><p>앱이 보낸 판매 총액이다. 분포는 뺀 가격을 빼고 세고, 줄 목록은 뺀 가격도 흐리게 보인다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <div class="body">
    <div class="row">
      <div class="field"><label for="item">아이템 key</label><input id="item" class="mono w-auto" type="text" placeholder="비우면 전부"></div>
      <div class="field"><label for="period">기간 key</label><input id="period" class="mono w-md" type="text" placeholder="2026-10-08 또는 2026-10"></div>
      <div class="field w-sm"><label for="limit">줄 수</label><input id="limit" type="number" min="1" max="1000" value="200"></div>
      <button id="load" class="btn" type="button">보기</button>
    </div>
  </div>
</section>
<section class="card">
  <header><h2>분포</h2><p>아이템 × 기간. 뺀 가격은 안 센다</p></header>
  <div class="table"><table><thead><tr><th>아이템</th><th>기간</th><th class="num">개수</th><th class="num">최소</th><th class="num">중앙값</th><th class="num">최대</th></tr></thead><tbody id="summary"></tbody></table></div>
</section>
<section class="card">
  <header><h2>최근 줄</h2><p id="rows-count"></p></header>
  <div class="table"><table><thead><tr><th>고친 때</th><th>아이템</th><th>기간</th><th>월드</th><th class="num">반지 Lv</th><th>부위</th><th class="num">가격</th><th>신원</th><th>사람</th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  function cell(tr, text, cls) { var td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; tr.appendChild(td); return td; }
  function emptyRow(tbody, cols) { var tr = document.createElement('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = cols; tbody.appendChild(tr); }
  function meso(n) { return Number(n).toLocaleString('ko-KR'); }
  async function load() {
    var q = new URLSearchParams();
    var item = document.getElementById('item').value.trim(); if (item) q.set('itemKey', item);
    var period = document.getElementById('period').value.trim(); if (period) q.set('periodKey', period);
    q.set('limit', document.getElementById('limit').value || '200');
    var r = await call('GET', '/admin/drop-prices/rows?' + q.toString());
    if (!r.ok) { show('못 읽었다 ' + r.status + '\\n' + r.text, true); return; }
    show('', false);
    var summary = document.getElementById('summary'); summary.innerHTML = '';
    r.json.summary.forEach(function (s) {
      var tr = document.createElement('tr');
      cell(tr, s.itemKey, 'mono'); cell(tr, s.periodKey, 'mono'); cell(tr, String(s.count), 'num');
      cell(tr, meso(s.min), 'num'); cell(tr, meso(s.median), 'num'); cell(tr, meso(s.max), 'num');
      summary.appendChild(tr);
    });
    if (r.json.summary.length === 0) emptyRow(summary, 6);
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    r.json.rows.forEach(function (row) {
      var tr = document.createElement('tr'); if (row.deletedAt) tr.className = 'deleted';
      cell(tr, row.updatedAt.replace('T', ' ').slice(0, 19), 'mono'); cell(tr, row.itemKey, 'mono'); cell(tr, row.periodKey, 'mono');
      cell(tr, row.worldKey || '-'); cell(tr, row.ringLevel === null ? '-' : String(row.ringLevel), 'num'); cell(tr, row.slot || '-');
      cell(tr, meso(row.priceMeso), 'num'); cell(tr, row.identifiedBy); cell(tr, row.userId.slice(0, 8), 'mono');
      rows.appendChild(tr);
    });
    if (r.json.rows.length === 0) emptyRow(rows, 9);
    document.getElementById('rows-count').textContent = r.json.rows.length + '줄';
  }
  document.getElementById('load').addEventListener('click', load);
  load();
</script>`,
)
