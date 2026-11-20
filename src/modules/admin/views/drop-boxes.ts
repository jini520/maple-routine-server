import { layout } from './layout'

/**
 * 랜덤 상자. 왼쪽은 상자 목록, 오른쪽은 고른 상자의 레벨 범위와 내용물이다. 내용물 차례가 앱에서 상자를 열면 서는 후보 차례다.
 *
 * 상자는 더하기만 있다. 기록이 상자 key 를 든다. 내용물은 더하고 빼고 옮긴다. 반지 상자만 레벨 범위를 든다.
 */
export const DROP_BOXES_HTML = layout(
  '/admin/drop-boxes',
  '상자',
  `<div class="top"><h1>상자</h1><span class="grow"></span><span class="updated" id="updated"></span><button id="b-new" class="btn sm" type="button">새 상자</button></div>
<div id="message" class="msg" role="status" hidden></div>
<datalist id="item-keys"></datalist>
<div class="split"><nav class="picklist" id="list" aria-label="상자"></nav><section class="panel" id="detail"></section></div>
<script>
  var D = null, current = null;
  var batch = editing(function () { load(); });
  async function move(b, c, direction) { var r = await call('POST', '/admin/drop-boxes/' + b.item + '/contents/' + c.item + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }

  function renderDetail(b) {
    var box = document.getElementById('detail'); box.innerHTML = '';
    if (!b) { box.appendChild(el('p', '상자가 없다', 'dim')); return; }
    var head = el('div', undefined, 'detail-head'); var title = el('div'); title.appendChild(el('h2', b.name)); title.appendChild(span(b.item, 'mono dim')); head.appendChild(title); box.appendChild(head);
    var fields = el('div', undefined, 'fields'); var min, max;
    var send = function () { return call('PUT', '/admin/drop-boxes/' + b.item, { ringLevelMin: min.value(), ringLevelMax: max.value() }); };
    min = numCell(batch, b.item + ' 레벨', b.ringLevelMin, send, 'short'); max = numCell(batch, b.item + ' 레벨', b.ringLevelMax, send, 'short');
    var lv = el('span', '레벨 범위 ', 'rule'); lv.appendChild(min.input); lv.appendChild(document.createTextNode('~')); lv.appendChild(max.input); fields.appendChild(lv);
    fields.appendChild(el('span', '반지 상자만 적는다. 장신구 상자는 둘 다 비운다', 'dim'));
    box.appendChild(fields);
    var t = el('table', undefined, 'sheet'); var tb = el('tbody');
    b.contents.forEach(function (c, i) {
      var tr = el('tr'); cell(tr, i + 1, 'n'); cell(tr, c.name); cell(tr, c.item, 'label');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), rm = button('빼기', 'btn danger sm');
      up.addEventListener('click', function () { move(b, c, 'up'); }); down.addEventListener('click', function () { move(b, c, 'down'); });
      rm.addEventListener('click', async function () { if (!window.confirm(b.name + ' 에서 ' + c.name + ' 을 뺀다.')) return; var r = await call('DELETE', '/admin/drop-boxes/' + b.item + '/contents/' + c.item); show(r.ok ? '뺐다' : fail('못 뺐다', r), !r.ok); load(); });
      var act = inline(up, down, rm); act.className = 'inline row-act'; cell(tr, act, 'act'); tb.appendChild(tr);
    });
    if (b.contents.length === 0) { var tr = el('tr'); var td = cell(tr, '내용물이 없다', 'empty'); td.colSpan = 4; tb.appendChild(tr); }
    t.appendChild(tb); box.appendChild(t);
    var foot = el('div', undefined, 'panel-head'); foot.style.marginTop = '10px';
    foot.appendChild(el('p', b.contents.length + '개 · 차례가 상자를 열면 서는 후보 차례다')); foot.appendChild(span('', 'grow'));
    var add = button('내용물 추가', 'btn ghost sm'); add.addEventListener('click', function () { addContent(b); }); foot.appendChild(add);
    box.appendChild(foot);
  }

  // 여러 개를 이어 넣을 수 있게 더한 뒤에도 창을 닫지 않고 칸만 비운다.
  function addContent(b) {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.setAttribute('list', 'item-keys'); key.placeholder = '아이템 key';
    form.appendChild(field('아이템', '맨 뒤에 선다. 아이템 표에 있어야 한다', key));
    var go = button('더하기', 'btn'); form.appendChild(go);
    openForm(b.name + ' 내용물 추가', form);
    go.addEventListener('click', async function () {
      var r = await call('POST', '/admin/drop-boxes/' + b.item + '/contents', { item: key.value.trim() });
      show(r.ok ? key.value.trim() + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { key.value = ''; key.focus(); load(); }
    });
  }

  function newBox() {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.setAttribute('list', 'item-keys'); key.placeholder = 'green_boss_ring_box';
    var min = input('number'), max = input('number'); min.min = '1'; max.min = '1';
    form.appendChild(field('상자 아이템 key', '아이템 표에 먼저 있어야 한다', key));
    form.appendChild(field('레벨 범위', '반지 상자만. 장신구 상자는 비운다', inline(min, document.createTextNode('~'), max)));
    var go = button('상자 추가', 'btn'); form.appendChild(go);
    var d = openForm('새 상자', form);
    go.addEventListener('click', async function () {
      var num = function (i) { return i.value.trim() === '' ? null : Number(i.value); };
      var r = await call('POST', '/admin/drop-boxes', { item: key.value.trim(), ringLevelMin: num(min), ringLevelMax: num(max) });
      show(r.ok ? '상자를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); current = key.value.trim(); setHashKey(current); load(); }
    });
  }

  function render() {
    batch.clear();
    if (!D.boxes.some(function (b) { return b.item === current; })) current = D.boxes.length ? D.boxes[0].item : null;
    pickList(document.getElementById('list'), D.boxes.map(function (b) { return { key: b.item, title: b.name, meta: String(b.contents.length) }; }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); });
    renderDetail(D.boxes.filter(function (b) { return b.item === current; })[0]);
  }

  document.getElementById('b-new').addEventListener('click', newBox);
  async function load() {
    var r = await call('GET', '/admin/drop-boxes/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    D = r.json; if (current === null) current = hashKey();
    var dl = document.getElementById('item-keys'); dl.innerHTML = '';
    D.items.forEach(function (i) { var o = document.createElement('option'); o.value = i.key; o.label = i.name; dl.appendChild(o); });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
