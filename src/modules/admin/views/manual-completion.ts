import { layout } from './layout'

/** 직접 완료 열고 닫기. 드롭다운은 bosses 표에서 오고, 닫는 것은 줄 id 로 한다. */
export const MANUAL_COMPLETION_HTML = layout(
  '/admin/manual-completion',
  '직접 완료',
  `<div class="head"><div><h1>직접 완료</h1><p>연 보스는 그 보스의 모든 난이도에 열린다. 닫으면 앱의 단추가 그 순간 사라지고 줄은 이력으로 남는다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>열기</h2><p>이미 열린 보스는 다시 못 연다</p></header>
  <div class="body">
    <div class="row">
      <div class="field"><label for="boss">보스</label><select id="boss" class="w-auto"></select></div>
      <div class="field"><label for="from">여는 날</label><input id="from" type="date" class="w-auto"></div>
      <button id="open" class="btn" type="button">열기</button>
    </div>
  </div>
</section>
<section class="card">
  <header><h2>열린 보스</h2><p id="open-count"></p></header>
  <div class="table"><table><thead><tr><th>보스</th><th>여는 날</th><th>연 때</th><th></th></tr></thead><tbody id="open-rows"></tbody></table></div>
</section>
<section class="card">
  <header><h2>닫은 이력</h2><p id="closed-count"></p></header>
  <div class="table"><table><thead><tr><th>보스</th><th>여는 날</th><th>연 때</th><th>닫은 때</th></tr></thead><tbody id="closed-rows"></tbody></table></div>
</section>
<script>
  function cell(tr, text, cls) { var td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; tr.appendChild(td); return td; }
  function who(tr, row) { var td = document.createElement('td'); td.textContent = row.name + ' '; var k = document.createElement('span'); k.className = 'mono dim'; k.textContent = row.boss; td.appendChild(k); tr.appendChild(td); }
  function emptyRow(tbody, cols) { var tr = document.createElement('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = cols; tbody.appendChild(tr); }
  async function load() {
    var r = await call('GET', '/admin/manual-completion/rows');
    var data = r.json || { rows: [], bosses: [] };
    var select = document.getElementById('boss');
    select.innerHTML = '';
    data.bosses.forEach(function (b) {
      var o = document.createElement('option'); o.value = b.key; o.textContent = b.name + ' (' + b.key + ')'; select.appendChild(o);
    });
    var open = document.getElementById('open-rows'); open.innerHTML = '';
    var closed = document.getElementById('closed-rows'); closed.innerHTML = '';
    var openCount = 0, closedCount = 0;
    data.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      who(tr, row); cell(tr, row.from, 'mono'); cell(tr, when(row.openedAt), 'mono');
      if (row.closedAt === null) {
        openCount += 1;
        var td = cell(tr, '', 'act'); var b = document.createElement('button'); b.type = 'button'; b.className = 'btn danger sm'; b.textContent = '닫기';
        b.addEventListener('click', async function () {
          var res = await call('DELETE', '/admin/manual-completion/' + row.id);
          show(res.ok ? row.name + ' 을 닫았다' : '못 닫았다 ' + res.status, !res.ok);
          load();
        });
        td.appendChild(b); open.appendChild(tr);
      } else { closedCount += 1; cell(tr, when(row.closedAt), 'mono'); closed.appendChild(tr); }
    });
    if (openCount === 0) emptyRow(open, 4);
    if (closedCount === 0) emptyRow(closed, 4);
    document.getElementById('open-count').textContent = openCount + '줄';
    document.getElementById('closed-count').textContent = closedCount + '줄';
  }
  document.getElementById('open').addEventListener('click', async function () {
    var boss = document.getElementById('boss').value;
    var from = document.getElementById('from').value;
    var r = await call('POST', '/admin/manual-completion', { boss: boss, from: from });
    if (!r.ok) { show('못 열었다 ' + r.status + '\\n' + r.text, true); return; }
    show(boss + ' 을 ' + from + ' 부터 열었다', false);
    load();
  });
  load();
</script>`,
)
