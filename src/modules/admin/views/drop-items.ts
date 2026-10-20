import { layout } from './layout'

/**
 * 드롭 아이템 마스터 표. 위는 새 아이템 폼, 아래는 표 하나다. 줄의 수정을 누르면 그 줄이 입력으로 바뀐다.
 *
 * 소비는 월드끼리 거래할 수 없는 아이템이다. 드롭 시세가 거래권이 아니라 월드마다 센다. 앱에는 안 간다.
 * key 는 기록과 서버 가격 줄이 들어 못 바꾸고, 아이템은 지우지 않는다. 드롭 표 · 상자 · 가격 줄이 가리킨다.
 */
export const DROP_ITEMS_HTML = layout(
  '/admin/drop-items',
  '드롭 아이템',
  `<div class="head">
  <div>
    <h1>드롭 아이템</h1>
    <p>드롭 표 · 상자 · 가격 줄이 가리키는 마스터 표다. 바꾸면 <code>GET /v1/game-data</code> 의 <code>dropItems.updatedAt</code> 이 움직인다. 그림은 앱 번들의 파일명이라 파일이 있어야 그려진다. 소비는 월드끼리 거래할 수 없는 아이템이고, 드롭 시세를 월드마다 따로 센다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-items">–</b><span>아이템</span></div>
    <div class="stat"><b id="stat-valuable">–</b><span>고가</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 아이템</h2><p>key 는 snake_case 이고 한 번 정하면 못 바꾼다</p></header>
  <div class="body">
    <div class="row">
      <div class="field"><label for="n-key">key</label><input id="n-key" class="mono" placeholder="dreamy_belt"></div>
      <div class="field"><label for="n-name">이름</label><input id="n-name" placeholder="몽환의 벨트"></div>
      <div class="field"><label for="n-icon">그림 파일 <small>src/assets/items/</small></label><input id="n-icon" class="mono" placeholder="dreamy_belt.png"></div>
      <label class="check"><input id="n-valuable" type="checkbox"> 고가</label>
      <label class="check"><input id="n-world-bound" type="checkbox"> 소비 <small>월드 간 거래 불가</small></label>
      <button id="n-add" class="btn" type="button">아이템 추가</button>
    </div>
  </div>
</section>
<section class="card">
  <header><h2>아이템</h2><p id="count"></p><span class="grow"></span><input id="filter" class="w-md" placeholder="key 나 이름으로 거른다"></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th>그림</th><th>고가</th><th>소비</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  var state = { items: [], editing: null };

  function itemRow(it) {
    var tr = el('tr', undefined, state.editing === it.key ? 'open' : '');
    cell(tr, it.key, 'mono');
    if (state.editing !== it.key) {
      cell(tr, it.name); cell(tr, it.iconFile || '-', 'mono'); cell(tr, it.valuable ? span('고가', 'tag accent') : span('-', 'dim'));
      cell(tr, it.worldBound ? span('소비', 'tag') : span('-', 'dim'));
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editing = it.key; render(); });
      cell(tr, edit, 'act');
      return tr;
    }
    var name = input('text'); name.value = it.name;
    var icon = input('text', 'mono'); icon.value = it.iconFile || '';
    var valuable = input('checkbox'); valuable.checked = it.valuable;
    var worldBound = input('checkbox'); worldBound.checked = it.worldBound;
    cell(tr, name); cell(tr, icon); cell(tr, valuable); cell(tr, worldBound);
    var save = button('저장', 'btn sm'); var close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/drop-items/' + it.key, { name: name.value.trim(), iconFile: orNull(icon.value), valuable: valuable.checked, worldBound: worldBound.checked });
      show(r.ok ? it.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function render() {
    var q = document.getElementById('filter').value.trim().toLowerCase();
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    var shown = state.items.filter(function (it) { return !q || it.key.indexOf(q) >= 0 || it.name.toLowerCase().indexOf(q) >= 0; });
    shown.forEach(function (it) { rows.appendChild(itemRow(it)); });
    if (shown.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 6; rows.appendChild(tr); }
    document.getElementById('count').textContent = shown.length + '줄' + (q ? ' (전체 ' + state.items.length + ')' : '');
  }

  document.getElementById('filter').addEventListener('input', render);
  document.getElementById('n-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('n-key').value.trim(), name: document.getElementById('n-name').value.trim(), iconFile: orNull(document.getElementById('n-icon').value), valuable: document.getElementById('n-valuable').checked, worldBound: document.getElementById('n-world-bound').checked };
    var r = await call('POST', '/admin/drop-items', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) { document.getElementById('n-key').value = ''; document.getElementById('n-name').value = ''; document.getElementById('n-icon').value = ''; document.getElementById('n-valuable').checked = false; document.getElementById('n-world-bound').checked = false; }
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/drop-items/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.items = r.json.items;
    document.getElementById('stat-items').textContent = state.items.length;
    document.getElementById('stat-valuable').textContent = state.items.filter(function (i) { return i.valuable; }).length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
