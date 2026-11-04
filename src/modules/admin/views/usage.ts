import { layout } from './layout'

/**
 * 앱 사용 로그 보기. 읽기만 한다. 날짜별 · 화면별 · 버전별 표 셋이고 날짜는 한국 시각으로 자른다.
 * 동작 칸은 그 기간에 나온 동작 이름으로 만든다. 앱이 동작을 더해도 서버를 고치지 않고 칸이 생긴다.
 */
export const USAGE_HTML = layout(
  '/admin/usage',
  '사용 로그',
  `<div class="head"><div><h1>사용 로그</h1><p>앱이 묶어 보낸 사용 사건이다. 방문자는 그 날 사건을 하나라도 보낸 서로 다른 사람이고, 방문은 앱을 열거나 30분 넘게 비웠다 돌아온 횟수다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <div class="body">
    <div class="row">
      <div class="field w-sm"><label for="days">기간 <small>일</small></label><input id="days" type="number" min="1" max="180" value="30"></div>
      <button id="load" class="btn" type="button">보기</button>
    </div>
  </div>
</section>
<section class="card">
  <header><h2>날짜별</h2><p>한국 시각</p></header>
  <div class="table"><table><thead id="days-head"></thead><tbody id="days-body"></tbody></table></div>
</section>
<section class="card">
  <header><h2>화면별</h2><p>체류는 화면을 떠날 때 잰 시간의 중앙값이다</p></header>
  <div class="table"><table><thead><tr><th>화면</th><th class="num">방문자</th><th class="num">본 횟수</th><th class="num">체류 중앙값</th></tr></thead><tbody id="screens"></tbody></table></div>
</section>
<section class="card">
  <header><h2>앱 버전별</h2><p>기간 안의 방문자</p></header>
  <div class="table"><table><thead><tr><th>플랫폼</th><th>앱 버전</th><th class="num">방문자</th></tr></thead><tbody id="versions"></tbody></table></div>
</section>
<script>
  function cell(tr, text, cls) { var td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; tr.appendChild(td); return td; }
  function head(tr, text, cls) { var th = document.createElement('th'); th.textContent = text; if (cls) th.className = cls; tr.appendChild(th); }
  function emptyRow(tbody, cols) { var tr = document.createElement('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = cols; tbody.appendChild(tr); }
  function seconds(ms) { return ms === null ? '-' : (ms / 1000).toFixed(1) + '초'; }
  async function load() {
    var days = document.getElementById('days').value || '30';
    var r = await call('GET', '/admin/usage/stats?days=' + encodeURIComponent(days));
    if (!r.ok) { show('못 읽었다 ' + r.status + '\\n' + r.text, true); return; }
    show('', false);
    var actionNames = [];
    r.json.days.forEach(function (d) { Object.keys(d.actions).forEach(function (n) { if (actionNames.indexOf(n) < 0) actionNames.push(n); }); });
    actionNames.sort();
    var thead = document.getElementById('days-head'); thead.innerHTML = '';
    var hr = document.createElement('tr');
    head(hr, '날짜'); head(hr, '방문자', 'num'); head(hr, '방문', 'num'); head(hr, 'iOS', 'num'); head(hr, 'Android', 'num');
    actionNames.forEach(function (n) { head(hr, n, 'num'); });
    thead.appendChild(hr);
    var body = document.getElementById('days-body'); body.innerHTML = '';
    r.json.days.forEach(function (d) {
      var tr = document.createElement('tr');
      cell(tr, d.day, 'mono'); cell(tr, String(d.visitors), 'num'); cell(tr, String(d.visits), 'num'); cell(tr, String(d.ios), 'num'); cell(tr, String(d.android), 'num');
      actionNames.forEach(function (n) { cell(tr, String(d.actions[n] || 0), 'num'); });
      body.appendChild(tr);
    });
    if (r.json.days.length === 0) emptyRow(body, 5 + actionNames.length);
    var screens = document.getElementById('screens'); screens.innerHTML = '';
    r.json.screens.forEach(function (s) {
      var tr = document.createElement('tr');
      cell(tr, s.name, 'mono'); cell(tr, String(s.visitors), 'num'); cell(tr, String(s.views), 'num'); cell(tr, seconds(s.medianMs), 'num');
      screens.appendChild(tr);
    });
    if (r.json.screens.length === 0) emptyRow(screens, 4);
    var versions = document.getElementById('versions'); versions.innerHTML = '';
    r.json.versions.forEach(function (v) {
      var tr = document.createElement('tr');
      cell(tr, v.platform); cell(tr, v.appVersion, 'mono'); cell(tr, String(v.visitors), 'num');
      versions.appendChild(tr);
    });
    if (r.json.versions.length === 0) emptyRow(versions, 3);
  }
  document.getElementById('load').addEventListener('click', load);
  load();
</script>`,
)
