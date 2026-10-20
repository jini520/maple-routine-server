import { layout } from './layout'

/**
 * 드롭 시세 아이템 화면. 위는 최근 90일 차트(일봉 · 주봉), 아래는 같은 기간의 거래 줄과 판정이다.
 * 봉을 누르면 차트 위에 그 봉의 값이 뜬다. 처음엔 마지막 봉이고, 그 종가가 현재가다. 고른 봉 단위는 주소의 period 에 남는다.
 * 왜 빠졌는지 보이게 줄마다 울타리를 함께 보인다.
 * 시세 하나는 주소의 kind · key · item · ring 이 정한다. 장비는 key 가 거래권, 소비는 월드다. ring 이 없으면 반지가 아닌 아이템이다.
 * 차트는 서버가 내보내는 lightweight-charts 4 의 standalone 파일이 window.LightweightCharts 로 연다.
 */
export const DROP_MARKET_ITEM_HTML = layout(
  '/admin/drop-market',
  '드롭 시세',
  `<script src="/admin/assets/lightweight-charts.js"></script>
<div class="head"><div><h1 id="title">드롭 시세</h1><p id="subtitle"></p></div><div><a class="btn ghost sm" id="back" href="/admin/drop-market">목록으로</a></div></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2 id="scope-title">거래권</h2></header>
  <div class="body"><div id="groups" class="actions"></div></div>
</section>
<section class="card">
  <header><div id="periods" class="actions"></div><p>최근 90일. 오른 봉은 빨강, 내린 봉은 파랑이다. 아래 막대가 거래 수다. 봉을 누르면 위에 값이 뜬다. 주봉은 목요일부터다</p></header>
  <div class="body">
    <div class="stats" id="candle-info"></div>
    <div id="chart" style="height:380px"></div>
  </div>
</section>
<section class="card">
  <header><h2>거래</h2><p id="count"></p></header>
  <div class="table"><table><thead><tr><th>거래 (KST)</th><th>월드</th><th class="num">가격</th><th>판정</th><th class="num">울타리</th><th class="num">표본</th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  function eok(n) { return n >= 1e8 ? (n / 1e8).toFixed(2) + '억' : meso(n); }
  var VERDICT = { included: ['포함', 'tag ok'], pending: ['판단 보류', 'tag'], excluded: ['제외', 'tag accent'] };
  var params = new URLSearchParams(location.search);
  var PERIODS = [['day', '일봉', 'candles'], ['week', '주봉', 'weeklyCandles']];
  var state = { period: params.get('period') === 'week' ? 'week' : 'day', detail: null, kind: params.get('kind') === 'consumable' ? 'consumable' : 'equipment', key: params.get('key') || 'general', item: params.get('item') || '', ring: params.get('ring') };
  var chart = LightweightCharts.createChart(document.getElementById('chart'), {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: '#4B5563', fontFamily: 'IBM Plex Sans KR, sans-serif' },
    grid: { vertLines: { color: '#F0F1F3' }, horzLines: { color: '#F0F1F3' } },
    localization: { locale: 'ko-KR', priceFormatter: eok },
    rightPriceScale: { borderColor: '#E5E7EB' },
    timeScale: { borderColor: '#E5E7EB' },
  });
  // 한국 증시처럼 오름이 빨강, 내림이 파랑이다.
  var candles = chart.addCandlestickSeries({ upColor: '#D92D20', downColor: '#2F5BEA', borderVisible: false, wickUpColor: '#D92D20', wickDownColor: '#2F5BEA' });
  var volume = chart.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' }, color: '#D2D6DC' });
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

  function stat(value, label) { var d = el('div', undefined, 'stat'); d.appendChild(el('b', value)); d.appendChild(el('span', label)); return d; }

  function current() { return state.detail[PERIODS.find(function (p) { return p[0] === state.period; })[2]]; }

  // lightweight-charts 4 는 'YYYY-MM-DD' 로 넣은 시각을 누르면 { year, month, day } 로 돌려준다.
  function dayOf(time) {
    if (typeof time === 'string') return time;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return time.year + '-' + p(time.month) + '-' + p(time.day);
  }

  function periodLabel(c) {
    if (state.period === 'day') return c.day;
    var end = new Date(new Date(c.day + 'T00:00:00Z').getTime() + 6 * 86400000).toISOString().slice(5, 10);
    return c.day + ' ~ ' + end;
  }

  // 마지막 봉의 종가가 현재가다. 앞 봉이 없으면 대비를 비운다.
  function showInfo(c) {
    var box = document.getElementById('candle-info'); box.innerHTML = '';
    if (!c) return;
    var list = current(); var i = list.indexOf(c); var prev = list[i - 1];
    var change = prev ? c.close - prev.close : null;
    var stats = [
      [periodLabel(c), state.period === 'day' ? '날' : '주'],
      [eok(c.open), '시가'], [eok(c.high), '최고가'], [eok(c.low), '최저가'],
      [eok(c.close), i === list.length - 1 ? '현재가' : '종가'], [String(c.count), '거래 수'],
      [change === null ? '-' : (change > 0 ? '+' : change < 0 ? '-' : '') + (Math.abs(change) / 1e8).toFixed(2) + '억', '앞 봉 대비'],
    ];
    stats.forEach(function (x, j) {
      var d = stat(x[0], x[1]); box.appendChild(d);
      if (j === 0) d.firstChild.className = 'mono';
      if (j === 6 && change) d.firstChild.style.color = change > 0 ? 'var(--danger-ink)' : 'var(--accent-ink)';
    });
  }

  function renderPeriods() {
    var box = document.getElementById('periods'); box.innerHTML = '';
    PERIODS.forEach(function (p) {
      var b = button(p[1], p[0] === state.period ? 'btn sm' : 'btn ghost sm');
      b.addEventListener('click', function () {
        if (state.period === p[0]) return;
        state.period = p[0];
        var q = new URLSearchParams(location.search); q.set('period', p[0]); history.replaceState(null, '', '?' + q.toString());
        renderPeriods(); renderChart();
      });
      box.appendChild(b);
    });
  }

  function renderChart() {
    var list = current();
    candles.setData(list.map(function (c) { return { time: c.day, open: c.open, high: c.high, low: c.low, close: c.close }; }));
    volume.setData(list.map(function (c) { return { time: c.day, value: c.count }; }));
    chart.timeScale().fitContent();
    showInfo(list[list.length - 1]);
  }

  chart.subscribeClick(function (param) {
    if (!param.time || !state.detail) return;
    var day = dayOf(param.time);
    var c = current().find(function (x) { return x.day === day; });
    if (c) showInfo(c);
  });

  function query(key) {
    var q = new URLSearchParams({ kind: state.kind, key: key, item: state.item });
    if (state.ring !== null) q.set('ring', state.ring);
    return q.toString();
  }

  async function loadGroups() {
    var r = await call('GET', '/admin/drop-market/scopes');
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    document.getElementById('scope-title').textContent = state.kind === 'equipment' ? '거래권' : '월드';
    var box = document.getElementById('groups'); box.innerHTML = '';
    (state.kind === 'equipment' ? r.json.groups : r.json.worlds).forEach(function (g) {
      var b = button(g.name, g.key === state.key ? 'btn sm' : 'btn ghost sm');
      if (g.worlds) b.title = g.worlds.join(' · ');
      b.addEventListener('click', function () { location.search = query(g.key) + '&period=' + state.period; });
      box.appendChild(b);
    });
  }

  async function loadDetail() {
    var r = await call('GET', '/admin/drop-market/item/rows?' + query(state.key));
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    var d = r.json;
    var name = (d.itemName || state.item) + (state.ring !== null ? ' ' + state.ring + '레벨' : '');
    document.getElementById('title').textContent = name;
    document.title = name + ' · 드롭 시세 · 메이플 루틴 관리';
    document.getElementById('back').href = '/admin/drop-market?' + new URLSearchParams({ kind: state.kind, key: state.key }).toString();
    var last = d.candles[d.candles.length - 1];
    document.getElementById('subtitle').textContent = last ? '마지막 봉 ' + last.day + ' · 종가 ' + meso(last.close) + ' 메소' : '최근 90일 거래가 없다';
    state.detail = d;
    renderChart();
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    d.rows.slice().reverse().forEach(function (row) {
      var tr = el('tr', undefined, row.verdict === 'excluded' ? 'deleted' : '');
      cell(tr, when(row.pricedAt).slice(0, 16), 'mono'); cell(tr, row.worldName).title = row.worldKey;
      cell(tr, eok(row.priceMeso), 'num').title = meso(row.priceMeso) + ' 메소';
      var v = VERDICT[row.verdict]; cell(tr, span(v[0], v[1]));
      cell(tr, row.fence ? eok(Math.max(0, row.fence.low)) + ' ~ ' + eok(row.fence.high) : '-', 'num');
      cell(tr, row.sampleDays ? row.sampleDays + '일' : '-', 'num');
      rows.appendChild(tr);
    });
    if (d.rows.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 6; rows.appendChild(tr); }
    var excluded = d.rows.filter(function (row) { return row.verdict === 'excluded'; }).length;
    document.getElementById('count').textContent = d.rows.length + '줄 · 제외 ' + excluded + '줄';
  }

  renderPeriods();
  loadGroups();
  loadDetail();
</script>`,
)
