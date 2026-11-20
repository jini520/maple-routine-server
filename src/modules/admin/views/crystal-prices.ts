import { layout } from './layout'

/**
 * 결정석 가격. 보스를 줄로, 난이도를 칸으로 놓은 표 하나에 지금 가격이 선다. 칸을 누르면 그 조합의 가격 줄 · 새 가격 · 파티 인원 상한을
 * 작은 창에서 고친다.
 *
 * 새 가격은 지금 줄을 닫고 새 줄을 연다. 옛 줄은 과거 기간이 읽어 안 건드린다. 시작은 그 보스의 기간 경계여야 한다.
 * 주간 · 시즌은 목요일, 월간은 1일이다. 패치가 기간 첫날 안에서 적용되면 T10:00 처럼 시각까지 적는다.
 */
export const CRYSTAL_PRICES_HTML = layout(
  '/admin/crystal-prices',
  '결정석 가격',
  `<div class="top"><h1>결정석 가격</h1><span class="dim" id="summary"></span><span class="grow"></span><span class="updated" id="updated"></span></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel"><table class="sheet price-grid"><thead><tr id="head"></tr></thead><tbody id="rows"></tbody></table></section>
<style>
  .price-grid td { padding: 1px 6px }
  .price-grid td.label { width: 1% }
  .price-cell { display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; width: 100%; padding: 3px 8px; border: 0; border-radius: 6px; background: transparent; font: 500 13px/1.3 var(--mono); color: var(--text); cursor: pointer }
  .price-cell:hover { background: var(--fill) }
  .price-cell small { font: 11.5px var(--font); color: var(--text-3) }
  .price-cell.missing { color: var(--danger-ink) }
</style>
<script>
  var DIFFS = ['easy', 'normal', 'hard', 'chaos', 'extreme'];
  var D = null;
  function current(p) { return p.prices.filter(function (r) { return r.validUntil === null; })[0] || null; }

  function openPair(p) {
    var form = el('div', undefined, 'form-body');
    var tb = el('tbody');
    p.prices.slice().reverse().forEach(function (r) {
      var tr = el('tr'); cell(tr, r.validFrom || '처음부터', 'mono'); cell(tr, r.validUntil || '지금', 'mono'); cell(tr, meso(r.priceMeso), 'num');
      if (r.validUntil === null) {
        var rm = button('거두기', 'btn danger sm');
        rm.addEventListener('click', async function () { if (!window.confirm('지금 가격 줄을 거둔다. 바로 앞 줄이 다시 열린다.')) return; var x = await call('DELETE', '/admin/crystal-prices/rows/' + r.id); show(x.ok ? '거뒀다' : fail('못 거뒀다', x), !x.ok); if (x.ok) { d.close(); load(); } });
        cell(tr, rm, 'act');
      } else cell(tr, '');
      tb.appendChild(tr);
    });
    if (p.prices.length === 0) { var tr = el('tr'); var td = cell(tr, '가격 줄이 없다', 'empty'); td.colSpan = 4; tb.appendChild(tr); }
    form.appendChild(mini(['시작', '끝', '가격', ''], tb));
    var price = input('number'); price.min = '1'; price.placeholder = '메소'; var from = input('text', 'mono'); from.placeholder = p.cycle === 'monthly' ? '2026-11-01' : '2026-10-22 (목요일)';
    var add = button('새 가격 열기', 'btn');
    var grid = el('div', undefined, 'grid2'); grid.appendChild(field('새 가격', '1인 기준 정가', price)); grid.appendChild(field('시작', p.cycle === 'monthly' ? '월간은 1일' : '주간은 목요일. 첫 줄은 비워도 된다', from)); form.appendChild(grid);
    form.appendChild(add);
    var cap = input('number'); cap.min = '1'; cap.max = '6'; cap.value = p.maxPartySize == null ? '' : p.maxPartySize; cap.placeholder = String(D.defaultMaxPartySize);
    var saveCap = button('상한 저장', 'btn ghost sm');
    form.appendChild(field('파티 인원 상한', '비우면 기본값 ' + D.defaultMaxPartySize + '인', inline(cap, saveCap)));
    var d = openForm(p.bossName + ' ' + p.difficulty, form); d.classList.add('mid');
    add.addEventListener('click', async function () {
      var x = await call('POST', '/admin/crystal-prices/' + p.boss + '/' + p.difficulty, { priceMeso: Number(price.value), validFrom: orNull(from.value) });
      show(x.ok ? '새 가격을 열었다' : fail('못 열었다', x), !x.ok); if (x.ok) { d.close(); load(); }
    });
    saveCap.addEventListener('click', async function () {
      var v = cap.value.trim(); var x = await call('PUT', '/admin/crystal-prices/' + p.boss + '/' + p.difficulty + '/max-party-size', { maxPartySize: v === '' ? null : Number(v) });
      show(x.ok ? '상한을 적었다' : fail('못 적었다', x), !x.ok); if (x.ok) { d.close(); load(); }
    });
  }

  function render() {
    var used = DIFFS.filter(function (d) { return D.pairs.some(function (p) { return p.difficulty === d; }); });
    var head = document.getElementById('head'); head.innerHTML = ''; head.appendChild(el('th', '보스'));
    used.forEach(function (d) { head.appendChild(el('th', d, 'num')); });
    var bosses = []; D.pairs.forEach(function (p) { if (bosses.indexOf(p.boss) < 0) bosses.push(p.boss); });
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    bosses.forEach(function (key) {
      var mine = D.pairs.filter(function (p) { return p.boss === key; });
      var tr = el('tr'); cell(tr, mine[0].bossName, 'label');
      used.forEach(function (d) {
        var p = mine.filter(function (x) { return x.difficulty === d; })[0];
        if (!p) { cell(tr, ''); return; }
        var cur = current(p); var b = button('', 'price-cell' + (cur ? '' : ' missing'));
        if (p.maxPartySize != null) b.appendChild(el('small', p.maxPartySize + '인'));
        if (p.prices.length > 1) b.appendChild(el('small', p.prices.length + '줄'));
        b.appendChild(document.createTextNode(cur ? meso(cur.priceMeso) : '가격 없음'));
        b.title = cur ? (cur.validFrom || '처음부터') + ' 부터' : '';
        b.addEventListener('click', function () { openPair(p); });
        cell(tr, b);
      });
      tb.appendChild(tr);
    });
    var missing = D.pairs.filter(function (p) { return !current(p); }).length;
    document.getElementById('summary').textContent = D.pairs.length + '조합' + (missing ? ' · 가격 없음 ' + missing : '') + ' · 파티 인원 상한 기본값 ' + D.defaultMaxPartySize + '인 · 칸을 누르면 가격 줄을 고친다';
  }

  async function load() {
    var r = await call('GET', '/admin/crystal-prices/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    D = r.json;
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
