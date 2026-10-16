import { layout } from './layout'

/**
 * 월드 마스터 표. 위는 새 월드 폼, 아래는 표 하나다. 줄의 수정을 누르면 그 줄이 입력으로 바뀐다.
 *
 * key 는 기록 · 원장 · 서버 가격 줄이 들어 못 바꾸고, 월드는 지우지 않는다. 새 챌린저스 시즌이 열리면 여기서 월드를
 * 더한다. 챌린저스를 켜야 시즌 보스가 보이고 월드 리프를 묻는다. 시즌 보스 자체의 끝은 보스 목록의 유효 기간이다.
 */
export const WORLDS_HTML = layout(
  '/admin/worlds',
  '월드',
  `<div class="head">
  <div>
    <h1>월드</h1>
    <p>차례가 곧 앱의 월드 차례다. 새 챌린저스 시즌이 열리면 월드를 더하고 챌린저스를 켠다. 엠블럼은 앱 번들의 파일명이라 파일이 있어야 그려진다. 바꾸면 <code>worlds.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-worlds">–</b><span>월드</span></div>
    <div class="stat"><b id="stat-challengers">–</b><span>챌린저스</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 월드</h2><p>key 는 snake_case 이고 한 번 정하면 못 바꾼다. 챌린저스 둘째부터는 challengers_2 처럼 번호를 붙인다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="n-key">key</label><input id="n-key" class="mono" placeholder="challengers_5"></div>
    <div class="field"><label for="n-name">이름 <small>API world_name 표기</small></label><input id="n-name" placeholder="챌린저스5"></div>
    <div class="field"><label for="n-emblem">엠블럼 <small>src/assets/worlds/ 의 파일 basename</small></label><input id="n-emblem" class="mono" placeholder="challengers"></div>
    <label class="check"><input id="n-challengers" type="checkbox"> 챌린저스</label>
    <label class="check"><input id="n-event" type="checkbox"> 이벤트 월드</label>
    <button id="n-add" class="btn" type="button">월드 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>월드</h2><p id="count"></p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>엠블럼</th><th>챌린저스</th><th>이벤트</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  var state = { worlds: [], editing: null };

  function worldRow(w, i) {
    var tr = el('tr', undefined, state.editing === w.key ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, w.key, 'mono');
    if (state.editing !== w.key) {
      cell(tr, w.name); cell(tr, w.emblem || '-', 'mono');
      cell(tr, w.challengers ? span('챌린저스', 'tag accent') : span('-', 'dim')); cell(tr, w.event ? span('이벤트', 'tag') : span('-', 'dim'));
      var up = button('↑', 'btn ghost sm'); var down = button('↓', 'btn ghost sm'); var edit = button('수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/worlds/' + w.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/worlds/' + w.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      edit.addEventListener('click', function () { state.editing = w.key; render(); });
      cell(tr, inline(up, down, edit), 'act');
      return tr;
    }
    var name = input('text'); name.value = w.name; var emblem = input('text', 'mono'); emblem.value = w.emblem || '';
    var challengers = input('checkbox'); challengers.checked = w.challengers; var event = input('checkbox'); event.checked = w.event;
    cell(tr, name); cell(tr, emblem); cell(tr, challengers); cell(tr, event);
    var save = button('저장', 'btn sm'); var close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/worlds/' + w.key, { name: name.value.trim(), emblem: orNull(emblem.value), challengers: challengers.checked, event: event.checked });
      show(r.ok ? w.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function render() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    state.worlds.forEach(function (w, i) { rows.appendChild(worldRow(w, i)); });
    if (state.worlds.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 7; rows.appendChild(tr); }
    document.getElementById('count').textContent = state.worlds.length + '줄 · 순서가 곧 앱의 화면 순서';
  }

  document.getElementById('n-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('n-key').value.trim(), name: document.getElementById('n-name').value.trim(), emblem: orNull(document.getElementById('n-emblem').value), challengers: document.getElementById('n-challengers').checked, event: document.getElementById('n-event').checked };
    var r = await call('POST', '/admin/worlds', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) { ['n-key', 'n-name', 'n-emblem'].forEach(function (id) { document.getElementById(id).value = ''; }); document.getElementById('n-challengers').checked = false; document.getElementById('n-event').checked = false; }
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/worlds/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.worlds = r.json.worlds;
    document.getElementById('stat-worlds').textContent = state.worlds.length;
    document.getElementById('stat-challengers').textContent = state.worlds.filter(function (w) { return w.challengers; }).length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
