import { ASSET_PICKER } from './asset-picker'
import { subNav } from './edit-kit'
import { layout } from './layout'

const NAV = [
  ['/admin/cashbook-categories', '분류'],
  ['/admin/cashbook-categories/item-types', '아이템 종류'],
] as const

function page(current: string, body: string, script: string): string {
  return layout(
    '/admin/cashbook-categories',
    '가계부 분류',
    `<div class="top"><h1>가계부 분류</h1>${subNav(NAV, current)}<span class="grow"></span><span class="updated" id="updated"></span></div>
<div id="message" class="msg" role="status" hidden></div>
${body}
<script>
  var D = null;
  var batch = editing(function () { load(); });
  async function load() {
    var r = await call('GET', '/admin/cashbook-categories/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    D = r.json;
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    await render();
  }
${script}
  load();
</script>`,
  )
}

/**
 * 가계부 입력 시트의 분류. 지출 · 수입을 한 표에 나눠 세우고 이름 · 카드 제목 · 그림 · 설명 · 단위를 칸에서 고친다.
 *
 * key 는 기록이 들어 못 바꾸고 분류는 지우지 않는다. 앱이 입력 폼을 모르는 분류는 앱에서 이름만 서고 못 고른다.
 */
export const CASHBOOK_CATEGORIES_HTML = page(
  '/admin/cashbook-categories',
  `<section class="panel">
  <table class="sheet"><thead><tr><th>#</th><th>key</th><th>이름</th><th>카드 제목</th><th>그림</th><th>설명</th><th>단위</th><th></th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>차례가 앱의 차례이고 수입은 맨 앞이 기본 분류다. 카드 제목은 하루 목록 카드의 첫 줄이고, 묶음이 있는 지출 분류는 묶음의 카드 제목이 대신 선다.</p></div>
</section>
${ASSET_PICKER}`,
  `
  var TYPES = [['spend', '지출'], ['income', '수입']];
  var assets = {};
  function lookup(id) { return assets[id]; }
  async function move(c, direction) { var r = await call('POST', '/admin/cashbook-categories/' + c.entryType + '/' + c.key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }

  function addCategory(type, label) {
    var form = el('div', undefined, 'form-body'); var grid = el('div', undefined, 'grid2');
    var key = input('text', 'mono'); key.placeholder = 'hexa_skill'; var name = input('text'); var title = input('text'); var desc = input('text'); var unit = input('text'); unit.placeholder = '개';
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['item', 'item_ring'], uploadCategory: 'item', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    grid.appendChild(field('key', '못 바꾼다', key)); grid.appendChild(field('그림', '아이템 분류의 그림', inline(iconText, pick)));
    grid.appendChild(field('이름', undefined, name)); grid.appendChild(field('카드 제목', '하루 목록 카드의 첫 줄', title));
    grid.appendChild(field('설명', '분류 카드 한 줄', desc)); grid.appendChild(field('단위', '수량이 없으면 비운다', unit));
    form.appendChild(grid); form.appendChild(el('p', '앱에 이 분류의 입력 폼이 생길 때까지 앱에서 고를 수 없다', 'hint'));
    var go = button(label + ' 분류 추가', 'btn'); form.appendChild(go);
    var d = openForm(label + ' 분류 추가', form); d.classList.add('mid');
    go.addEventListener('click', async function () {
      var body = { entryType: type, key: key.value.trim(), name: name.value.trim(), cardTitle: title.value.trim(), iconAssetId: icon.id, description: desc.value.trim(), unit: orNull(unit.value) };
      var r = await call('POST', '/admin/cashbook-categories', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }

  function categoryRow(c, i, count) {
    var tr = el('tr'); cell(tr, i + 1, 'n'); cell(tr, c.key, 'label');
    var name, title, icon, desc, unit;
    var send = function () { return call('PUT', '/admin/cashbook-categories/' + c.entryType + '/' + c.key, { name: name.value(), cardTitle: title.value(), iconAssetId: icon.value(), description: desc.value(), unit: orNull(unit.value()) }); };
    var k = c.key;
    name = textCell(batch, k, c.name, send, 'w-name'); title = textCell(batch, k, c.cardTitle, send, 'w-name');
    icon = assetCell(batch, k, c.iconAssetId, send, { categories: ['item', 'item_ring'], uploadCategory: 'item', lookup: lookup });
    desc = textCell(batch, k, c.description, send, 'w-long'); unit = textCell(batch, k, c.unit, send, 'w-unit'); unit.input.placeholder = '없음';
    cell(tr, name.input); cell(tr, title.input); cell(tr, icon.input); cell(tr, desc.input); cell(tr, unit.input);
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'); up.disabled = i === 0; down.disabled = i === count - 1;
    up.addEventListener('click', function () { move(c, 'up'); }); down.addEventListener('click', function () { move(c, 'down'); });
    var act = inline(up, down); act.className = 'inline row-act'; cell(tr, act, 'act');
    return tr;
  }

  async function render() {
    if (Object.keys(assets).length === 0) { var a = await call('GET', '/admin/assets/list'); if (a.ok) a.json.rows.forEach(function (row) { assets[row.id] = row; }); }
    batch.clear();
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    TYPES.forEach(function (t) {
      var rows = D.cashbookCategories.filter(function (c) { return c.entryType === t[0]; });
      var g = el('tr', undefined, 'group'); var td = document.createElement('td'); td.colSpan = 8; td.appendChild(document.createTextNode(t[1] + ' ' + rows.length));
      var add = button('분류 추가', 'btn ghost sm'); add.addEventListener('click', function () { addCategory(t[0], t[1]); }); td.appendChild(add); g.appendChild(td); tb.appendChild(g);
      rows.forEach(function (c, i) { tb.appendChild(categoryRow(c, i, rows.length)); });
    });
  }
`,
)

/** 아이템 구매 · 판매의 종류. 게임 인벤토리 탭 이름이다. 앱 코드가 key 로 수량 · 관세를 갈라 더하기가 없다. */
export const CASHBOOK_ITEM_TYPES_HTML = page(
  '/admin/cashbook-categories/item-types',
  `<section class="panel">
  <table class="sheet"><thead><tr><th>key</th><th>이름</th><th>단위</th><th>관세</th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>단위가 비면 앱에 수량 칸이 없다. 관세는 월드 간 거래가 되는 종류에만 붙인다.</p></div>
</section>`,
  `
  async function render() {
    batch.clear();
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    D.cashbookItemTypes.forEach(function (k) {
      var tr = el('tr'); cell(tr, k.key, 'label'); var name, unit, tariff;
      var send = function () { return call('PUT', '/admin/cashbook-item-types/' + k.key, { name: name.value(), unit: orNull(unit.value()), hasTariff: tariff.value() }); };
      name = textCell(batch, k.key, k.name, send); unit = textCell(batch, k.key, k.unit, send); unit.input.placeholder = '수량 없음';
      tariff = checkCell(batch, k.key, k.hasTariff, send, '붙음');
      cell(tr, name.input); cell(tr, unit.input); cell(tr, tariff.input);
      tb.appendChild(tr);
    });
  }
`,
)
