import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 사냥터. 왼쪽은 지역, 오른쪽은 고른 지역의 이름 · 힘 · 아이콘과 그 지역의 사냥터다. 사냥터의 포스 · 마릿수 · 몬스터 레벨 · 인기를
 * 칸에서 바로 고친다.
 *
 * 지역 key 와 사냥터 key 는 기록이 들어 못 바꾸고 지우지 않는다. 사냥터 key 는 지역 key 를 접두로 받고, 레벨은 `217, 219` 처럼
 * 적는다. 지역의 차례는 파일의 차례이고 앱은 역순으로 세운다. 계산 상수(분당 8젠 · 레벨 × 7.5 · 페널티 표)는 앱 코드에 있다.
 */
export const HUNTING_GROUNDS_HTML = layout(
  '/hunting-grounds',
  '사냥터',
  `<div class="top"><h1>사냥터</h1><span class="grow"></span><span class="updated" id="updated"></span><button id="add-region" class="btn ghost sm" type="button">지역 추가</button></div>
<div id="message" class="msg" role="status" hidden></div>
<div class="split"><nav class="picklist" id="list" aria-label="지역"></nav><section class="panel" id="detail"></section></div>
${ASSET_PICKER}
<script>
  var FORCES = [['arcane', '아케인'], ['authentic', '어센틱']];
  var D = null, assets = {}, current = null;
  var batch = editing(function () { load(); });
  function lookup(id) { return assets[id]; }
  function groundsOf(regionKey) { return D.grounds.filter(function (g) { return g.region === regionKey; }); }
  function levelsOf(groundKey) { return D.groundLevels.filter(function (l) { return l.ground === groundKey; }).map(function (l) { return l.mobLevel; }); }
  function parseLevels(text) { return text.split(/[,\\s]+/).filter(function (s) { return s !== ''; }).map(Number); }
  async function post(url, body, okText) { var x = await call('POST', url, body); if (!x.ok) show(fail('못 했다', x), true); else if (okText) show(okText, false); load(); return x; }

  function renderDetail(r) {
    var box = document.getElementById('detail'); box.innerHTML = '';
    if (!r) { box.appendChild(el('p', '지역이 없다', 'dim')); return; }
    var head = el('div', undefined, 'panel-head'); var icon, name, force;
    var sendRegion = function () { return call('PUT', '/hunting-grounds/regions/' + r.key, { name: name.value(), forceType: force.value(), iconAssetId: icon.value() }); };
    icon = assetCell(batch, r.key, r.iconAssetId, sendRegion, { categories: ['map_icon'], uploadCategory: 'map_icon', lookup: lookup, nullable: true, compact: true });
    name = textCell(batch, r.key, r.name, sendRegion, 'w-name'); force = selectCell(batch, r.key, r.forceType, sendRegion, FORCES);
    head.appendChild(icon.input); head.appendChild(span(r.key, 'mono dim'));
    var w1 = el('span', '이름 ', 'rule'); w1.appendChild(name.input); var w2 = el('span', '힘 ', 'rule'); w2.appendChild(force.input); head.appendChild(w1); head.appendChild(w2);
    head.appendChild(span('', 'grow'));
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'); up.title = '지역을 앞으로'; down.title = '지역을 뒤로';
    up.addEventListener('click', function () { post('/hunting-grounds/regions/' + r.key + '/move', { direction: 'up' }); });
    down.addEventListener('click', function () { post('/hunting-grounds/regions/' + r.key + '/move', { direction: 'down' }); });
    var add = button('사냥터 추가', 'btn ghost sm'); add.addEventListener('click', function () { addGround(r); });
    head.appendChild(inline(up, down)); head.appendChild(add); box.appendChild(head);

    var tb = el('tbody');
    groundsOf(r.key).forEach(function (g, i) {
      var tr = el('tr'); cell(tr, i + 1, 'n'); cell(tr, g.key.slice(r.key.length + 1), 'label clip').title = g.key;
      var gname, req, mobs, levels;
      var send = function () { return call('PUT', '/hunting-grounds/grounds/' + g.key, { name: gname.value(), requiredForce: req.value(), mobQuantity: mobs.value(), mobLevels: parseLevels(levels.value()) }); };
      gname = textCell(batch, g.name, g.name, send, 'w-mid'); req = numCell(batch, g.name, g.requiredForce, send, 'short'); mobs = numCell(batch, g.name, g.mobQuantity, send, 'short');
      levels = textCell(batch, g.name, levelsOf(g.key).join(', '), send, 'w-unit');
      var popular = checkCell(batch, g.name + ' 인기', g.isPopular, function () { return call('PUT', '/hunting-grounds/grounds/' + g.key + '/popular', { isPopular: popular.value() }); }, '인기');
      cell(tr, gname.input); cell(tr, req.input, 'num'); cell(tr, mobs.input, 'num'); cell(tr, levels.input); cell(tr, popular.input);
      var gu = button('↑', 'btn ghost sm'), gd = button('↓', 'btn ghost sm');
      gu.addEventListener('click', function () { post('/hunting-grounds/grounds/' + g.key + '/move', { direction: 'up' }); });
      gd.addEventListener('click', function () { post('/hunting-grounds/grounds/' + g.key + '/move', { direction: 'down' }); });
      var act = inline(gu, gd); act.className = 'inline row-act'; cell(tr, act, 'act');
      tb.appendChild(tr);
    });
    if (groundsOf(r.key).length === 0) { var e = el('tr'); var td = cell(e, '사냥터가 없다', 'empty'); td.colSpan = 8; tb.appendChild(e); }
    var t = el('table', undefined, 'sheet tight'); var thead = el('thead'); var hr = el('tr');
    ['#', 'key', '이름', '포스', '마릿수', '몬스터 레벨', '인기', ''].forEach(function (h, i) { var th = el('th', h); if (i === 3 || i === 4) th.className = 'num'; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead); t.appendChild(tb); box.appendChild(t);
    box.appendChild(el('p', '차례는 레벨 차이 · 마릿수가 같을 때의 차례다. 이름은 전역에서 유일하다. 몬스터 레벨이 둘이면 레벨마다 재서 평균낸다.', 'hint'));
  }

  function addGround(r) {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'weathered_land_of_joy'; var name = input('text');
    var force = input('number'); force.min = '0'; var mobs = input('number'); mobs.min = '1'; var levels = input('text', 'mono'); levels.placeholder = '217, 219';
    var grid = el('div', undefined, 'grid2');
    grid.appendChild(field('key', r.key + '_ 뒤에 붙는다. 못 바꾼다', key)); grid.appendChild(field('이름', '전역에서 유일해야 한다', name));
    grid.appendChild(field('포스', (r.forceType === 'arcane' ? '아케인' : '어센틱') + ' 포스 요구치', force)); grid.appendChild(field('마릿수', '맵에 한 번에 뜨는 수', mobs));
    grid.appendChild(field('몬스터 레벨', '쉼표로 적는다', levels));
    form.appendChild(grid); var go = button('사냥터 추가', 'btn'); form.appendChild(go);
    var d = openForm(r.name + ' 사냥터 추가', form); d.classList.add('mid');
    go.addEventListener('click', async function () {
      var body = { key: r.key + '_' + key.value.trim(), region: r.key, name: name.value.trim(), requiredForce: Number(force.value), mobQuantity: Number(mobs.value), mobLevels: parseLevels(levels.value) };
      var x = await call('POST', '/hunting-grounds/grounds', body);
      show(x.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', x), !x.ok); if (x.ok) { d.close(); load(); }
    });
  }

  function render() {
    batch.clear();
    if (current === null) current = hashKey();
    if (!D.regions.some(function (r) { return r.key === current; })) current = D.regions.length ? D.regions[0].key : null;
    pickList(document.getElementById('list'), D.regions.map(function (r) { return { key: r.key, title: r.name, meta: groundsOf(r.key).length + (r.forceType === 'arcane' ? ' 아케인' : ' 어센틱') }; }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); });
    renderDetail(D.regions.filter(function (r) { return r.key === current; })[0]);
  }

  document.getElementById('add-region').addEventListener('click', function () {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'geardrak'; var name = input('text'); var force = select(FORCES, 'authentic');
    var icon = { id: null }; var iconText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['map_icon'], uploadCategory: 'map_icon', current: icon.id, onPick: function (f) { icon.id = f ? f.id : null; iconText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    form.appendChild(field('key', '못 바꾼다', key)); form.appendChild(field('이름', undefined, name)); form.appendChild(field('힘 종류', undefined, force)); form.appendChild(field('지역 아이콘', '지역 아이콘 분류의 그림', inline(iconText, pick)));
    var go = button('지역 추가', 'btn'); form.appendChild(go); var d = openForm('지역 추가', form);
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), name: name.value.trim(), forceType: force.value, iconAssetId: icon.id };
      var x = await call('POST', '/hunting-grounds/regions', body);
      show(x.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', x), !x.ok); if (x.ok) { d.close(); current = body.key; setHashKey(current); load(); }
    });
  });

  async function load() {
    var x = await call('GET', '/hunting-grounds/rows'); var a = await call('GET', '/images/list');
    if (!x.ok || !a.ok) { show('못 읽었다 ' + (x.ok ? a.status : x.status), true); return; }
    D = x.json; assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
