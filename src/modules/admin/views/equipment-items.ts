import { layout } from './layout'

/**
 * 장비 마스터 표. 위는 거르기 칸과 새 장비 폼, 아래는 표 하나다. 줄의 수정을 누르면 이름 · 레벨이 입력으로 바뀐다.
 *
 * key 는 기록이 들어 못 바꾸고 장비는 지우지 않는다. 강화할 수 없는 장비는 애초에 안 담는다. 레벨을 비우면 그 장비의
 * 스타포스는 안 매기고 건수만 센다.
 */
export const EQUIPMENT_ITEMS_HTML = layout(
  '/admin/equipment-items',
  '장비',
  `<div class="head">
  <div>
    <h1>장비</h1>
    <p>강화 비용을 매길 장비 표다. 이름은 붙여 쓰고, 앱이 넥슨 응답의 장비 이름에서 공백을 지워 이 이름과 맞춘다. 레벨을 비우면 모른다는 뜻이라 그 장비의 스타포스는 건수만 센다. 바꾸면 <code>equipmentItems.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-items">–</b><span>장비</span></div>
    <div class="stat"><b id="stat-unknown">–</b><span>레벨 모름</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 장비</h2><p>key 는 snake_case 이고 한 번 정하면 못 바꾼다. 드롭 아이템 표에 같은 장비가 있으면 그 key 를 쓴다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="n-key">key</label><input id="n-key" class="mono" placeholder="ascendant_pulse_ring"></div>
    <div class="field"><label for="n-name">이름 <small>붙여 쓴다</small></label><input id="n-name" placeholder="어센던트펄스링"></div>
    <div class="field w-sm"><label for="n-level">착용 레벨 <small>모르면 비운다</small></label><input id="n-level" type="number" min="1"></div>
    <button id="n-add" class="btn" type="button">장비 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>장비</h2><p id="count"></p><span class="grow"></span><input id="filter" class="w-md" placeholder="key 나 이름으로 거른다"></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th class="num">착용 레벨</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  var state = { items: [], editing: null };
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }

  function itemRow(it) {
    var tr = el('tr', undefined, state.editing === it.key ? 'open' : '');
    cell(tr, it.key, 'mono');
    if (state.editing !== it.key) {
      cell(tr, it.name); cell(tr, it.level === null ? span('모름', 'dim') : it.level, 'num');
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editing = it.key; render(); });
      cell(tr, edit, 'act'); return tr;
    }
    var name = input('text'); name.value = it.name; var level = input('number'); level.min = '1'; level.value = it.level === null ? '' : it.level;
    cell(tr, name); cell(tr, level, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/equipment-items/' + it.key, { name: name.value.trim(), level: numOrNull(level.value) });
      show(r.ok ? it.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act'); return tr;
  }

  function render() {
    var q = document.getElementById('filter').value.trim().toLowerCase();
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    var shown = state.items.filter(function (it) { return !q || it.key.indexOf(q) >= 0 || it.name.toLowerCase().indexOf(q) >= 0; });
    shown.forEach(function (it) { rows.appendChild(itemRow(it)); });
    if (shown.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 4; rows.appendChild(tr); }
    document.getElementById('count').textContent = shown.length + '줄' + (q ? ' · 전체 ' + state.items.length : '');
  }

  document.getElementById('filter').addEventListener('input', render);
  document.getElementById('n-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('n-key').value.trim(), name: document.getElementById('n-name').value.trim(), level: numOrNull(document.getElementById('n-level').value) };
    var r = await call('POST', '/admin/equipment-items', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['n-key', 'n-name', 'n-level'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/equipment-items/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.items = r.json.items;
    document.getElementById('stat-items').textContent = state.items.length;
    document.getElementById('stat-unknown').textContent = state.items.filter(function (it) { return it.level === null; }).length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
