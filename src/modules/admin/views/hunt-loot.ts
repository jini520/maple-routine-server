import { layout } from './layout'

/**
 * 사냥 전리품 표. 위에 새 전리품 폼, 그 아래 표 하나다. 줄의 수정을 누르면 이름 · 그림 · NPC 가격 · 기간이 입력으로 바뀐다.
 *
 * key 와 분류는 기록이 들어 못 바꾸고 줄은 지우지 않는다. 이벤트가 끝나면 끝 날짜로 닫는다.
 */
export const HUNT_LOOT_HTML = layout(
  '/admin/hunt-loot',
  '사냥 전리품',
  `<div class="head">
  <div>
    <h1>사냥 전리품</h1>
    <p>가계부 사냥 전리품 판매의 아이템이다. 앱은 분류마다 세그먼트 칸을 두고, 이벤트 칸은 기간 안의 이벤트 아이템이 있을 때만 선다. NPC 가격은 소비에만 있고 앱이 단가로 채운다. 시작은 그날부터, 끝은 그날부터 아니다. 바꾸면 <code>huntLoot.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-items">–</b><span>전리품</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 전리품</h2><p>key 는 snake_case 이고 key · 분류는 한 번 정하면 못 바꾼다. 맨 뒤에 선다. 그림은 그림 화면에서 먼저 올린다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="c-key">key</label><input id="c-key" class="mono" placeholder="suspicious_magnifier"></div>
    <div class="field w-sm"><label for="c-kind">분류</label><select id="c-kind"><option value="event">이벤트</option><option value="consumable">소비</option><option value="fragment">조각</option></select></div>
    <div class="field"><label for="c-name">이름</label><input id="c-name" placeholder="수상한 돋보기"></div>
    <div class="field"><label for="c-icon">그림 파일 <small>src/assets/items/</small></label><input id="c-icon" class="mono" placeholder="suspicious_magnifier.webp"></div>
    <div class="field w-sm"><label for="c-price">NPC 가격 <small>소비만</small></label><input id="c-price" type="number" min="1" placeholder="2750"></div>
    <div class="field w-sm"><label for="c-from">시작</label><input id="c-from" class="mono" placeholder="2026-10-22"></div>
    <div class="field w-sm"><label for="c-until">끝</label><input id="c-until" class="mono" placeholder="2026-11-19"></div>
    <button id="c-add" class="btn" type="button">전리품 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>전리품</h2><p>차례가 곧 앱의 차례</p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>분류</th><th>이름</th><th>그림 파일</th><th>NPC 가격</th><th>시작</th><th>끝</th><th></th></tr></thead><tbody id="items"></tbody></table></div>
</section>
<script>
  var KINDS = { fragment: '조각', consumable: '소비', event: '이벤트' };
  var state = { data: null, editing: null };

  function priceOf(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }

  function itemRow(item, i, count) {
    var editing = state.editing === item.key;
    var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, item.key, 'mono'); cell(tr, KINDS[item.kind] || item.kind);
    if (!editing) {
      cell(tr, item.name); cell(tr, item.iconFile, 'mono');
      cell(tr, item.npcPriceMeso === null ? '-' : item.npcPriceMeso.toLocaleString(), 'n');
      cell(tr, item.from || '-', 'mono'); cell(tr, item.until || '-', 'mono');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
      up.disabled = i === 0; down.disabled = i === count - 1;
      up.addEventListener('click', function () { move(item, 'up'); });
      down.addEventListener('click', function () { move(item, 'down'); });
      edit.addEventListener('click', function () { state.editing = item.key; render(); });
      cell(tr, inline(up, down, edit), 'act');
      return tr;
    }
    var name = input('text'); name.value = item.name;
    var icon = input('text', 'mono'); icon.value = item.iconFile;
    var price = input('number'); price.value = item.npcPriceMeso === null ? '' : item.npcPriceMeso; price.disabled = item.kind !== 'consumable';
    var from = input('text', 'mono'); from.value = item.from || '';
    var until = input('text', 'mono'); until.value = item.until || '';
    cell(tr, name); cell(tr, icon); cell(tr, price); cell(tr, from); cell(tr, until);
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hunt-loot/' + item.key, {
        name: name.value.trim(), iconFile: icon.value.trim(), npcPriceMeso: priceOf(price.value), from: orNull(from.value), until: orNull(until.value),
      });
      show(r.ok ? item.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  async function move(item, direction) {
    var r = await call('POST', '/admin/hunt-loot/' + item.key + '/move', { direction: direction });
    if (!r.ok) show(fail('못 옮겼다', r), true); load();
  }

  function render() {
    var body = document.getElementById('items'); body.innerHTML = '';
    var rows = state.data.items;
    rows.forEach(function (item, i) { body.appendChild(itemRow(item, i, rows.length)); });
    if (rows.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 9; body.appendChild(tr); }
  }

  document.getElementById('c-kind').addEventListener('change', function (e) {
    document.getElementById('c-price').disabled = e.target.value !== 'consumable';
  });
  document.getElementById('c-price').disabled = true;

  document.getElementById('c-add').addEventListener('click', async function () {
    var v = function (id) { return document.getElementById(id).value.trim(); };
    var body = { key: v('c-key'), kind: v('c-kind'), name: v('c-name'), iconFile: v('c-icon'), npcPriceMeso: v('c-kind') === 'consumable' ? priceOf(v('c-price')) : null, from: orNull(v('c-from')), until: orNull(v('c-until')) };
    var r = await call('POST', '/admin/hunt-loot', body);
    show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['c-key', 'c-name', 'c-icon', 'c-price', 'c-from', 'c-until'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/hunt-loot/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    document.getElementById('stat-items').textContent = r.json.items.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
