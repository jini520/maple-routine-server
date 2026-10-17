import { layout } from './layout'

/**
 * 심볼 강화 비용. 묶음마다 표 하나다. 가로가 레벨, 세로가 심볼, 칸이 지금 비용이다. 심볼 줄의 수정을 누르면 그 아래로
 * 레벨마다 새 비용 칸과 시작일이 펼쳐진다.
 *
 * 새 비용은 결정석 가격처럼 지금 줄을 닫고 새 줄을 연다. 바뀐 칸만 새 줄이 된다. 옛 줄은 과거 기록이 읽어 안 건드린다.
 * 새 심볼은 레벨 전부를 한 번에 넣는다. 빈 레벨이 있으면 앱의 구간 합이 틀려서다.
 */
export const SYMBOL_COSTS_HTML = layout(
  '/admin/symbol-costs',
  '심볼 비용',
  `<div class="head">
  <div>
    <h1>심볼 비용</h1>
    <p>Lv.n → n+1 로 올리는 메소다. 패치로 값이 바뀌면 시작일을 적고 바뀐 칸을 고친다. 지금 줄이 그 날로 닫히고 새 줄이 선다. 옛 줄은 과거 기록이 읽어 그대로 둔다. 바꾸면 <code>symbolCosts.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-groups">–</b><span>묶음</span></div>
    <div class="stat"><b id="stat-symbols">–</b><span>심볼</span></div>
    <div class="stat"><b id="stat-missing">–</b><span>비용 없는 칸</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<div id="groups"></div>
<section class="card">
  <header><h2>새 심볼</h2><p>key 는 사냥터 표의 지역 key 와 같다. 더한 뒤 그 줄의 수정에서 레벨 전부의 비용을 한 번에 넣는다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="s-key">key</label><input id="s-key" class="mono" placeholder="tallahart"></div>
    <div class="field w-md"><label for="s-group">묶음</label><select id="s-group"></select></div>
    <div class="field"><label for="s-name">이름 <small>넥슨 응답의 심볼 이름이 이것으로 끝난다</small></label><input id="s-name" placeholder="탈라하트"></div>
    <div class="field w-sm"><label for="s-level">착용 레벨</label><input id="s-level" type="number" min="1"></div>
    <div class="field"><label for="s-icon">그림 파일 <small>src/assets/items/</small></label><input id="s-icon" class="mono" placeholder="grand_authentic_symbol_tallahart.webp"></div>
    <button id="s-add" class="btn" type="button">심볼 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>새 묶음</h2><p>심볼 종류가 하나 더 생길 때. 만렙과 심볼을 고르면 서는 기본 범위를 든다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="n-key">key</label><input id="n-key" class="mono" placeholder="grand_authentic"></div>
    <div class="field"><label for="n-name">이름</label><input id="n-name" placeholder="그랜드 어센틱 심볼"></div>
    <div class="field w-sm"><label for="n-max">만렙</label><input id="n-max" type="number" min="2"></div>
    <div class="field w-sm"><label for="n-from">기본 시작</label><input id="n-from" type="number" min="1"></div>
    <div class="field w-sm"><label for="n-to">기본 끝</label><input id="n-to" type="number" min="2"></div>
    <button id="n-add" class="btn" type="button">묶음 추가</button>
  </div></div>
</section>
<script>
  var state = { data: null, open: null, editingGroup: null };
  function current(level) { return level.costs.filter(function (c) { return c.until === null; })[0] || null; }

  function groupCard(g) {
    var card = el('section', undefined, 'card'); var header = el('header');
    if (state.editingGroup === g.key) {
      var name = input('text'); name.value = g.name; var max = input('number'); max.min = '2'; max.value = g.maxLevel;
      var from = input('number'); from.min = '1'; from.value = g.defaultFrom; var to = input('number'); to.min = '2'; to.value = g.defaultTo;
      var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
      save.addEventListener('click', async function () {
        var r = await call('PUT', '/admin/symbol-costs/groups/' + g.key, { name: name.value.trim(), maxLevel: Number(max.value), defaultFrom: Number(from.value), defaultTo: Number(to.value) });
        show(r.ok ? g.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingGroup = null; load();
      });
      close.addEventListener('click', function () { state.editingGroup = null; render(); });
      var row = el('div', undefined, 'row'); row.appendChild(field('이름', undefined, name)); row.appendChild(field('만렙', '비용 줄 위로는 못 내린다', max)); row.appendChild(field('기본 시작', undefined, from)); row.appendChild(field('기본 끝', undefined, to)); row.appendChild(inline(save, close));
      header.appendChild(row);
    } else {
      var h = el('h2', g.name + ' '); h.appendChild(span(g.key, 'mono dim')); header.appendChild(h);
      header.appendChild(el('p', '만렙 ' + g.maxLevel + ' · 고르면 서는 범위 Lv.' + g.defaultFrom + ' → ' + g.defaultTo + ' · 심볼 ' + g.symbols.length));
      var grow = el('span', undefined, 'grow'); header.appendChild(grow);
      var edit = button('묶음 수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingGroup = g.key; render(); }); header.appendChild(edit);
    }
    card.appendChild(header);
    var wrap = el('div', undefined, 'table'); var table = el('table'); var thead = el('thead'); var hr = el('tr');
    hr.appendChild(el('th', '심볼')); hr.appendChild(el('th', '착용', 'num'));
    for (var lv = 1; lv < g.maxLevel; lv++) { var th = el('th', lv + '→' + (lv + 1), 'num'); hr.appendChild(th); }
    hr.appendChild(el('th', '')); thead.appendChild(hr); table.appendChild(thead);
    var tbody = el('tbody');
    g.symbols.forEach(function (s) {
      var isOpen = state.open === s.key; var tr = el('tr', undefined, isOpen ? 'open' : '');
      var name = span(s.name + ' '); name.appendChild(span(s.key, 'mono dim')); cell(tr, name); cell(tr, s.requiredLevel, 'num');
      s.levels.forEach(function (l) { var c = current(l); cell(tr, c ? meso(c.costMeso) : span('없음', 'tag'), 'num'); });
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), toggle = button(isOpen ? '닫기' : '수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/symbol-costs/symbols/' + s.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/symbol-costs/symbols/' + s.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      toggle.addEventListener('click', function () { state.open = isOpen ? null : s.key; render(); });
      cell(tr, inline(up, down, toggle), 'act');
      tbody.appendChild(tr);
      if (isOpen) tbody.appendChild(editorRow(g, s));
    });
    if (g.symbols.length === 0) { var empty = el('tr'); var td = cell(empty, '심볼이 없다', 'empty'); td.colSpan = g.maxLevel + 2; tbody.appendChild(empty); }
    table.appendChild(tbody); wrap.appendChild(table); card.appendChild(wrap);
    return card;
  }

  function editorRow(g, s) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = g.maxLevel + 2;
    var box = el('div', undefined, 'editor'); box.appendChild(el('h3', s.name + ' 의 비용 줄'));
    var name = input('text'); name.value = s.name; var level = input('number'); level.min = '1'; level.value = s.requiredLevel; var icon = input('text', 'mono'); icon.value = s.iconFile;
    var saveMeta = button('심볼 저장', 'btn ghost sm');
    saveMeta.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/symbol-costs/symbols/' + s.key, { name: name.value.trim(), requiredLevel: Number(level.value), iconFile: icon.value.trim() });
      show(r.ok ? s.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); load();
    });
    var meta = el('div', undefined, 'row'); meta.appendChild(field('이름', undefined, name)); meta.appendChild(field('착용 레벨', undefined, level)); meta.appendChild(field('그림 파일', undefined, icon)); meta.appendChild(saveMeta); box.appendChild(meta);

    var inputs = []; var tbody = el('tbody');
    s.levels.forEach(function (l) {
      var c = current(l); var row = el('tr');
      cell(row, 'Lv.' + l.level + ' → ' + (l.level + 1), 'mono'); cell(row, c ? meso(c.costMeso) : span('없음', 'tag'), 'num'); cell(row, c ? (c.from || '처음부터') : '-', 'mono'); cell(row, l.costs.length, 'num');
      var next = input('number'); next.min = '1'; next.placeholder = c ? '그대로' : '필수'; inputs.push({ level: l.level, input: next, current: c }); cell(row, next);
      if (c && l.costs.length > 1) {
        var del = button('거두기', 'btn danger sm');
        del.addEventListener('click', async function () { if (!window.confirm('Lv.' + l.level + ' 의 지금 비용 줄을 거둔다. 바로 앞 줄이 다시 열린다.')) return; var x = await call('DELETE', '/admin/symbol-costs/rows/' + c.id); show(x.ok ? '거뒀다' : fail('못 거뒀다', x), !x.ok); load(); });
        cell(row, del, 'act');
      } else cell(row, '');
      tbody.appendChild(row);
    });
    box.appendChild(mini(['레벨', '지금 비용', 'from', '줄', '새 비용', ''], tbody));
    var from = input('text', 'mono'); from.placeholder = '2026-10-22'; var open = button('적은 칸으로 새 비용 열기', 'btn sm');
    open.addEventListener('click', async function () {
      var costs = inputs.filter(function (i) { return i.input.value.trim() !== ''; }).map(function (i) { return { level: i.level, costMeso: Number(i.input.value) }; });
      if (costs.length === 0) { show('새 비용을 적은 칸이 없다', true); return; }
      var x = await call('POST', '/admin/symbol-costs/symbols/' + s.key + '/costs', { from: orNull(from.value), costs: costs });
      show(x.ok ? costs.length + '칸의 새 비용을 열었다' : fail('못 열었다', x), !x.ok); load();
    });
    var row2 = el('div', undefined, 'row'); row2.appendChild(field('from', 'KST 패치일. 지금 줄의 시작보다 뒤. 첫 줄은 비워도 된다', from)); row2.appendChild(open); box.appendChild(row2);
    box.appendChild(el('p', '새 심볼은 레벨 전부를 한 번에 적는다. 빈 레벨이 있으면 서버가 거절한다. 앱의 구간 합이 틀려서다.', 'hint'));
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  function render() {
    var groups = document.getElementById('groups'); groups.innerHTML = '';
    state.data.groups.forEach(function (g) { groups.appendChild(groupCard(g)); });
    var sel = document.getElementById('s-group'); var keep = sel.value; sel.innerHTML = '';
    state.data.groups.forEach(function (g) { var o = document.createElement('option'); o.value = g.key; o.textContent = g.name; sel.appendChild(o); });
    if (keep) sel.value = keep;
  }

  document.getElementById('s-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('s-key').value.trim(), group: document.getElementById('s-group').value, name: document.getElementById('s-name').value.trim(), requiredLevel: Number(document.getElementById('s-level').value), iconFile: document.getElementById('s-icon').value.trim() };
    var r = await call('POST', '/admin/symbol-costs/symbols', body);
    show(r.ok ? body.key + ' 를 더했다. 수정에서 레벨 전부의 비용을 넣는다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['s-key', 's-name', 's-level', 's-icon'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });
  document.getElementById('n-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('n-key').value.trim(), name: document.getElementById('n-name').value.trim(), maxLevel: Number(document.getElementById('n-max').value), defaultFrom: Number(document.getElementById('n-from').value), defaultTo: Number(document.getElementById('n-to').value) };
    var r = await call('POST', '/admin/symbol-costs/groups', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['n-key', 'n-name', 'n-max', 'n-from', 'n-to'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/symbol-costs/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    var symbols = 0, missing = 0;
    r.json.groups.forEach(function (g) { symbols += g.symbols.length; g.symbols.forEach(function (s) { s.levels.forEach(function (l) { if (!current(l)) missing++; }); }); });
    document.getElementById('stat-groups').textContent = r.json.groups.length;
    document.getElementById('stat-symbols').textContent = symbols;
    document.getElementById('stat-missing').textContent = missing;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
