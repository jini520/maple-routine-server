import { layout } from './layout'

/**
 * 보스 표. 위는 규칙 둘과 새 보스 폼, 아래는 표 두 개를 줄 그대로 보인다.
 *
 * 보스는 더하기만 있고 지우기는 없다. 직접 완료 줄이 참조할 수 있어서다. 난이도 줄은 더하고 지우고
 * 레벨을 갈아 끼운다. 마지막 난이도는 못 지운다. 난이도 없는 보스가 생기면 앱이 표 전체를 거절한다.
 */
export const BOSSES_HTML = layout(
  '/admin/bosses',
  '보스 목록',
  `<div class="head">
  <div>
    <h1>보스 목록</h1>
    <p>바꾸면 <code>GET /v1/bosses</code> 의 <code>updatedAt</code> 이 움직이고, 앱은 다음에 켤 때 표를 다시 받는다. 새 보스의 그림은 앱 번들에 있어야 그려진다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-bosses">–</b><span>보스</span></div>
    <div class="stat"><b id="stat-diffs">–</b><span>난이도 줄</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>규칙</h2><p>주간 한도 둘. 앱의 n/12 배지와 결정석 판매 상한이 이 값을 본다</p></header>
  <div class="body">
    <div class="row">
      <div class="field w-sm"><label for="rule-selection">주간 보스 선택 한도</label><input id="rule-selection" type="number" min="1"></div>
      <div class="field w-sm"><label for="rule-crystal">주간 결정석 판매 한도</label><input id="rule-crystal" type="number" min="1"></div>
      <button id="save-rules" class="btn" type="button">저장</button>
    </div>
  </div>
</section>
<section class="card">
  <header><h2>새 보스</h2><p>더하기만 있고 지우기는 없다. 직접 완료 줄이 참조할 수 있어서다</p></header>
  <div class="body">
    <div class="grid2">
      <div class="field"><label for="b-key">key <small>snake_case · 앱 기록이 드는 값</small></label><input id="b-key" class="mono" type="text" placeholder="jupiter"></div>
      <div class="field"><label for="b-cycle">주기</label>
        <select id="b-cycle"><option value="weekly">weekly</option><option value="event_weekly">event_weekly (시즌)</option><option value="monthly">monthly</option></select></div>
      <div class="field"><label for="b-name">이름 <small>넥슨 API content_name 표기</small></label><input id="b-name" type="text"></div>
      <div class="field"><label for="b-alias">별칭 <small>좁은 자리의 이름. 비우면 이름 그대로</small></label><input id="b-alias" type="text"></div>
      <div class="field"><label for="b-slug">초상화 파일명 <small>앱 src/assets/bosses/*.webp 의 이름</small></label><input id="b-slug" class="mono" type="text"></div>
    </div>
    <div class="field">
      <label>난이도와 요구 레벨</label>
      <div class="mini"><table><thead><tr><th>난이도</th><th>요구 레벨</th><th></th></tr></thead><tbody id="b-diffs"></tbody></table></div>
    </div>
    <div class="actions"><button id="b-create" class="btn" type="button">보스 추가</button><button id="b-add-diff" class="btn ghost" type="button">난이도 줄 추가</button></div>
  </div>
</section>
<section class="card">
  <header><h2>bosses</h2><p id="bosses-count"></p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>별칭</th><th>주기</th><th>초상화</th><th>난이도</th><th>난이도 추가</th></tr></thead><tbody id="bosses-rows"></tbody></table></div>
</section>
<section class="card">
  <header><h2>boss_difficulties</h2><p id="diffs-count"></p></header>
  <div class="table"><table><thead><tr><th>보스</th><th>난이도</th><th>요구 레벨</th><th></th></tr></thead><tbody id="diffs-rows"></tbody></table></div>
</section>
<script>
  var DIFFS = ['easy', 'normal', 'hard', 'chaos', 'extreme'];
  function cell(tr, child, cls) { var td = document.createElement('td'); if (typeof child === 'string' || typeof child === 'number') td.textContent = String(child); else td.appendChild(child); if (cls) td.className = cls; tr.appendChild(td); return td; }
  function span(text, cls) { var s = document.createElement('span'); s.textContent = text; s.className = cls; return s; }
  function diffSelect(value) { var s = document.createElement('select'); DIFFS.forEach(function (d) { var o = document.createElement('option'); o.value = d; o.textContent = d; s.appendChild(o); }); if (value) s.value = value; return s; }
  function levelInput(value) { var i = document.createElement('input'); i.type = 'number'; i.min = '1'; i.placeholder = 'Lv'; if (value) i.value = String(value); return i; }
  function button(text, cls) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.className = cls; return b; }
  function inline() { var d = document.createElement('div'); d.className = 'inline'; for (var i = 0; i < arguments.length; i++) d.appendChild(arguments[i]); return d; }

  // 새 보스 폼의 난이도 줄
  function addDiffRow(difficulty, level) {
    var tr = document.createElement('tr');
    cell(tr, inline(diffSelect(difficulty))); cell(tr, inline(levelInput(level)));
    var del = button('빼기', 'btn danger sm'); del.addEventListener('click', function () { tr.remove(); }); cell(tr, del, 'act');
    document.getElementById('b-diffs').appendChild(tr);
  }
  document.getElementById('b-add-diff').addEventListener('click', function () { addDiffRow('normal', ''); });
  addDiffRow('normal', '');

  document.getElementById('save-rules').addEventListener('click', async function () {
    var r = await call('PUT', '/admin/bosses/rules', {
      weeklyBossSelectionLimit: Number(document.getElementById('rule-selection').value),
      weeklyCrystalSaleLimit: Number(document.getElementById('rule-crystal').value),
    });
    show(r.ok ? '규칙을 저장했다' : '저장하지 못했다 ' + r.status + '\\n' + r.text, !r.ok); load();
  });

  document.getElementById('b-create').addEventListener('click', async function () {
    var difficulties = [];
    document.querySelectorAll('#b-diffs tr').forEach(function (tr) {
      difficulties.push({ difficulty: tr.querySelector('select').value, requiredLevel: Number(tr.querySelector('input').value) });
    });
    var body = {
      key: document.getElementById('b-key').value.trim(),
      name: document.getElementById('b-name').value.trim(),
      alias: document.getElementById('b-alias').value.trim() || document.getElementById('b-name').value.trim(),
      cycle: document.getElementById('b-cycle').value,
      portraitSlug: document.getElementById('b-slug').value.trim(),
      difficulties: difficulties,
    };
    var r = await call('POST', '/admin/bosses', body);
    if (!r.ok) { show('더하지 못했다 ' + r.status + '\\n' + r.text, true); return; }
    show(body.key + ' 를 더했다', false);
    ['b-key', 'b-name', 'b-alias', 'b-slug'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('b-diffs').innerHTML = ''; addDiffRow('normal', '');
    load();
  });

  async function load() {
    var r = await call('GET', '/v1/bosses');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    var c = r.json;
    document.getElementById('rule-selection').value = c.rules.weeklyBossSelectionLimit == null ? '' : c.rules.weeklyBossSelectionLimit;
    document.getElementById('rule-crystal').value = c.rules.weeklyCrystalSaleLimit == null ? '' : c.rules.weeklyCrystalSaleLimit;

    var bossesRows = document.getElementById('bosses-rows'); bossesRows.innerHTML = '';
    var diffsRows = document.getElementById('diffs-rows'); diffsRows.innerHTML = '';
    var diffCount = 0;
    c.bosses.forEach(function (b, i) {
      var tr = document.createElement('tr');
      cell(tr, i + 1, 'n'); cell(tr, b.key, 'mono'); cell(tr, b.name); cell(tr, b.alias);
      cell(tr, span(b.cycle, b.cycle === 'weekly' ? 'tag' : 'tag accent')); cell(tr, b.portraitSlug, 'mono');
      var tags = document.createElement('div'); tags.className = 'tags';
      b.difficulties.forEach(function (d) { tags.appendChild(span(d.difficulty + ' ' + d.requiredLevel, 'tag mono')); });
      cell(tr, tags);
      var sel = diffSelect('normal'); var lv = levelInput(''); var btn = button('추가', 'btn ghost sm');
      btn.addEventListener('click', async function () {
        var res = await call('PUT', '/admin/bosses/' + b.key + '/difficulties/' + sel.value, { requiredLevel: Number(lv.value) });
        show(res.ok ? b.key + ' ' + sel.value + ' 을 적었다' : '못 적었다 ' + res.status + '\\n' + res.text, !res.ok); load();
      });
      cell(tr, inline(sel, lv, btn), 'act');
      bossesRows.appendChild(tr);

      b.difficulties.forEach(function (d) {
        diffCount += 1;
        var dr = document.createElement('tr');
        var who = document.createElement('span'); who.textContent = b.name + ' '; who.appendChild(span(b.key, 'mono dim'));
        cell(dr, who); cell(dr, span(d.difficulty, 'tag'));
        var lvl = levelInput(d.requiredLevel); var save = button('레벨 저장', 'btn ghost sm');
        save.addEventListener('click', async function () {
          var res = await call('PUT', '/admin/bosses/' + b.key + '/difficulties/' + d.difficulty, { requiredLevel: Number(lvl.value) });
          show(res.ok ? b.key + ' ' + d.difficulty + ' 레벨을 적었다' : '못 적었다 ' + res.status + '\\n' + res.text, !res.ok); load();
        });
        cell(dr, inline(lvl, save));
        var del = button('지우기', 'btn danger sm');
        del.addEventListener('click', async function () {
          if (!window.confirm(b.name + ' ' + d.difficulty + ' 줄을 지운다.')) return;
          var res = await call('DELETE', '/admin/bosses/' + b.key + '/difficulties/' + d.difficulty);
          show(res.ok ? '지웠다' : '못 지웠다 ' + res.status + '\\n' + res.text, !res.ok); load();
        });
        cell(dr, del, 'act');
        diffsRows.appendChild(dr);
      });
    });
    document.getElementById('stat-bosses').textContent = c.bosses.length;
    document.getElementById('stat-diffs').textContent = diffCount;
    document.getElementById('stat-updated').textContent = c.updatedAt ? when(c.updatedAt) : '없음';
    document.getElementById('bosses-count').textContent = c.bosses.length + '줄 · 순서가 곧 앱의 화면 순서';
    document.getElementById('diffs-count').textContent = diffCount + '줄 · 마지막 난이도는 못 지운다';
  }
  load();
</script>`,
)
