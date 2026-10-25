import { layout } from './layout'

/**
 * 지출 카탈로그. 맨 위에 규칙 둘, 그 아래 묶음 표(열기 · 닫기 스위치)다. 묶음의 항목을 누르면 그 아래로 항목 줄과
 * 항목 폼이 펼쳐진다. 맨 아래가 타일 표다.
 *
 * key 는 기록이 들어 못 바꾸고 묶음 · 타일 · 항목은 지우지 않는다. 항목은 until 로 닫고 묶음은 스위치로 닫는다.
 * 갈래는 가계부 갈래 화면이 든다. 이 화면은 그 화면의 지출 갈래를 읽어 고르개에 세운다.
 */
export const SPEND_CATALOG_HTML = layout(
  '/admin/spend-catalog',
  '지출 카탈로그',
  `<div class="head">
  <div>
    <h1>지출 카탈로그</h1>
    <p>가계부 지출의 선택 목록이다. 묶음의 열림 스위치가 앱에서 고를 수 있는지를 정한다. 날짜로 판정하지 않는다. 항목은 지우지 않고 until 로 닫는다. 바꾸면 <code>spendCatalog.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-groups">–</b><span>묶음</span></div>
    <div class="stat"><b id="stat-closed">–</b><span>닫힌 묶음</span></div>
    <div class="stat"><b id="stat-items">–</b><span>항목</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>규칙</h2><p>관세율은 메포 → 메소 환산에 붙고, 주화 판매가는 에픽던전 추가 리워드의 세라자르 주화가 메소로 빠지는 값이다</p></header>
  <div class="body"><div class="row">
    <div class="field w-sm"><label for="r-tariff">관세율 <small>%</small></label><input id="r-tariff" type="number" min="0" max="100"></div>
    <div class="field"><label for="r-coin">세라자르 주화 판매가 <small>메소</small></label><input id="r-coin" type="number" min="1"></div>
    <button id="r-save" class="btn" type="button">규칙 저장</button>
  </div></div>
</section>
<section class="card">
  <header><h2>새 묶음</h2><p>key 는 snake_case 이고 한 번 정하면 못 바꾼다. 묶음은 맨 뒤에 선다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="g-key">key</label><input id="g-key" class="mono" placeholder="maple_point_shop"></div>
    <div class="field"><label for="g-name">이름</label><input id="g-name" placeholder="메이플 포인트 샵"></div>
    <div class="field w-md"><label for="g-category">갈래</label><select id="g-category"></select></div>
    <div class="field"><label for="g-title">카드 제목 <small>하루 목록 카드 첫 줄</small></label><input id="g-title" placeholder="메이플 포인트 샵"></div>
    <button id="g-add" class="btn" type="button">묶음 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>묶음</h2><p id="group-count"></p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>갈래</th><th>카드 제목</th><th>열림</th><th class="num">항목</th><th></th></tr></thead><tbody id="groups"></tbody></table></div>
</section>
<section class="card">
  <header><h2>에픽던전 형태</h2><p>형태는 앱 코드가 key 로 갈려 더하기가 없다. 이름은 하루 목록 카드에도 선다</p></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th></th></tr></thead><tbody id="forms"></tbody></table></div>
</section>
<section class="card">
  <header><h2>타일</h2><p>목록의 한 칸. 같은 타일의 항목이 한 칸으로 접힌다. 그림은 아이템 파일과 지역 아이콘 중 하나다</p><span class="grow"></span><input id="tile-filter" class="w-md" placeholder="key 나 이름으로 거른다"></header>
  <div class="body"><div class="row">
    <div class="field"><label for="t-key">key</label><input id="t-key" class="mono" placeholder="high_mountain"></div>
    <div class="field"><label for="t-name">이름</label><input id="t-name" placeholder="하이마운틴"></div>
    <div class="field"><label for="t-file">그림 파일 <small>src/assets/items/</small></label><input id="t-file" class="mono" placeholder="monster_park_ticket.webp"></div>
    <div class="field"><label for="t-map">지역 아이콘 <small>src/assets/maps/icons/</small></label><input id="t-map" class="mono" placeholder="highMountain"></div>
    <button id="t-add" class="btn" type="button">타일 추가</button>
  </div></div>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th>그림 파일</th><th>지역 아이콘</th><th class="num">항목</th><th></th></tr></thead><tbody id="tiles"></tbody></table></div>
</section>
<script>
  var CATEGORIES = [];
  var CURRENCIES = [['point', '메포'], ['meso', '메소']];
  var UNITS = [['회', '회'], ['개', '개'], ['포인트', '포인트'], ['시간', '시간']];
  var FORMS = [];
  var state = { data: null, open: null, editingGroup: null, editingItem: null, editingTile: null };

  function nameOf(pairs, key) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === key) return pairs[i][1]; return key; }
  function itemsOf(groupKey) { return state.data.items.filter(function (it) { return it.group === groupKey; }); }
  function optionsOf(itemKey) { return state.data.itemOptions.filter(function (o) { return o.item === itemKey; }); }
  function formsOf(itemKey) { return state.data.itemForms.filter(function (f) { return f.item === itemKey; }).map(function (f) { return f.form; }); }
  function tileNameOf(key) { var t = state.data.tiles.filter(function (x) { return x.key === key; })[0]; return t ? t.name : key; }
  function optionsText(opts) { return opts.map(function (o) { return o.axis + '=' + o.value; }).join('; '); }
  function parseOptions(text) {
    return text.split(';').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; }).map(function (s) {
      var at = s.indexOf('='); return { axis: at < 0 ? s : s.slice(0, at).trim(), value: at < 0 ? '' : s.slice(at + 1).trim() };
    });
  }
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }
  function tileChoices() { return state.data.tiles.map(function (t) { return [t.key, t.name + ' (' + t.key + ')']; }); }
  function period(it) { if (!it.from && !it.until) return '-'; return (it.from || '처음') + ' ~ ' + (it.until || ''); }

  function groupRow(g, i) {
    var isOpen = state.open === g.key, editing = state.editingGroup === g.key;
    var tr = el('tr', undefined, isOpen || editing ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, g.key, 'mono');
    var name = input('text'); name.value = g.name; var category = select(CATEGORIES, g.category);
    var title = input('text'); title.value = g.cardTitle;
    if (editing) { cell(tr, name); cell(tr, category); cell(tr, title); } else { cell(tr, g.name); cell(tr, span(nameOf(CATEGORIES, g.category), 'tag')); cell(tr, g.cardTitle); }
    var active = input('checkbox'); active.checked = g.active;
    var activeLabel = el('label', undefined, 'check'); activeLabel.appendChild(active); activeLabel.appendChild(document.createTextNode(g.active ? ' 열림' : ' 닫힘'));
    active.addEventListener('change', async function () {
      var r = await call('PUT', '/admin/spend-catalog/groups/' + g.key, { name: g.name, category: g.category, cardTitle: g.cardTitle, active: active.checked });
      show(r.ok ? g.key + (active.checked ? ' 을 열었다' : ' 을 닫았다') : fail('못 바꿨다', r), !r.ok); load();
    });
    cell(tr, activeLabel); cell(tr, itemsOf(g.key).length, 'num');
    if (!editing) {
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm'), toggle = button(isOpen ? '접기' : '항목', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/spend-catalog/groups/' + g.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/spend-catalog/groups/' + g.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      edit.addEventListener('click', function () { state.editingGroup = g.key; render(); });
      toggle.addEventListener('click', function () { state.open = isOpen ? null : g.key; state.editingItem = null; render(); });
      cell(tr, inline(up, down, edit, toggle), 'act');
      return tr;
    }
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/spend-catalog/groups/' + g.key, { name: name.value.trim(), category: category.value, cardTitle: title.value.trim(), active: active.checked });
      show(r.ok ? g.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingGroup = null; load();
    });
    close.addEventListener('click', function () { state.editingGroup = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function itemsRow(g) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 8;
    var box = el('div', undefined, 'editor'); box.appendChild(el('h3', g.name + ' 의 항목. 차례가 곧 앱의 차례이고 같은 타일은 한 칸으로 접힌다'));
    var tbody = el('tbody');
    itemsOf(g.key).forEach(function (it, i) {
      var row = el('tr', undefined, state.editingItem === it.key ? 'open' : '');
      cell(row, i + 1, 'n'); cell(row, it.key, 'mono'); cell(row, tileNameOf(it.tile));
      var nameCell = cell(row, it.name); if (it.shortName) { nameCell.appendChild(document.createTextNode(' ')); nameCell.appendChild(span('줄임 ' + it.shortName, 'dim')); }
      var opts = optionsOf(it.key); cell(row, it.tier || (opts.length ? optionsText(opts) : '-'));
      cell(row, it.unitPrice === null ? span('경매장', 'dim') : meso(it.unitPrice) + ' ' + nameOf(CURRENCIES, it.currency), 'num');
      cell(row, it.unit); cell(row, it.maxQuantity === null ? '-' : it.maxQuantity, 'num'); cell(row, it.rewardCoins === null ? '-' : it.rewardCoins, 'num');
      var forms = formsOf(it.key); cell(row, forms.length ? forms.map(function (f) { return nameOf(FORMS, f); }).join(' · ') : '-');
      cell(row, period(it), 'mono');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/spend-catalog/items/' + it.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/spend-catalog/items/' + it.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      edit.addEventListener('click', function () { state.editingItem = state.editingItem === it.key ? null : it.key; render(); });
      cell(row, inline(up, down, edit), 'act');
      tbody.appendChild(row);
    });
    box.appendChild(mini(['#', 'key', '타일', '이름', '단계 · 축 값', '가격', '단위', '상한', '주화', '형태', '기간', ''], tbody));
    var editing = itemsOf(g.key).filter(function (it) { return it.key === state.editingItem; })[0] || null;
    box.appendChild(itemForm(g, editing));
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  // 항목 폼 하나로 새 항목과 수정을 다 한다. it 이 null 이면 새 항목이다.
  function itemForm(g, it) {
    var box = el('div', undefined, 'sub'); box.appendChild(el('h3', it ? it.key + ' 수정' : '새 항목'));
    var key = input('text', 'mono'); key.placeholder = 'high_mountain_3';
    var tile = select(tileChoices(), it ? it.tile : undefined);
    var name = input('text'); var shortName = input('text'); shortName.placeholder = '비우면 이름 그대로';
    var tier = input('text'); tier.placeholder = '1단계 · 공격력';
    var currency = select(CURRENCIES, it ? it.currency : 'point'); var unitPrice = input('number'); unitPrice.min = '0'; unitPrice.placeholder = '비우면 경매장 값';
    var unit = select(UNITS, it ? it.unit : '회'); var maxQuantity = input('number'); maxQuantity.min = '1'; var rewardCoins = input('number'); rewardCoins.min = '1';
    var from = input('text', 'mono'); from.placeholder = '2026-09-17'; var until = input('text', 'mono'); until.placeholder = '비우면 끝없이';
    var options = input('text'); options.placeholder = '무기=한손무기; 능력치=공격력';
    var formsBox = el('div', undefined, 'inline');
    var formChecks = FORMS.map(function (f) { var l = el('label', undefined, 'check'); var c = input('checkbox'); c.value = f[0]; l.appendChild(c); l.appendChild(document.createTextNode(' ' + f[1])); formsBox.appendChild(l); return c; });
    if (it) {
      name.value = it.name; shortName.value = it.shortName || ''; tier.value = it.tier || ''; unitPrice.value = it.unitPrice === null ? '' : it.unitPrice;
      maxQuantity.value = it.maxQuantity === null ? '' : it.maxQuantity; rewardCoins.value = it.rewardCoins === null ? '' : it.rewardCoins;
      from.value = it.from || ''; until.value = it.until || ''; options.value = optionsText(optionsOf(it.key));
      var fs = formsOf(it.key); formChecks.forEach(function (c) { c.checked = fs.indexOf(c.value) >= 0; });
    }
    var grid = el('div', undefined, 'grid2');
    if (!it) grid.appendChild(field('key', 'snake_case. 한 번 정하면 못 바꾼다', key));
    grid.appendChild(field('타일', '같은 타일의 항목이 한 칸으로 접힌다', tile));
    grid.appendChild(field('이름', '원본 이름. 하루 목록 카드에도 선다', name));
    grid.appendChild(field('줄인 이름', '타일처럼 좁은 자리에만 선다', shortName));
    grid.appendChild(field('단계', '타일에 항목이 여럿일 때. 축 값과 함께 못 든다', tier));
    grid.appendChild(field('축 값', '축=값; 축=값. 같은 타일은 축 이름이 같아야 한다', options));
    grid.appendChild(field('재화', undefined, currency));
    grid.appendChild(field('가격', '비우면 경매장 값이라 앱이 적을 때 친다', unitPrice));
    grid.appendChild(field('단위', '수량 칸의 라벨', unit));
    grid.appendChild(field('수량 상한', '기록 한 건', maxQuantity));
    grid.appendChild(field('세라자르 주화', '한 형태에서 받는 개수. 형태를 든 항목만', rewardCoins));
    grid.appendChild(field('형태', '에픽던전 추가 리워드', formsBox));
    grid.appendChild(field('from', 'KST. 비우면 처음부터', from));
    grid.appendChild(field('until', '지우지 않고 여기로 닫는다', until));
    box.appendChild(grid);
    function body() {
      return {
        tile: tile.value, name: name.value.trim(), shortName: orNull(shortName.value), tier: orNull(tier.value), currency: currency.value, unitPrice: numOrNull(unitPrice.value), unit: unit.value,
        maxQuantity: numOrNull(maxQuantity.value), rewardCoins: numOrNull(rewardCoins.value), from: orNull(from.value), until: orNull(until.value),
        options: parseOptions(options.value), forms: formChecks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }),
      };
    }
    var actions = el('div', undefined, 'actions');
    if (it) {
      var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
      save.addEventListener('click', async function () { var r = await call('PUT', '/admin/spend-catalog/items/' + it.key, body()); show(r.ok ? it.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingItem = null; load(); });
      close.addEventListener('click', function () { state.editingItem = null; render(); });
      actions.appendChild(save); actions.appendChild(close);
    } else {
      var add = button('항목 추가', 'btn sm');
      add.addEventListener('click', async function () {
        var b = body(); b.key = key.value.trim(); b.group = g.key;
        var r = await call('POST', '/admin/spend-catalog/items', b); show(r.ok ? b.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); load();
      });
      actions.appendChild(add);
    }
    box.appendChild(actions); return box;
  }

  function tileRow(t) {
    var tr = el('tr', undefined, state.editingTile === t.key ? 'open' : '');
    cell(tr, t.key, 'mono');
    var used = state.data.items.filter(function (it) { return it.tile === t.key; }).length;
    if (state.editingTile !== t.key) {
      cell(tr, t.name); cell(tr, t.iconFile || '-', 'mono'); cell(tr, t.iconMap || '-', 'mono'); cell(tr, used, 'num');
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingTile = t.key; render(); }); cell(tr, edit, 'act');
      return tr;
    }
    var name = input('text'); name.value = t.name; var iconFile = input('text', 'mono'); iconFile.value = t.iconFile || ''; var iconMap = input('text', 'mono'); iconMap.value = t.iconMap || '';
    cell(tr, name); cell(tr, iconFile); cell(tr, iconMap); cell(tr, used, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/spend-catalog/tiles/' + t.key, { name: name.value.trim(), iconFile: orNull(iconFile.value), iconMap: orNull(iconMap.value) });
      show(r.ok ? t.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingTile = null; load();
    });
    close.addEventListener('click', function () { state.editingTile = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function formRow(f) {
    var tr = el('tr'); cell(tr, f.key, 'mono');
    var name = input('text'); name.value = f.name; cell(tr, name);
    var save = button('저장', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/spend-catalog/forms/' + f.key, { name: name.value.trim() });
      show(r.ok ? f.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); load();
    });
    cell(tr, save, 'act');
    return tr;
  }

  function render() {
    var groups = document.getElementById('groups'); groups.innerHTML = '';
    state.data.groups.forEach(function (g, i) { groups.appendChild(groupRow(g, i)); if (state.open === g.key) groups.appendChild(itemsRow(g)); });
    if (state.data.groups.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 8; groups.appendChild(tr); }
    var forms = document.getElementById('forms'); forms.innerHTML = '';
    state.data.forms.forEach(function (f) { forms.appendChild(formRow(f)); });
    document.getElementById('group-count').textContent = state.data.groups.length + '묶음 · ' + state.data.items.length + '항목. 차례가 곧 앱의 차례';
    var q = document.getElementById('tile-filter').value.trim().toLowerCase();
    var tiles = document.getElementById('tiles'); tiles.innerHTML = '';
    var shown = state.data.tiles.filter(function (t) { return !q || t.key.indexOf(q) >= 0 || t.name.toLowerCase().indexOf(q) >= 0; });
    shown.forEach(function (t) { tiles.appendChild(tileRow(t)); });
    if (shown.length === 0) { var tr2 = el('tr'); var td2 = cell(tr2, '없다', 'empty'); td2.colSpan = 6; tiles.appendChild(tr2); }
  }

  document.getElementById('tile-filter').addEventListener('input', function () { if (state.data) render(); });
  document.getElementById('r-save').addEventListener('click', async function () {
    var r = await call('PUT', '/admin/spend-catalog/rules', { tariffPercent: Number(document.getElementById('r-tariff').value), rewardCoinPriceMeso: Number(document.getElementById('r-coin').value) });
    show(r.ok ? '규칙을 적었다' : fail('못 적었다', r), !r.ok); load();
  });
  document.getElementById('g-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('g-key').value.trim(), name: document.getElementById('g-name').value.trim(), category: document.getElementById('g-category').value, cardTitle: document.getElementById('g-title').value.trim(), active: true };
    var r = await call('POST', '/admin/spend-catalog/groups', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['g-key', 'g-name', 'g-title'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });
  document.getElementById('t-add').addEventListener('click', async function () {
    var body = { key: document.getElementById('t-key').value.trim(), name: document.getElementById('t-name').value.trim(), iconFile: orNull(document.getElementById('t-file').value), iconMap: orNull(document.getElementById('t-map').value) };
    var r = await call('POST', '/admin/spend-catalog/tiles', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['t-key', 't-name', 't-file', 't-map'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/spend-catalog/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    var c = await call('GET', '/admin/cashbook-categories/rows');
    if (!c.ok) { show('갈래를 못 읽었다 ' + c.status, true); return; }
    CATEGORIES = c.json.categories.filter(function (x) { return x.entryType === 'spend'; }).map(function (x) { return [x.key, x.name]; });
    var picker = document.getElementById('g-category'), picked = picker.value; picker.innerHTML = '';
    CATEGORIES.forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; picker.appendChild(o); });
    if (picked) picker.value = picked;
    FORMS = r.json.forms.map(function (f) { return [f.key, f.name]; });
    state.data = r.json;
    document.getElementById('stat-groups').textContent = r.json.groups.length;
    document.getElementById('stat-closed').textContent = r.json.groups.filter(function (g) { return !g.active; }).length;
    document.getElementById('stat-items').textContent = r.json.items.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    document.getElementById('r-tariff').value = r.json.rules.tariffPercent == null ? '' : r.json.rules.tariffPercent;
    document.getElementById('r-coin').value = r.json.rules.rewardCoinPriceMeso == null ? '' : r.json.rules.rewardCoinPriceMeso;
    render();
  }
  load();
</script>`,
)
