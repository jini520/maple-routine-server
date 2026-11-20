import { ASSET_PICKER } from './asset-picker'
import { subNav } from './edit-kit'
import { layout } from './layout'

const NAV = [
  ['/admin/items', '아이템'],
  ['/admin/items/groups', '묶음'],
] as const

/** 두 화면이 함께 쓰는 읽기. */
const COMMON_JS = `
  var D = null;
  var batch = editing(function () { load(); });
  function groupChoices() { var l = [['', '분류 없음']]; D.categories.forEach(function (k) { k.groups.forEach(function (g) { l.push([g.key, k.name + ' › ' + g.name]); }); }); return l; }
  async function load() {
    var r = await call('GET', '/admin/items/rows');
    if (!r.ok) { show(fail('아이템을 못 읽었다', r), true); return; }
    D = r.json; render();
  }
`

function page(current: string, top: string, body: string, script: string): string {
  return layout(
    '/admin/items',
    '아이템',
    `<div class="top"><h1>아이템</h1>${subNav(NAV, current)}${top}</div>
<div id="message" class="msg" role="status" hidden></div>
${body}
${ASSET_PICKER}
<script>
${COMMON_JS}
${script}
  load();
</script>`,
  )
}

/**
 * 아이템. 위에서 묶음 · 역할을 고르거나 찾으면 맞는 아이템이 20줄씩 선다. 그림 · 이름 · 묶음 · 착용 레벨 · 고가 · 역할을 칸에서 고친다.
 *
 * 드롭 아이템 · 강화 장비 · 사냥 전리품이 한 줄을 나눠 쓴다. 역할은 붙이기만 하고 빼지 않는다. 드롭 표 · 드롭 가격 기록이 key 로
 * 가리켜 빼면 앱에서 모르는 아이템이 되기 때문이다. 사냥 전리품의 종류 · NPC 가격 · 기간은 사냥 전리품 화면이 고친다.
 * 반지 레벨 줄과 같은 물건의 따로 둔 줄은 원래 아이템을 고치면 따라 바뀌어 여기서 못 고친다.
 */
