import { layout } from './layout'

/**
 * 보스 직접 완료. 연 보스는 그 보스의 모든 난이도에 열리고, 닫으면 앱의 단추가 그 순간 사라진다. 닫은 줄은 이력으로 남는다.
 *
 * 열린 줄과 닫은 이력을 표 하나에 두고 열린 줄을 위에 세운다. 이력은 쌓이기만 하므로 표가 칸 안에서 스크롤한다. 보스 열기는
 * 단추가 띄우는 작은 창이고, 이미 열린 보스는 고르는 목록에 없다. 닫기는 보스 key 가 아니라 줄 id 로 한다.
 */
export const MANUAL_COMPLETION_HTML = layout(
  '/manual-completion',
  '보스 직접 완료',
  `<div class="top"><h1>보스 직접 완료</h1><span class="dim" id="summary"></span><span class="grow"></span><button id="open" class="btn sm" type="button">보스 열기</button></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel">
  <div class="panel-head"><p>연 보스는 그 보스의 모든 난이도에 열린다. 닫으면 앱의 단추가 그 순간 사라지고 줄은 이력으로 남는다</p></div>
  <div class="fill" id="list"><table class="sheet"><thead><tr><th>상태</th><th>보스</th><th>여는 날</th><th>연 때</th><th>닫은 때</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  var D = { rows: [], bosses: [] };
  function isOpen(row) { return row.closedAt === null; }
  // 오늘 KST 날짜. 여는 날 칸의 처음 값이다.
  function todayKst() { return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); }
  function render() {
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    // 서버는 연 때가 늦은 줄부터 준다. 그 차례를 지킨 채 열린 줄을 위로 올린다.
    var open = D.rows.filter(isOpen), closed = D.rows.filter(function (r) { return !isOpen(r); });
    document.getElementById('summary').textContent = '열림 ' + open.length + ' · 이력 ' + closed.length;
    if (D.rows.length === 0) { var tr0 = el('tr'); var td0 = cell(tr0, '연 보스가 없다', 'empty'); td0.colSpan = 6; tb.appendChild(tr0); return; }
    open.concat(closed).forEach(function (row) {
      var tr = el('tr', undefined, isOpen(row) ? '' : 'muted');
      cell(tr, isOpen(row) ? span('열림', 'tag accent') : span('닫음', 'tag'));
      var who = el('span'); who.appendChild(document.createTextNode(row.name + ' ')); who.appendChild(span(row.boss, 'mono dim')); cell(tr, who);
      cell(tr, row.fromDate, 'mono'); cell(tr, when(row.openedAt), 'mono'); cell(tr, when(row.closedAt), 'mono');
      var act = cell(tr, '', 'act');
      if (isOpen(row)) {
        var close = button('닫기', 'btn danger sm');
        close.addEventListener('click', async function () {
          if (!window.confirm('‘' + row.name + '’ 을 닫는다. 앱의 직접 완료 단추가 바로 사라진다.')) return;
          var r = await call('DELETE', '/manual-completion/' + row.id);
          show(r.ok ? row.name + ' 을 닫았다' : fail('못 닫았다', r), !r.ok); load();
        });
        act.appendChild(close);
      }
      tb.appendChild(tr);
    });
  }
  document.getElementById('open').addEventListener('click', function () {
    var opened = {}; D.rows.forEach(function (r) { if (isOpen(r)) opened[r.boss] = true; });
    var choices = D.bosses.filter(function (b) { return !opened[b.key]; }).map(function (b) { return [b.key, b.name + ' (' + b.key + ')']; });
    if (choices.length === 0) { show('모든 보스가 이미 열려 있다', true); return; }
    var form = el('div', undefined, 'form-body'), boss = select(choices), from = input('date'); from.value = todayKst();
    form.appendChild(field('보스', '이미 열린 보스는 목록에 없다', boss)); form.appendChild(field('여는 날', 'KST', from));
    var go = button('열기', 'btn'); form.appendChild(go); var d = openForm('보스 열기', form);
    go.addEventListener('click', async function () {
      var r = await call('POST', '/manual-completion', { boss: boss.value, fromDate: from.value });
      show(r.ok ? boss.value + ' 을 ' + from.value + ' 부터 열었다' : fail('못 열었다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  });
  async function load() {
    var r = await call('GET', '/manual-completion/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    D = r.json; render();
  }
  fillToBottom(document.getElementById('list'), 44);
  load();
</script>`,
)
