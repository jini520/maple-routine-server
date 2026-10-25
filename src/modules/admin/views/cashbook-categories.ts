import { layout } from './layout'

/**
 * 가계부 갈래와 아이템 종류. 위에 새 갈래 폼, 그 아래 수입 · 지출 갈래 표 둘, 맨 아래 아이템 종류 표다.
 *
 * key 는 기록이 들어 못 바꾸고 갈래는 지우지 않는다. 앱이 입력 폼을 모르는 갈래는 앱에서 이름만 서고 못 고른다.
 */
export const CASHBOOK_CATEGORIES_HTML = layout(
  '/admin/cashbook-categories',
  '가계부 갈래',
  `<div class="head">
  <div>
    <h1>가계부 갈래</h1>
    <p>가계부 입력 시트의 갈래와 아이템 구매 · 판매의 종류다. 카드 제목은 하루 목록 카드의 첫 줄이고, 묶음이 있는 지출 갈래는 묶음의 카드 제목이 대신 선다. 새 갈래는 앱에 그 입력 폼이 생길 때까지 앱에서 못 고른다. 바꾸면 <code>cashbookCategories.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-income">–</b><span>수입 갈래</span></div>
    <div class="stat"><b id="stat-spend">–</b><span>지출 갈래</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 갈래</h2><p>key 는 snake_case 이고 한 번 정하면 못 바꾼다. 같은 쪽의 맨 뒤에 선다</p></header>
  <div class="body"><div class="row">
    <div class="field w-sm"><label for="c-type">수입 · 지출</label><select id="c-type"><option value="spend">지출</option><option value="income">수입</option></select></div>
    <div class="field"><label for="c-key">key</label><input id="c-key" class="mono" placeholder="hexa_skill"></div>
    <div class="field"><label for="c-name">이름</label><input id="c-name" placeholder="헥사 스킬 강화"></div>
    <div class="field"><label for="c-title">카드 제목</label><input id="c-title" placeholder="헥사강화"></div>
    <div class="field"><label for="c-icon">그림 파일 <small>src/assets/items/</small></label><input id="c-icon" class="mono" placeholder="sol_erda_fragment.webp"></div>
    <div class="field"><label for="c-desc">설명</label><input id="c-desc" placeholder="갈래 카드 한 줄"></div>
    <div class="field w-sm"><label for="c-unit">단위</label><input id="c-unit" placeholder="개"></div>
    <button id="c-add" class="btn" type="button">갈래 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>지출 갈래</h2><p>차례가 곧 앱의 차례</p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>카드 제목</th><th>그림 파일</th><th>설명</th><th>단위</th><th></th></tr></thead><tbody id="spend"></tbody></table></div>
</section>
<section class="card">
  <header><h2>수입 갈래</h2><p>차례가 곧 앱의 차례이고 맨 앞이 기본 갈래다</p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>카드 제목</th><th>그림 파일</th><th>설명</th><th>단위</th><th></th></tr></thead><tbody id="income"></tbody></table></div>
</section>
<section class="card">
  <header><h2>아이템 종류</h2><p>게임 인벤토리 탭 이름. 단위가 비면 수량 칸이 없고, 관세는 월드 간 거래가 되는 종류에만 붙는다</p></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th>단위</th><th>관세</th><th></th></tr></thead><tbody id="kinds"></tbody></table></div>
</section>
<script>
  var state = { data: null, editing: null, editingKind: null };

  function categoryRow(c, i, count) {
    var id = c.entryType + '.' + c.key, editing = state.editing === id;
    var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, c.key, 'mono');
    if (!editing) {
      cell(tr, c.name); cell(tr, c.cardTitle); cell(tr, c.iconFile, 'mono'); cell(tr, c.description || '-'); cell(tr, c.unit || '-');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
      up.disabled = i === 0; down.disabled = i === count - 1;
      up.addEventListener('click', function () { move(c, 'up'); });
      down.addEventListener('click', function () { move(c, 'down'); });
      edit.addEventListener('click', function () { state.editing = id; render(); });
      cell(tr, inline(up, down, edit), 'act');
      return tr;
    }
    var name = input('text'); name.value = c.name;
    var title = input('text'); title.value = c.cardTitle;
    var icon = input('text', 'mono'); icon.value = c.iconFile;
    var desc = input('text'); desc.value = c.description;
    var unit = input('text'); unit.value = c.unit || '';
    cell(tr, name); cell(tr, title); cell(tr, icon); cell(tr, desc); cell(tr, unit);
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/cashbook-categories/' + c.entryType + '/' + c.key, {
        name: name.value.trim(), cardTitle: title.value.trim(), iconFile: icon.value.trim(), description: desc.value.trim(), unit: orNull(unit.value),
      });
      show(r.ok ? c.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  async function move(c, direction) {
    var r = await call('POST', '/admin/cashbook-categories/' + c.entryType + '/' + c.key + '/move', { direction: direction });
    if (!r.ok) show(fail('못 옮겼다', r), true); load();
  }

  function kindRow(k) {
    var tr = el('tr', undefined, state.editingKind === k.key ? 'open' : '');
    cell(tr, k.key, 'mono');
    if (state.editingKind !== k.key) {
      cell(tr, k.name); cell(tr, k.unit || '수량 없음'); cell(tr, k.hasTariff ? '붙음' : '없음');
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingKind = k.key; render(); }); cell(tr, edit, 'act');
      return tr;
    }
    var name = input('text'); name.value = k.name;
    var unit = input('text'); unit.value = k.unit || ''; unit.placeholder = '비우면 수량 없음';
    var tariff = input('checkbox'); tariff.checked = k.hasTariff;
    var tariffLabel = el('label', undefined, 'check'); tariffLabel.appendChild(tariff); tariffLabel.appendChild(document.createTextNode(' 관세'));
    cell(tr, name); cell(tr, unit); cell(tr, tariffLabel);
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/cashbook-item-kinds/' + k.key, { name: name.value.trim(), unit: orNull(unit.value), hasTariff: tariff.checked });
      show(r.ok ? k.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingKind = null; load();
    });
    close.addEventListener('click', function () { state.editingKind = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function render() {
    ['spend', 'income'].forEach(function (type) {
      var body = document.getElementById(type); body.innerHTML = '';
      var rows = state.data.categories.filter(function (c) { return c.entryType === type; });
      rows.forEach(function (c, i) { body.appendChild(categoryRow(c, i, rows.length)); });
      if (rows.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 8; body.appendChild(tr); }
    });
    var kinds = document.getElementById('kinds'); kinds.innerHTML = '';
    state.data.itemKinds.forEach(function (k) { kinds.appendChild(kindRow(k)); });
  }

  document.getElementById('c-add').addEventListener('click', async function () {
    var v = function (id) { return document.getElementById(id).value.trim(); };
    var body = { entryType: v('c-type'), key: v('c-key'), name: v('c-name'), cardTitle: v('c-title'), iconFile: v('c-icon'), description: v('c-desc'), unit: orNull(v('c-unit')) };
    var r = await call('POST', '/admin/cashbook-categories', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['c-key', 'c-name', 'c-title', 'c-icon', 'c-desc', 'c-unit'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/cashbook-categories/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    document.getElementById('stat-income').textContent = r.json.categories.filter(function (c) { return c.entryType === 'income'; }).length;
    document.getElementById('stat-spend').textContent = r.json.categories.filter(function (c) { return c.entryType === 'spend'; }).length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
