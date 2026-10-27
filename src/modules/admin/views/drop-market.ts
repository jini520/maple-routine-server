import { layout } from './layout'

/**
 * 드롭 시세 한눈에 보기. 장비 · 소비 탭을 고르고 장비는 거래권을, 소비는 월드를 고른다. 시세 하나(아이템 · 반지 레벨)가 한 줄이다.
 * 소비 아이템은 월드끼리 거래할 수 없어 값이 월드마다 다르고, 장비는 거래권 안에서 관세 10% 로 오가 차이가 작다.
 * 고른 것은 주소의 kind · key 에 남아 새로고침해도 그대로다. 줄을 누르면 아이템 화면으로 간다.
 */
export const DROP_MARKET_HTML = layout(
  '/admin/drop-market',
  '드롭 시세',
  `<div class="head"><div><h1>드롭 시세</h1><p>장비는 거래권마다, 소비 아이템은 월드마다 센 시세다. 잘못 적은 값은 IQR 울타리로 빼고 센다. 금일은 KST 0시부터, 금주는 목요일 0시부터다. 거래권은 <a href="/admin/worlds">월드</a>, 소비 여부는 <a href="/admin/drop-items">드롭 아이템</a> 화면에서 바꾼다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><div id="kinds" class="actions"></div><p id="scope-worlds"></p></header>
  <div class="body"><div id="scopes" class="actions"></div></div>
</section>
<section class="card">
  <header><h2>시세</h2><p id="count"></p></header>
  <div class="table"><table><thead><tr><th>아이템</th><th class="num">반지 Lv</th><th class="num">최근 거래가</th><th class="num">금일 최저가</th><th class="num">금일 최고가</th><th class="num">전일 대비</th><th class="num">금일 거래</th><th class="num">금주 거래</th><th class="num">제외 (30일)</th><th>최근 거래 (KST)</th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  // 억 단위 두 자리. 시세는 대부분 억이 넘어 전부 쓰면 자릿수를 세야 읽힌다. 정확한 값은 칸에 마우스를 올리면 뜬다.
  function eok(n) { return n === null ? '-' : n >= 1e8 ? (n / 1e8).toFixed(2) + '억' : meso(n); }
  function priceCell(tr, n) { var td = cell(tr, eok(n), 'num'); if (n !== null) td.title = meso(n) + ' 메소'; return td; }
  var KINDS = [['equipment', '장비'], ['consumable', '소비']];
  var params = new URLSearchParams(location.search);
  var state = { kind: params.get('kind') === 'consumable' ? 'consumable' : 'equipment', key: params.get('key'), scopes: null };

  function options() { return state.kind === 'equipment' ? state.scopes.groups : state.scopes.worlds; }

  function render() {
    var kinds = document.getElementById('kinds'); kinds.innerHTML = '';
    KINDS.forEach(function (k) {
      var b = button(k[1], k[0] === state.kind ? 'btn sm' : 'btn ghost sm');
      b.addEventListener('click', function () { if (state.kind === k[0]) return; state.kind = k[0]; state.key = null; select(); });
      kinds.appendChild(b);
    });
    var box = document.getElementById('scopes'); box.innerHTML = '';
    options().forEach(function (o) {
      var b = button(o.name, o.key === state.key ? 'btn sm' : 'btn ghost sm');
      b.addEventListener('click', function () { state.key = o.key; select(); });
      box.appendChild(b);
    });
    var current = options().find(function (o) { return o.key === state.key; });
    document.getElementById('scope-worlds').textContent = state.kind === 'equipment' && current ? current.worlds.join(' · ') : '';
  }

  // 고른 범위가 목록에 없으면 첫 것으로 간다. 탭을 바꿨거나 주소의 key 가 낡은 경우다.
  function select() {
    if (!options().some(function (o) { return o.key === state.key; })) state.key = options().length ? options()[0].key : null;
    history.replaceState(null, '', '?' + new URLSearchParams({ kind: state.kind, key: state.key || '' }).toString());
    render();
    loadRows();
  }

  async function loadRows() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    if (!state.key) return;
    var r = await call('GET', '/admin/drop-market/rows?' + new URLSearchParams({ kind: state.kind, key: state.key }).toString());
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    show('', false);
    r.json.forEach(function (m) {
      var tr = el('tr'); tr.style.cursor = 'pointer';
      cell(tr, m.itemName).title = m.itemKey; cell(tr, m.ringLevel === null ? '-' : String(m.ringLevel), 'num');
      priceCell(tr, m.lastPrice); priceCell(tr, m.todayLow); priceCell(tr, m.todayHigh);
      // 변동은 1억 아래가 흔해 eok 처럼 메소로 떨어지면 줄마다 단위가 달라진다. 늘 억으로 쓴다.
      var change = cell(tr, m.change === null ? '-' : (m.change > 0 ? '+' : m.change < 0 ? '-' : '') + (Math.abs(m.change) / 1e8).toFixed(2) + '억', 'num');
      if (m.change !== null) { change.style.color = m.change > 0 ? 'var(--danger-ink)' : m.change < 0 ? 'var(--accent-ink)' : ''; change.title = meso(m.change) + ' 메소'; }
      cell(tr, String(m.todayCount), 'num'); cell(tr, String(m.weekCount), 'num'); cell(tr, String(m.excludedCount), m.excludedCount > 0 ? 'num' : 'num dim');
      cell(tr, when(m.lastPricedAt).slice(0, 16), 'mono');
      tr.addEventListener('click', function () {
        var q = new URLSearchParams({ kind: state.kind, key: state.key, item: m.itemKey });
        if (m.ringLevel !== null) q.set('ring', String(m.ringLevel));
        location.href = '/admin/drop-market/item?' + q.toString();
      });
      rows.appendChild(tr);
    });
    if (r.json.length === 0) { var tr = el('tr'); var td = cell(tr, '최근 30일 거래가 없다', 'empty'); td.colSpan = 10; rows.appendChild(tr); }
    document.getElementById('count').textContent = r.json.length + '개 · 줄을 누르면 일봉 차트';
  }

  async function load() {
    var r = await call('GET', '/admin/drop-market/scopes');
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    state.scopes = r.json;
    select();
  }
  load();
</script>`,
)
