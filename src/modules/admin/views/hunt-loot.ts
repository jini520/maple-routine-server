import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 사냥 전리품. 표 하나에서 이름 · 그림 · NPC 가격 · 기간을 칸에서 고친다. 새 전리품은 작은 창에서 더한다.
 *
 * key 와 종류는 기록이 들어 못 바꾸고 줄은 지우지 않는다. 이벤트가 끝나면 끝 날짜로 닫는다.
 */
export const HUNT_LOOT_HTML = layout(
  '/hunt-loot',
  '사냥 전리품',
  `<div class="top"><h1>사냥 전리품</h1><span class="grow"></span><span class="updated" id="updated"></span><button id="add" class="btn sm" type="button">전리품 추가</button></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel">
  <table class="sheet"><thead><tr><th>#</th><th>종류</th><th>이름 · key</th><th>그림</th><th class="num">NPC 가격</th><th>시작</th><th>끝</th><th></th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>차례가 앱의 차례다. 앱은 종류마다 칸을 두고, 이벤트 칸은 기간 안의 이벤트 아이템이 있을 때만 선다. NPC 가격은 소비에만 있다. 시작은 그날부터, 끝은 그날부터 아니다.</p></div>
</section>
${ASSET_PICKER}
<script>
  var TYPES = [['event', '이벤트'], ['consumable', '소비'], ['fragment', '조각']];
  var TYPE_NAME = { event: '이벤트', consumable: '소비', fragment: '조각' };
  var D = null, assets = {};
  var batch = editing(function () { load(); });
  function lookup(id) { return assets[id]; }
  async function move(item, direction) { var r = await call('POST', '/hunt-loot/' + item.key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }

  function itemRow(item, i, count) {
    var tr = el('tr'); cell(tr, i + 1, 'n'); cell(tr, TYPE_NAME[item.type] || item.type, 'label');
    var name, icon, price, from, until, k = item.key;
    var send = function () { return call('PUT', '/hunt-loot/' + item.key, { name: name.value(), iconAssetId: icon.value(), npcPriceMeso: price ? price.value() : null, validFrom: orNull(from.value()), validUntil: orNull(until.value()) }); };
    name = textCell(batch, k, item.name, send, 'w-name');
    icon = assetCell(batch, k, item.iconAssetId, send, { categories: ['item'], uploadCategory: 'item', lookup: lookup, compact: true });
    var stack = el('div', undefined, 'stack'); stack.appendChild(name.input); stack.appendChild(el('small', item.key)); cell(tr, stack); cell(tr, icon.input);
    if (item.type === 'consumable') { price = numCell(batch, k, item.npcPriceMeso, send, 'mid'); cell(tr, price.input, 'num'); } else cell(tr, '', 'num');
    from = textCell(batch, k, item.validFrom, send, 'period'); from.input.placeholder = '처음부터';
    until = textCell(batch, k, item.validUntil, send, 'period'); until.input.placeholder = '끝없이';
    cell(tr, from.input); cell(tr, until.input);
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'); up.disabled = i === 0; down.disabled = i === count - 1;
    up.addEventListener('click', function () { move(item, 'up'); }); down.addEventListener('click', function () { move(item, 'down'); });
    var act = inline(up, down); act.className = 'inline row-act'; cell(tr, act, 'act');
    return tr;
  }

  function addItem() {
    var form = el('div', undefined, 'form-body'); var grid = el('div', undefined, 'grid2');
    var key = input('text', 'mono'); key.placeholder = 'suspicious_magnifier'; var type = select(TYPES, 'event'); var name = input('text');
    var price = input('number'); price.min = '1'; price.disabled = true; var from = input('text', 'mono'); from.placeholder = '2026-10-22'; var until = input('text', 'mono'); until.placeholder = '2026-11-19';
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['item'], uploadCategory: 'item', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    type.addEventListener('change', function () { price.disabled = type.value !== 'consumable'; });
    grid.appendChild(field('key', '못 바꾼다', key)); grid.appendChild(field('종류', '못 바꾼다', type));
    grid.appendChild(field('이름', undefined, name)); grid.appendChild(field('그림', '아이템 분류의 그림', inline(iconText, pick)));
    grid.appendChild(field('NPC 가격', '소비만', price)); grid.appendChild(el('div'));
    grid.appendChild(field('시작', '비우면 처음부터', from)); grid.appendChild(field('끝', '비우면 끝없이', until));
    form.appendChild(grid); var go = button('전리품 추가', 'btn'); form.appendChild(go);
    var d = openForm('전리품 추가', form); d.classList.add('mid');
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), type: type.value, name: name.value.trim(), iconAssetId: icon.id, npcPriceMeso: type.value === 'consumable' && price.value.trim() !== '' ? Number(price.value) : null, validFrom: orNull(from.value), validUntil: orNull(until.value) };
      var r = await call('POST', '/hunt-loot', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }

  function render() {
    batch.clear();
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    D.items.forEach(function (item, i) { tb.appendChild(itemRow(item, i, D.items.length)); });
    if (D.items.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 8; tb.appendChild(tr); }
  }

  document.getElementById('add').addEventListener('click', addItem);
  async function load() {
    var r = await call('GET', '/hunt-loot/rows'); var a = await call('GET', '/images/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    D = r.json; assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
