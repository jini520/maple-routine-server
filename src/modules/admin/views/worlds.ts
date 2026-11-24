import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 월드. 표 하나에서 엠블럼 · 이름 · 챌린저스 · 이벤트 · 거래권을 칸에서 고친다. 열린 기간은 줄의 기간 단추가 여는 작은 창에서 고친다.
 *
 * 거래권은 장비를 관세 내고 서로 거래할 수 있는 월드끼리 같은 값이다. 비우면 시세에서 빠진다(스페셜). 거래권은 앱에 안 간다.
 * key 는 기록 · 원장 · 서버 가격 줄이 들어 못 바꾸고, 월드는 지우지 않는다. 새 챌린저스 시즌이 열리면 월드를 더하고 챌린저스를
 * 켠다. 챌린저스를 켜야 시즌 보스가 보이고 월드 리프를 묻는다. 시즌 보스 자체의 끝은 보스 목록의 유효 기간이다.
 * 열린 기간은 월드마다 여러 줄이다. 이벤트 · 챌린저스 월드가 시즌마다 같은 이름으로 다시 열리기 때문이다.
 */
export const WORLDS_HTML = layout(
  '/worlds',
  '월드',
  `<div class="top"><h1>월드</h1><span class="grow"></span><span class="updated" id="updated"></span><button id="add" class="btn sm" type="button">월드 추가</button></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel">
  <table class="sheet tight"><thead><tr><th>#</th><th>key</th><th>엠블럼</th><th>이름</th><th>챌린저스</th><th>이벤트</th><th>거래권</th><th>열린 기간</th><th></th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>차례가 앱의 월드 차례다. 거래권이 같은 월드끼리 장비를 거래할 수 있고, 비우면 드롭 시세에서 빠진다. 이름은 넥슨 API world_name 표기다.</p></div>
</section>
${ASSET_PICKER}
<script>
  var D = null, assets = {};
  var batch = editing(function () { load(); });
  function lookup(id) { return assets[id]; }
  function tradeChoices() { return [['', '시세 제외']].concat(D.tradeGroups.map(function (g) { return [g.key, g.name]; })); }
  async function move(w, direction) { var r = await call('POST', '/worlds/' + w.key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }

  // 열린 기간은 줄마다 바로 저장한다. 기간끼리 겹치면 서버가 거절해서, 여러 줄을 한 번에 보내면 어느 줄이 문제인지 가리기 어렵다.
  function periods(w) {
    var form = el('div', undefined, 'form-body'); var tb = el('tbody');
    w.openPeriods.forEach(function (p) {
      var tr = el('tr'); var from = input('text', 'mono'); from.value = p.validFrom; var until = input('text', 'mono'); until.value = p.validUntil;
      var save = button('저장', 'btn ghost sm'), rm = button('지우기', 'btn danger sm');
      save.addEventListener('click', async function () { var r = await call('PUT', '/worlds/periods/' + p.id, { validFrom: from.value.trim(), validUntil: until.value.trim() }); show(r.ok ? '기간을 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) { d.close(); load(); } });
      rm.addEventListener('click', async function () { if (!window.confirm(p.validFrom + ' ~ ' + p.validUntil + ' 기간을 지운다.')) return; var r = await call('DELETE', '/worlds/periods/' + p.id); show(r.ok ? '기간을 지웠다' : fail('못 지웠다', r), !r.ok); if (r.ok) { d.close(); load(); } });
      cell(tr, from); cell(tr, until); cell(tr, inline(save, rm), 'act'); tb.appendChild(tr);
    });
    var tr = el('tr'); var nf = input('text', 'mono'); nf.placeholder = '2025-11-20'; var nu = input('text', 'mono'); nu.placeholder = '2025-12-19'; var add = button('기간 추가', 'btn sm');
    add.addEventListener('click', async function () { var r = await call('POST', '/worlds/' + w.key + '/periods', { validFrom: nf.value.trim(), validUntil: nu.value.trim() }); show(r.ok ? '기간을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); } });
    cell(tr, nf); cell(tr, nu); cell(tr, add, 'act'); tb.appendChild(tr);
    form.appendChild(mini(['시작 (연 날)', '끝 (닫힌 다음 날)', ''], tb));
    form.appendChild(el('p', 'KST 날짜다. 끝은 닫힌 다음 날이라 그 날은 안 든다. 새벽 3시에 닫혔으면 다음 날을 적는다. 같은 월드의 기간끼리는 겹칠 수 없다. 앱은 이벤트 월드에서 지운 캐릭터의 강화를 이 기간으로 가린다.', 'hint'));
    var d = openForm(w.name + ' 열린 기간', form); d.classList.add('mid');
  }

  function render() {
    batch.clear();
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    D.worlds.forEach(function (w, i) {
      var tr = el('tr'); cell(tr, i + 1, 'n'); cell(tr, w.key, 'label'); var emblem, name, ch, ev, trade;
      var send = function () { return call('PUT', '/worlds/' + w.key, { name: name.value(), emblemAssetId: emblem.value(), isChallengers: ch.value(), isEvent: ev.value(), tradeGroupKey: orNull(trade.value()) }); };
      emblem = assetCell(batch, w.key, w.emblemAssetId, send, { categories: ['world'], uploadCategory: 'world', lookup: lookup, nullable: true, compact: true });
      name = textCell(batch, w.key, w.name, send, 'w-name'); ch = checkCell(batch, w.key, w.isChallengers, send, '챌린저스'); ev = checkCell(batch, w.key, w.isEvent, send, '이벤트');
      trade = selectCell(batch, w.key, w.tradeGroupKey === null ? '' : w.tradeGroupKey, send, tradeChoices());
      cell(tr, emblem.input); cell(tr, name.input); cell(tr, ch.input); cell(tr, ev.input); cell(tr, trade.input);
      var pb = button(w.openPeriods.length === 0 ? '기간 없음' : w.openPeriods.map(function (p) { return p.validFrom + ' ~ ' + p.validUntil; }).join(', '), 'btn ghost sm');
      pb.addEventListener('click', function () { periods(w); }); cell(tr, pb);
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'); up.disabled = i === 0; down.disabled = i === D.worlds.length - 1;
      up.addEventListener('click', function () { move(w, 'up'); }); down.addEventListener('click', function () { move(w, 'down'); });
      var act = inline(up, down); act.className = 'inline row-act'; cell(tr, act, 'act');
      tb.appendChild(tr);
    });
  }

  document.getElementById('add').addEventListener('click', function () {
    var form = el('div', undefined, 'form-body'); var key = input('text', 'mono'); key.placeholder = 'challengers_5'; var name = input('text'); name.placeholder = '챌린저스5';
    var trade = select(tradeChoices(), 'general'); var ch = input('checkbox'), ev = input('checkbox');
    var emblem = { id: null }; var emblemText = span('없음', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['world'], uploadCategory: 'world', current: emblem.id, onPick: function (f) { emblem.id = f ? f.id : null; emblemText.textContent = f ? f.fileName + '.' + f.extension : '없음'; } }); });
    var checks = el('div', undefined, 'inline'); [[ch, '챌린저스'], [ev, '이벤트 월드']].forEach(function (x) { var l = el('label', undefined, 'check'); l.appendChild(x[0]); l.appendChild(document.createTextNode(x[1])); checks.appendChild(l); });
    form.appendChild(field('key', '못 바꾼다. 챌린저스 둘째부터는 challengers_2 처럼 번호를 붙인다', key)); form.appendChild(field('이름', 'API world_name 표기', name));
    form.appendChild(field('엠블럼', '월드 분류의 그림', inline(emblemText, pick))); form.appendChild(field('거래권', '비우면 시세 제외', trade)); form.appendChild(checks);
    var go = button('월드 추가', 'btn'); form.appendChild(go); var d = openForm('월드 추가', form);
    go.addEventListener('click', async function () {
      var body = { key: key.value.trim(), name: name.value.trim(), emblemAssetId: emblem.id, isChallengers: ch.checked, isEvent: ev.checked, tradeGroupKey: orNull(trade.value) };
      var r = await call('POST', '/worlds', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  });

  async function load() {
    var r = await call('GET', '/worlds/rows'); var a = await call('GET', '/images/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    D = r.json; assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
