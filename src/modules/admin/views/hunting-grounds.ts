import { layout } from './layout'

/**
 * 사냥터 참조표. 위는 새 지역 폼, 아래는 지역 표다. 지역을 펼치면 그 아래로 사냥터 줄과 새 사냥터 폼이 선다.
 *
 * 지역 key 와 사냥터 key 는 기록이 들어 못 바꾸고 지우지 않는다. 사냥터 key 는 지역 key 를 접두로 받고, 레벨은 `217, 219`
 * 처럼 적는다.
 */
export const HUNTING_GROUNDS_HTML = layout(
  '/admin/hunting-grounds',
  '사냥터',
  `<div class="head">
  <div>
    <h1>사냥터</h1>
    <p>사냥 계산기의 참조표다. 지역의 차례는 파일의 차례이고 앱은 역순으로 세운다. 사냥터의 포스 · 마릿수 · 몬스터 레벨이 메소를 정한다. 계산 상수(분당 8젠 · 레벨 × 7.5 · 페널티 표)는 앱 코드에 있다. 바꾸면 <code>huntingGrounds.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-regions">–</b><span>지역</span></div>
    <div class="stat"><b id="stat-grounds">–</b><span>사냥터</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 지역</h2><p>key 는 snake_case 이고 한 번 정하면 못 바꾼다. 지역은 맨 뒤에 선다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="n-key">key</label><input id="n-key" class="mono" placeholder="geardrak"></div>
    <div class="field"><label for="n-name">이름</label><input id="n-name" placeholder="기어드락"></div>
    <div class="field w-md"><label for="n-force">힘 종류</label><select id="n-force"></select></div>
    <div class="field"><label for="n-map">지역 아이콘 (maps/icons)</label><input id="n-map" class="mono" placeholder="geardrak"></div>
    <button id="n-add" class="btn" type="button">지역 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>지역</h2><p id="count"></p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>힘</th><th>지역 아이콘</th><th class="num">사냥터</th><th></th></tr></thead><tbody id="regions"></tbody></table></div>
</section>
<script>
  var FORCES = [['arcane', '아케인'], ['authentic', '어센틱']];
  var state = { data: null, open: null, editingRegion: null, editingGround: null };

  function nameOf(pairs, key) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === key) return pairs[i][1]; return key; }
  function groundsOf(regionKey) { return state.data.grounds.filter(function (g) { return g.region === regionKey; }); }
  function levelsOf(groundKey) { return state.data.groundLevels.filter(function (l) { return l.ground === groundKey; }).map(function (l) { return l.level; }); }
  function parseLevels(text) { return text.split(/[,\\s]+/).filter(function (s) { return s !== ''; }).map(Number); }

  function regionRow(r, i) {
    var isOpen = state.open === r.key, editing = state.editingRegion === r.key;
    var tr = el('tr', undefined, isOpen || editing ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, r.key, 'mono');
    if (!editing) {
      cell(tr, r.name); cell(tr, span(nameOf(FORCES, r.forceType), 'tag')); cell(tr, r.iconMap || '-', 'mono'); cell(tr, groundsOf(r.key).length, 'num');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm'), toggle = button(isOpen ? '접기' : '사냥터', 'btn ghost sm');
      up.addEventListener('click', async function () { var x = await call('POST', '/admin/hunting-grounds/regions/' + r.key + '/move', { direction: 'up' }); if (!x.ok) show(fail('못 옮겼다', x), true); load(); });
      down.addEventListener('click', async function () { var x = await call('POST', '/admin/hunting-grounds/regions/' + r.key + '/move', { direction: 'down' }); if (!x.ok) show(fail('못 옮겼다', x), true); load(); });
      edit.addEventListener('click', function () { state.editingRegion = r.key; render(); });
      toggle.addEventListener('click', function () { state.open = isOpen ? null : r.key; state.editingGround = null; render(); });
      cell(tr, inline(up, down, edit, toggle), 'act'); return tr;
    }
    var name = input('text'); name.value = r.name; var force = select(FORCES, r.forceType); var iconMap = input('text', 'mono'); iconMap.value = r.iconMap || '';
    cell(tr, name); cell(tr, force); cell(tr, iconMap); cell(tr, groundsOf(r.key).length, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var x = await call('PUT', '/admin/hunting-grounds/regions/' + r.key, { name: name.value.trim(), forceType: force.value, iconMap: orNull(iconMap.value) });
      show(x.ok ? r.key + ' 를 적었다' : fail('못 적었다', x), !x.ok); if (x.ok) state.editingRegion = null; load();
    });
    close.addEventListener('click', function () { state.editingRegion = null; render(); });
    cell(tr, inline(save, close), 'act'); return tr;
  }

  function groundsRow(r) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 7;
    var box = el('div', undefined, 'editor'); box.appendChild(el('h3', r.name + ' 의 사냥터. 차례는 레벨 차이 · 마릿수가 동률일 때의 차례다'));
    var tbody = el('tbody');
    groundsOf(r.key).forEach(function (g, i) {
      var row = el('tr', undefined, state.editingGround === g.key ? 'open' : '');
      cell(row, i + 1, 'n'); cell(row, g.key.slice(r.key.length + 1), 'mono'); cell(row, g.name);
      cell(row, g.force, 'num'); cell(row, g.mobs, 'num'); cell(row, 'lv.' + levelsOf(g.key).join('-'), 'mono');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var x = await call('POST', '/admin/hunting-grounds/grounds/' + g.key + '/move', { direction: 'up' }); if (!x.ok) show(fail('못 옮겼다', x), true); load(); });
      down.addEventListener('click', async function () { var x = await call('POST', '/admin/hunting-grounds/grounds/' + g.key + '/move', { direction: 'down' }); if (!x.ok) show(fail('못 옮겼다', x), true); load(); });
      edit.addEventListener('click', function () { state.editingGround = state.editingGround === g.key ? null : g.key; render(); });
      cell(row, inline(up, down, edit), 'act');
      tbody.appendChild(row);
    });
    box.appendChild(mini(['#', 'key (지역 접두 뒤)', '이름', '포스', '마릿수', '레벨', ''], tbody));
    var editing = groundsOf(r.key).filter(function (g) { return g.key === state.editingGround; })[0] || null;
    box.appendChild(groundForm(r, editing));
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  // 폼 하나로 새 사냥터와 수정을 다 한다. g 가 null 이면 새 사냥터이고 지역 맨 뒤에 선다.
  function groundForm(r, g) {
    var box = el('div', undefined, 'sub'); box.appendChild(el('h3', g ? g.key + ' 수정' : '새 사냥터. 지역 맨 뒤에 선다'));
    var key = input('text', 'mono'); key.placeholder = 'weathered_land_of_joy';
    var name = input('text'); var force = input('number'); force.min = '0'; var mobs = input('number'); mobs.min = '1';
    var levels = input('text', 'mono'); levels.placeholder = '217, 219';
    if (g) { name.value = g.name; force.value = g.force; mobs.value = g.mobs; levels.value = levelsOf(g.key).join(', '); }
    var grid = el('div', undefined, 'grid2');
    if (!g) grid.appendChild(field('key', '지역 key ' + r.key + '_ 뒤에 붙는다. 한 번 정하면 못 바꾼다', key));
    grid.appendChild(field('이름', '전역에서 유일해야 한다', name));
    grid.appendChild(field('포스', nameOf(FORCES, r.forceType) + ' 포스 요구치', force));
    grid.appendChild(field('마릿수', '맵에 한 번에 뜨는 수', mobs));
    grid.appendChild(field('몬스터 레벨', '쉼표로 적는다. 둘이면 레벨마다 재서 평균낸다', levels));
    box.appendChild(grid);
    function body() { return { name: name.value.trim(), force: Number(force.value), mobs: Number(mobs.value), levels: parseLevels(levels.value) }; }
    var actions = el('div', undefined, 'actions');
    if (g) {
      var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
      save.addEventListener('click', async function () { var x = await call('PUT', '/admin/hunting-grounds/grounds/' + g.key, body()); show(x.ok ? g.key + ' 를 적었다' : fail('못 적었다', x), !x.ok); if (x.ok) state.editingGround = null; load(); });
      close.addEventListener('click', function () { state.editingGround = null; render(); });
      actions.appendChild(save); actions.appendChild(close);
    } else {
      var add = button('사냥터 추가', 'btn sm');
      add.addEventListener('click', async function () {
        var b = body(); b.key = r.key + '_' + key.value.trim(); b.region = r.key;
        var x = await call('POST', '/admin/hunting-grounds/grounds', b); show(x.ok ? b.key + ' 를 더했다' : fail('더하지 못했다', x), !x.ok); load();
      });
      actions.appendChild(add);
    }
    box.appendChild(actions); return box;
  }

  function render() {
    var regions = document.getElementById('regions'); regions.innerHTML = '';
    state.data.regions.forEach(function (r, i) { regions.appendChild(regionRow(r, i)); if (state.open === r.key) regions.appendChild(groundsRow(r)); });
    if (state.data.regions.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 7; regions.appendChild(tr); }
    document.getElementById('count').textContent = state.data.regions.length + '지역 · ' + state.data.grounds.length + '사냥터. 차례가 곧 파일의 차례이고 앱은 역순이다';
  }

  FORCES.forEach(function (f) { var o = document.createElement('option'); o.value = f[0]; o.textContent = f[1]; document.getElementById('n-force').appendChild(o); });
  document.getElementById('n-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('n-key').value.trim(), name: document.getElementById('n-name').value.trim(), forceType: document.getElementById('n-force').value, iconMap: orNull(document.getElementById('n-map').value) };
    var x = await call('POST', '/admin/hunting-grounds/regions', body);
    show(x.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', x), !x.ok);
    if (x.ok) { document.getElementById('n-key').value = ''; document.getElementById('n-name').value = ''; document.getElementById('n-map').value = ''; }
    load();
  });

  async function load() {
    var x = await call('GET', '/admin/hunting-grounds/rows');
    if (!x.ok) { show('못 읽었다 ' + x.status, true); return; }
    state.data = x.json;
    document.getElementById('stat-regions').textContent = x.json.regions.length;
    document.getElementById('stat-grounds').textContent = x.json.grounds.length;
    document.getElementById('stat-updated').textContent = x.json.updatedAt ? when(x.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
