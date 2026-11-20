import { ASSET_PICKER } from './asset-picker'
import { subNav } from './edit-kit'
import { layout } from './layout'

const NAV = [
  ['/admin/enhancement-costs', '잠재능력'],
  ['/admin/enhancement-costs/starforce', '스타포스'],
  ['/admin/enhancement-costs/superior', '슈페리얼 장비'],
] as const

/** 세 화면이 함께 쓰는 데이터 읽기와 규칙 저장. 규칙은 이 화면에 있는 것만 보낸다. 다른 화면의 규칙은 건드리지 않는다. */
const COMMON_JS = `
  var GRADES = [['rare', '레어'], ['epic', '에픽'], ['unique', '유니크'], ['legendary', '레전드리']];
  var D = null, R = null;
  var batch = editing(function () { load(); });
  async function data() {
    var r = await call('GET', '/admin/enhancement-costs/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return false; }
    D = r.json;
    var g = await call('GET', '/admin/game-rules'); R = g.ok ? g.json.gameRules : null;
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    return true;
  }
  var ruleCells = {};
  function rulesBody() { var body = {}; Object.keys(ruleCells).forEach(function (k) { body[k] = ruleCells[k].value(); }); return body; }
  function ruleCell(label, unit, field) {
    var w = el('span', undefined, 'rule'); w.appendChild(document.createTextNode(label));
    ruleCells[field] = numCell(batch, '규칙', R ? R[field] : null, function () { return call('PUT', '/admin/game-rules', rulesBody()); }, 'short');
    w.appendChild(ruleCells[field].input); if (unit) w.appendChild(document.createTextNode(unit));
    return w;
  }
  function numField(label, small, placeholder) { var i = input('number'); if (placeholder) i.placeholder = placeholder; return { field: field(label, small, i), input: i }; }
`

function page(current: string, body: string, script: string): string {
  return layout(
    '/admin/enhancement-costs',
    '강화 비용',
    `<div class="top"><h1>강화 비용</h1>${subNav(NAV, current)}<span class="grow"></span><span class="updated" id="updated"></span></div>
<div id="message" class="msg" role="status" hidden></div>
${body}
<script>
${COMMON_JS}
${script}
  load();
</script>`,
  )
}

/**
 * 잠재능력 비용. 감정비용 규칙 둘과, 잠재 · 에디셔널 · 소울 재설정 비용을 같은 등급 칸으로 맞춘 표 하나다.
 * 장비 레벨 이하인 구간 중 가장 큰 것이 그 장비의 줄이라 1 구간은 못 지운다.
 */
