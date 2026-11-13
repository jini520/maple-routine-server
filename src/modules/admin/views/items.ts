import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 아이템 화면. 왼쪽은 분류 트리, 오른쪽은 그림 격자이고 아이템을 누르면 편집 서랍이 열린다(앱 저장소 ADR-187 결정 6, 시안 아이템
 * A 의 짜임에 B 의 서랍). 트리의 `묶음 고치기` 를 누르면 묶음을 더하고 이름 · 차례 · 종류를 바꾸고 빈 묶음을 지운다(결정 2).
 *
 * 드롭 아이템 · 강화 장비 · 사냥 전리품이 한 줄을 나눠 쓴다. 역할은 붙이기만 하고 빼지 않는다. 드롭 표 · 드롭 가격 기록이 key 로
 * 가리켜 빼면 앱에서 모르는 아이템이 되기 때문이다. 사냥 전리품의 분류 · NPC 가격 · 기간은 사냥 전리품 화면이 고친다.
 */
export const ITEMS_HTML = layout(
  '/admin/items',
  '아이템',
  `<div class="head">
  <div>
    <h1>아이템</h1>
    <p>드롭 아이템 · 강화 장비 · 사냥 전리품을 한 표에서 고친다. 묶음은 왼쪽 트리의 묶음 고치기에서 더하고, 이름 · 차례 · 종류를 바꾼다. 이름 · 그림 · 고가 · 착용 레벨 · 역할을 바꾸면 앱이 받는 칸의 시각이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-items">–</b><span>아이템</span></div>
    <div class="stat"><b id="stat-noicon">–</b><span>그림 없음</span></div>
    <div class="stat"><b id="stat-nocat">–</b><span>분류 없음</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card items-split">
  <nav class="items-tree" id="tree" aria-label="아이템 분류"></nav>
  <div class="items-main">
    <div class="items-bar">
      <input id="q" class="w-md" placeholder="이름 · key 로 찾는다" aria-label="찾기">
      <div class="seg" id="roles" role="group" aria-label="역할"></div>
      <span class="grow"></span>
      <button type="button" class="btn" id="add">아이템 더하기</button>
    </div>
    <div class="items-grid" id="grid"></div>
  </div>
</section>
<div class="scrim" id="scrim" hidden></div>
<aside class="drawer" id="drawer" aria-labelledby="ed-title" hidden>
  <header><b id="ed-title">아이템 고치기</b><button type="button" class="btn ghost sm" id="ed-close">닫기</button></header>
  <div class="drawer-body">
    <div class="preview">
      <div class="big" id="ed-icon"></div>
      <div class="preview-side">
        <span class="mono dim" id="ed-path">그림 없음</span>
        <div class="actions"><button type="button" class="btn ghost sm" id="ed-pick">그림 고르기</button></div>
      </div>
    </div>
    <div class="grid2">
      <div class="field"><label for="ed-name">이름</label><input id="ed-name"></div>
      <div class="field"><label for="ed-key">key <small id="ed-key-note">바꿀 수 없음</small></label><input id="ed-key" class="mono" placeholder="dreamy_belt"></div>
      <div class="field"><label for="ed-category">분류</label><select id="ed-category"></select></div>
      <div class="field"><label for="ed-level">착용 레벨 <small>강화 장비</small></label><input id="ed-level" type="number" min="1" step="1"></div>
    </div>
    <div class="checks">
      <label class="check"><input id="ed-valuable" type="checkbox"> 고가</label>
      <label class="check"><input id="ed-world-bound" type="checkbox"> 월드 간 거래 불가</label>
    </div>
    <div class="field"><label>역할 <small>붙이기만 한다. 붙은 역할은 뺄 수 없다</small></label>
      <div class="checks">
        <label class="check"><input id="ed-drop" type="checkbox"> 드롭 아이템</label>
        <label class="check"><input id="ed-equipment" type="checkbox"> 강화 장비</label>
        <span class="tag" id="ed-loot" hidden></span>
      </div>
    </div>
  </div>
  <footer class="actions"><span class="grow"></span><button type="button" class="btn ghost" id="ed-cancel">닫기</button><button type="button" class="btn" id="ed-save">저장</button></footer>
</aside>
${ASSET_PICKER}
<style>
  .items-split { display: grid; grid-template-columns: 220px minmax(0, 1fr) }
  .items-split.editing { grid-template-columns: 380px minmax(0, 1fr) }
  @media (max-width: 860px) { .items-split, .items-split.editing { grid-template-columns: 1fr } }
  .items-tree { display: flex; flex-direction: column; gap: 2px; padding: 14px 10px; background: var(--surface-2) }
  .items-tree .kind { font-size: 11.5px; font-weight: 700; color: var(--text-3); letter-spacing: .04em; padding: 10px 10px 4px }
  .items-tree > button { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-2); font: 500 13px/1.3 var(--font); text-align: left; cursor: pointer }
  .items-tree > button:hover { background: var(--surface); color: var(--text) }
  .items-tree > button[aria-current="true"] { background: var(--accent-tint); color: var(--accent-ink); font-weight: 600 }
  .items-tree > button span { color: inherit; opacity: .7; font-size: 12px; font-variant-numeric: tabular-nums }
  .items-tree > button.add-group { color: var(--accent-ink) }
  .tree-head { display: flex; justify-content: flex-end; padding: 0 0 6px }
  .group-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px 3px 10px; border-radius: 8px }
  .group-row:hover { background: var(--surface) }
  .group-row .gname { flex: 1; min-width: 0; font: 500 13px/1.3 var(--font); color: var(--text-2); overflow-wrap: anywhere }
  .group-row .gcount { font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums }
  .group-row .btn:disabled { opacity: .35; cursor: default; background: transparent }
  .group-form { display: grid; gap: 6px; padding: 8px 10px; background: var(--surface); border-radius: 8px }
  .items-main { min-width: 0 }
  .items-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 14px 16px }
  .items-bar .grow { flex: 1 }
  .seg { display: inline-flex; background: var(--fill); border-radius: 8px; padding: 3px; gap: 2px }
  .seg button { font: 500 12.5px/1 var(--font); padding: 6px 11px; border-radius: 6px; border: 0; background: transparent; color: var(--text-2); cursor: pointer }
  .seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: var(--shadow) }
  .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; padding: 0 16px 16px }
  .tile { display: grid; justify-items: center; gap: 4px; padding: 10px 6px 8px; border: 0; border-radius: 10px; background: var(--surface-2); text-align: center; cursor: pointer; min-width: 0; color: var(--text) }
  .tile:hover { background: var(--fill) }
  .tile[aria-current="true"] { background: var(--accent-tint); box-shadow: inset 0 0 0 2px var(--accent) }
  .tile .ic { width: 64px; height: 64px; display: grid; place-items: center }
  .tile .ic img { max-width: 64px; max-height: 64px; image-rendering: pixelated }
  .tile .ic .none { width: 40px; height: 40px; border-radius: 8px; background: var(--fill) }
  .tile .nm { font-size: 12.5px; line-height: 1.35; font-weight: 500; overflow-wrap: anywhere }
  .tile .ky { font: 10.5px var(--mono); color: var(--text-3); overflow-wrap: anywhere }
  .tile .tags { justify-content: center }
  .scrim { position: fixed; inset: 0; background: rgba(17,24,39,.35); z-index: 20 }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(400px, 100vw); background: var(--surface); box-shadow: 0 12px 32px rgba(16,24,40,.18); z-index: 21; display: grid; grid-template-rows: auto minmax(0, 1fr) auto }
  .drawer[hidden] { display: none }
  .drawer > header { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px 6px }
  .drawer > header b { font-size: 15px }
  .drawer-body { overflow: auto; padding: 10px 18px; display: grid; gap: 14px; align-content: start }
  .drawer > footer { padding: 14px 18px; background: var(--surface-2) }
  .drawer > footer .grow { flex: 1 }
  .preview { display: flex; gap: 12px; align-items: center; background: var(--surface-2); border-radius: 10px; padding: 12px }
  .preview .big { width: 88px; height: 88px; display: grid; place-items: center; background: var(--surface); border-radius: 10px; flex: none }
  .preview .big img { max-width: 80px; max-height: 80px; image-rendering: pixelated }
  .preview-side { display: grid; gap: 6px; min-width: 0 }
  .preview-side .mono { overflow-wrap: anywhere }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px }
  .checks { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center }
</style>
<script>
  var ROLES = [['all', '전체'], ['drop', '드롭'], ['equipment', '강화'], ['loot', '사냥 전리품'], ['noicon', '그림 없음']];
  var state = { categories: [], items: [], group: 'all', role: 'all', editing: null, icon: null, editGroups: false, groupForm: null };

  function roleOk(it) {
    if (state.role === 'drop') return it.isDrop;
    if (state.role === 'equipment') return it.isEquipment;
    if (state.role === 'loot') return it.huntLootKind !== null;
    if (state.role === 'noicon') return it.icon === null;
    return true;
  }
  function groupOk(it) {
    if (state.group === 'all') return true;
    if (state.group === 'none') return it.category === null;
    return it.category === state.group;
  }
  function treeButton(key, label, count) {
    var b = button(''); b.setAttribute('aria-current', String(state.group === key));
    b.appendChild(document.createTextNode(label)); b.appendChild(span(String(count)));
    b.addEventListener('click', function () { state.group = key; render(); });
    return b;
  }
  function renderTree() {
    var tree = document.getElementById('tree'); tree.innerHTML = '';
    var head = el('div', undefined, 'tree-head');
    var toggle = button(state.editGroups ? '묶음 고치기 끝' : '묶음 고치기', 'btn ghost sm');
    toggle.setAttribute('aria-pressed', String(state.editGroups));
    toggle.addEventListener('click', function () { state.editGroups = !state.editGroups; state.groupForm = null; render(); });
    head.appendChild(toggle); tree.appendChild(head);
    document.querySelector('.items-split').classList.toggle('editing', state.editGroups);
    if (state.editGroups) { renderGroupEditor(tree); return; }
    var pool = state.items.filter(roleOk);
    tree.appendChild(treeButton('all', '전체', pool.length));
    tree.appendChild(treeButton('none', '분류 없음', pool.filter(function (it) { return it.category === null; }).length));
    state.categories.forEach(function (kind) {
      tree.appendChild(el('div', kind.name, 'kind'));
      kind.groups.forEach(function (g) {
        tree.appendChild(treeButton(g.key, g.name, pool.filter(function (it) { return it.category === g.key; }).length));
      });
    });
  }
  function itemCount(groupKey) { return state.items.filter(function (it) { return it.category === groupKey; }).length; }
  function kindSelect(value) {
    var s = document.createElement('select'); s.setAttribute('aria-label', '종류');
    state.categories.forEach(function (k) { var o = el('option', k.name); o.value = k.key; s.appendChild(o); });
    s.value = value; return s;
  }
  function renderGroupEditor(tree) {
    state.categories.forEach(function (kind) {
      tree.appendChild(el('div', kind.name, 'kind'));
      kind.groups.forEach(function (g, i) {
        var editing = state.groupForm !== null && state.groupForm.mode === 'edit' && state.groupForm.key === g.key;
        tree.appendChild(editing ? groupEditForm(kind, g) : groupRow(g, i, kind.groups.length));
      });
      if (state.groupForm !== null && state.groupForm.mode === 'add' && state.groupForm.kind === kind.key) { tree.appendChild(groupAddForm(kind)); return; }
      var add = button('+ ' + kind.name + '에 묶음 더하기', 'add-group');
      add.addEventListener('click', function () { state.groupForm = { mode: 'add', kind: kind.key }; renderTree(); });
      tree.appendChild(add);
    });
  }
  function groupRow(g, i, count) {
    var n = itemCount(g.key);
    var row = el('div', undefined, 'group-row');
    row.appendChild(el('span', g.name, 'gname')); row.appendChild(span(String(n), 'gcount'));
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('고치기', 'btn ghost sm'), del = button('지우기', 'btn danger sm');
    up.disabled = i === 0; down.disabled = i === count - 1;
    // 아이템이 든 묶음은 서버가 거절한다. 누르기 전에 막아 둔다.
    del.disabled = n > 0; if (n > 0) del.title = '아이템이 든 묶음은 못 지운다';
    up.addEventListener('click', function () { moveGroup(g, 'up'); });
    down.addEventListener('click', function () { moveGroup(g, 'down'); });
    edit.addEventListener('click', function () { state.groupForm = { mode: 'edit', key: g.key }; renderTree(); });
    del.addEventListener('click', async function () {
      if (!window.confirm('‘' + g.name + '’ 묶음을 지운다.')) return;
      var r = await call('DELETE', '/admin/item-groups/' + g.key);
      show(r.ok ? g.name + ' 묶음을 지웠다' : fail('못 지웠다', r), !r.ok); if (r.ok) await load();
    });
    row.appendChild(inline(up, down, edit, del));
    return row;
  }
  function groupEditForm(kind, g) {
    var box = el('div', undefined, 'group-form');
    var name = input('text'); name.value = g.name; name.setAttribute('aria-label', '묶음 이름');
    var kinds = kindSelect(kind.key);
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/item-groups/' + g.key, { kind: kinds.value, name: name.value.trim() });
      show(r.ok ? g.key + ' 묶음을 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) { state.groupForm = null; await load(); }
    });
    close.addEventListener('click', function () { state.groupForm = null; renderTree(); });
    box.appendChild(el('span', g.key, 'mono dim')); box.appendChild(name); box.appendChild(kinds); box.appendChild(inline(save, close));
    return box;
  }
  function groupAddForm(kind) {
    var box = el('div', undefined, 'group-form');
    var key = input('text', 'mono'); key.placeholder = 'boutique'; key.setAttribute('aria-label', '묶음 key, snake_case, 한 번 정하면 못 바꾼다');
    var name = input('text'); name.placeholder = '부티크'; name.setAttribute('aria-label', '묶음 이름');
    var save = button('더하기', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('POST', '/admin/item-groups', { key: key.value.trim(), kind: kind.key, name: name.value.trim() });
      show(r.ok ? name.value.trim() + ' 묶음을 더했다' : fail('못 더했다', r), !r.ok); if (r.ok) { state.groupForm = null; await load(); }
    });
    close.addEventListener('click', function () { state.groupForm = null; renderTree(); });
    box.appendChild(key); box.appendChild(name); box.appendChild(inline(save, close));
    return box;
  }
  async function moveGroup(g, direction) {
    var r = await call('POST', '/admin/item-groups/' + g.key + '/move', { direction: direction });
    if (!r.ok) show(fail('못 옮겼다', r), true); await load();
  }
  function renderRoles() {
    var seg = document.getElementById('roles'); seg.innerHTML = '';
    ROLES.forEach(function (r) {
      var b = button(r[1]); b.setAttribute('aria-pressed', String(state.role === r[0]));
      b.addEventListener('click', function () { state.role = r[0]; render(); });
      seg.appendChild(b);
    });
  }
  function iconImg(icon, cls) {
    if (icon === null) return el('div', undefined, cls || 'none');
    var img = el('img'); img.src = '/assets/' + icon.file; img.alt = ''; img.loading = 'lazy'; return img;
  }
  function tile(it) {
    var b = button('', 'tile'); b.setAttribute('aria-current', String(state.editing !== null && state.editing.key === it.key));
    var ic = el('div', undefined, 'ic'); ic.appendChild(iconImg(it.icon)); b.appendChild(ic);
    b.appendChild(el('div', it.name, 'nm')); b.appendChild(el('div', it.key, 'ky'));
    var tags = el('div', undefined, 'tags');
    if (it.isDrop) tags.appendChild(span('드롭', 'tag'));
    if (it.isEquipment) tags.appendChild(span('강화', 'tag'));
    if (it.huntLootKind !== null) tags.appendChild(span('사냥 전리품', 'tag'));
    b.appendChild(tags);
    b.addEventListener('click', function () { openEditor(it); });
    return b;
  }
  function render() {
    renderTree(); renderRoles();
    var q = document.getElementById('q').value.trim().toLowerCase();
    var grid = document.getElementById('grid'); grid.innerHTML = '';
    var shown = state.items.filter(function (it) {
      return roleOk(it) && groupOk(it) && (!q || it.key.indexOf(q) >= 0 || it.name.toLowerCase().indexOf(q) >= 0);
    });
    shown.forEach(function (it) { grid.appendChild(tile(it)); });
    if (shown.length === 0) grid.appendChild(el('p', '맞는 아이템이 없다', 'empty-text'));
    document.getElementById('stat-items').textContent = String(state.items.length);
    document.getElementById('stat-noicon').textContent = String(state.items.filter(function (it) { return it.icon === null; }).length);
    document.getElementById('stat-nocat').textContent = String(state.items.filter(function (it) { return it.category === null; }).length);
  }
  function fillCategories(value) {
    var s = document.getElementById('ed-category'); s.innerHTML = '';
    var none = el('option', '분류 없음'); none.value = ''; s.appendChild(none);
    state.categories.forEach(function (kind) {
      var og = document.createElement('optgroup'); og.label = kind.name;
      kind.groups.forEach(function (g) { var o = el('option', kind.name + ' › ' + g.name); o.value = g.key; og.appendChild(o); });
      s.appendChild(og);
    });
    s.value = value || '';
  }
  function showIcon() {
    var box = document.getElementById('ed-icon'); box.innerHTML = '';
    box.appendChild(iconImg(state.icon, 'none'));
    document.getElementById('ed-path').textContent = state.icon === null ? '그림 없음' : state.icon.path;
  }
  function openEditor(it) {
    var isNew = it === null;
    state.editing = isNew ? { key: null } : it;
    state.icon = isNew ? null : it.icon;
    document.getElementById('ed-title').textContent = isNew ? '아이템 더하기' : it.name;
    document.getElementById('ed-name').value = isNew ? '' : it.name;
    var key = document.getElementById('ed-key'); key.value = isNew ? '' : it.key; key.readOnly = !isNew;
    document.getElementById('ed-key-note').textContent = isNew ? 'snake_case, 한 번 정하면 못 바꾼다' : '바꿀 수 없음';
    fillCategories(isNew ? (state.group !== 'all' && state.group !== 'none' ? state.group : '') : it.category);
    document.getElementById('ed-level').value = isNew || it.level === null ? '' : String(it.level);
    document.getElementById('ed-valuable').checked = !isNew && it.valuable;
    document.getElementById('ed-world-bound').checked = !isNew && it.worldBound;
    var drop = document.getElementById('ed-drop'); drop.checked = !isNew && it.isDrop; drop.disabled = !isNew && it.isDrop;
    var eq = document.getElementById('ed-equipment'); eq.checked = !isNew && it.isEquipment; eq.disabled = !isNew && it.isEquipment;
    var loot = document.getElementById('ed-loot');
    loot.hidden = isNew || it.huntLootKind === null; loot.textContent = '사냥 전리품 · 사냥 전리품 화면에서 고친다';
    showIcon();
    document.getElementById('scrim').hidden = false; document.getElementById('drawer').hidden = false;
    document.getElementById('ed-name').focus();
    render();
  }
  function closeEditor() {
    state.editing = null;
    document.getElementById('scrim').hidden = true; document.getElementById('drawer').hidden = true;
    render();
  }
  async function save() {
    var editing = state.editing; if (editing === null) return;
    var level = document.getElementById('ed-level').value.trim();
    var body = {
      name: document.getElementById('ed-name').value.trim(),
      category: document.getElementById('ed-category').value || null,
      iconAssetId: state.icon === null ? null : state.icon.id,
      valuable: document.getElementById('ed-valuable').checked,
      worldBound: document.getElementById('ed-world-bound').checked,
      level: level === '' ? null : Number(level),
      isDrop: document.getElementById('ed-drop').checked,
      isEquipment: document.getElementById('ed-equipment').checked,
    };
    var r;
    if (editing.key === null) {
      body.key = document.getElementById('ed-key').value.trim();
      r = await call('POST', '/admin/items', body);
    } else {
      r = await call('PUT', '/admin/items/' + editing.key, body);
    }
    var key = editing.key === null ? body.key : editing.key;
    show(r.ok ? key + ' 를 적었다' : fail('못 적었다', r), !r.ok);
    if (r.ok) { closeEditor(); await load(); }
  }
  async function load() {
    var r = await call('GET', '/admin/items/rows');
    if (!r.ok) { show(fail('아이템을 못 읽었다', r), true); return; }
    state.categories = r.json.categories; state.items = r.json.items;
    // 지운 묶음을 고르고 있었으면 전체로 돌아간다.
    var known = state.categories.some(function (k) { return k.groups.some(function (g) { return g.key === state.group; }); });
    if (state.group !== 'all' && state.group !== 'none' && !known) state.group = 'all';
    render();
  }
  document.getElementById('q').addEventListener('input', render);
  document.getElementById('add').addEventListener('click', function () { openEditor(null); });
  document.getElementById('ed-close').addEventListener('click', closeEditor);
  document.getElementById('ed-cancel').addEventListener('click', closeEditor);
  document.getElementById('scrim').addEventListener('click', closeEditor);
  document.getElementById('ed-save').addEventListener('click', save);
  document.getElementById('ed-pick').addEventListener('click', function () {
    openAssetPicker({
      dirs: ['items', 'items/rings'], uploadDir: 'items', current: state.icon && state.icon.id,
      onPick: function (file) { state.icon = file === null ? null : { id: file.id, path: file.path, file: file.file }; showIcon(); },
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.editing !== null && !document.getElementById('asset-picker').open) closeEditor(); });
  load();
</script>`,
)
