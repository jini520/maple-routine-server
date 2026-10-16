import { layout } from './layout'

/**
 * 랜덤 상자. 상자마다 카드 하나다. 레벨 범위와 내용물을 그 자리에서 고친다. 내용물 차례가 상자를 열면 서는 후보 차례다.
 *
 * 상자는 더하기만 있다. 기록이 상자 key 를 든다. 내용물은 더하고 빼고 옮긴다.
 */
export const DROP_BOXES_HTML = layout(
  '/admin/drop-boxes',
  '상자',
  `<div class="head">
  <div>
    <h1>상자</h1>
    <p>반지 상자는 레벨 범위를 들고 장신구 상자는 비운다. 내용물 차례가 앱에서 상자를 열면 서는 후보 차례다. 바꾸면 <code>dropBoxes.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-boxes">–</b><span>상자</span></div>
    <div class="stat"><b id="stat-contents">–</b><span>내용물</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<datalist id="item-keys"></datalist>
<section class="card">
  <header><h2>새 상자</h2><p>상자 아이템은 드롭 아이템 표에 먼저 있어야 한다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="b-item">상자 아이템 key</label><input id="b-item" class="mono" list="item-keys" placeholder="green_boss_ring_box"></div>
    <div class="field w-sm"><label for="b-min">레벨 min <small>장신구 상자는 비운다</small></label><input id="b-min" type="number" min="1"></div>
    <div class="field w-sm"><label for="b-max">레벨 max</label><input id="b-max" type="number" min="1"></div>
    <button id="b-add" class="btn" type="button">상자 추가</button>
  </div></div>
</section>
<div id="boxes" class="page"></div>
<script>
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }

  function boxCard(b) {
    var card = el('section', undefined, 'card');
    var header = el('header'); var h = el('h2', b.name + ' '); h.appendChild(span(b.item, 'mono dim')); header.appendChild(h);
    header.appendChild(el('p', b.contents.length + '개 · ' + (b.levelMin == null ? '레벨 없음' : 'Lv ' + b.levelMin + '~' + b.levelMax)));
    card.appendChild(header);
    var body = el('div', undefined, 'body');
    var min = input('number'); min.min = '1'; min.value = b.levelMin == null ? '' : b.levelMin; var max = input('number'); max.min = '1'; max.value = b.levelMax == null ? '' : b.levelMax;
    var saveLv = button('레벨 저장', 'btn ghost sm');
    saveLv.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/drop-boxes/' + b.item, { levelMin: numOrNull(min.value), levelMax: numOrNull(max.value) });
      show(r.ok ? b.item + ' 레벨 범위를 적었다' : fail('못 적었다', r), !r.ok); load();
    });
    var row = el('div', undefined, 'row'); row.appendChild(field('레벨 min', '', min)); row.appendChild(field('레벨 max', '', max)); row.appendChild(saveLv); body.appendChild(row);
    var tbody = el('tbody');
    b.contents.forEach(function (c, i) {
      var tr = el('tr'); cell(tr, i + 1, 'n'); cell(tr, c.item, 'mono'); cell(tr, c.name);
      var up = button('↑', 'btn ghost sm'); var down = button('↓', 'btn ghost sm'); var del = button('빼기', 'btn danger sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/drop-boxes/' + b.item + '/contents/' + c.item + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/drop-boxes/' + b.item + '/contents/' + c.item + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      del.addEventListener('click', async function () { if (!window.confirm(b.name + ' 에서 ' + c.name + ' 을 뺀다.')) return; var r = await call('DELETE', '/admin/drop-boxes/' + b.item + '/contents/' + c.item); show(r.ok ? '뺐다' : fail('못 뺐다', r), !r.ok); load(); });
      cell(tr, inline(up, down, del), 'act');
      tbody.appendChild(tr);
    });
    var addInput = input('text', 'mono'); addInput.setAttribute('list', 'item-keys'); addInput.placeholder = '아이템 key';
    var add = button('내용물 추가', 'btn sm');
    add.addEventListener('click', async function () { var r = await call('POST', '/admin/drop-boxes/' + b.item + '/contents', { item: addInput.value.trim() }); show(r.ok ? '더했다' : fail('더하지 못했다', r), !r.ok); load(); });
    var tr = el('tr'); cell(tr, ''); cell(tr, inline(addInput)); cell(tr, ''); cell(tr, add, 'act'); tbody.appendChild(tr);
    body.appendChild(mini(['#', 'key', '이름', ''], tbody));
    card.appendChild(body);
    return card;
  }

  document.getElementById('b-add').addEventListener('click', async function () {
    var r = await call('POST', '/admin/drop-boxes', { item: document.getElementById('b-item').value.trim(), levelMin: numOrNull(document.getElementById('b-min').value), levelMax: numOrNull(document.getElementById('b-max').value) });
    show(r.ok ? '상자를 더했다' : fail('더하지 못했다', r), !r.ok); load();
  });

  async function load() {
    var r = await call('GET', '/admin/drop-boxes/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    var dl = document.getElementById('item-keys'); dl.innerHTML = '';
    r.json.items.forEach(function (i) { var o = document.createElement('option'); o.value = i.key; o.label = i.name; dl.appendChild(o); });
    var wrap = document.getElementById('boxes'); wrap.innerHTML = '';
    r.json.boxes.forEach(function (b) { wrap.appendChild(boxCard(b)); });
    document.getElementById('stat-boxes').textContent = r.json.boxes.length;
    document.getElementById('stat-contents').textContent = r.json.boxes.reduce(function (s, b) { return s + b.contents.length; }, 0);
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
  }
  load();
</script>`,
)
