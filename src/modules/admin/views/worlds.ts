import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 월드 마스터 표. 위는 새 월드 폼, 아래는 표 하나다. 줄의 수정을 누르면 그 줄이 입력으로 바뀐다.
 *
 * 거래권은 장비를 관세 내고 서로 거래할 수 있는 월드끼리 같은 값이다. 챌린저스는 시즌마다 붙는 거래권이 달라 여기서 고친다.
 * 비우면 시세에서 빠진다(스페셜).
 * key 는 기록 · 원장 · 서버 가격 줄이 들어 못 바꾸고, 월드는 지우지 않는다. 새 챌린저스 시즌이 열리면 여기서 월드를
 * 더한다. 챌린저스를 켜야 시즌 보스가 보이고 월드 리프를 묻는다. 시즌 보스 자체의 끝은 보스 목록의 유효 기간이다.
 * 열린 기간은 월드마다 여러 줄이다. 이벤트 · 챌린저스 월드가 시즌마다 같은 이름으로 다시 열리기 때문이다.
 */
export const WORLDS_HTML = layout(
  '/admin/worlds',
  '월드',
  `<div class="head">
  <div>
    <h1>월드</h1>
    <p>차례가 곧 앱의 월드 차례다. 새 챌린저스 시즌이 열리면 월드를 더하고 챌린저스를 켠다. 엠블럼은 앱 번들의 파일명이라 파일이 있어야 그려진다. 거래권은 장비를 서로 거래할 수 있는 월드끼리 같은 값이고, 비우면 드롭 시세에서 빠진다. 거래권은 앱에 안 간다. 바꾸면 <code>worlds.updatedAt</code> 이 움직인다.</p>
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
    <div class="field"><label>엠블럼 <small>월드 분류의 그림</small></label><div class="inline"><span id="n-emblem" class="mono dim">없음</span><button id="n-emblem-pick" class="btn ghost sm" type="button">고르기</button></div></div>
    <div class="field"><label for="n-trade-group">거래권 <small>비우면 시세 제외</small></label><select id="n-trade-group"></select></div>
    <label class="check"><input id="n-challengers" type="checkbox"> 챌린저스</label>
    <label class="check"><input id="n-event" type="checkbox"> 이벤트 월드</label>
    <button id="n-add" class="btn" type="button">월드 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>월드</h2><p id="count"></p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>엠블럼</th><th>챌린저스</th><th>이벤트</th><th>거래권</th><th>열린 기간</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<section class="card">
  <header><h2>열린 기간</h2><p>KST 날짜다. 시작은 연 날, 끝은 닫힌 다음 날이라 그 날은 안 든다. 새벽 3시에 닫혔으면 다음 날을 적는다. 같은 월드의 기간끼리는 겹칠 수 없다. 앱은 이벤트 월드에서 지운 캐릭터의 강화를 이 기간으로 가린다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="p-world">월드</label><select id="p-world"></select></div>
    <div class="field"><label for="p-from">시작 <small>연 날</small></label><input id="p-from" class="mono" placeholder="2025-11-20"></div>
    <div class="field"><label for="p-until">끝 <small>닫힌 다음 날</small></label><input id="p-until" class="mono" placeholder="2025-12-19"></div>
    <button id="p-add" class="btn" type="button">기간 추가</button>
  </div></div>
  <div class="table"><table><thead><tr><th>월드</th><th>시작</th><th>끝</th><th></th></tr></thead><tbody id="periods"></tbody></table></div>
</section>
${ASSET_PICKER}
<script>
  // assets 는 그림 id 에서 그림 줄을 찾는 표다. 엠블럼 칸에 파일 이름을 보인다.
  var state = { worlds: [], tradeGroups: [], assets: {}, editing: null, editingPeriod: null, newEmblem: null };

  function emblemText(id) { var a = id ? state.assets[id] : null; return id === null ? '-' : a ? a.fileName + '.' + a.extension : '그림 표에 없다'; }
  function tradeGroupSelect(value) {
    return select([['', '시세 제외']].concat(state.tradeGroups.map(function (g) { return [g.key, g.name + ' (' + g.key + ')']; })), value === null ? '' : value);
  }
  function pickEmblem(current, onPick) {
    openAssetPicker({ categories: ['world'], uploadCategory: 'world', current: current, onPick: function (f) { onPick(f ? f.id : null); } });
  }

  function periodText(w) {
    return w.openPeriods.length === 0 ? span('-', 'dim') : span(w.openPeriods.map(function (p) { return p.validFrom + ' ~ ' + p.validUntil; }).join(', '), 'mono');
  }

  function worldRow(w, i) {
    var tr = el('tr', undefined, state.editing === w.key ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, w.key, 'mono');
    if (state.editing !== w.key) {
      cell(tr, w.name); cell(tr, emblemText(w.emblemAssetId), 'mono');
      cell(tr, w.isChallengers ? span('챌린저스', 'tag accent') : span('-', 'dim')); cell(tr, w.isEvent ? span('이벤트', 'tag') : span('-', 'dim'));
      cell(tr, w.tradeGroupKey === null ? span('시세 제외', 'dim') : span(w.tradeGroupKey, w.tradeGroupKey === 'general' ? 'mono' : 'tag mono'));
      cell(tr, periodText(w));
      var up = button('↑', 'btn ghost sm'); var down = button('↓', 'btn ghost sm'); var edit = button('수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/worlds/' + w.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/worlds/' + w.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      edit.addEventListener('click', function () { state.editing = w.key; render(); });
      cell(tr, inline(up, down, edit), 'act');
      return tr;
    }
    var name = input('text'); name.value = w.name;
    var emblem = { id: w.emblemAssetId }; var emblemLabel = span(emblemText(emblem.id), 'mono'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { pickEmblem(emblem.id, function (id) { emblem.id = id; emblemLabel.textContent = emblemText(id); }); });
    var challengers = input('checkbox'); challengers.checked = w.isChallengers; var event = input('checkbox'); event.checked = w.isEvent;
    var tradeGroup = tradeGroupSelect(w.tradeGroupKey);
    cell(tr, name); cell(tr, inline(emblemLabel, pick)); cell(tr, challengers); cell(tr, event); cell(tr, tradeGroup); cell(tr, periodText(w));
    var save = button('저장', 'btn sm'); var close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/worlds/' + w.key, { name: name.value.trim(), emblemAssetId: emblem.id, isChallengers: challengers.checked, isEvent: event.checked, tradeGroupKey: orNull(tradeGroup.value) });
      show(r.ok ? w.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function render() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    state.worlds.forEach(function (w, i) { rows.appendChild(worldRow(w, i)); });
    if (state.worlds.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 9; rows.appendChild(tr); }
    document.getElementById('count').textContent = state.worlds.length + '줄 · 순서가 곧 앱의 화면 순서';
    var newGroup = document.getElementById('n-trade-group'); var keep = newGroup.value || 'general';
    newGroup.replaceWith(Object.assign(tradeGroupSelect(keep), { id: 'n-trade-group' }));
    renderPeriods();
  }

  function periodRow(w, p) {
    var tr = el('tr', undefined, state.editingPeriod === p.id ? 'open' : '');
    cell(tr, w.name + ' (' + w.key + ')');
    if (state.editingPeriod !== p.id) {
      cell(tr, p.validFrom, 'mono'); cell(tr, p.validUntil, 'mono');
      var edit = button('수정', 'btn ghost sm'); var remove = button('지우기', 'btn ghost sm');
      edit.addEventListener('click', function () { state.editingPeriod = p.id; renderPeriods(); });
      remove.addEventListener('click', async function () { var r = await call('DELETE', '/admin/worlds/periods/' + p.id); show(r.ok ? w.key + ' 기간을 지웠다' : fail('못 지웠다', r), !r.ok); load(); });
      cell(tr, inline(edit, remove), 'act');
      return tr;
    }
    var from = input('text', 'mono'); from.value = p.validFrom; var until = input('text', 'mono'); until.value = p.validUntil;
    cell(tr, from); cell(tr, until);
    var save = button('저장', 'btn sm'); var close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/worlds/periods/' + p.id, { validFrom: from.value.trim(), validUntil: until.value.trim() });
      show(r.ok ? w.key + ' 기간을 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingPeriod = null; load();
    });
    close.addEventListener('click', function () { state.editingPeriod = null; renderPeriods(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function renderPeriods() {
    var picker = document.getElementById('p-world'); var picked = picker.value;
    picker.innerHTML = '';
    state.worlds.forEach(function (w) { var o = document.createElement('option'); o.value = w.key; o.textContent = w.name + ' (' + w.key + ')'; picker.appendChild(o); });
    if (picked) picker.value = picked;
    var rows = document.getElementById('periods'); rows.innerHTML = '';
    var count = 0;
    state.worlds.forEach(function (w) { w.openPeriods.forEach(function (p) { rows.appendChild(periodRow(w, p)); count += 1; }); });
    if (count === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 4; rows.appendChild(tr); }
  }

  document.getElementById('p-add').addEventListener('click', async function () {
    var key = document.getElementById('p-world').value;
    var body = { validFrom: document.getElementById('p-from').value.trim(), validUntil: document.getElementById('p-until').value.trim() };
    var r = await call('POST', '/admin/worlds/' + key + '/periods', body);
    show(r.ok ? key + ' 에 기간을 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) { document.getElementById('p-from').value = ''; document.getElementById('p-until').value = ''; }
    load();
  });

  document.getElementById('n-emblem-pick').addEventListener('click', function () {
    pickEmblem(state.newEmblem, function (id) { state.newEmblem = id; document.getElementById('n-emblem').textContent = id === null ? '없음' : emblemText(id); });
  });
  document.getElementById('n-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('n-key').value.trim(), name: document.getElementById('n-name').value.trim(), emblemAssetId: state.newEmblem, isChallengers: document.getElementById('n-challengers').checked, isEvent: document.getElementById('n-event').checked, tradeGroupKey: orNull(document.getElementById('n-trade-group').value) };
    var r = await call('POST', '/admin/worlds', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) { ['n-key', 'n-name'].forEach(function (id) { document.getElementById(id).value = ''; }); state.newEmblem = null; document.getElementById('n-emblem').textContent = '없음'; document.getElementById('n-challengers').checked = false; document.getElementById('n-event').checked = false; }
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/worlds/rows');
    var a = await call('GET', '/admin/assets/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    state.worlds = r.json.worlds; state.tradeGroups = r.json.tradeGroups;
    state.assets = {}; a.json.rows.forEach(function (row) { state.assets[row.id] = row; });
    document.getElementById('stat-worlds').textContent = state.worlds.length;
    document.getElementById('stat-challengers').textContent = state.worlds.filter(function (w) { return w.isChallengers; }).length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