export const ITEMS_HTML = page(
  '/admin/items',
  `<select id="group" class="on-bg w-md" aria-label="묶음"></select><span id="roles"></span><input id="q" class="on-bg" placeholder="이름 · key 로 찾는다" aria-label="찾기"><span class="grow"></span><button id="add" class="btn sm" type="button">아이템 더하기</button>`,
  `<section class="panel">
  <table class="sheet tight"><thead><tr><th>그림</th><th>이름 · key</th><th>묶음</th><th class="num">착용</th><th>고가</th><th>역할</th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:8px"><p id="summary"></p><span class="grow"></span><span id="pages"></span></div>
</section>
<style>
  .sheet .follows { color: var(--text-3) }
</style>`,
  `
  var ROLES = [['all', '전체'], ['drop', '드롭'], ['equipment', '강화'], ['loot', '사냥 전리품'], ['noicon', '그림 없음']];
  var PAGE = 20, group = 'all', role = 'all', pageAt = 0, known = {};
  function lookup(id) { return known[id]; }
  function roleOk(it) {
    if (role === 'drop') return it.isDrop; if (role === 'equipment') return it.isEquipment;
    if (role === 'loot') return it.huntLootType !== null; if (role === 'noicon') return it.icon === null; return true;
  }
  function groupOk(it) { return group === 'all' || (group === 'none' ? it.groupKey === null : it.groupKey === group); }

  function fillGroups() {
    var s = document.getElementById('group'); s.innerHTML = '';
    var pool = D.items.filter(roleOk); var count = function (fn) { return pool.filter(fn).length; };
    var add = function (parent, value, text) { var o = el('option', text); o.value = value; parent.appendChild(o); };
    add(s, 'all', '전체 · ' + pool.length); add(s, 'none', '분류 없음 · ' + count(function (it) { return it.groupKey === null; }));
    D.categories.forEach(function (k) {
      var og = document.createElement('optgroup'); og.label = k.name;
      k.groups.forEach(function (g) { add(og, g.key, g.name + ' · ' + count(function (it) { return it.groupKey === g.key; })); });
      s.appendChild(og);
    });
    s.value = group;
  }

  function itemRow(it) {
    var tr = el('tr', undefined, it.followsKey ? 'follows' : ''); var icon, name, grp, level, valuable, drop, eq;
    if (it.icon) known[it.icon.id] = it.icon;
    var send = function () { return call('PUT', '/admin/items/' + it.key, { name: name.value(), groupKey: orNull(grp.value()), iconAssetId: icon.value(), isValuable: valuable.value(), requiredLevel: level.value(), isDrop: drop.value(), isEquipment: eq.value() }); };
    icon = assetCell(batch, it.name, it.icon ? it.icon.id : null, send, { categories: ['item', 'item_ring'], uploadCategory: 'item', lookup: lookup, nullable: true, compact: true });
    name = textCell(batch, it.name, it.name, send, 'w-mid'); grp = selectCell(batch, it.name, it.groupKey === null ? '' : it.groupKey, send, groupChoices());
    level = numCell(batch, it.name, it.requiredLevel, send, 'short'); valuable = checkCell(batch, it.name, it.isValuable, send, '고가');
    drop = checkCell(batch, it.name, it.isDrop, send, '드롭'); eq = checkCell(batch, it.name, it.isEquipment, send, '강화');
    // 붙은 역할은 빼지 못한다. 드롭 표 · 드롭 가격 기록이 key 로 가리킨다.
    if (it.isDrop) drop.input.querySelector('input').disabled = true;
    if (it.isEquipment) eq.input.querySelector('input').disabled = true;
    var nameBox = el('div', undefined, 'pair'); nameBox.appendChild(name.input); nameBox.appendChild(el('small', it.key + (it.followsKey ? ' · ' + it.followsKey + ' 를 따른다' : '')));
    var roles = inline(drop.input, eq.input); if (it.huntLootType !== null) roles.appendChild(span('사냥 전리품', 'tag'));
    cell(tr, icon.input); cell(tr, nameBox); cell(tr, grp.input); cell(tr, level.input, 'num'); cell(tr, valuable.input); cell(tr, roles);
    if (it.followsKey) tr.querySelectorAll('input, select, button').forEach(function (x) { x.disabled = true; });
    return tr;
  }

  function render() {
    batch.clear(); fillGroups();
    var seg = document.getElementById('roles'); seg.innerHTML = '';
    seg.appendChild(segButtons(ROLES, role, function (v) { if (!discardOk(batch)) return; role = v; pageAt = 0; render(); }));
    var q = document.getElementById('q').value.trim().toLowerCase();
    var shown = D.items.filter(function (it) { return roleOk(it) && groupOk(it) && (!q || it.key.indexOf(q) >= 0 || it.name.toLowerCase().indexOf(q) >= 0); });
    var pages = Math.max(1, Math.ceil(shown.length / PAGE)); if (pageAt >= pages) pageAt = pages - 1;
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    shown.slice(pageAt * PAGE, pageAt * PAGE + PAGE).forEach(function (it) { tb.appendChild(itemRow(it)); });
    if (shown.length === 0) { var e = el('tr'); var td = cell(e, '맞는 아이템이 없다', 'empty'); td.colSpan = 6; tb.appendChild(e); }
    document.getElementById('summary').textContent = shown.length + '개 · 아이템 ' + D.items.length + ' · 그림 없음 ' + D.items.filter(function (it) { return it.icon === null; }).length + ' · 분류 없음 ' + D.items.filter(function (it) { return it.groupKey === null; }).length;
    var pg = document.getElementById('pages'); pg.innerHTML = '';
    pg.appendChild(pager(pages, pageAt, function (v) { if (!discardOk(batch)) return; pageAt = v; render(); }));
  }

  function addItem() {
    var form = el('div', undefined, 'form-body'); var grid = el('div', undefined, 'grid2');
    var key = input('text', 'mono'); key.placeholder = 'dreamy_belt'; var name = input('text'); var grp = select(groupChoices(), group === 'all' || group === 'none' ? '' : group);
    var level = input('number'); level.min = '1'; var valuable = input('checkbox'), drop = input('checkbox'), eq = input('checkbox');
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['item', 'item_ring'], uploadCategory: 'item', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    var checks = el('div', undefined, 'inline'); [[valuable, '고가'], [drop, '드롭 아이템'], [eq, '강화 장비']].forEach(function (x) { var l = el('label', undefined, 'check'); l.appendChild(x[0]); l.appendChild(document.createTextNode(x[1])); checks.appendChild(l); });
    grid.appendChild(field('key', '못 바꾼다', key)); grid.appendChild(field('이름', undefined, name)); grid.appendChild(field('묶음', undefined, grp)); grid.appendChild(field('착용 레벨', '강화 장비', level));
    grid.appendChild(field('그림', '아이템 분류의 그림', inline(iconText, pick))); grid.appendChild(field('역할', '붙이면 뺄 수 없다', checks));
    form.appendChild(grid); var go = button('아이템 더하기', 'btn'); form.appendChild(go);
    var d = openForm('아이템 더하기', form); d.classList.add('mid');
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), name: name.value.trim(), groupKey: orNull(grp.value), iconAssetId: icon.id, isValuable: valuable.checked, requiredLevel: level.value.trim() === '' ? null : Number(level.value), isDrop: drop.checked, isEquipment: eq.checked };
      var r = await call('POST', '/admin/items', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); document.getElementById('q').value = body.key; load(); }
    });
  }

  document.getElementById('group').addEventListener('change', function (e) { if (!discardOk(batch)) { e.target.value = group; return; } group = e.target.value; pageAt = 0; render(); });
  document.getElementById('q').addEventListener('input', function () { pageAt = 0; render(); });
  document.getElementById('add').addEventListener('click', addItem);
`,
)

