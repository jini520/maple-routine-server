import { layout } from './layout'

/**
 * 드롭 가격 보기. 읽기만 한다. 왼쪽은 아이템 목록이고, 줄을 고르면 오른쪽에 그 아이템의 값 · 가격 분포 점그림 · 기록이 뜬다.
 * 잘못 적은 값과 completed 가 아닌 줄을 눈으로 찾는 자리라 pending · skipped · deleted 도 기록에 남긴다. 값은 completed 만 센다.
 * 기간 · 획득처 고르기는 목록과 상세에 함께 걸린다.
 */
export const DROP_PRICES_HTML = layout(
  '/admin/drop-prices',
  '드롭 가격',
  `<div class="head"><div><h1>드롭 가격</h1><p>앱이 보낸 드롭 가격 기록이다. 왼쪽에서 아이템을 고르면 오른쪽에 그 아이템의 가격 분포와 기록이 뜬다. 값은 완료된 기록만 센다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<div class="toolbar">
  <div class="search">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
    <input id="q" class="on-bg" type="search" placeholder="아이템 이름" aria-label="아이템 이름으로 찾기">
  </div>
  <select id="period" class="on-bg" aria-label="기간"></select>
  <select id="source" class="on-bg" aria-label="획득처"></select>
</div>
<section class="card">
  <header><h2>아이템</h2><p id="item-count"></p></header>
  <div class="split-view even">
    <div class="table"><table class="rank"><thead><tr id="item-head"></tr></thead><tbody id="items"></tbody></table></div>
    <aside class="detail" id="detail" aria-label="고른 아이템" aria-live="polite"></aside>
  </div>
</section>
<script>
  var PAGE = 50;
  var STATUS = { completed: ['완료', 'dim'], pending: ['대기', 'tag accent'], skipped: ['건너뜀', 'tag'], deleted: ['삭제', 'tag danger'] };
  var ROW_CLASS = { completed: '', pending: 'muted', skipped: 'muted', deleted: 'deleted' };
  var DIFFICULTY = { easy: '이지', normal: '노멀', hard: '하드', chaos: '카오스', extreme: '익스트림' };
  var COLS = [
    { label: '아이템', key: 'itemName', text: true },
    { label: '기록', key: 'count', num: true },
    { label: '완료', key: 'completed', num: true },
    { label: '중앙값', key: 'median', num: true },
    { label: '최소 ~ 최대', num: true },
  ];
  var state = { period: thisWeek(), source: 'all', q: '', sort: { key: 'count', dir: -1 }, items: [], sel: null, rows: [], offset: 0 };

  // 이번 주의 기간 key. 처치 기간은 목요일 0시(KST)에 바뀐다.
  function thisWeek() {
    var d = new Date(Date.now() + 9 * 3600000);
    d = new Date(d.getTime() - ((d.getUTCDay() + 3) % 7) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function periodLabel(key) {
    var year = Number(key.slice(0, 4)) === new Date(Date.now() + 9 * 3600000).getUTCFullYear() ? '' : key.slice(0, 4) + '-';
    if (key.length === 7) return year + Number(key.slice(5)) + '월 (월간 보스)';
    return year + key.slice(5) + ' 주' + (key === thisWeek() ? ' (이번 주)' : '');
  }
  function sourceLabel(row) { return row.source === 'box' ? row.boxName : row.source === 'direct' ? '직접 드롭' : '획득처 모름'; }
  function query(extra) {
    var q = new URLSearchParams({ source: state.source });
    if (state.period) q.set('periodKey', state.period);
    Object.keys(extra || {}).forEach(function (k) { q.set(k, String(extra[k])); });
    return q.toString();
  }

  function renderItems() {
    sortHeader(document.getElementById('item-head'), COLS, state.sort, function (s) { state.sort = s; renderItems(); });
    var q = state.q.trim();
    var list = state.items.filter(function (it) { return !q || it.itemName.indexOf(q) >= 0 || it.itemKey.indexOf(q) >= 0; })
      .sort(byKey(function (it) { return it[state.sort.key]; }, state.sort.dir));
    var body = document.getElementById('items'); body.innerHTML = '';
    list.forEach(function (it) {
      var tr = el('tr', undefined, it.itemKey === state.sel ? 'open' : '');
      var pick = button(it.itemName, 'pick-btn');
      pick.addEventListener('click', function (e) { e.stopPropagation(); choose(it.itemKey); });
      cell(tr, pick); cell(tr, String(it.count), 'num'); cell(tr, String(it.completed), 'num');
      cell(tr, money(it.median), 'num price').title = it.median === null ? '' : meso(it.median) + ' 메소';
      cell(tr, it.min === null ? '-' : it.min === it.max ? money(it.min) : money(it.min) + ' ~ ' + money(it.max), 'num dim');
      tr.addEventListener('click', function () { choose(it.itemKey); });
      body.appendChild(tr);
    });
    if (list.length === 0) { var tr = el('tr'); cell(tr, '맞는 아이템이 없다', 'empty').colSpan = COLS.length; body.appendChild(tr); }
    document.getElementById('item-count').textContent = list.length + '개';
  }

  function choose(key) {
    if (state.sel === key) return;
    state.sel = key;
    renderItems();
    loadDetail();
  }

  function fact(label, value, title) { var d = el('div'); d.appendChild(el('span', label)); var b = el('b', value); if (title) b.title = title; d.appendChild(b); return d; }

  // 가로축은 로그 눈금이다. 같은 아이템에 1메소와 수십억이 함께 적히면 고른 눈금으로는 나머지 점이 한쪽 끝에 뭉친다.
  function strip(points, median) {
    var prices = points.filter(function (p) { return p.priceMeso !== null; });
    var lo = Math.min.apply(null, prices.map(function (p) { return p.priceMeso; }));
    var hi = Math.max.apply(null, prices.map(function (p) { return p.priceMeso; }));
    var x = function (v) { return hi === lo ? 50 : (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * 100; };
    var box = el('div', undefined, 'strip'); box.appendChild(el('div', undefined, 'track'));
    var lane = el('div', undefined, 'lane'); box.appendChild(lane);
    prices.forEach(function (p) {
      var dot = el('span', undefined, 'dot ' + (p.source === 'direct' ? '' : p.source));
      dot.style.left = x(p.priceMeso) + '%'; dot.title = meso(p.priceMeso) + ' 메소 · ' + sourceLabel(p);
      lane.appendChild(dot);
    });
    if (median !== null) { var m = el('span', undefined, 'median'); m.style.left = x(median) + '%'; m.title = '중앙값 ' + meso(median) + ' 메소'; lane.appendChild(m); }
    var wrap = el('div', undefined, 'block');
    wrap.appendChild(el('div', '가격 분포', 'hint'));
    wrap.appendChild(box);
    var axis = el('div', undefined, 'strip-axis'); axis.appendChild(el('span', money(lo))); axis.appendChild(el('span', money(hi))); wrap.appendChild(axis);
    var legend = el('div', undefined, 'legend');
    [['직접 드롭', 'var(--part-1)'], ['상자', 'var(--part-2)'], ['획득처 모름', 'var(--text-3)']].forEach(function (l) {
      var s = el('span'); var i = el('i'); i.style.background = l[1]; s.appendChild(i); s.appendChild(document.createTextNode(l[0])); legend.appendChild(s);
    });
    wrap.appendChild(legend);
    wrap.appendChild(el('p', '완료된 기록 하나가 점 하나다. 세로 막대가 중앙값이고, 가로축은 로그 눈금이다', 'hint'));
    return wrap;
  }

  function rowLine(r) {
    var tr = el('tr', undefined, ROW_CLASS[r.recordStatus]);
    tr.title = (r.identifiedBy === 'login' ? '로그인' : 'API 키') + ' · ' + (r.userId === null ? '삭제된 사람' : r.userId.slice(0, 8));
    cell(tr, when(r.updatedAt).slice(5, 16), 'mono');
    cell(tr, r.worldName || '-');
    var boss = el('div'); boss.appendChild(document.createTextNode(r.bossName || '-'));
    if (r.difficulty) boss.appendChild(el('span', DIFFICULTY[r.difficulty] || r.difficulty, 'diff'));
    boss.appendChild(el('span', sourceLabel(r), r.source === 'box' ? 'src box' : 'src'));
    cell(tr, boss);
    var price = el('div'); price.appendChild(document.createTextNode(money(r.priceMeso)));
    if (r.ringLevel !== null) price.appendChild(el('span', r.ringLevel + '레벨', 'lv'));
    var td = cell(tr, price, 'num'); if (r.priceMeso !== null) td.title = meso(r.priceMeso) + ' 메소';
    var st = STATUS[r.recordStatus]; cell(tr, span(st[0], st[1]));
    return tr;
  }

  function renderDetail(points) {
    var box = document.getElementById('detail'); box.innerHTML = '';
    var it = state.items.filter(function (x) { return x.itemKey === state.sel; })[0];
    if (!it) { box.appendChild(el('p', '왼쪽에서 아이템을 고른다', 'hint')); return; }
    var name = el('div', undefined, 'name'); name.appendChild(el('b', it.itemName));
    name.appendChild(el('div', (state.period ? periodLabel(state.period) : '전체 기간') + ' · 기록 ' + it.count + '줄', 'hint'));
    var bySource = {}, order = [];
    points.forEach(function (p) { var l = sourceLabel(p); if (!(l in bySource)) { bySource[l] = 0; order.push(l); } bySource[l]++; });
    name.appendChild(el('div', order.map(function (l) { return l + ' ' + bySource[l]; }).join(' · '), 'hint'));
    box.appendChild(name);
    var facts = el('div', undefined, 'facts');
    facts.appendChild(fact('중앙값', money(it.median), it.median === null ? '' : meso(it.median) + ' 메소'));
    facts.appendChild(fact('최소', money(it.min), it.min === null ? '' : meso(it.min) + ' 메소'));
    facts.appendChild(fact('최대', money(it.max), it.max === null ? '' : meso(it.max) + ' 메소'));
    facts.appendChild(fact('완료 / 기록', it.completed + ' / ' + it.count));
    box.appendChild(facts);
    if (it.completed > 0) box.appendChild(strip(points, it.median));
    var body = el('tbody'); body.id = 'detail-rows';
    var list = el('div', undefined, 'block');
    list.appendChild(el('div', '기록 · 최근 것부터. 줄에 마우스를 올리면 보낸 사람이 보인다', 'hint'));
    list.appendChild(mini(['고친 때', '월드', '보스 · 획득처', '가격', '상태'], body));
    list.querySelectorAll('th')[3].className = 'num';
    var more = button('더 보기', 'more'); more.id = 'more'; more.hidden = true;
    more.addEventListener('click', loadRows);
    list.appendChild(more);
    box.appendChild(list);
  }

  async function loadRows() {
    var r = await call('GET', '/admin/drop-prices/rows?' + query({ itemKey: state.sel, limit: PAGE, offset: state.offset }));
    if (!r.ok) { show(fail('기록을 못 읽었다', r), true); return; }
    var body = document.getElementById('detail-rows');
    if (!body) return;
    r.json.rows.forEach(function (row) { body.appendChild(rowLine(row)); });
    state.offset += r.json.rows.length;
    document.getElementById('more').hidden = !r.json.hasMore;
  }

  async function loadDetail() {
    state.offset = 0;
    if (!state.sel) { renderDetail([]); return; }
    var r = await call('GET', '/admin/drop-prices/points?' + query({ itemKey: state.sel }));
    if (!r.ok) { show(fail('가격 분포를 못 읽었다', r), true); return; }
    renderDetail(r.json);
    await loadRows();
  }

  async function loadItems() {
    var r = await call('GET', '/admin/drop-prices/items?' + query());
    if (!r.ok) { show(fail('아이템 목록을 못 읽었다', r), true); return; }
    show('', false);
    state.items = r.json;
    if (!state.items.some(function (it) { return it.itemKey === state.sel; })) state.sel = state.items.length ? state.items[0].itemKey : null;
    renderItems();
    await loadDetail();
  }

  async function init() {
    var res = await Promise.all([call('GET', '/admin/drop-prices/periods'), call('GET', '/admin/drop-boxes/rows')]);
    if (!res[0].ok) { show(fail('기간 목록을 못 읽었다', res[0]), true); return; }
    if (!res[1].ok) { show(fail('상자 표를 못 읽었다', res[1]), true); return; }
    var periods = res[0].json;
    if (periods.indexOf(state.period) < 0) periods.unshift(state.period);
    var period = document.getElementById('period');
    periods.forEach(function (k) { period.appendChild(new Option(periodLabel(k), k)); });
    period.appendChild(new Option('전체 기간', ''));
    period.value = state.period;
    var source = document.getElementById('source');
    [['all', '모든 획득처'], ['direct', '직접 드롭'], ['box', '상자 전부']]
      .concat(res[1].json.boxes.map(function (b) { return [b.item, b.name]; }))
      .concat([['unknown', '획득처 모름']])
      .forEach(function (o) { source.appendChild(new Option(o[1], o[0])); });
    period.addEventListener('change', function () { state.period = period.value; loadItems(); });
    source.addEventListener('change', function () { state.source = source.value; loadItems(); });
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderItems(); });
    await loadItems();
  }
  init();
</script>`,
)
