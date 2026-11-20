import { ASSET_PICKER } from './asset-picker'
import { subNav } from './edit-kit'
import { layout } from './layout'

const NAV = [
  ['/admin/spend-catalog', '묶음 · 항목'],
  ['/admin/spend-catalog/tiles', '타일'],
] as const

/** 두 화면이 함께 쓰는 읽기. 지출 분류는 가계부 분류 화면이 들고, 이 화면은 그 지출 분류를 읽어 고르개에 세운다. */
const COMMON_JS = `
  var D = null, assets = {}, CATEGORIES = [], REWARD_TYPES = [];
  var batch = editing(function () { load(); });
  function lookup(id) { return assets[id]; }
  async function load() {
    var r = await call('GET', '/admin/spend-catalog/rows'); var c = await call('GET', '/admin/cashbook-categories/rows'); var a = await call('GET', '/admin/assets/list');
    if (!r.ok || !c.ok || !a.ok) { show('못 읽었다 ' + [r, c, a].filter(function (x) { return !x.ok; })[0].status, true); return; }
    D = r.json; assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    CATEGORIES = c.json.cashbookCategories.filter(function (x) { return x.entryType === 'spend'; }).map(function (x) { return [x.key, x.name]; });
    REWARD_TYPES = D.rewardTypes.map(function (f) { return [f.key, f.name]; });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    await render();
  }
`

