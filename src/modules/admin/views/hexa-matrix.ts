import { ASSET_PICKER } from './asset-picker'
import { subNav } from './edit-kit'
import { layout } from './layout'

const NAV = [
  ['/hexa-matrix', '직업별 코어'],
  ['/hexa-matrix/types', '코어 종류 · 스탯'],
  ['/hexa-matrix/costs', '레벨 비용'],
] as const

/** 세 화면이 함께 쓰는 읽기. */
const COMMON_JS = `
  var D = null, assets = {};
  var batch = editing(function () { load(); });
  function lookup(id) { return assets[id]; }
  function typeById(id) { return D.hexaCoreTypes.filter(function (t) { return t.id === id; })[0]; }
  async function load() {
    var r = await call('GET', '/hexa-matrix/rows'); var a = await call('GET', '/images/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    D = r.json; assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
`

function page(current: string, top: string, body: string, script: string): string {
  return layout(
    '/hexa-matrix',
    '헥사 매트릭스',
    `<div class="top"><h1>헥사 매트릭스</h1>${subNav(NAV, current)}<span class="grow"></span><span class="updated" id="updated"></span>${top}</div>
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
 * 직업마다의 코어. 왼쪽에서 직업을 고르면 그 직업의 코어가 선다. 그림 · 이름 · 종류는 칸에서 바로 고친다.
 *
 * 코어는 종류를 직접 가리킨다. 차례는 같은 직업 · 같은 종류 안의 차례이고, 앱이 전직업의 코어를 섞어 종류 차례로 다시 늘어놓는다.
 * 모든 직업이 쓰는 코어는 전직업에 둔다.
 */
export const HEXA_MATRIX_HTML = page(
  '/hexa-matrix',
  '<button id="add-job" class="btn ghost sm" type="button">직업 추가</button>',
  `<div class="split"><div class="picklist-wrap"><input id="filter" class="on-bg" placeholder="직업 찾기"><nav class="picklist" id="list" aria-label="직업"></nav></div><section class="panel" id="detail"></section></div>
<style>
  .picklist-wrap { display: grid; gap: 8px; position: sticky; top: 16px }
  .picklist-wrap .picklist { position: static; max-height: calc(100vh - 160px) }
</style>`,
  `
  var current = null;
  async function move(c, direction) { var r = await call('POST', '/hexa-matrix/cores/' + c.id + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }
  function typeChoices() { return D.hexaCoreTypes.map(function (t) { return [t.key, t.name]; }); }

  function renderDetail(j) {
    var box = document.getElementById('detail'); box.innerHTML = '';
    if (!j) { box.appendChild(el('p', '직업이 없다', 'dim')); return; }
    var head = el('div', undefined, 'panel-head');
    var name = textCell(batch, '직업 이름', j.name, function () { return call('PUT', '/hexa-matrix/jobs/' + j.id, { name: name.value() }); });
    var w = el('span', '직업 이름 ', 'rule'); w.appendChild(name.input); head.appendChild(w);
    head.appendChild(el('p', j.isAllJobs ? '모든 직업이 함께 쓰는 코어' : '넥슨 character_class 이름'));
    head.appendChild(span('', 'grow'));
    var add = button('코어 추가', 'btn ghost sm'); add.addEventListener('click', function () { addCore(j); }); head.appendChild(add);
    box.appendChild(head);
    var cores = D.hexaCores.filter(function (c) { return c.jobId === j.id; });
    var tb = el('tbody');
    D.hexaCoreTypes.forEach(function (t) {
      var mine = cores.filter(function (c) { return c.typeId === t.id; });
      if (mine.length === 0) return;
      var g = el('tr', undefined, 'group'); var gd = document.createElement('td'); gd.colSpan = 5; gd.textContent = t.name + ' ' + mine.length; g.appendChild(gd); tb.appendChild(g);
      mine.forEach(function (c, i) {
        var tr = el('tr'); cell(tr, i + 1, 'n'); var nm, type, icon;
        var send = function () { return call('PUT', '/hexa-matrix/cores/' + c.id, { name: nm.value(), typeKey: type.value(), iconAssetId: icon.value() }); };
        icon = assetCell(batch, c.name, c.iconAssetId, send, { categories: ['skill'], uploadCategory: 'skill', lookup: lookup, compact: true });
        nm = textCell(batch, c.name, c.name, send, 'w-long'); type = selectCell(batch, c.name, t.key, send, typeChoices());
        cell(tr, icon.input); cell(tr, nm.input); cell(tr, type.input);
        var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), rm = button('지우기', 'btn danger sm');
        up.addEventListener('click', function () { move(c, 'up'); }); down.addEventListener('click', function () { move(c, 'down'); });
        rm.addEventListener('click', async function () { if (!window.confirm(c.name + ' 코어를 지운다.')) return; var r = await call('DELETE', '/hexa-matrix/cores/' + c.id); show(r.ok ? '지웠다' : fail('못 지웠다', r), !r.ok); load(); });
        var act = inline(up, down, rm); act.className = 'inline row-act'; cell(tr, act, 'act');
        tb.appendChild(tr);
      });
    });
    if (cores.length === 0) { var e = el('tr'); var td = cell(e, '코어가 없다', 'empty'); td.colSpan = 5; tb.appendChild(e); }
    var t = el('table', undefined, 'sheet'); t.appendChild(tb); box.appendChild(t);
    var foot = el('div', undefined, 'panel-head'); foot.style.marginTop = '10px';
    foot.appendChild(el('p', cores.length + '코어 · 차례는 같은 종류 안에서 hexamatrix 응답의 차례다. 그림은 스킬 분류의 그림이다.')); box.appendChild(foot);
  }

  function addCore(j) {
    var form = el('div', undefined, 'form-body'); var name = input('text'); name.placeholder = '인페르날 웨이브'; var type = select(typeChoices());
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['skill'], uploadCategory: 'skill', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    form.appendChild(field('코어 이름', '넥슨 응답의 이름 그대로', name)); form.appendChild(field('종류', undefined, type)); form.appendChild(field('그림', '스킬 분류의 그림', inline(iconText, pick)));
    var go = button('코어 추가', 'btn'); form.appendChild(go); var d = openForm(j.name + ' 코어 추가', form);
    go.addEventListener('click', async function () {
      var r = await call('POST', '/hexa-matrix/cores', { jobId: j.id, name: name.value.trim(), typeKey: type.value, iconAssetId: icon.id });
      show(r.ok ? name.value.trim() + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }

  function render() {
    batch.clear();
    if (current === null) current = hashKey();
    if (!D.jobs.some(function (j) { return j.id === current; })) current = D.jobs.length ? D.jobs[0].id : null;
    var q = document.getElementById('filter').value.trim();
    var jobs = D.jobs.filter(function (j) { return !q || j.name.indexOf(q) >= 0 || j.id === current; });
    pickList(document.getElementById('list'), jobs.map(function (j) { return { key: j.id, title: j.name, meta: String(D.hexaCores.filter(function (c) { return c.jobId === j.id; }).length) }; }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); });
    renderDetail(D.jobs.filter(function (j) { return j.id === current; })[0]);
  }
  document.getElementById('filter').addEventListener('input', function () {
    var q = this.value.trim();
    pickList(document.getElementById('list'), D.jobs.filter(function (j) { return !q || j.name.indexOf(q) >= 0; }).map(function (j) { return { key: j.id, title: j.name, meta: String(D.hexaCores.filter(function (c) { return c.jobId === j.id; }).length) }; }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); });
  });
  document.getElementById('add-job').addEventListener('click', function () {
    var form = el('div', undefined, 'form-body'); var name = input('text'); name.placeholder = '아크메이지(불,독)';
    form.appendChild(field('직업 이름', '넥슨 character_class 그대로', name)); var go = button('직업 추가', 'btn'); form.appendChild(go); var d = openForm('직업 추가', form);
    go.addEventListener('click', async function () {
      var r = await call('POST', '/hexa-matrix/jobs', { name: name.value.trim() });
      show(r.ok ? name.value.trim() + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); if (r.json && r.json.id) { current = r.json.id; setHashKey(current); } load(); }
    });
  });
`,
)

/** 코어 종류와 헥사 스탯. 종류는 넥슨 타입마다 기본이 하나이고, 표에 없는 코어를 넥슨 타입으로 맞출 때 쓴다. */
export const HEXA_TYPES_HTML = page(
  '/hexa-matrix/types',
  '<button id="add-type" class="btn ghost sm" type="button">종류 추가</button><button id="add-stat" class="btn ghost sm" type="button">스탯 추가</button>',
  `<section class="panel">
  <table class="sheet"><thead><tr><th>key</th><th>그림</th><th>이름</th><th>넥슨 타입</th><th>기본</th><th class="num">만렙</th></tr></thead><tbody id="types"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>기본 종류는 넥슨 타입마다 하나다. 표에 없는 코어가 오면 넥슨 타입의 기본 종류로 센다. 만렙을 바꾸면 레벨 비용도 그 레벨까지 다시 적는다.</p></div>
</section>
<section class="panel">
  <table class="sheet"><thead><tr><th>헥사 스탯 key</th><th>이름</th><th class="num">활성화 조각</th></tr></thead><tbody id="stats"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>활성화 조각을 모르면 비운다. 앱이 활성화 체크를 막는다.</p></div>
</section>`,
  `
  function render() {
    batch.clear();
    var tb = document.getElementById('types'); tb.innerHTML = '';
    D.hexaCoreTypes.forEach(function (t) {
      var tr = el('tr'); cell(tr, t.key, 'label'); var icon, name, api, def, max;
      var send = function () { return call('PUT', '/hexa-matrix/types/' + t.key, { name: name.value(), apiType: api.value(), isDefault: def.value(), maxLevel: max.value(), iconAssetId: icon.value() }); };
      icon = assetCell(batch, t.key, t.iconAssetId, send, { categories: ['item', 'item_ring'], uploadCategory: 'item', lookup: lookup, compact: true });
      name = textCell(batch, t.key, t.name, send, 'w-name'); api = textCell(batch, t.key, t.apiType, send, 'w-name'); def = checkCell(batch, t.key, t.isDefault, send, '기본'); max = numCell(batch, t.key, t.maxLevel, send, 'short');
      cell(tr, icon.input); cell(tr, name.input); cell(tr, api.input); cell(tr, def.input); cell(tr, max.input, 'num');
      tb.appendChild(tr);
    });
    var sb = document.getElementById('stats'); sb.innerHTML = '';
    D.hexaStats.forEach(function (s) {
      var tr = el('tr'); cell(tr, s.key, 'label'); var name, act;
      var send = function () { return call('PUT', '/hexa-matrix/stats/' + s.key, { name: name.value(), activationFragmentQuantity: act.value() }); };
      name = textCell(batch, s.key, s.name, send, 'w-name'); act = numCell(batch, s.key, s.activationFragmentQuantity, send, 'short'); act.input.placeholder = '모름';
      cell(tr, name.input); cell(tr, act.input, 'num'); sb.appendChild(tr);
    });
  }
  document.getElementById('add-type').addEventListener('click', function () {
    var form = el('div', undefined, 'form-body'); var grid = el('div', undefined, 'grid2');
    var key = input('text', 'mono'); key.placeholder = 'skill_3rd'; var name = input('text'); var api = input('text'); api.placeholder = '스킬 코어'; var max = input('number'); max.value = '30'; var def = input('checkbox');
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['item', 'item_ring'], uploadCategory: 'item', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    var defLabel = el('label', undefined, 'check'); defLabel.appendChild(def); defLabel.appendChild(document.createTextNode('기본 종류'));
    grid.appendChild(field('key', undefined, key)); grid.appendChild(field('이름', undefined, name)); grid.appendChild(field('넥슨 타입', 'hexa_core_type', api)); grid.appendChild(field('만렙', undefined, max));
    grid.appendChild(field('그림', '아이템 분류의 그림', inline(iconText, pick))); grid.appendChild(defLabel);
    form.appendChild(grid); form.appendChild(el('p', '더한 뒤 레벨 비용 화면에서 레벨 전부의 비용을 적는다.', 'hint'));
    var go = button('종류 추가', 'btn'); form.appendChild(go); var d = openForm('종류 추가', form); d.classList.add('mid');
    go.addEventListener('click', async function () {
      var r = await call('POST', '/hexa-matrix/types', { key: key.value.trim(), name: name.value.trim(), apiType: api.value.trim(), isDefault: def.checked, maxLevel: Number(max.value), iconAssetId: icon.id });
      show(r.ok ? key.value.trim() + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  });
  document.getElementById('add-stat').addEventListener('click', function () {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'hexa_stat_4'; var name = input('text'); var act = input('number'); act.min = '0';
    form.appendChild(field('key', undefined, key)); form.appendChild(field('이름', undefined, name)); form.appendChild(field('활성화 조각', '모르면 비운다', act));
    var go = button('스탯 추가', 'btn'); form.appendChild(go); var d = openForm('스탯 추가', form);
    go.addEventListener('click', async function () {
      var r = await call('POST', '/hexa-matrix/stats', { key: key.value.trim(), name: name.value.trim(), activationFragmentQuantity: act.value.trim() === '' ? null : Number(act.value) });
      show(r.ok ? key.value.trim() + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  });
`,
)

/**
 * 코어 종류마다 Lv.n → n+1 의 솔 에르다 조각과 솔 에르다. 위에서 종류를 고르고, 레벨을 두 단으로 나눠 한 화면에 세운다.
 * 비용은 기간 줄 없이 레벨 전부를 한 번에 갈아 끼운다. 빈 레벨이 있으면 앱의 구간 합이 틀려서다.
 */
export const HEXA_COSTS_HTML = page(
  '/hexa-matrix/costs',
  '',
  `<section class="panel">
  <div class="panel-head" id="types"></div>
  <div class="cost-cols" id="cols"></div>
  <div class="panel-head" style="margin-top:10px"><p>저장하면 그 종류의 레벨 전부가 한 번에 바뀐다. 0 부터 만렙 - 1 까지 빈 칸이 없어야 한다.</p></div>
</section>
<style>
  .cost-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px }
  .cost-cols .num-in { width: 96px }
</style>`,
  `
  var current = null;
  function render() {
    batch.clear();
    if (current === null) current = hashKey();
    if (!D.hexaCoreTypes.some(function (t) { return t.key === current; })) current = D.hexaCoreTypes.length ? D.hexaCoreTypes[0].key : null;
    var head = document.getElementById('types'); head.innerHTML = '';
    head.appendChild(segButtons(D.hexaCoreTypes.map(function (t) { return [t.key, t.name]; }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); }));
    var t = D.hexaCoreTypes.filter(function (x) { return x.key === current; })[0]; var cols = document.getElementById('cols'); cols.innerHTML = '';
    if (!t) return;
    head.appendChild(el('p', '만렙 ' + t.maxLevel));
    var cells = [];
    var send = function () { return call('PUT', '/hexa-matrix/types/' + t.key + '/costs', { costs: cells.map(function (x) { return { fromLevel: x.fromLevel, fragmentQuantity: x.fragment.value(), solErdaQuantity: x.erda.value() }; }) }); };
    for (var lv = 0; lv < t.maxLevel; lv++) {
      var c = D.hexaCoreLevelCosts.filter(function (x) { return x.typeId === t.id && x.fromLevel === lv; })[0];
      var f = numCell(batch, t.name + ' 비용', c ? c.fragmentQuantity : null, send); var e = numCell(batch, t.name + ' 비용', c ? c.solErdaQuantity : null, send);
      f.input.placeholder = '없음'; e.input.placeholder = '없음'; cells.push({ fromLevel: lv, fragment: f, erda: e });
    }
    var half = Math.ceil(cells.length / 2);
    [cells.slice(0, half), cells.slice(half)].forEach(function (part) {
      var tbl = el('table', undefined, 'sheet'); var thead = el('thead'); var hr = el('tr'); hr.appendChild(el('th', '레벨')); hr.appendChild(el('th', '솔 에르다 조각', 'num')); hr.appendChild(el('th', '솔 에르다', 'num')); thead.appendChild(hr); tbl.appendChild(thead);
      var tb = el('tbody'); part.forEach(function (x) { var tr = el('tr'); cell(tr, 'Lv.' + x.fromLevel + ' → ' + (x.fromLevel + 1), 'label'); cell(tr, x.fragment.input, 'num'); cell(tr, x.erda.input, 'num'); tb.appendChild(tr); });
      tbl.appendChild(tb); cols.appendChild(tbl);
    });
  }
`,
)
