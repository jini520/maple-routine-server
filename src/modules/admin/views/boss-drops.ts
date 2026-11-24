import { layout } from './layout'

/**
 * 드롭 표. 왼쪽에서 보스를, 오른쪽 위에서 난이도를 고르면 그 조합의 보상 줄이 분류마다 선다. 개수 · 기간은 칸에서 바로 고친다.
 *
 * 줄의 차례가 앱 드롭 시트의 타일 차례다. 줄을 지우는 버튼은 두지 않는다. 지우면 그 아이템의 지난 드롭이 동기화에서 거절되므로 보스가
 * 주는 것이 바뀌면 끝을 적는다.
 */
export const BOSS_DROPS_HTML = layout(
  '/boss-drops',
  '드롭 표',
  `<div class="top"><h1>드롭 표</h1><span class="grow"></span></div>
<div id="message" class="msg" role="status" hidden></div>
<datalist id="item-keys"></datalist>
<div class="split"><nav class="picklist" id="list" aria-label="보스"></nav><section class="panel" id="detail"></section></div>
<script>
  var CATS = [['fixed', '고정 보상'], ['equipment', '장비'], ['consumable', '소비']];
  var LETTER = { easy: 'E', normal: 'N', hard: 'H', chaos: 'C', extreme: 'X' };
  var catalog = null, boss = null, difficulty = null, rows = [];
  var batch = editing(function () { loadRows(); });
  function bossOf(key) { return catalog.bosses.filter(function (b) { return b.key === key; })[0]; }
  async function move(r, direction) { var x = await call('POST', '/boss-drops/' + r.id + '/move', { direction: direction }); if (!x.ok) show(fail('못 옮겼다', x), true); loadRows(); }

  function rewardRow(r, i) {
    var tr = el('tr'); cell(tr, i + 1, 'n'); var nm = span(r.itemName + ' '); nm.appendChild(span(r.item, 'mono dim')); cell(tr, nm, 'wrap');
    var q, from, until, name = r.itemName + (r.validFrom ? ' (' + r.validFrom + ')' : '');
    var send = function () { return call('PUT', '/boss-drops/' + r.id, { quantity: q ? q.value() : null, validFrom: orNull(from.value()), validUntil: orNull(until.value()) }); };
    if (r.category === 'fixed') { q = numCell(batch, name, r.quantity, send, 'short'); cell(tr, q.input, 'num'); } else cell(tr, '', 'num');
    from = textCell(batch, name, r.validFrom, send, 'period'); from.input.placeholder = '처음부터';
    until = textCell(batch, name, r.validUntil, send, 'period'); until.input.placeholder = '끝없이';
    cell(tr, from.input); cell(tr, until.input);
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm');
    up.addEventListener('click', function () { move(r, 'up'); }); down.addEventListener('click', function () { move(r, 'down'); });
    var act = inline(up, down); act.className = 'inline row-act'; cell(tr, act, 'act');
    return tr;
  }

  function addRow(category, label) {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.setAttribute('list', 'item-keys');
    var q = input('number'); q.min = '1'; var from = input('text', 'mono'); from.placeholder = '2026-09-17T10:00'; var until = input('text', 'mono');
    form.appendChild(field('아이템', '아이템 표에 있어야 한다', key));
    if (category === 'fixed') form.appendChild(field('개수', undefined, q));
    form.appendChild(field('시작', '새로 생긴 보상이면 패치 시각. 비우면 처음부터', from)); form.appendChild(field('끝', '비우면 끝없이', until));
    var go = button('줄 추가', 'btn'); form.appendChild(go);
    var d = openForm(bossOf(boss).name + ' ' + difficulty + ' · ' + label + ' 줄 추가', form);
    go.addEventListener('click', async function () {
      var body = { boss: boss, difficulty: difficulty, category: category, item: key.value.trim(), quantity: category === 'fixed' && q.value.trim() !== '' ? Number(q.value) : null, validFrom: orNull(from.value), validUntil: orNull(until.value) };
      var x = await call('POST', '/boss-drops', body);
      show(x.ok ? body.item + ' 줄을 더했다' : fail('더하지 못했다', x), !x.ok); if (x.ok) { d.close(); loadRows(); }
    });
  }

  function renderDetail() {
    batch.clear();
    var box = document.getElementById('detail'); box.innerHTML = '';
    var b = bossOf(boss); if (!b) return;
    var head = el('div', undefined, 'detail-head'); head.appendChild(el('h2', b.name)); head.appendChild(span('', 'grow'));
    head.appendChild(segButtons(b.difficulties.map(function (d) { return [d.difficulty, d.difficulty]; }), difficulty, function (v) { if (!discardOk(batch)) return; difficulty = v; setHashKey(boss + '/' + v); loadRows(); }));
    box.appendChild(head);
    var t = el('table', undefined, 'sheet'); var thead = el('thead'); var hr = el('tr');
    ['#', '아이템', '개수', '시작', '끝', ''].forEach(function (h, i) { var th = el('th', h); if (i === 2) th.className = 'num'; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead); var tb = el('tbody');
    CATS.forEach(function (c) {
      var mine = rows.filter(function (r) { return r.category === c[0]; });
      var g = el('tr', undefined, 'group'); var td = document.createElement('td'); td.colSpan = 6; td.appendChild(document.createTextNode(c[1] + ' ' + mine.length));
      var add = button('줄 추가', 'btn ghost sm'); add.addEventListener('click', function () { addRow(c[0], c[1]); }); td.appendChild(add); g.appendChild(td); tb.appendChild(g);
      mine.forEach(function (r, i) { tb.appendChild(rewardRow(r, i)); });
    });
    t.appendChild(tb); box.appendChild(t);
    var foot = el('div', undefined, 'panel-head'); foot.style.marginTop = '10px';
    foot.appendChild(el('p', '차례가 앱 드롭 시트의 타일 차례다. 기간은 KST 2026-09-17 또는 2026-09-17T10:00. 패치로 빠진 보상은 끝을 적는다.'));
    box.appendChild(foot);
  }

  async function loadRows() {
    var b = bossOf(boss);
    if (!b) { renderDetail(); return; }
    if (!b.difficulties.some(function (d) { return d.difficulty === difficulty; })) difficulty = b.difficulties[0].difficulty;
    var r = await call('GET', '/boss-drops/rows?boss=' + boss + '&difficulty=' + difficulty);
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    rows = r.json.rows; renderDetail();
  }

  function renderList() {
    pickList(document.getElementById('list'), catalog.bosses.map(function (b) { return { key: b.key, title: b.name, meta: b.difficulties.map(function (d) { return LETTER[d.difficulty]; }).join('') }; }), boss, function (k) {
      if (!discardOk(batch)) return; boss = k; setHashKey(k + '/' + (difficulty || '')); renderList(); loadRows();
    });
  }

  (async function boot() {
    var c = await call('GET', '/bosses/rows'); if (!c.ok) { show('보스 표를 못 읽었다 ' + c.status, true); return; }
    catalog = c.json;
    var h = (hashKey() || '').split('/'); boss = bossOf(h[0]) ? h[0] : (catalog.bosses[0] ? catalog.bosses[0].key : null); difficulty = h[1] || null;
    var items = await call('GET', '/drop-items/rows');
    if (items.ok) { var dl = document.getElementById('item-keys'); items.json.items.forEach(function (i) { var o = document.createElement('option'); o.value = i.key; o.label = i.name; dl.appendChild(o); }); }
    renderList(); loadRows();
  })();
</script>`,
)
