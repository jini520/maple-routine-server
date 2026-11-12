import { DASHBOARD_SCRIPT } from './dashboard'
import { layout } from './layout'

/**
 * 사용자 대시보드. 사람 수와 그 일별 · 요일별 증감을 본다. 읽기만 한다.
 * 기간은 한국 시각 오늘까지다. 오늘 값은 새로고침할 때마다 늘어난다. 플랫폼을 고르면 사건으로 세는 값만 그 플랫폼으로 센다.
 */
export const USERS_HTML = layout(
  '/admin/users',
  '사용자',
  `<div class="head"><div><h1>사용자</h1><p>앱을 쓰는 사람의 수다. 방문자는 그 날 사용 사건을 하나라도 보낸 서로 다른 사람이고, 새 사용자는 서버가 그 사람을 처음 만든 날로 센다. 날짜는 한국 시각으로 자르고, 오늘은 지금까지 받은 사건으로 센다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<div class="dash-filters">
  <div class="btns" role="group" aria-label="기간" id="presets"></div>
  <div class="inline"><label for="platform">플랫폼</label><select id="platform" class="on-bg"><option value="">전체</option><option value="ios">iOS</option><option value="android">Android</option></select></div>
  <span class="mono dim" id="range"></span>
</div>
<div id="dash" style="display: grid; gap: 20px">
  <div class="kpis" id="kpis"></div>
  <section class="card">
    <header><h2>일별 방문자</h2><p>막대 아래 두 줄은 그 날 보낸 알림 수, 맨 아래 줄은 전날과의 차이다</p></header>
    <div class="body" id="daily"></div>
  </section>
  <div class="dash-2">
    <section class="card">
      <header><h2>요일별 방문자</h2><p>막대는 평균, 세로선은 가장 적은 날부터 가장 많은 날까지</p></header>
      <div class="body" id="weekday"></div>
    </section>
    <section class="card">
      <header><h2>요일 · 시간대별 방문</h2><p>방문을 시작한 시각. 같은 요일끼리의 평균</p></header>
      <div class="body" id="heat"></div>
    </section>
  </div>
  <div class="dash-2">
    <section class="card">
      <header><h2>일별 새 사용자</h2><p>서버가 사람을 처음 만든 날. 모든 플랫폼</p></header>
      <div class="body" id="fresh"></div>
    </section>
    <section class="card">
      <header><h2>기간 방문자 구성</h2><p id="comp-note"></p></header>
      <div class="body"><div class="parts" id="composition"></div></div>
    </section>
  </div>
</div>
${DASHBOARD_SCRIPT}
<script>
  var state = { days: 7, platform: '' };
  var PLATFORM_NAMES = { ios: 'iOS', android: 'Android' };
  var IDENTITY_NAMES = { login: '넥슨 로그인', key: 'API 키' };

  function put(id, node) { clear(document.getElementById(id)).appendChild(node); }

  function render(d) {
    var n = d.range.days;
    document.getElementById('range').textContent = d.range.first + ' ~ ' + d.range.last;
    var allPlatforms = state.platform ? '모든 플랫폼' : '';
    var t = d.tiles;
    var kpis = clear(document.getElementById('kpis'));
    [
      { label: '전체 사용자', value: t.total.value, delta: t.total.delta, vs: n + '일 전보다', series: t.total.series, note: allPlatforms },
      { label: '오늘 방문자', value: t.today.value, delta: t.today.delta, vs: '어제보다', series: t.today.series },
      { label: '7일 방문자', value: t.week.value, delta: t.week.delta, vs: '그 전 7일보다' },
      { label: n + '일 방문자', value: t.period.value, delta: t.period.delta, vs: '그 전 ' + n + '일보다' },
      { label: n + '일 새 사용자', value: t.fresh.value, delta: t.fresh.delta, vs: '그 전 ' + n + '일보다', series: t.fresh.series, note: allPlatforms },
    ].forEach(function (tile) { kpis.appendChild(kpiTile(tile)); });

    put('daily', dailyChart({
      series: '방문자', unit: '명', height: 200, delta: true, alerts: true,
      days: d.daily.map(function (x) { return { day: x.day, value: x.visitors, extra: '새 사용자 ' + x.fresh + '명', alerts: x.alerts }; }),
    }));
    put('weekday', weekdayChart(d.weekday, '명'));
    put('heat', heatChart(d.heat, '방문 시작 평균', '번'));
    put('fresh', dailyChart({
      series: '새 사용자', unit: '명', height: 140,
      days: d.daily.map(function (x) { return { day: x.day, value: x.fresh }; }),
    }));
    document.getElementById('comp-note').textContent = n + '일 방문자 ' + num(t.period.value) + '명. 마지막으로 보낸 사건으로 한 번씩 센다';
    var comp = clear(document.getElementById('composition'));
    comp.appendChild(splitPart('플랫폼', inOrder(d.composition.platform, ['ios', 'android'], PLATFORM_NAMES), PARTS, '명'));
    comp.appendChild(splitPart('로그인 방식', inOrder(d.composition.identity, ['login', 'key'], IDENTITY_NAMES), PARTS, '명'));
  }

  async function load() {
    presetButtons(document.getElementById('presets'), state.days, function (days) { state.days = days; load(); });
    var dash = document.getElementById('dash');
    dash.classList.add('loading');
    var url = '/admin/users/stats?days=' + state.days + (state.platform ? '&platform=' + state.platform : '');
    var r = await call('GET', url);
    dash.classList.remove('loading');
    if (!r.ok) { show(fail('못 읽었다', r), true); return; }
    show('', false);
    render(r.json);
  }

  document.getElementById('platform').addEventListener('change', function (e) { state.platform = e.target.value; load(); });
  load();
</script>`,
)
