import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 심볼 강화 비용. 위에서 묶음을 고르면 그 묶음의 표 하나가 선다. 세로가 레벨, 가로가 심볼, 칸이 지금 비용이다.
 * 심볼 머리에서 그림 · 이름 · 착용 레벨을, 칸에서 비용을 바로 고친다.
 *
 * 비용은 결정석 가격처럼 지금 줄을 닫고 새 줄을 연다. 고친 칸만 새 줄이 되고 시작은 위의 `새 비용 시작` 이다. 옛 줄은 과거 기록이
 * 읽어 안 건드린다. 새 심볼은 레벨 전부를 한 번에 넣는다. 빈 레벨이 있으면 앱의 구간 합이 틀려서다.
 */
export const SYMBOL_COSTS_HTML = layout(
  '/symbol-costs',
  '심볼 비용',
  `<div class="top"><h1>심볼 비용</h1><span id="groups"></span><span class="grow"></span><span class="updated" id="updated"></span><button id="add-symbol" class="btn sm" type="button">심볼 추가</button><button id="add-group" class="btn ghost sm" type="button">묶음 추가</button></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel">
  <div class="panel-head" id="group-fields"></div>
  <table class="sheet symbol-grid"><thead id="head"></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>칸을 고치면 그 칸만 새 비용 줄이 되고, 지금 줄은 새 비용 시작 날로 닫힌다. 비어 있는 칸은 비용이 없는 레벨이다. 심볼의 지난 줄은 머리의 <b>줄</b> 에서 본다.</p></div>
</section>
<style>
  .symbol-grid th { text-transform: none; letter-spacing: 0; vertical-align: bottom }
  .symbol-grid th .sym { display: grid; justify-items: end; gap: 2px }
  .symbol-grid th .sym .text-in { text-align: right; width: 110px }
  .symbol-grid .num-in { width: 110px }
  .symbol-grid .num-in::placeholder { color: var(--danger-ink) }
</style>
${ASSET_PICKER}
<script>
  var D = null, assets = {}, current = null;
  var batch = editing(function () { load(); });
  function lookup(id) { return assets[id]; }
  function now(level) { return level.costs.filter(function (c) { return c.validUntil === null; })[0] || null; }
  function groupOf(key) { return D.groups.filter(function (g) { return g.key === key; })[0]; }
  var startInput = input('text', 'text-in period'); startInput.placeholder = '2026-10-22';

  function symbolHead(s) {
    var box = el('div', undefined, 'sym'); var name, level, icon;
    var send = function () { return call('PUT', '/symbol-costs/symbols/' + s.key, { name: name.value(), requiredLevel: level.value(), iconAssetId: icon.value() }); };
    icon = assetCell(batch, s.name, s.iconAssetId, send, { categories: ['item', 'item_ring'], uploadCategory: 'item', lookup: lookup, compact: true });
    name = textCell(batch, s.name, s.name, send); level = numCell(batch, s.name, s.requiredLevel, send, 'short');
    var rows = button('줄', 'btn ghost sm'); rows.addEventListener('click', function () { history(s); });
    box.appendChild(inline(icon.input, rows)); box.appendChild(name.input); box.appendChild(inline(span('착용', 'dim'), level.input));
    return box;
  }

  function history(s) {
    var form = el('div', undefined, 'form-body'); var tb = el('tbody');
    s.levels.forEach(function (l) {
      l.costs.slice().reverse().forEach(function (c, i) {
        var tr = el('tr'); cell(tr, i === 0 ? 'Lv.' + l.fromLevel + ' → ' + (l.fromLevel + 1) : '', 'mono'); cell(tr, c.validFrom || '처음부터', 'mono'); cell(tr, c.validUntil || '지금', 'mono'); cell(tr, meso(c.costMeso), 'num');
        if (c.validUntil === null && l.costs.length > 1) {
          var rm = button('거두기', 'btn danger sm');
          rm.addEventListener('click', async function () { if (!window.confirm('Lv.' + l.fromLevel + ' 의 지금 비용 줄을 거둔다. 바로 앞 줄이 다시 열린다.')) return; var x = await call('DELETE', '/symbol-costs/rows/' + c.id); show(x.ok ? '거뒀다' : fail('못 거뒀다', x), !x.ok); if (x.ok) { d.close(); load(); } });
          cell(tr, rm, 'act');
        } else cell(tr, '');
        tb.appendChild(tr);
      });
    });
    form.appendChild(mini(['레벨', '시작', '끝', '비용', ''], tb));
    var left = button('← 앞으로', 'btn ghost sm'), right = button('뒤로 →', 'btn ghost sm');
    var move = async function (direction) { var x = await call('POST', '/symbol-costs/symbols/' + s.key + '/move', { direction: direction }); if (!x.ok) show(fail('못 옮겼다', x), true); d.close(); load(); };
    left.addEventListener('click', function () { move('up'); }); right.addEventListener('click', function () { move('down'); });
    form.appendChild(inline(span('표의 자리', 'dim'), left, right));
    var d = openForm(s.name + ' 비용 줄', form); d.classList.add('mid');
  }

  function render() {
    batch.clear();
    if (!groupOf(current)) current = D.groups.length ? D.groups[0].key : null;
    var nav = document.getElementById('groups'); nav.innerHTML = '';
    nav.appendChild(segButtons(D.groups.map(function (g) { return [g.key, g.name]; }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); }));
    var g = groupOf(current); if (!g) return;
    var gf = document.getElementById('group-fields'); gf.innerHTML = '';
    var name, max, from, to;
    var sendGroup = function () { return call('PUT', '/symbol-costs/groups/' + g.key, { name: name.value(), maxLevel: max.value(), defaultFromLevel: from.value(), defaultToLevel: to.value() }); };
    name = textCell(batch, g.name + ' 묶음', g.name, sendGroup, 'w-name'); max = numCell(batch, g.name + ' 묶음', g.maxLevel, sendGroup, 'short');
    from = numCell(batch, g.name + ' 묶음', g.defaultFromLevel, sendGroup, 'short'); to = numCell(batch, g.name + ' 묶음', g.defaultToLevel, sendGroup, 'short');
    var w1 = el('span', '이름 ', 'rule'); w1.appendChild(name.input); var w2 = el('span', '만렙 ', 'rule'); w2.appendChild(max.input);
    var w3 = el('span', '고르면 서는 범위 Lv.', 'rule'); w3.appendChild(from.input); w3.appendChild(document.createTextNode('→')); w3.appendChild(to.input);
    var w4 = el('span', '새 비용 시작 ', 'rule'); w4.appendChild(startInput);
    [span(g.key, 'mono dim'), w1, w2, w3, span('', 'grow'), w4].forEach(function (x) { gf.appendChild(x); });

    var head = document.getElementById('head'); head.innerHTML = ''; var hr = el('tr'); hr.appendChild(el('th', '레벨'));
    g.symbols.forEach(function (s) { var th = el('th', undefined, 'num'); th.appendChild(symbolHead(s)); hr.appendChild(th); });
    head.appendChild(hr);
    var cells = {};
    g.symbols.forEach(function (s) {
      cells[s.key] = [];
      var send = function () {
        var costs = cells[s.key].filter(function (x) { return x.cell.changed(); }).map(function (x) { return { fromLevel: x.fromLevel, costMeso: x.cell.value() }; });
        return call('POST', '/symbol-costs/symbols/' + s.key + '/costs', { validFrom: orNull(startInput.value), costs: costs });
      };
      s.levels.forEach(function (l) { var c = now(l); var nc = numCell(batch, s.name + ' 비용', c ? c.costMeso : null, send); nc.input.placeholder = '없음'; cells[s.key].push({ fromLevel: l.fromLevel, cell: nc }); });
    });
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    for (var lv = 1; lv < g.maxLevel; lv++) {
      var tr = el('tr'); cell(tr, 'Lv.' + lv + ' → ' + (lv + 1), 'label');
      g.symbols.forEach(function (s) { var x = cells[s.key].filter(function (y) { return y.fromLevel === lv; })[0]; cell(tr, x ? x.cell.input : '', 'num'); });
      tb.appendChild(tr);
    }
    if (g.symbols.length === 0) { var e = el('tr'); var td = cell(e, '심볼이 없다. 심볼 추가로 더한다', 'empty'); td.colSpan = 2; tb.appendChild(e); }
  }

  document.getElementById('add-symbol').addEventListener('click', function () {
    var g = groupOf(current); if (!g) return;
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'tallahart'; var name = input('text'); var level = input('number'); level.min = '1';
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['item', 'item_ring'], uploadCategory: 'item', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    form.appendChild(field('key', '사냥터 표의 지역 key 와 같다', key)); form.appendChild(field('이름', '넥슨 응답의 심볼 이름이 이것으로 끝난다', name));
    form.appendChild(field('착용 레벨', undefined, level)); form.appendChild(field('그림', '아이템 분류의 그림', inline(iconText, pick)));
    form.appendChild(el('p', '더한 뒤 표의 그 심볼 칸에 레벨 전부의 비용을 적고 저장한다.', 'hint'));
    var go = button(g.name + ' 에 더하기', 'btn'); form.appendChild(go); var d = openForm('심볼 추가', form);
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), group: g.key, name: name.value.trim(), requiredLevel: Number(level.value), iconAssetId: icon.id };
      var r = await call('POST', '/symbol-costs/symbols', body);
      show(r.ok ? body.key + ' 를 더했다. 칸에 비용을 적는다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  });
  document.getElementById('add-group').addEventListener('click', function () {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'grand_authentic'; var name = input('text');
    var max = input('number'); max.min = '2'; var from = input('number'); from.min = '1'; var to = input('number'); to.min = '2';
    form.appendChild(field('key', undefined, key)); form.appendChild(field('이름', undefined, name)); form.appendChild(field('만렙', undefined, max));
    form.appendChild(field('고르면 서는 범위', '시작 → 끝', inline(from, document.createTextNode('→'), to)));
    var go = button('묶음 추가', 'btn'); form.appendChild(go); var d = openForm('묶음 추가', form);
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), name: name.value.trim(), maxLevel: Number(max.value), defaultFromLevel: Number(from.value), defaultToLevel: Number(to.value) };
      var r = await call('POST', '/symbol-costs/groups', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); current = body.key; setHashKey(current); load(); }
    });
  });

  async function load() {
    var r = await call('GET', '/symbol-costs/rows'); var a = await call('GET', '/images/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    D = r.json; assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    if (current === null) current = hashKey();
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
