import { DASHBOARD_SCRIPT } from './dashboard'
import { layout } from './layout'

/**
 * 사용 로그 대시보드. 읽기만 한다. 위 칸을 누르면 일별 막대가 그 지표로 바뀌고, 화면 줄을 누르면 오른쪽에 그 화면을 펼친다.
 * 동작 칸은 그 기간에 나온 동작 이름으로 만든다. 앱이 동작을 더해도 서버를 고치지 않고 칸이 생긴다.
 */
export const USAGE_HTML = layout(
  '/admin/usage',
  '사용 로그',
  `<div class="head"><div><h1>사용 로그</h1><p>앱이 묶어 보낸 사용 사건이다. 방문은 앱을 열거나 30분 넘게 비웠다 돌아온 횟수고, 동작 이름은 앱이 보낸 그대로다. 날짜는 한국 시각으로 자르고, 오늘은 지금까지 받은 사건으로 센다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<div class="dash-filters">
  <div class="btns" role="group" aria-label="기간" id="presets"></div>
  <span class="mono dim" id="range"></span>
</div>
<div id="dash" style="display: grid; gap: 20px">
  <div class="dash-top">
    <section class="card dash-main">
      <div class="tabs" role="tablist" aria-label="지표" id="tabs"></div>
      <div class="body" id="daily"></div>
    </section>
    <aside class="card dash-rail">
      <header><h2>기간 방문자 구성</h2><p id="comp-note"></p></header>
      <div class="body"><div class="parts" id="composition"></div></div>
    </aside>
  </div>
  <section class="card">
    <header><h2>화면별</h2><p>방문자가 많은 화면부터. 줄을 누르면 그 화면의 일별 방문자가 오른쪽에 뜬다. 체류는 화면을 떠날 때 잰 시간의 중앙값이다</p></header>
    <div class="split-view">
      <div class="table">
        <table class="rank"><thead><tr><th>화면</th><th>방문자</th><th class="num">본 횟수</th><th class="num">체류 중앙값</th><th class="num">지난 7일 방문자</th></tr></thead><tbody id="screens"></tbody></table>
        <button type="button" class="more" id="more" hidden></button>
      </div>
      <div class="detail" id="detail"></div>
    </div>
  </section>
</div>
${DASHBOARD_SCRIPT}
<script>
  var state = { days: 7, tab: 'visits', screen: null, showAll: false, data: null };
  var PLATFORM_NAMES = { ios: 'iOS', android: 'Android' };
  var VERSION_COLORS = ['var(--ramp-5)', 'var(--ramp-4)', 'var(--ramp-3)', 'var(--ramp-2)', 'var(--ramp-gray)'];
  var TOP_SCREENS = 10;

  function put(id, node) { clear(document.getElementById(id)).appendChild(node); }
  function seconds(ms) { return ms === null ? '-' : (ms / 1000).toFixed(1) + '초'; }
  function changeText(c) { return c === null ? '-' : c === 0 ? '0%' : (c > 0 ? '▲ ' : '▼ ') + Math.abs(c) + '%'; }

  /** 1.0.13+2 같은 버전을 큰 것부터. 새 버전일수록 진한 코발트다. 다섯째부터는 하나로 접는다. */
  function versionKey(v) { return v.split('+')[0].split('.').map(Number).concat([Number(v.split('+')[1] || 0)]); }
  function byVersionDesc(a, b) {
    var x = versionKey(a.name), y = versionKey(b.name);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); }
    return 0;
  }
  function versionParts(parts) {
    var sorted = parts.slice().sort(byVersionDesc);
    if (sorted.length <= 5) return sorted;
    var rest = sorted.slice(4).reduce(function (a, p) { return a + p.value; }, 0);
    return sorted.slice(0, 4).concat([{ name: '그 밖 ' + (sorted.length - 4) + '개', value: rest }]);
  }

  function metricValue(key, day) {
    if (key === 'visits') return day.visits;
    if (key === 'views') return day.views;
    return day.actions[key.slice(7)] || 0;
  }

  function renderTabs(d) {
    var box = clear(document.getElementById('tabs'));
    d.metrics.forEach(function (m) {
      var on = m.key === state.tab;
      var b = button(undefined, 'tab');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.appendChild(el('span', m.label, m.key.indexOf('action:') === 0 ? 'label mono' : 'label'));
      var v = el('span', num(m.total), 'value');
      v.appendChild(el('small', '번'));
      b.appendChild(v);
      var delta = el('span', m.delta === null ? '' : signed(m.delta) + ' ', 'delta ' + (m.delta === null ? 'flat' : toneOf(m.delta)));
      delta.appendChild(el('small', m.delta === null ? '맞댈 앞 기간이 없다' : '그 전 ' + d.range.days + '일보다'));
      b.appendChild(delta);
      b.addEventListener('click', function () { state.tab = m.key; renderTabs(d); renderDaily(d); });
      box.appendChild(b);
    });
  }

  function renderDaily(d) {
    var metric = d.metrics.filter(function (m) { return m.key === state.tab; })[0] || d.metrics[0];
    put('daily', dailyChart({
      series: metric.label, unit: '번', height: 200, delta: true, alerts: true,
      days: d.daily.map(function (x) { return { day: x.day, value: metricValue(metric.key, x), alerts: x.alerts }; }),
    }));
  }

  function renderScreens(d) {
    var body = clear(document.getElementById('screens'));
    var rows = state.showAll ? d.screens : d.screens.slice(0, TOP_SCREENS);
    var max = d.screens.reduce(function (a, s) { return Math.max(a, s.visitors); }, 0) || 1;
    if (rows.length === 0) {
      var tr = el('tr');
      var td = cell(tr, '기간에 본 화면이 없다', 'empty');
      td.colSpan = 5;
      body.appendChild(tr);
    }
    rows.forEach(function (s) {
      var tr = el('tr', undefined, s.name === state.screen ? 'open' : '');
      var name = button(undefined, 'pick-btn');
      var label = el('span', undefined, 'screen');
      label.appendChild(el('b', s.label || s.name));
      if (s.label) label.appendChild(el('small', s.name));
      name.appendChild(label);
      name.setAttribute('aria-pressed', s.name === state.screen ? 'true' : 'false');
      cell(tr, name);
      var line = el('div', undefined, 'barline');
      var bar = el('i');
      bar.style.width = (s.visitors / max * 100).toFixed(1) + '%';
      var track = el('div');
      track.style.flex = '1';
      track.appendChild(bar);
      line.appendChild(track);
      line.appendChild(el('span', num(s.visitors), 'num'));
      cell(tr, line, 'bar-cell');
      cell(tr, num(s.views), 'num');
      cell(tr, seconds(s.medianMs), 'num');
      cell(tr, changeText(s.recentChange), 'num ' + (s.recentChange === null ? 'flat' : toneOf(s.recentChange)));
      tr.addEventListener('click', function () { pickScreen(s.name); });
      body.appendChild(tr);
    });
    var more = document.getElementById('more');
    more.hidden = d.screens.length <= TOP_SCREENS;
    more.textContent = state.showAll ? '위 ' + TOP_SCREENS + '개만 보기' : '나머지 ' + (d.screens.length - TOP_SCREENS) + '개 화면';
  }

  async function pickScreen(name) {
    state.screen = name;
    renderScreens(state.data);
    var s = state.data.screens.filter(function (x) { return x.name === name; })[0];
    var detail = clear(document.getElementById('detail'));
    if (!s) { detail.appendChild(el('span', '고른 화면이 없다', 'dim')); return; }
    var head = el('div', undefined, 'name');
    head.appendChild(el('b', s.label || s.name));
    if (s.label) head.appendChild(el('small', s.name));
    detail.appendChild(head);
    var facts = el('div', undefined, 'facts');
    [
      ['기간 방문자', num(s.visitors) + '명', ''],
      ['방문자 1명당 조회', (s.views / Math.max(1, s.visitors)).toFixed(1) + '번', ''],
      ['체류 중앙값', seconds(s.medianMs), ''],
      ['지난 7일 방문자', changeText(s.recentChange), s.recentChange === null ? 'flat' : toneOf(s.recentChange)],
    ].forEach(function (f) {
      var box = el('div');
      box.appendChild(el('span', f[0]));
      box.appendChild(el('b', f[1], f[2]));
      facts.appendChild(box);
    });
    detail.appendChild(facts);
    var well = el('div', undefined, 'well');
    detail.appendChild(well);
    var r = await call('GET', '/admin/usage/screen?days=' + state.days + '&name=' + encodeURIComponent(name));
    if (state.screen !== name) return;
    if (!r.ok) { well.appendChild(el('span', fail('못 읽었다', r), 'dim')); return; }
    well.appendChild(dailyChart({
      series: '방문자', unit: '명', height: 110, compact: true,
      days: r.json.daily.map(function (x) { return { day: x.day, value: x.visitors }; }),
    }));
  }

  function render(d) {
    state.data = d;
    document.getElementById('range').textContent = d.range.first + ' ~ ' + d.range.last;
    if (!d.metrics.some(function (m) { return m.key === state.tab; })) state.tab = 'visits';
    renderTabs(d);
    renderDaily(d);
    var visitors = d.composition.platform.reduce(function (a, p) { return a + p.value; }, 0);
    document.getElementById('comp-note').textContent = num(visitors) + '명';
    var comp = clear(document.getElementById('composition'));
    comp.appendChild(splitPart('앱 버전', versionParts(d.composition.version), VERSION_COLORS, '명'));
    comp.appendChild(splitPart('플랫폼', inOrder(d.composition.platform, ['ios', 'android'], PLATFORM_NAMES), PARTS, '명'));
    if (!d.screens.some(function (s) { return s.name === state.screen; })) state.screen = d.screens.length ? d.screens[0].name : null;
    renderScreens(d);
    if (state.screen) pickScreen(state.screen);
    else clear(document.getElementById('detail')).appendChild(el('span', '기간에 본 화면이 없다', 'dim'));
  }

  async function load() {
    presetButtons(document.getElementById('presets'), state.days, function (days) { state.days = days; load(); });
    var dash = document.getElementById('dash');
    dash.classList.add('loading');
    var r = await call('GET', '/admin/usage/stats?days=' + state.days);
    dash.classList.remove('loading');
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    show('', false);
    render(r.json);
  }

  document.getElementById('more').addEventListener('click', function () { state.showAll = !state.showAll; renderScreens(state.data); });
  load();
</script>`,
)
