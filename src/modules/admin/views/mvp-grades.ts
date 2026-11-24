import { layout } from './layout'

/**
 * MVP 등급 표. 이름 · 경매장 수수료 · 스타포스 할인을 칸에서 바로 고치고 한 번에 저장한다.
 *
 * key 는 ENUM 과 일대일이라 더하고 지우는 폼이 없다. 차례가 등급의 높낮이라 ↑↓ 로 옮긴다.
 */
export const MVP_GRADES_HTML = layout(
  '/mvp-grades',
  'MVP 등급',
  `<div class="top"><h1>MVP 등급</h1><span class="grow"></span><span class="updated" id="updated"></span></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel">
  <div class="panel-head"><p>낮은 등급이 앞이다. 소속을 모르는 스타포스 줄이 그 날 가장 높은 등급을 찾을 때 이 차례를 쓴다. 새 등급은 코드가 분기에 쓰는 값이라 마이그레이션으로 더한다</p></div>
  <table class="sheet"><thead><tr><th>key</th><th>이름</th><th class="num">경매장 수수료 %</th><th class="num">스타포스 할인 %</th><th>명패</th><th></th></tr></thead><tbody id="rows"></tbody></table>
</section>
<style>.plate { width: 72px; height: 24px; object-fit: contain }</style>
<script>
  var batch = editing(function () { load(); });
  var assets = {};
  async function move(key, direction) { var r = await call('POST', '/mvp-grades/' + key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }
  function render(grades) {
    batch.clear();
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    grades.forEach(function (g) {
      var tr = el('tr'); cell(tr, g.key, 'label');
      var send = function () { return call('PUT', '/mvp-grades/' + g.key, { name: name.value(), auctionFeePercent: fee.value(), starforceDiscountPercent: discount.value() }); };
      var name = textCell(batch, g.name, g.name, send), fee = numCell(batch, g.name, g.auctionFeePercent, send, 'short'), discount = numCell(batch, g.name, g.starforceDiscountPercent, send, 'short');
      cell(tr, name.input); cell(tr, fee.input, 'num'); cell(tr, discount.input, 'num');
      var a = g.plateAssetId ? assets[g.plateAssetId] : null;
      if (a) { var img = el('img', undefined, 'plate'); img.src = '/assets/' + a.file; img.alt = ''; cell(tr, img); } else cell(tr, span('없음', 'dim'));
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm');
      up.addEventListener('click', function () { move(g.key, 'up'); }); down.addEventListener('click', function () { move(g.key, 'down'); });
      cell(tr, inline(up, down), 'act'); rows.appendChild(tr);
    });
  }
  async function load() {
    var a = await call('GET', '/images/list');
    if (a.ok) { assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; }); }
    var r = await call('GET', '/mvp-grades/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    document.getElementById('updated').textContent = r.json.updatedAt ? '마지막 갱신 ' + when(r.json.updatedAt) : '';
    render(r.json.mvpGrades);
  }
  load();
</script>`,
)