export const ENHANCEMENT_POTENTIAL_HTML = page(
  '/admin/enhancement-costs',
  `<section class="panel">
  <div class="panel-head" id="rules"></div>
  <table class="sheet"><thead><tr><th>착용 레벨 구간</th><th class="num">레어</th><th class="num">에픽</th><th class="num">유니크</th><th class="num">레전드리</th><th></th></tr></thead><tbody id="rows"></tbody></table>
</section>`,
  `
  var TYPES = [['potential', '잠재능력 재설정'], ['additional', '에디셔널 잠재능력 재설정']];
  function bandsOf(type) { var l = []; D.potentialResetCosts.forEach(function (c) { if (c.type === type && l.indexOf(c.minRequiredLevel) < 0) l.push(c.minRequiredLevel); }); return l.sort(function (a, b) { return a - b; }); }
  function costOf(type, lv, grade) { var c = D.potentialResetCosts.filter(function (x) { return x.type === type && x.minRequiredLevel === lv && x.grade === grade; })[0]; return c ? c.costMeso : null; }
  function groupRow(title, type) {
    var tr = el('tr', undefined, 'group'); var td = document.createElement('td'); td.colSpan = 6; td.appendChild(document.createTextNode(title));
    if (type) { var add = button('구간 추가', 'btn ghost sm'); add.addEventListener('click', function () { addBand(type, title); }); td.appendChild(add); }
    tr.appendChild(td); return tr;
  }
  function addBand(type, title) {
    var box = el('div', undefined, 'form-body'); var lv = numField('구간 시작', '착용 레벨', '275'); box.appendChild(lv.field);
    var costs = {}; GRADES.forEach(function (g) { var f = numField(g[1], '메소'); costs[g[0]] = f.input; box.appendChild(f.field); });
    var go = button('구간 추가', 'btn'); box.appendChild(go);
    var d = openForm(title + ' 구간 추가', box);
    go.addEventListener('click', async function () {
      var body = { type: type, minRequiredLevel: Number(lv.input.value), costs: {} };
      GRADES.forEach(function (g) { body.costs[g[0]] = Number(costs[g[0]].value); });
      var r = await call('POST', '/admin/enhancement-costs/potential', body);
      show(r.ok ? body.minRequiredLevel + ' 구간을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }
  function render() {
    batch.clear(); ruleCells = {};
    var rules = document.getElementById('rules'); rules.innerHTML = '';
    rules.appendChild(ruleCell('감정비용 무료 상한', '레벨', 'cubeAppraisalFreeMaxLevel'));
    rules.appendChild(ruleCell('감정비용 계수', '', 'cubeAppraisalCoefficient'));
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    TYPES.forEach(function (t) {
      tb.appendChild(groupRow(t[1], t[0]));
      bandsOf(t[0]).forEach(function (lv) {
        var tr = el('tr'); cell(tr, lv + ' 이상', 'label');
        GRADES.forEach(function (g) {
          var url = '/admin/enhancement-costs/potential/' + t[0] + '/' + lv + '/' + g[0];
          var c = numCell(batch, (t[0] === 'potential' ? '잠재' : '에디셔널') + ' ' + lv + ' ' + g[1], costOf(t[0], lv, g[0]), function () { return call('PUT', url, { costMeso: c.value() }); });
          cell(tr, c.input, 'num');
        });
        var rm = button('지우기', 'btn danger sm row-act');
        if (lv === 1) rm.hidden = true;
        rm.addEventListener('click', async function () { if (!window.confirm(t[1] + ' ' + lv + ' 구간을 등급 넷과 함께 지운다.')) return; var r = await call('DELETE', '/admin/enhancement-costs/potential/' + t[0] + '/' + lv); show(r.ok ? lv + ' 구간을 지웠다' : fail('못 지웠다', r), !r.ok); load(); });
        cell(tr, rm, 'act'); tb.appendChild(tr);
      });
    });
    tb.appendChild(groupRow('소울 잠재능력 재설정 (장비 레벨을 안 본다)', null));
    var soul = el('tr'); cell(soul, '-', 'label');
    GRADES.forEach(function (g) {
      var c0 = D.soulPotentialResetCosts.filter(function (x) { return x.grade === g[0]; })[0];
      var c = numCell(batch, '소울 ' + g[1], c0 ? c0.costMeso : null, function () { return call('PUT', '/admin/enhancement-costs/soul/' + g[0], { costMeso: c.value() }); });
      cell(soul, c.input, 'num');
    });
    cell(soul, ''); tb.appendChild(soul);
  }
  async function load() { if (await data()) render(); }
`,
)

