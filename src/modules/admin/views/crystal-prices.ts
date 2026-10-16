import { layout } from './layout'

/**
 * 결정석 가격. 보스 표의 난이도 줄 전부가 서고, 줄의 수정을 누르면 그 아래로 가격 줄 목록과 새 가격 폼이 펼쳐진다.
 *
 * 새 가격은 지금 줄을 닫고 새 줄을 연다. 옛 줄은 과거 기간이 읽어 안 건드린다. 시작은 그 보스의 기간 경계여야 한다.
 * 주간 · 시즌은 목요일, 월간은 1일이다. 패치가 기간 첫날 안에서 적용되면 T10:00 처럼 시각까지 적는다.
 */
export const CRYSTAL_PRICES_HTML = layout(
  '/admin/crystal-prices',
  '결정석 가격',
  `<div class="head">
  <div>
    <h1>결정석 가격</h1>
    <p>1인 기준 정가다. 패치로 값이 바뀌면 새 줄을 연다. 옛 줄은 과거 기간이 읽어 그대로 둔다. 파티 인원 상한은 난이도 줄의 칸이고 비우면 기본값이다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-pairs">–</b><span>조합</span></div>
    <div class="stat"><b id="stat-missing">–</b><span>가격 없음</span></div>
    <div class="stat"><b id="stat-default">–</b><span>상한 기본값</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>보스 × 난이도</h2><p id="count"></p></header>
  <div class="table"><table><thead><tr><th>보스</th><th>난이도</th><th class="num">지금 가격</th><th>from</th><th class="num">상한</th><th class="num">줄</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  var state = { data: null, open: null };
  function pairKey(p) { return p.boss + '/' + p.difficulty; }
  function current(p) { return p.prices.filter(function (r) { return r.until === null; })[0] || null; }

  function pairRow(p) {
    var isOpen = state.open === pairKey(p);
    var tr = el('tr', undefined, isOpen ? 'open' : '');
    var name = span(p.bossName + ' '); name.appendChild(span(p.boss, 'mono dim')); cell(tr, name);
    cell(tr, span(p.difficulty, 'tag')); var cur = current(p);
    cell(tr, cur ? meso(cur.priceMeso) : '-', 'num'); cell(tr, cur ? (cur.from || '처음부터') : '-', 'mono');
    cell(tr, p.maxPartySize == null ? span(String(state.data.defaultMaxPartySize), 'dim') : String(p.maxPartySize), 'num');
    cell(tr, p.prices.length, 'num');
    var toggle = button(isOpen ? '닫기' : '수정', 'btn ghost sm'); toggle.addEventListener('click', function () { state.open = isOpen ? null : pairKey(p); render(); }); cell(tr, toggle, 'act');
    return tr;
  }

  function editorRow(p) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 7;
    var box = el('div', undefined, 'editor');
    var h = el('h3', p.bossName + ' ' + p.difficulty + ' 의 가격 줄'); box.appendChild(h);
    var tbody = el('tbody');
    p.prices.slice().reverse().forEach(function (r) {
      var row = el('tr'); cell(row, r.from || '처음부터', 'mono'); cell(row, r.until || (r.until === null ? '지금' : ''), 'mono'); cell(row, meso(r.priceMeso), 'num');
      if (r.until === null) {
        var del = button('거두기', 'btn danger sm');
        del.addEventListener('click', async function () { if (!window.confirm('지금 가격 줄을 거둔다. 바로 앞 줄이 다시 열린다.')) return; var x = await call('DELETE', '/admin/crystal-prices/rows/' + r.id); show(x.ok ? '거뒀다' : fail('못 거뒀다', x), !x.ok); load(); });
        cell(row, del, 'act');
      } else cell(row, '');
      tbody.appendChild(row);
    });
    box.appendChild(mini(['from', 'until', '가격', ''], tbody));
    var price = input('number'); price.min = '1'; price.placeholder = '메소'; var from = input('text', 'mono'); from.placeholder = p.cycle === 'monthly' ? '2026-11-01' : '2026-10-22 (목요일)';
    var add = button('새 가격 열기', 'btn sm');
    add.addEventListener('click', async function () {
      var x = await call('POST', '/admin/crystal-prices/' + p.boss + '/' + p.difficulty, { priceMeso: Number(price.value), from: orNull(from.value) });
      show(x.ok ? '새 가격을 열었다' : fail('못 열었다', x), !x.ok); load();
    });
    var row = el('div', undefined, 'row'); row.appendChild(field('가격', '1인 기준 정가', price)); row.appendChild(field('from', p.cycle === 'monthly' ? '월간은 1일' : '주간은 목요일. 첫 줄은 비워도 된다', from)); row.appendChild(add); box.appendChild(row);
    var mps = input('number'); mps.min = '1'; mps.max = '6'; mps.value = p.maxPartySize == null ? '' : p.maxPartySize; var saveMps = button('상한 저장', 'btn ghost sm');
    saveMps.addEventListener('click', async function () { var v = mps.value.trim(); var x = await call('PUT', '/admin/crystal-prices/' + p.boss + '/' + p.difficulty + '/max-party-size', { maxPartySize: v === '' ? null : Number(v) }); show(x.ok ? '상한을 적었다' : fail('못 적었다', x), !x.ok); load(); });
    var row2 = el('div', undefined, 'row'); row2.appendChild(field('파티 인원 상한', '비우면 기본값 ' + state.data.defaultMaxPartySize, mps)); row2.appendChild(saveMps); box.appendChild(row2);
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  function render() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    state.data.pairs.forEach(function (p) { rows.appendChild(pairRow(p)); if (state.open === pairKey(p)) rows.appendChild(editorRow(p)); });
    document.getElementById('count').textContent = state.data.pairs.length + '조합';
  }

  async function load() {
    var r = await call('GET', '/admin/crystal-prices/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    document.getElementById('stat-pairs').textContent = r.json.pairs.length;
    document.getElementById('stat-missing').textContent = r.json.pairs.filter(function (p) { return !current(p); }).length;
    document.getElementById('stat-default').textContent = r.json.defaultMaxPartySize == null ? '없음' : r.json.defaultMaxPartySize + '인';
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