/**
 * 아이템 묶음. 종류마다 한 단이고 묶음의 이름 · 종류를 칸에서 고친다. 묶음은 더하고 차례를 옮기고, 아이템이 없는 묶음만 지운다.
 */
export const ITEM_GROUPS_HTML = page(
  '/admin/items/groups',
  '<span class="grow"></span>',
  `<section class="panel"><div class="kinds" id="kinds"></div></section>
<style>
  .kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px 20px; align-items: start }
  .kind-col h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 13.5px }
  .kind-col .grow { flex: 1 }
  .kind-row { display: flex; align-items: center; gap: 4px; padding: 1px 0; border-radius: 6px }
  .kind-row:hover { background: var(--surface-2) }
  .kind-row .text-in { flex: 1; width: auto }
  .kind-row .n { width: 30px; text-align: right; font: 12px var(--mono); color: var(--text-3) }
  .kind-row .row-act { display: none }
  .kind-row:hover .row-act, .kind-row .row-act:has(.changed) { display: inline-flex; visibility: visible }
  .kind-row .sel-in { padding-right: 22px; font-size: 12px }
</style>`,
  `
  function count(key) { return D.items.filter(function (it) { return it.groupKey === key; }).length; }
  async function move(g, direction) { var r = await call('POST', '/admin/item-groups/' + g.key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }
  function render() {
    batch.clear();
    var box = document.getElementById('kinds'); box.innerHTML = '';
    var kinds = D.categories.map(function (k) { return [k.key, k.name]; });
    D.categories.forEach(function (k) {
      var col = el('div', undefined, 'kind-col'); var h = el('h3', k.name); h.appendChild(span(k.key, 'mono dim')); h.appendChild(span('', 'grow'));
      var add = button('묶음 추가', 'btn ghost sm'); add.addEventListener('click', function () { addGroup(k); }); h.appendChild(add); col.appendChild(h);
      k.groups.forEach(function (g, i) {
        var row = el('div', undefined, 'kind-row'); var name, type; var n = count(g.key);
        var send = function () { return call('PUT', '/admin/item-groups/' + g.key, { type: type.value(), name: name.value() }); };
        name = textCell(batch, g.key, g.name, send); type = selectCell(batch, g.key, k.key, send, kinds); name.input.title = g.key;
        var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), rm = button('지우기', 'btn danger sm');
        up.disabled = i === 0; down.disabled = i === k.groups.length - 1; rm.disabled = n > 0; if (n > 0) rm.title = '아이템이 든 묶음은 못 지운다';
        up.addEventListener('click', function () { move(g, 'up'); }); down.addEventListener('click', function () { move(g, 'down'); });
        rm.addEventListener('click', async function () { if (!window.confirm('‘' + g.name + '’ 묶음을 지운다.')) return; var r = await call('DELETE', '/admin/item-groups/' + g.key); show(r.ok ? g.name + ' 묶음을 지웠다' : fail('못 지웠다', r), !r.ok); load(); });
        var act = inline(up, down, type.input, rm); act.className = 'inline row-act';
        row.appendChild(name.input); row.appendChild(span(String(n), 'n')); row.appendChild(act); col.appendChild(row);
      });
      box.appendChild(col);
    });
  }
  function addGroup(k) {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'boutique'; var name = input('text'); name.placeholder = '부티크';
    form.appendChild(field('key', '못 바꾼다', key)); form.appendChild(field('이름', undefined, name));
    var go = button('묶음 추가', 'btn'); form.appendChild(go); var d = openForm(k.name + ' 묶음 추가', form);
    go.addEventListener('click', async function () {
      var r = await call('POST', '/admin/item-groups', { key: key.value.trim(), type: k.key, name: name.value.trim() });
      show(r.ok ? name.value.trim() + ' 묶음을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }
`,
)
