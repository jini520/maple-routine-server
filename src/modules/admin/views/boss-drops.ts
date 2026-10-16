import { layout } from './layout'

/**
 * 드롭 표. 보스와 난이도를 고르면 그 조합의 보상 줄이 갈래별로 선다. 줄을 더하고 빼고 차례를 옮기고 수량 · 기간을 고친다.
 *
 * 줄의 차례가 앱 드롭 시트의 타일 차례다. 패치로 빠진 아이템은 지우지 않고 until 을 적는다. 지우면 패치 전 기록이 거짓 기록으로 지워진다.
 */
export const BOSS_DROPS_HTML = layout(
  '/admin/boss-drops',
  '드롭 표',
  `<div class="head">
  <div>
    <h1>드롭 표</h1>
    <p>보스 한 난이도의 보상 줄. 차례가 앱 드롭 시트의 타일 차례다. 패치로 빠진 아이템은 지우지 말고 <code>until</code> 을 적는다. 지우면 그 전 기록이 거짓 기록으로 지워진다. 기간은 KST <code>YYYY-MM-DD</code> 또는 <code>YYYY-MM-DDTHH:mm</code> 다.</p>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<datalist id="item-keys"></datalist>
<section class="card">
  <div class="body"><div class="row">
    <div class="field"><label for="boss">보스</label><select id="boss"></select></div>
    <div class="field"><label for="difficulty">난이도</label><select id="difficulty"></select></div>
  </div></div>
</section>
<section class="card">
  <header><h2 id="title">보상</h2><p id="count"></p></header>
  <div class="table"><table><thead><tr><th>갈래</th><th>#</th><th>아이템</th><th>수량</th><th>from</th><th>until</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<section class="card">
  <header><h2>줄 추가</h2><p>그 갈래의 맨 뒤에 선다</p></header>
  <div class="body"><div class="row">
    <div class="field w-sm"><label for="a-category">갈래</label><select id="a-category"><option value="fixed">fixed</option><option value="equipment">equipment</option><option value="consumable">consumable</option></select></div>
    <div class="field"><label for="a-item">아이템 key</label><input id="a-item" class="mono" list="item-keys"></div>
    <div class="field w-sm"><label for="a-amount">수량 <small>고정 보상만</small></label><input id="a-amount" placeholder="160개"></div>
    <div class="field w-sm"><label for="a-from">from</label><input id="a-from" class="mono" placeholder="2026-09-17T10:00"></div>
    <div class="field w-sm"><label for="a-until">until</label><input id="a-until" class="mono"></div>
    <button id="a-add" class="btn" type="button">줄 추가</button>
  </div></div>
</section>
<script>
  var state = { catalog: null, rows: [], editing: null };
  var CATS = ['fixed', 'equipment', 'consumable'];

  function selected() { return { boss: document.getElementById('boss').value, difficulty: document.getElementById('difficulty').value }; }

  function rewardRow(r, index) {
    var tr = el('tr', undefined, state.editing === r.id ? 'open' : '');
    cell(tr, span(r.category, r.category === 'fixed' ? 'tag' : 'tag accent')); cell(tr, index + 1, 'n');
    var name = span(r.itemName + ' '); name.appendChild(span(r.item, 'mono dim')); cell(tr, name);
    if (state.editing !== r.id) {
      cell(tr, r.amount || '-'); cell(tr, r.from || '-', 'mono'); cell(tr, r.until || '-', 'mono');
      var up = button('↑', 'btn ghost sm'); var down = button('↓', 'btn ghost sm'); var edit = button('수정', 'btn ghost sm'); var del = button('지우기', 'btn danger sm');
      up.addEventListener('click', async function () { var x = await call('POST', '/admin/boss-drops/' + r.id + '/move', { direction: 'up' }); if (!x.ok) show(fail('못 옮겼다', x), true); load(); });
      down.addEventListener('click', async function () { var x = await call('POST', '/admin/boss-drops/' + r.id + '/move', { direction: 'down' }); if (!x.ok) show(fail('못 옮겼다', x), true); load(); });
      edit.addEventListener('click', function () { state.editing = r.id; render(); });
      del.addEventListener('click', async function () { if (!window.confirm(r.itemName + ' 줄을 지운다. 패치로 빠진 것이면 지우지 말고 until 을 적는다.')) return; var x = await call('DELETE', '/admin/boss-drops/' + r.id); show(x.ok ? '지웠다' : fail('못 지웠다', x), !x.ok); load(); });
      cell(tr, inline(up, down, edit, del), 'act');
      return tr;
    }
    var amount = input('text'); amount.value = r.amount || ''; var from = input('text', 'mono'); from.value = r.from || ''; var until = input('text', 'mono'); until.value = r.until || '';
    cell(tr, amount); cell(tr, from); cell(tr, until);
    var save = button('저장', 'btn sm'); var close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () { var x = await call('PUT', '/admin/boss-drops/' + r.id, { amount: orNull(amount.value), from: orNull(from.value), until: orNull(until.value) }); show(x.ok ? '적었다' : fail('못 적었다', x), !x.ok); if (x.ok) state.editing = null; load(); });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function render() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    CATS.forEach(function (c) { state.rows.filter(function (r) { return r.category === c; }).forEach(function (r, i) { rows.appendChild(rewardRow(r, i)); }); });
    if (state.rows.length === 0) { var tr = el('tr'); var td = cell(tr, '줄이 없다', 'empty'); td.colSpan = 7; rows.appendChild(tr); }
    var s = selected(); document.getElementById('title').textContent = s.boss + ' · ' + s.difficulty;
    document.getElementById('count').textContent = state.rows.length + '줄';
  }

  function fillDifficulties() {
    var boss = state.catalog.bosses.filter(function (b) { return b.key === document.getElementById('boss').value; })[0];
    var sel = document.getElementById('difficulty'); var keep = sel.value; sel.innerHTML = '';
    (boss ? boss.difficulties : []).forEach(function (d) { var o = document.createElement('option'); o.value = d.difficulty; o.textContent = d.difficulty; sel.appendChild(o); });
    if (keep && boss && boss.difficulties.some(function (d) { return d.difficulty === keep; })) sel.value = keep;
  }

  async function loadRows() {
    var s = selected(); if (!s.boss || !s.difficulty) { state.rows = []; render(); return; }
    var r = await call('GET', '/admin/boss-drops/rows?boss=' + s.boss + '&difficulty=' + s.difficulty);
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.rows = r.json.rows; render();
  }
  async function load() { await loadRows(); }

  document.getElementById('boss').addEventListener('change', function () { fillDifficulties(); state.editing = null; loadRows(); });
  document.getElementById('difficulty').addEventListener('change', function () { state.editing = null; loadRows(); });
  document.getElementById('a-add').addEventListener('click', async function () {
    var s = selected();
    var body = { boss: s.boss, difficulty: s.difficulty, category: document.getElementById('a-category').value, item: document.getElementById('a-item').value.trim(), amount: orNull(document.getElementById('a-amount').value), from: orNull(document.getElementById('a-from').value), until: orNull(document.getElementById('a-until').value) };
    var r = await call('POST', '/admin/boss-drops', body);
    show(r.ok ? body.item + ' 줄을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) document.getElementById('a-item').value = ''; load();
  });

  (async function boot() {
    var c = await call('GET', '/v1/bosses'); if (!c.ok) { show('보스 표를 못 읽었다 ' + c.status, true); return; }
    state.catalog = c.json;
    var sel = document.getElementById('boss'); c.json.bosses.forEach(function (b) { var o = document.createElement('option'); o.value = b.key; o.textContent = b.name + ' (' + b.key + ')'; sel.appendChild(o); });
    fillDifficulties();
    var items = await call('GET', '/admin/drop-items/rows');
    if (items.ok) { var dl = document.getElementById('item-keys'); items.json.items.forEach(function (i) { var o = document.createElement('option'); o.value = i.key; o.label = i.name; dl.appendChild(o); }); }
    load();
  })();
</script>`,
)
