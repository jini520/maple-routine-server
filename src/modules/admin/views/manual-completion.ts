import { layout } from './layout'

/** 직접 완료 열고 닫기. 드롭다운은 bosses 표에서 오고, 닫는 것은 줄 id 로 한다. */
export const MANUAL_COMPLETION_HTML = layout(
  '직접 완료',
  `<h1>직접 완료</h1>
<p>연 보스는 그 보스의 모든 난이도에 열린다. 닫으면 앱의 단추가 그 순간 사라지고 줄은 이력으로 남는다.</p>
<div id="message"></div>
<p>
  <label>보스 <select id="boss"></select></label>
  <label>여는 날 <input id="from" type="date"></label>
  <button id="open">열기</button>
</p>
<h2>열린 보스</h2>
<table><thead><tr><th>보스</th><th>여는 날</th><th>연 때</th><th></th></tr></thead><tbody id="open-rows"></tbody></table>
<h2>닫은 이력</h2>
<table><thead><tr><th>보스</th><th>여는 날</th><th>연 때</th><th>닫은 때</th></tr></thead><tbody id="closed-rows"></tbody></table>
<script>
  function cell(tr, text) { var td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; }
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
    data.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      cell(tr, row.name + ' (' + row.boss + ')'); cell(tr, row.from); cell(tr, row.openedAt);
      if (row.closedAt === null) {
        var td = cell(tr, ''); var b = document.createElement('button'); b.className = 'quiet'; b.textContent = '닫기';
        b.addEventListener('click', async function () {
          var res = await call('DELETE', '/admin/manual-completion/' + row.id);
          show(res.ok ? row.name + ' 을 닫았다' : '못 닫았다 ' + res.status, !res.ok);
          load();
        });
        td.appendChild(b); open.appendChild(tr);
      } else { cell(tr, row.closedAt); closed.appendChild(tr); }
    });
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
