import { layout } from './layout'

/**
 * 보스 목록 불러오기. GET /v1/bosses 응답과 같은 모양의 JSON 을 붙여 넣으면 POST /admin/bosses/import 로 보낸다.
 * 결과의 leftover 는 JSON 에 없어 표에 남은 보스다. 지우는 화면은 없다.
 */
export const BOSSES_HTML = layout(
  '보스 목록',
  `<h1>보스 목록</h1>
<p>앱의 <code>src/data/bosses.json</code> 을 그대로 붙여 넣는다. 모양은 <code>GET /v1/bosses</code> 응답에서 <code>updatedAt</code> 을 뺀 것이다.</p>
<div id="message"></div>
<textarea id="json" placeholder='{ "rules": { "weeklyBossSelectionLimit": 12, "weeklyCrystalSaleLimit": 90 }, "bosses": [ … ] }'></textarea>
<p><button id="import">불러오기</button></p>
<h2>지금 표에 있는 것</h2>
<p id="summary">읽는 중…</p>
<table><thead><tr><th>#</th><th>key</th><th>이름</th><th>주기</th><th>난이도</th></tr></thead><tbody id="rows"></tbody></table>
<script>
  async function load() {
    var r = await call('GET', '/v1/bosses');
    var c = r.json || { updatedAt: null, rules: {}, bosses: [] };
    document.getElementById('summary').textContent =
      '보스 ' + c.bosses.length + ' · 갱신 ' + (c.updatedAt || '없음') +
      ' · 선택 한도 ' + (c.rules.weeklyBossSelectionLimit == null ? '없음' : c.rules.weeklyBossSelectionLimit) +
      ' · 결정석 판매 한도 ' + (c.rules.weeklyCrystalSaleLimit == null ? '없음' : c.rules.weeklyCrystalSaleLimit);
    var tbody = document.getElementById('rows');
    tbody.innerHTML = '';
    c.bosses.forEach(function (b, i) {
      var tr = document.createElement('tr');
      [i + 1, b.key, b.name, b.cycle, b.difficulties.map(function (d) { return d.difficulty + ' ' + d.requiredLevel; }).join(' · ')]
        .forEach(function (v) { var td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td); });
      tbody.appendChild(tr);
    });
  }
  document.getElementById('import').addEventListener('click', async function () {
    var parsed;
    try { parsed = JSON.parse(document.getElementById('json').value); }
    catch (e) { show('JSON 이 아니다: ' + e.message, true); return; }
    var r = await call('POST', '/admin/bosses/import', parsed);
    if (!r.ok) { show('거절됐다 ' + r.status + '\\n' + r.text, true); return; }
    var leftover = r.json.leftover.length ? '\\nJSON 에 없어 표에 남은 보스: ' + r.json.leftover.join(', ') : '';
    show('넣었다. 보스 ' + r.json.bosses + ' · 난이도 ' + r.json.difficulties + leftover, false);
    load();
  });
  load();
</script>`,
)