/** 스타포스 비용. 파괴 방지 추가분과 시도 전 성수마다의 지수 · 제수다. 0 부터 빠짐없이 있어야 해서 끝 성수만 더하고 지운다. */
export const ENHANCEMENT_STARFORCE_HTML = page(
  '/admin/enhancement-costs/starforce',
  `<section class="panel">
  <div class="panel-head"><span id="rule"></span><span class="grow"></span><button id="add" class="btn ghost sm" type="button">끝 성수 더하기</button><button id="remove" class="btn danger sm" type="button">끝 성수 지우기</button></div>
  <div class="steps" id="steps"></div>
</section>
<style>.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px }</style>`,
  `
  function render() {
    batch.clear(); ruleCells = {};
    var rule = document.getElementById('rule'); rule.innerHTML = ''; rule.appendChild(ruleCell('파괴 방지 추가분', '%', 'starforceDestroyDefenceSurchargePercent'));
    var steps = document.getElementById('steps'); steps.innerHTML = '';
    var list = D.starforceCostSteps, per = Math.max(1, Math.ceil(list.length / 3));
    for (var col = 0; col < 3; col++) {
      var t = el('table', undefined, 'sheet'); var thead = el('thead'); var hr = el('tr');
      hr.appendChild(el('th', '성수')); hr.appendChild(el('th', '지수', 'num')); hr.appendChild(el('th', '제수', 'num')); thead.appendChild(hr); t.appendChild(thead);
      var tb = el('tbody');
      list.slice(col * per, (col + 1) * per).forEach(function (s) {
        var tr = el('tr'); cell(tr, s.fromStar + ' → ' + (s.fromStar + 1), 'label');
        var key = s.fromStar + '성', url = '/admin/enhancement-costs/starforce/' + s.fromStar;
        var send = function () { return call('PUT', url, { exponent: e.value(), divisor: d.value() }); };
        var e = numCell(batch, key, s.exponent, send, 'short'), d = numCell(batch, key, s.divisor, send, 'short');
        cell(tr, e.input, 'num'); cell(tr, d.input, 'num'); tb.appendChild(tr);
      });
      t.appendChild(tb); steps.appendChild(t);
    }
  }
  document.getElementById('add').addEventListener('click', function () {
    var last = D.starforceCostSteps[D.starforceCostSteps.length - 1], next = last ? last.fromStar + 1 : 0;
    var box = el('div', undefined, 'form-body'); var e = numField('지수', undefined, '2.7'), d = numField('제수', undefined, '200');
    e.input.step = '0.1'; box.appendChild(e.field); box.appendChild(d.field); var go = button(next + ' → ' + (next + 1) + ' 더하기', 'btn'); box.appendChild(go);
    var dlg = openForm('끝 성수 더하기', box);
    go.addEventListener('click', async function () { var r = await call('POST', '/admin/enhancement-costs/starforce', { exponent: Number(e.input.value), divisor: Number(d.input.value) }); show(r.ok ? next + ' 성을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { dlg.close(); load(); } });
  });
  document.getElementById('remove').addEventListener('click', async function () {
    var last = D.starforceCostSteps[D.starforceCostSteps.length - 1]; if (!last) return;
    if (!window.confirm(last.fromStar + ' → ' + (last.fromStar + 1) + ' 단계를 지운다.')) return;
    var r = await call('DELETE', '/admin/enhancement-costs/starforce/last'); show(r.ok ? last.fromStar + ' 성을 지웠다' : fail('못 지웠다', r), !r.ok); load();
  });
  async function load() { if (await data()) render(); }
`,
)