function page(current: string, top: string, body: string, script: string): string {
  return layout(
    '/admin/spend-catalog',
    '지출 카탈로그',
    `<div class="top"><h1>지출 카탈로그</h1>${subNav(NAV, current)}<span class="grow"></span><span class="updated" id="updated"></span>${top}</div>
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
 * 가계부 지출의 선택 목록. 위는 규칙과 추가 리워드 종류 이름, 왼쪽은 묶음, 오른쪽은 고른 묶음의 칸과 항목이다.
 * 항목을 누르면 작은 창에서 고친다. 축 값 · 추가 리워드 종류처럼 칸 하나에 안 담기는 값이 있어서다.
 *
 * key 는 기록이 들어 못 바꾸고 묶음 · 타일 · 항목은 지우지 않는다. 항목은 끝으로 닫고 묶음은 열림을 끈다. 앱은 열림으로 고를 수 있는지
 * 정한다. 날짜로 판정하지 않는다.
 */
export const SPEND_CATALOG_HTML = page(
  '/admin/spend-catalog',
  '<button id="add-group" class="btn sm" type="button">묶음 추가</button>',
  `<section class="panel"><div class="panel-head" id="rules"></div></section>
<div class="split"><nav class="picklist" id="list" aria-label="묶음"></nav><section class="panel" id="detail"></section></div>`,
  `
  var CURRENCIES = [['point', '메포'], ['meso', '메소']];
  var UNITS = [['회', '회'], ['개', '개'], ['포인트', '포인트'], ['시간', '시간']];
  var current = null, ruleCells = {};
  function nameOf(pairs, key) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === key) return pairs[i][1]; return key; }
  function itemsOf(groupKey) { return D.items.filter(function (it) { return it.group === groupKey; }); }
  function optionsOf(itemKey) { return D.itemOptions.filter(function (o) { return o.item === itemKey; }); }
  function rewardTypesOf(itemKey) { return D.itemRewardTypes.filter(function (f) { return f.item === itemKey; }).map(function (f) { return f.rewardType; }); }
  function tileNameOf(key) { var t = D.tiles.filter(function (x) { return x.key === key; })[0]; return t ? t.name : key; }
  function optionsText(opts) { return opts.map(function (o) { return o.axis + '=' + o.value; }).join('; '); }
  function parseOptions(text) {
    return text.split(';').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; }).map(function (s) {
      var at = s.indexOf('='); return { axis: at < 0 ? s : s.slice(0, at).trim(), value: at < 0 ? '' : s.slice(at + 1).trim() };
    });
  }
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }
  function period(it) { if (!it.validFrom && !it.validUntil) return ''; return (it.validFrom || '처음') + ' ~ ' + (it.validUntil || ''); }

  function ruleCell(label, unit, field) {
    var w = el('span', undefined, 'rule'); w.appendChild(document.createTextNode(label));
    ruleCells[field] = numCell(batch, '지출 규칙', R[field], function () { var body = {}; Object.keys(ruleCells).forEach(function (k) { body[k] = ruleCells[k].value(); }); return call('PUT', '/admin/game-rules', body); }, field === 'rewardCoinPriceMeso' ? '' : 'short');
    w.appendChild(ruleCells[field].input); if (unit) w.appendChild(document.createTextNode(unit)); return w;
  }
  var R = {};
  function renderRules() {
    ruleCells = {};
    var box = document.getElementById('rules'); box.innerHTML = '';
    box.appendChild(ruleCell('관세율', '%', 'spendTariffPercent'));
    box.appendChild(ruleCell('메소마켓 수수료율', '%', 'mesoMarketFeePercent'));
    box.appendChild(ruleCell('세라자르 주화 판매가', '메소', 'rewardCoinPriceMeso'));
    D.rewardTypes.forEach(function (f) {
      var c = textCell(batch, '추가 리워드 ' + f.key, f.name, function () { return call('PUT', '/admin/spend-catalog/reward-types/' + f.key, { name: c.value() }); }, 'w-name');
      var w = el('span', '추가 리워드 ', 'rule'); w.appendChild(span(f.key, 'mono dim')); w.appendChild(c.input); box.appendChild(w);
    });
  }

  function itemForm(g, it) {
    var form = el('div', undefined, 'form-body');
    var key = input('text', 'mono'); key.placeholder = 'high_mountain_3';
    var tile = select(D.tiles.map(function (t) { return [t.key, t.name + ' (' + t.key + ')']; }), it ? it.tile : undefined);
    var name = input('text'); var tier = input('text'); tier.placeholder = '1단계 · 공격력';
    var currency = select(CURRENCIES, it ? it.currency : 'point'); var unitPrice = input('number'); unitPrice.min = '0'; unitPrice.placeholder = '비우면 경매장 값';
    var unit = select(UNITS, it ? it.unit : '회'); var maxQuantity = input('number'); maxQuantity.min = '1'; var coin = input('number'); coin.min = '1';
    var from = input('text', 'mono'); from.placeholder = '2026-09-17'; var until = input('text', 'mono'); until.placeholder = '비우면 끝없이';
    var options = input('text'); options.placeholder = '무기=한손무기; 능력치=공격력';
    var typesBox = el('div', undefined, 'inline');
    var typeChecks = REWARD_TYPES.map(function (f) { var l = el('label', undefined, 'check'); var c = input('checkbox'); c.value = f[0]; l.appendChild(c); l.appendChild(document.createTextNode(' ' + f[1])); typesBox.appendChild(l); return c; });
    if (it) {
      name.value = it.name; tier.value = it.tier || ''; unitPrice.value = it.unitPrice === null ? '' : it.unitPrice;
      maxQuantity.value = it.maxQuantity === null ? '' : it.maxQuantity; coin.value = it.rewardCoinQuantity === null ? '' : it.rewardCoinQuantity;
      from.value = it.validFrom || ''; until.value = it.validUntil || ''; options.value = optionsText(optionsOf(it.key));
      var fs = rewardTypesOf(it.key); typeChecks.forEach(function (c) { c.checked = fs.indexOf(c.value) >= 0; });
    }
    var grid = el('div', undefined, 'grid2');
    if (!it) grid.appendChild(field('key', '못 바꾼다', key));
    grid.appendChild(field('타일', '같은 타일의 항목이 한 칸으로 접힌다', tile));
    grid.appendChild(field('이름', '원본 이름. 하루 목록 카드에도 선다', name));
    grid.appendChild(field('단계', '타일에 항목이 여럿일 때. 축 값과 함께 못 든다', tier));
    grid.appendChild(field('축 값', '축=값; 축=값. 같은 타일은 축 이름이 같아야 한다', options));
    grid.appendChild(field('재화', undefined, currency));
    grid.appendChild(field('가격', '비우면 경매장 값이라 앱이 적을 때 친다', unitPrice));
    grid.appendChild(field('단위', '수량 칸의 라벨', unit));
    grid.appendChild(field('수량 상한', '기록 한 건', maxQuantity));
    grid.appendChild(field('세라자르 주화', '한 리워드 종류에서 받는 개수. 리워드 종류를 든 항목만', coin));
    grid.appendChild(field('추가 리워드 종류', '에픽던전 추가 리워드', typesBox));
    grid.appendChild(field('시작', 'KST. 비우면 처음부터', from));
    grid.appendChild(field('끝', '지우지 않고 여기로 닫는다', until));
    form.appendChild(grid);
    var go = button(it ? '저장' : '항목 추가', 'btn'); form.appendChild(go);
    var d = openForm(it ? it.key + ' 고치기' : g.name + ' 항목 추가', form); d.classList.add('mid');
    go.addEventListener('click', async function () {
      var body = {
        tile: tile.value, name: name.value.trim(), tier: orNull(tier.value), currency: currency.value, unitPrice: numOrNull(unitPrice.value), unit: unit.value,
        maxQuantity: numOrNull(maxQuantity.value), rewardCoinQuantity: numOrNull(coin.value), validFrom: orNull(from.value), validUntil: orNull(until.value),
        options: parseOptions(options.value), rewardTypes: typeChecks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }),
      };
      if (!it) { body.key = key.value.trim(); body.group = g.key; }
      var r = it ? await call('PUT', '/admin/spend-catalog/items/' + it.key, body) : await call('POST', '/admin/spend-catalog/items', body);
      show(r.ok ? (it ? it.key : body.key) + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }

  async function moveItem(it, direction) { var r = await call('POST', '/admin/spend-catalog/items/' + it.key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }
  async function moveGroup(direction) { var r = await call('POST', '/admin/spend-catalog/groups/' + current + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }

  function renderDetail(g) {
    var box = document.getElementById('detail'); box.innerHTML = '';
    if (!g) { box.appendChild(el('p', '묶음이 없다', 'dim')); return; }
    var name, category, title, active;
    var send = function () { return call('PUT', '/admin/spend-catalog/groups/' + g.key, { name: name.value(), category: category.value(), cardTitle: title.value(), isActive: active.value() }); };
    // 묶음 이름은 칸에서 바로 고치므로 제목을 따로 세우지 않는다. 항목이 많은 묶음도 한 화면에 들어오게 하려는 것이다.
    var fields = el('div', undefined, 'panel-head');
    name = textCell(batch, g.key, g.name, send, 'w-name'); category = selectCell(batch, g.key, g.category, send, CATEGORIES); title = textCell(batch, g.key, g.cardTitle, send, 'w-name');
    active = checkCell(batch, g.key, g.isActive, send, '열림');
    fields.appendChild(span(g.key, 'mono dim'));
    [['이름 ', name], ['분류 ', category], ['카드 제목 ', title]].forEach(function (x) { var w = el('span', x[0], 'rule'); w.appendChild(x[1].input); fields.appendChild(w); });
    fields.appendChild(active.input); fields.appendChild(span('', 'grow'));
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'); up.title = '묶음을 앞으로'; down.title = '묶음을 뒤로';
    up.addEventListener('click', function () { moveGroup('up'); }); down.addEventListener('click', function () { moveGroup('down'); });
    fields.appendChild(inline(up, down)); box.appendChild(fields);
    var tb = el('tbody');
    itemsOf(g.key).forEach(function (it, i) {
      var tr = el('tr', undefined, 'click'); cell(tr, i + 1, 'n'); cell(tr, tileNameOf(it.tile)); cell(tr, it.name);
      var opts = optionsOf(it.key); cell(tr, it.tier || (opts.length ? optionsText(opts) : ''), 'dim');
      cell(tr, it.unitPrice === null ? span('경매장', 'dim') : meso(it.unitPrice) + ' ' + nameOf(CURRENCIES, it.currency), 'num');
      cell(tr, it.unit); cell(tr, it.maxQuantity === null ? '' : it.maxQuantity, 'num'); cell(tr, it.rewardCoinQuantity === null ? '' : it.rewardCoinQuantity, 'num');
      cell(tr, rewardTypesOf(it.key).map(function (f) { return nameOf(REWARD_TYPES, f); }).join(' · '), 'dim'); cell(tr, period(it), 'mono');
      var iu = button('↑', 'btn ghost sm'), id = button('↓', 'btn ghost sm');
      iu.addEventListener('click', function (e) { e.stopPropagation(); moveItem(it, 'up'); }); id.addEventListener('click', function (e) { e.stopPropagation(); moveItem(it, 'down'); });
      var act = inline(iu, id); act.className = 'inline row-act'; cell(tr, act, 'act');
      tr.addEventListener('click', function () { itemForm(g, it); });
      tb.appendChild(tr);
    });
    var tbl = el('table', undefined, 'sheet'); var thead = el('thead'); var hr = el('tr');
    ['#', '타일', '이름', '단계 · 축 값', '가격', '단위', '상한', '주화', '추가 리워드', '기간', ''].forEach(function (h, i) { var th = el('th', h); if ([4, 6, 7].indexOf(i) >= 0) th.className = 'num'; hr.appendChild(th); });
    thead.appendChild(hr); tbl.appendChild(thead); tbl.appendChild(tb); box.appendChild(tbl);
    var foot = el('div', undefined, 'panel-head'); foot.style.marginTop = '10px';
    foot.appendChild(el('p', itemsOf(g.key).length + '항목 · 차례가 앱의 차례이고 같은 타일은 한 칸으로 접힌다. 줄을 누르면 고친다'));
    foot.appendChild(span('', 'grow')); var add = button('항목 추가', 'btn ghost sm'); add.addEventListener('click', function () { itemForm(g, null); }); foot.appendChild(add);
    box.appendChild(foot);
  }

  function addGroup() {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'maple_point_shop'; var name = input('text'); var category = select(CATEGORIES); var title = input('text');
    form.appendChild(field('key', '못 바꾼다', key)); form.appendChild(field('이름', undefined, name)); form.appendChild(field('분류', '지출 분류', category)); form.appendChild(field('카드 제목', '하루 목록 카드 첫 줄', title));
    var go = button('묶음 추가', 'btn'); form.appendChild(go); var d = openForm('묶음 추가', form);
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), name: name.value.trim(), category: category.value, cardTitle: title.value.trim(), isActive: true };
      var r = await call('POST', '/admin/spend-catalog/groups', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); current = body.key; setHashKey(current); load(); }
    });
  }

  async function render() {
    var g = await call('GET', '/admin/game-rules'); R = g.ok && g.json.gameRules ? g.json.gameRules : {};
    batch.clear(); renderRules();
    if (current === null) current = hashKey();
    if (!D.groups.some(function (x) { return x.key === current; })) current = D.groups.length ? D.groups[0].key : null;
    pickList(document.getElementById('list'), D.groups.map(function (x) { return { key: x.key, title: x.name, meta: (x.isActive ? '' : '닫힘 ') + itemsOf(x.key).length }; }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); });
    renderDetail(D.groups.filter(function (x) { return x.key === current; })[0]);
  }
  document.getElementById('add-group').addEventListener('click', addGroup);
