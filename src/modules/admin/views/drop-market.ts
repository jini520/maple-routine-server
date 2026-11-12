import { layout } from './layout'

/**
 * 드롭 시세 한눈에 보기. 장비 · 소비를 고르고 장비는 거래권을, 소비는 월드를 고른다. 시세 하나(아이템 · 반지 레벨)가 한 줄이다.
 * 소비 아이템은 월드끼리 거래할 수 없어 값이 월드마다 다르고, 장비는 거래권 안에서 관세 10% 로 오가 차이가 작다.
 * 고른 것은 주소의 kind · key 에 남아 새로고침해도 그대로다. 정렬과 검색은 받은 줄 안에서 한다. 줄을 누르면 아이템 화면으로 간다.
 */
export const DROP_MARKET_HTML = layout(
  '/admin/drop-market',
  '드롭 시세',
  `<div class="head"><div><h1>드롭 시세</h1><p>장비는 거래권마다, 소비 아이템은 월드마다 센 시세다. 잘못 적은 값은 IQR 울타리로 빼고 센다. 금일은 KST 0시부터, 금주는 목요일 0시부터다. 거래권은 <a href="/admin/worlds">월드</a>, 소비 여부는 <a href="/admin/drop-items">드롭 아이템</a> 화면에서 바꾼다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<div class="toolbar">
  <div id="kinds" class="seg" role="group" aria-label="종류"></div>
  <select id="scope" class="on-bg"></select>
  <div class="search">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
    <input id="q" class="on-bg" type="search" placeholder="아이템 이름" aria-label="아이템 이름으로 찾기">
  </div>
</div>
<section class="card">
  <header><div><h2 id="scope-name"></h2><p class="hint" id="scope-worlds"></p></div><p id="count"></p></header>
  <div class="table"><table><thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  var KINDS = [['equipment', '장비'], ['consumable', '소비']];
  var COLS = [
    { label: '아이템', key: 'name', text: true },
    { label: '최근 거래가', key: 'lastPrice', num: true },
    { label: '전일 대비', key: 'change', num: true },
    { label: '금일 최저 ~ 최고', num: true },
    { label: '금일', key: 'todayCount', num: true },
    { label: '금주', key: 'weekCount', num: true },
    { label: '제외 30일', key: 'excludedCount', num: true },
    { label: '최근 거래', key: 'lastPricedAt' },
  ];
  var params = new URLSearchParams(location.search);
  var state = { kind: params.get('kind') === 'consumable' ? 'consumable' : 'equipment', key: params.get('key'), scopes: null, rows: [], q: '', sort: { key: 'lastPricedAt', dir: -1 } };

  function options() { return state.kind === 'equipment' ? state.scopes.groups : state.scopes.worlds; }
  // 반지는 레벨까지가 시세 하나라, 이름이 같으면 레벨 차례로 선다.
  function sortValue(m) { return state.sort.key === 'name' ? m.itemName + ' ' + (m.ringLevel === null ? '' : String(m.ringLevel).padStart(2, '0')) : m[state.sort.key]; }

  function renderControls() {
    var kinds = document.getElementById('kinds'); kinds.innerHTML = '';
    KINDS.forEach(function (k) {
      var b = button(k[1]); b.setAttribute('aria-pressed', String(k[0] === state.kind));
      b.addEventListener('click', function () { if (state.kind === k[0]) return; state.kind = k[0]; state.key = null; select(); });
      kinds.appendChild(b);
    });
    var scope = document.getElementById('scope'); scope.innerHTML = '';
    scope.setAttribute('aria-label', state.kind === 'equipment' ? '거래권' : '월드');
    options().forEach(function (o) { scope.appendChild(new Option(o.name, o.key)); });
    scope.value = state.key || '';
    var current = options().find(function (o) { return o.key === state.key; });
    document.getElementById('scope-name').textContent = current ? current.name : '';
    document.getElementById('scope-worlds').textContent = state.kind === 'equipment' && current ? current.worlds.join(' · ') : '';
  }

  // 고른 범위가 목록에 없으면 첫 것으로 간다. 종류를 바꿨거나 주소의 key 가 낡은 경우다.
  function select() {
    if (!options().some(function (o) { return o.key === state.key; })) state.key = options().length ? options()[0].key : null;
    history.replaceState(null, '', '?' + new URLSearchParams({ kind: state.kind, key: state.key || '' }).toString());
    renderControls();
    loadRows();
  }

  function renderRows() {
    sortHeader(document.getElementById('head'), COLS, state.sort, function (s) { state.sort = s; renderRows(); });
    var q = state.q.trim();
    var list = state.rows.filter(function (m) { return !q || m.itemName.indexOf(q) >= 0; }).sort(byKey(sortValue, state.sort.dir));
    var body = document.getElementById('rows'); body.innerHTML = '';
    list.forEach(function (m) {
      var tr = el('tr'); tr.style.cursor = 'pointer';
      var traded = m.todayCount > 0;
      var name = el('div', m.itemName); if (m.ringLevel !== null) name.appendChild(el('span', m.ringLevel + '레벨', 'lv'));
      cell(tr, name);
      cell(tr, money(m.lastPrice), 'num price').title = m.lastPrice === null ? '' : meso(m.lastPrice) + ' 메소';
      var change = cell(tr, moneyDiff(m.change), 'num ' + (m.change === null || m.change === 0 ? 'flat' : m.change > 0 ? 'up' : 'down'));
      if (m.change !== null) change.title = meso(m.change) + ' 메소';
      cell(tr, m.todayLow === null ? '-' : m.todayLow === m.todayHigh ? money(m.todayLow) : money(m.todayLow) + ' ~ ' + money(m.todayHigh), m.todayLow === null ? 'num dim' : 'num');
      cell(tr, String(m.todayCount), m.todayCount ? 'num' : 'num dim');
      cell(tr, String(m.weekCount), m.weekCount ? 'num' : 'num dim');
      cell(tr, String(m.excludedCount), m.excludedCount ? 'num' : 'num dim');
      cell(tr, when(m.lastPricedAt).slice(5, 16), traded ? 'mono' : 'mono dim');
      tr.addEventListener('click', function () {
        var q = new URLSearchParams({ kind: state.kind, key: state.key, item: m.itemKey });
        if (m.ringLevel !== null) q.set('ring', String(m.ringLevel));
        location.href = '/admin/drop-market/item?' + q.toString();
      });
      body.appendChild(tr);
    });
    if (list.length === 0) { var tr = el('tr'); cell(tr, q ? '맞는 아이템이 없다' : '최근 30일 거래가 없다', 'empty').colSpan = COLS.length; body.appendChild(tr); }
    document.getElementById('count').textContent = list.length + '개 · 줄을 누르면 차트로 간다';
  }

  async function loadRows() {
    state.rows = [];
    if (!state.key) { renderRows(); return; }
    var r = await call('GET', '/admin/drop-market/rows?' + new URLSearchParams({ kind: state.kind, key: state.key }).toString());
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    show('', false);
    state.rows = r.json;
    renderRows();
  }

  async function load() {
    var r = await call('GET', '/admin/drop-market/scopes');
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    state.scopes = r.json;
    document.getElementById('scope').addEventListener('change', function (e) { state.key = e.target.value; select(); });
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderRows(); });
    select();
  }
  load();
</script>`,
)