/** 슈페리얼 장비. 계열마다 단 하나이고, 단에 스타포스 1회 비용과 장비 목록이 있다. 장비를 누르면 그림을 바꾼다. */
export const ENHANCEMENT_SUPERIOR_HTML = page(
  '/admin/enhancement-costs/superior',
  `<div class="panel-head"><p>계열마다 스타포스 1회 비용이 하나다. 성수 · 이벤트 할인 · MVP 할인 · 파괴 방지와 상관없다. 앱은 넥슨 응답의 장비 이름을 공백을 지운 뒤 아래 이름과 맞춘다</p><span class="grow"></span><button id="add-series" class="btn ghost sm" type="button">계열 추가</button><button id="add-item" class="btn sm" type="button">장비 추가</button></div>
<div class="series-cols" id="cols"></div>
<style>
  .series-cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; align-items: start }
  .series-col { background: var(--surface); border-radius: var(--r-card); box-shadow: var(--shadow); padding: 14px 12px 10px }
  .series-col header { display: grid; gap: 6px; padding: 0 4px 10px }
  .series-col header .name { display: flex; align-items: center; gap: 8px }
  .series-col header .name .text-in { flex: 1; font-weight: 600; font-size: 14px }
  .series-col header .name span { white-space: nowrap }
  .series-col header .rule { justify-content: space-between }
  .gear { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 7px; font-size: 12.5px }
  .gear:hover { background: var(--fill) }
  .gear .pick { display: flex; align-items: center; gap: 8px; flex: 1; padding: 0; border: 0; background: transparent; font: inherit; color: var(--text); text-align: left; cursor: pointer }
  .gear img, .gear .noimg { width: 24px; height: 24px; object-fit: contain; image-rendering: pixelated; border-radius: 5px; background: var(--surface-2); flex: none }
  .gear .del { visibility: hidden }
  .gear:hover .del { visibility: visible }
</style>
${ASSET_PICKER}`,
  `
  var assets = {};
  function render() {
    batch.clear();
    var cols = document.getElementById('cols'); cols.innerHTML = '';
    D.superiorSeries.forEach(function (s) {
      var items = D.superiorItems.filter(function (i) { return i.seriesKey === s.key; });
      var col = el('section', undefined, 'series-col'), h = el('header'), n = el('div', undefined, 'name');
      var key = s.key, send = function () { return call('PUT', '/admin/enhancement-costs/superior-series/' + key, { name: name.value(), starforceCostMeso: cost.value() }); };
      var name = textCell(batch, s.name, s.name, send);
      n.appendChild(name.input); n.appendChild(span(s.key, 'mono dim')); n.appendChild(span(items.length + '개', 'dim')); h.appendChild(n);
      var r = el('span', undefined, 'rule'); r.appendChild(document.createTextNode('스타포스 1회 비용')); var cost = numCell(batch, s.name, s.starforceCostMeso, send); r.appendChild(cost.input); h.appendChild(r);
      col.appendChild(h);
      items.forEach(function (i) {
        var g = el('div', undefined, 'gear'), pick = button('', 'pick'), a = i.iconAssetId ? assets[i.iconAssetId] : null;
        if (a) { var img = el('img'); img.src = '/assets/' + a.file; img.alt = ''; pick.appendChild(img); } else pick.appendChild(el('span', undefined, 'noimg'));
        pick.appendChild(span(i.name)); pick.title = '그림 바꾸기';
        pick.addEventListener('click', function () {
          openAssetPicker({ categories: ['item'], uploadCategory: 'item', current: i.iconAssetId, onPick: async function (f) {
            if (f === null) { show('그림은 비울 수 없다. 다른 그림을 고른다', true); return; }
            var x = await call('PUT', '/admin/enhancement-costs/superior-items/' + encodeURIComponent(i.name) + '/icon', { iconAssetId: f.id });
            show(x.ok ? i.name + ' 의 그림을 바꿨다' : fail('못 바꿨다', x), !x.ok); if (x.ok) load();
          } });
        });
        var del = button('지우기', 'btn danger sm del');
        del.addEventListener('click', async function () { if (!window.confirm(i.name + ' 을 지운다.')) return; var x = await call('DELETE', '/admin/enhancement-costs/superior-items/' + encodeURIComponent(i.name)); show(x.ok ? i.name + ' 을 지웠다' : fail('못 지웠다', x), !x.ok); load(); });
        g.appendChild(pick); g.appendChild(del); col.appendChild(g);
      });
      cols.appendChild(col);
    });
  }
  document.getElementById('add-series').addEventListener('click', function () {
    var box = el('div', undefined, 'form-body'), k = input('text'), n = input('text'), c = numField('스타포스 1회 비용', '메소');
    k.placeholder = 'tyrant'; n.placeholder = '타일런트'; box.appendChild(field('key', undefined, k)); box.appendChild(field('계열', undefined, n)); box.appendChild(c.field);
    var go = button('계열 추가', 'btn'); box.appendChild(go); var d = openForm('계열 추가', box);
    go.addEventListener('click', async function () { var r = await call('POST', '/admin/enhancement-costs/superior-series', { key: k.value.trim(), name: n.value.trim(), starforceCostMeso: Number(c.input.value) }); show(r.ok ? n.value.trim() + ' 계열을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); } });
  });
  document.getElementById('add-item').addEventListener('click', function () {
    var box = el('div', undefined, 'form-body'), n = input('text'), s = select(D.superiorSeries.map(function (x) { return [x.key, x.name]; }));
    n.placeholder = '타일런트 리카온 벨트'; box.appendChild(field('장비 이름', '넥슨 표기', n)); box.appendChild(field('계열', undefined, s));
    var go = button('장비 추가', 'btn'); box.appendChild(go); var d = openForm('장비 추가', box);
    go.addEventListener('click', async function () { var r = await call('POST', '/admin/enhancement-costs/superior-items', { name: n.value.trim(), seriesKey: s.value }); show(r.ok ? n.value.trim() + ' 을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); } });
  });
  async function load() {
    var a = await call('GET', '/admin/assets/list');
    if (a.ok) { assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; }); }
    if (await data()) render();
  }
`,
)