`,
)

/** 지출 목록의 타일. 같은 타일의 항목이 앱 목록에서 한 칸으로 접힌다. 그림은 아이템 그림이거나 지역 아이콘이다. */
export const SPEND_TILES_HTML = page(
  '/admin/spend-catalog/tiles',
  '<input id="filter" class="w-md on-bg" placeholder="key 나 이름으로 거른다"><button id="add-tile" class="btn sm" type="button">타일 추가</button>',
  `<section class="panel"><div class="tiles" id="tiles"></div></section>
<style>
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 4px 8px }
  .tile { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0 6px; padding: 4px; border-radius: 8px }
  .tile:hover { background: var(--surface-2) }
  .tile .asset-cell { grid-row: span 2; padding: 2px }
  .tile .asset-cell span { display: none }
  .tile .text-in { padding: 2px 6px }
  .tile small { padding: 0 6px; font: 11.5px var(--mono); color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
</style>`,
  `
  var TILE_ICONS = ['item', 'item_ring', 'map_icon'];
  async function render() {
    batch.clear();
    var q = document.getElementById('filter').value.trim().toLowerCase();
    var box = document.getElementById('tiles'); box.innerHTML = '';
    D.tiles.filter(function (t) { return !q || t.key.indexOf(q) >= 0 || t.name.toLowerCase().indexOf(q) >= 0; }).forEach(function (t) {
      var used = D.items.filter(function (it) { return it.tile === t.key; }).length; var name, icon;
      var send = function () { return call('PUT', '/admin/spend-catalog/tiles/' + t.key, { name: name.value(), iconAssetId: icon.value() }); };
      icon = assetCell(batch, t.key, t.iconAssetId, send, { categories: TILE_ICONS, uploadCategory: 'item', lookup: lookup, nullable: true });
      name = textCell(batch, t.key, t.name, send);
      var card = el('div', undefined, 'tile'); card.appendChild(icon.input); card.appendChild(name.input); card.appendChild(el('small', t.key + ' · ' + used + '항목'));
      box.appendChild(card);
    });
  }
  document.getElementById('filter').addEventListener('input', function () { if (D && discardOk(batch)) render(); });
  document.getElementById('add-tile').addEventListener('click', function () {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'high_mountain'; var name = input('text');
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: TILE_ICONS, uploadCategory: 'item', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    form.appendChild(field('key', '못 바꾼다', key)); form.appendChild(field('이름', undefined, name)); form.appendChild(field('그림', '아이템 그림 · 지역 아이콘', inline(iconText, pick)));
    var go = button('타일 추가', 'btn'); form.appendChild(go); var d = openForm('타일 추가', form);
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), name: name.value.trim(), iconAssetId: icon.id };
      var r = await call('POST', '/admin/spend-catalog/tiles', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  });
`,
)
