import { layout } from './layout'

/**
 * MVP 등급 표. 표 하나다. 줄의 수정을 누르면 이름 · 퍼센트 둘이 입력으로 바뀐다.
 *
 * key 는 ENUM 과 일대일이라 더하고 지우는 폼이 없다. 차례가 등급의 높낮이라 ↑↓ 로 옮긴다.
 */
export const MVP_GRADES_HTML = layout(
  '/admin/mvp-grades',
  'MVP 등급',
  `<div class="head">
  <div>
    <h1>MVP 등급</h1>
    <p>등급마다 경매장 수수료와 스타포스 할인이다. 차례가 등급의 높낮이이고 낮은 등급이 앞이다. 새 등급은 코드가 분기에 쓰는 값이라 마이그레이션으로 더한다. 바꾸면 <code>mvpGrades.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-grades">–</b><span>등급</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>등급</h2><p>낮은 등급이 앞. 소속을 모르는 스타포스 줄이 그 날 가장 높은 등급을 찾을 때 이 차례를 쓴다</p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th class="num">경매장 수수료 %</th><th class="num">스타포스 할인 %</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<script>
  var state = { grades: [], editing: null };

  function gradeRow(g, i) {
    var tr = el('tr', undefined, state.editing === g.key ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, g.key, 'mono');
    if (state.editing !== g.key) {
      cell(tr, g.name); cell(tr, g.auctionFeePercent, 'num'); cell(tr, g.starforceDiscountPercent === 0 ? span('없음', 'dim') : g.starforceDiscountPercent, 'num');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/mvp-grades/' + g.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/mvp-grades/' + g.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      edit.addEventListener('click', function () { state.editing = g.key; render(); });
      cell(tr, inline(up, down, edit), 'act'); return tr;
    }
    var name = input('text'); name.value = g.name;
    var fee = input('number'); fee.min = '0'; fee.max = '100'; fee.value = g.auctionFeePercent;
    var discount = input('number'); discount.min = '0'; discount.max = '100'; discount.value = g.starforceDiscountPercent;
    cell(tr, name); cell(tr, fee, 'num'); cell(tr, discount, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/mvp-grades/' + g.key, { name: name.value.trim(), auctionFeePercent: Number(fee.value), starforceDiscountPercent: Number(discount.value) });
      show(r.ok ? g.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act'); return tr;
  }

  function render() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    state.grades.forEach(function (g, i) { rows.appendChild(gradeRow(g, i)); });
    if (state.grades.length === 0) { var tr = el('tr'); var td = cell(tr, '없다. 씨앗이 안 돌았다', 'empty'); td.colSpan = 6; rows.appendChild(tr); }
  }

  async function load() {
    var r = await call('GET', '/admin/mvp-grades/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.grades = r.json.grades;
    document.getElementById('stat-grades').textContent = state.grades.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
