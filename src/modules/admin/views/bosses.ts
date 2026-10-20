import { layout } from './layout'

/**
 * 보스 표. 위는 규칙 둘, 아래는 보스 표 하나다. 줄의 수정을 누르면 그 아래로 난이도 편집기가 펼쳐지고,
 * 새 보스는 같은 편집기가 표 맨 위에 열린다. 목록을 떠나지 않는다.
 *
 * 보스는 더하기만 있고 지우기는 없다. 직접 완료 줄이 참조할 수 있어서다. 이미 있는 보스에서 고치는 칸은 별칭뿐이고,
 * 이름 · 주기 · 초상화는 고치는 끝점이 없다. 난이도 줄은 더하고 지우고 레벨을 갈아 끼운다. 마지막 난이도는 못 지운다. 난이도 없는 보스가 생기면 앱이
 * 표 전체를 거절한다. 유효 기간 둘은 편집기 아래 줄에서 적는다. 시즌 보스의 끝이 그것이다.
 */
export const BOSSES_HTML = layout(
  '/admin/bosses',
  '보스 목록',
  `<div class="head">
  <div>
    <h1>보스 목록</h1>
    <p>바꾸면 <code>GET /v1/game-data</code> 의 <code>bosses.updatedAt</code> 이 움직이고, 앱은 다음에 켤 때 표를 다시 받는다. 새 보스의 그림은 앱 번들에 있어야 그려진다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-bosses">–</b><span>보스</span></div>
    <div class="stat"><b id="stat-diffs">–</b><span>난이도 줄</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <div class="body">
    <div class="row">
      <div class="field w-sm"><label for="rule-selection">주간 보스 선택 한도</label><input id="rule-selection" type="number" min="1"></div>
      <div class="field w-sm"><label for="rule-crystal">주간 결정석 판매 한도</label><input id="rule-crystal" type="number" min="1"></div>
      <div class="field w-sm"><label for="rule-party">파티 인원 상한 기본값</label><input id="rule-party" type="number" min="1" max="6"></div>
      <button id="save-rules" class="btn ghost" type="button">규칙 저장</button>
      <span class="hint">앱의 n/12 배지와 결정석 판매 상한이 이 값을 본다</span>
    </div>
  </div>
</section>
<section class="card">
  <header><h2>보스</h2><p id="bosses-count"></p><span class="grow"></span><button id="b-new" class="btn" type="button">새 보스</button></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>주기</th><th>초상화</th><th>난이도 · 요구 레벨</th><th></th></tr></thead><tbody id="bosses-rows"></tbody></table></div>
</section>
<script>
  var DIFFS = ['easy', 'normal', 'hard', 'chaos', 'extreme'];
  var CYCLES = [['weekly', 'weekly'], ['event_weekly', 'event_weekly (시즌)'], ['monthly', 'monthly']];
  // open 은 편집기가 펼쳐진 보스 key, newRow 는 새 보스 편집기 DOM. 다시 그려도 적던 값이 안 날아가게 노드를 든다.
  var state = { table: null, open: null, creating: false, newRow: null };

  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function span(text, cls) { return el('span', text, cls); }
  function cell(tr, child, cls) { var td = document.createElement('td'); if (typeof child === 'string' || typeof child === 'number') td.textContent = String(child); else td.appendChild(child); if (cls) td.className = cls; tr.appendChild(td); return td; }
  function input(type, cls) { var i = document.createElement('input'); i.type = type; if (cls) i.className = cls; return i; }
  function select(options, value) { var s = document.createElement('select'); options.forEach(function (o) { var opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1]; s.appendChild(opt); }); if (value) s.value = value; return s; }
  function diffSelect(value, allowed) { return select(allowed.map(function (d) { return [d, d]; }), value); }
  function levelInput(value) { var i = input('number'); i.min = '1'; i.placeholder = 'Lv'; if (value) i.value = String(value); return i; }
  function button(text, cls) { var b = el('button', text, cls); b.type = 'button'; return b; }
  function inline() { var d = el('div', undefined, 'inline'); for (var i = 0; i < arguments.length; i++) d.appendChild(arguments[i]); return d; }
  function field(label, small, control) { var d = el('div', undefined, 'field'); var l = el('label', label); if (small) { l.appendChild(document.createTextNode(' ')); l.appendChild(el('small', small)); } d.appendChild(l); d.appendChild(control); return d; }
  function mini(headers, tbody) { var wrap = el('div', undefined, 'mini'); var t = el('table'); var thead = el('thead'); var hr = el('tr'); headers.forEach(function (h) { hr.appendChild(el('th', h)); }); thead.appendChild(hr); t.appendChild(thead); t.appendChild(tbody); wrap.appendChild(t); return wrap; }
  function fail(what, r) { return what + ' ' + r.status + '\\n' + r.text; }

  // 보스 한 줄. 열려 있으면 바로 아래에 editorRow 가 따라온다.
  function bossRow(b, i) {
    var isOpen = state.open === b.key;
    var tr = el('tr', undefined, isOpen ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, b.key, 'mono');
    var name = span(b.name); if (b.alias !== b.name) { name.appendChild(document.createTextNode(' ')); name.appendChild(span(b.alias, 'dim')); } cell(tr, name);
    var cyc = el('div', undefined, 'tags'); cyc.appendChild(span(b.cycle, b.cycle === 'weekly' ? 'tag' : 'tag accent'));
    if (b.from || b.until) cyc.appendChild(span((b.from || '처음') + ' ~ ' + (b.until || ''), 'tag mono'));
    cell(tr, cyc); cell(tr, b.portraitSlug, 'mono');
    var tags = el('div', undefined, 'tags');
    b.difficulties.forEach(function (d) { tags.appendChild(span(d.difficulty + ' ' + d.requiredLevel + (d.maxPartySize == null ? '' : ' · ' + d.maxPartySize + '인') + (d.from || d.until ? ' · ' + (d.from || '처음') + '~' + (d.until || '') : ''), 'tag mono')); });
    cell(tr, tags);
    var toggle = button(isOpen ? '닫기' : '수정', 'btn ghost sm');
    toggle.addEventListener('click', function () { state.open = isOpen ? null : b.key; render(); });
    cell(tr, toggle, 'act');
    return tr;
  }

  // 펼쳐진 난이도 편집기. 줄마다 그 자리에서 저장되고 저장 뒤 load() 가 다시 그린다. 열린 보스는 그대로 열려 있다.
  function editorRow(b) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 7;
    var box = el('div', undefined, 'editor');
    var h = el('h3', b.name + ' '); h.appendChild(span(b.key, 'mono dim')); box.appendChild(h);
    var alias = input('text'); alias.value = b.alias;
    var saveAlias = button('별칭 저장', 'btn ghost sm');
    saveAlias.addEventListener('click', async function () {
      var res = await call('PUT', '/admin/bosses/' + b.key + '/alias', { alias: alias.value });
      show(res.ok ? b.key + ' 의 별칭을 적었다' : fail('못 적었다', res), !res.ok); load();
    });
    var arow = el('div', undefined, 'row'); arow.appendChild(field('별칭', '좁은 자리의 이름', alias)); arow.appendChild(saveAlias); box.appendChild(arow);
    var tbody = el('tbody');
    b.difficulties.forEach(function (d) {
      var r = el('tr');
      cell(r, span(d.difficulty, 'tag'));
      var lvl = levelInput(d.requiredLevel); var save = button('레벨 저장', 'btn ghost sm');
      save.addEventListener('click', async function () {
        var res = await call('PUT', '/admin/bosses/' + b.key + '/difficulties/' + d.difficulty, { requiredLevel: Number(lvl.value) });
        show(res.ok ? b.key + ' ' + d.difficulty + ' 레벨을 적었다' : fail('못 적었다', res), !res.ok); load();
      });
      cell(r, inline(lvl, save));
      var dfrom = input('text', 'mono w-period'); dfrom.placeholder = '시작'; dfrom.value = d.from || ''; var duntil = input('text', 'mono w-period'); duntil.placeholder = '끝'; duntil.value = d.until || '';
      var savePeriod = button('기간 저장', 'btn ghost sm');
      savePeriod.addEventListener('click', async function () {
        var res = await call('PUT', '/admin/bosses/' + b.key + '/difficulties/' + d.difficulty + '/period', { from: orNull(dfrom.value), until: orNull(duntil.value) });
        show(res.ok ? b.key + ' ' + d.difficulty + ' 의 유효 기간을 적었다' : fail('못 적었다', res), !res.ok); load();
      });
      cell(r, inline(dfrom, duntil, savePeriod));
      var del = button('지우기', 'btn danger sm');
      del.addEventListener('click', async function () {
        if (!window.confirm(b.name + ' ' + d.difficulty + ' 줄을 지운다.')) return;
        var res = await call('DELETE', '/admin/bosses/' + b.key + '/difficulties/' + d.difficulty);
        show(res.ok ? '지웠다' : fail('못 지웠다', res), !res.ok); load();
      });
      cell(r, del, 'act');
      tbody.appendChild(r);
    });
    var have = b.difficulties.map(function (d) { return d.difficulty; });
    var rest = DIFFS.filter(function (d) { return have.indexOf(d) < 0; });
    if (rest.length > 0) {
      var r = el('tr'); var sel = diffSelect(rest[0], rest); var lv = levelInput(''); var add = button('난이도 추가', 'btn sm');
      var nfrom = input('text', 'mono w-period'); nfrom.placeholder = '시작 (패치 시각)'; var nuntil = input('text', 'mono w-period'); nuntil.placeholder = '끝';
      add.addEventListener('click', async function () {
        var res = await call('PUT', '/admin/bosses/' + b.key + '/difficulties/' + sel.value, { requiredLevel: Number(lv.value), from: orNull(nfrom.value), until: orNull(nuntil.value) });
        show(res.ok ? b.key + ' ' + sel.value + ' 을 적었다' : fail('못 적었다', res), !res.ok); load();
      });
      cell(r, inline(sel)); cell(r, inline(lv)); cell(r, inline(nfrom, nuntil)); cell(r, add, 'act');
      tbody.appendChild(r);
    }
    box.appendChild(mini(['난이도', '요구 레벨', '유효 기간 (KST, 비우면 보스 기간 그대로)', ''], tbody));
    var from = input('text', 'mono w-period'); from.placeholder = '2026-07-03'; from.value = b.from || '';
    var until = input('text', 'mono w-period'); until.placeholder = '2026-11-05T10:00'; until.value = b.until || '';
    var savePeriod = button('기간 저장', 'btn ghost sm');
    savePeriod.addEventListener('click', async function () {
      var res = await call('PUT', '/admin/bosses/' + b.key + '/period', { from: orNull(from.value), until: orNull(until.value) });
      show(res.ok ? b.key + ' 의 유효 기간을 적었다' : fail('못 적었다', res), !res.ok); load();
    });
    var prow = el('div', undefined, 'row'); prow.appendChild(field('시작', '비우면 처음부터', from)); prow.appendChild(field('끝', '비우면 끝없이. KST 글자. 그 날을 품은 주까지 서고 다음 주부터 안 선다', until)); prow.appendChild(savePeriod); box.appendChild(prow);
    box.appendChild(el('p', '이름 · 주기 · 초상화는 고치는 끝점이 없어 여기서 안 바꾼다. 별칭은 위에서 고친다. 마지막 난이도는 못 지운다. 시즌 보스는 시즌이 끝나는 날을 끝에 적는다.', 'hint'));
    td.appendChild(box); tr.appendChild(td);
    return tr;
  }

  // 새 보스 편집기. 표 맨 위에 선다. 한 번 만든 노드를 다시 쓰므로 다른 줄을 펼쳐도 적던 값이 남는다.
  function newEditorRow() {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 7;
    var box = el('div', undefined, 'editor');
    box.appendChild(el('h3', '새 보스'));
    var key = input('text', 'mono'); key.placeholder = 'jupiter';
    var cycle = select(CYCLES, 'weekly'); var name = input('text'); var alias = input('text'); var slug = input('text', 'mono');
    var grid = el('div', undefined, 'grid2');
    grid.appendChild(field('key', 'snake_case · 앱 기록이 드는 값', key)); grid.appendChild(field('주기', '', cycle));
    grid.appendChild(field('이름', '넥슨 API content_name 표기', name)); grid.appendChild(field('별칭', '좁은 자리의 이름. 비우면 이름 그대로', alias));
    grid.appendChild(field('초상화 파일명', '앱 src/assets/bosses/*.webp 의 이름', slug));
    box.appendChild(grid);
    var tbody = el('tbody');
    function addDiffRow(difficulty) {
      var r = el('tr');
      cell(r, inline(diffSelect(difficulty, DIFFS))); cell(r, inline(levelInput('')));
      var del = button('빼기', 'btn danger sm'); del.addEventListener('click', function () { r.remove(); }); cell(r, del, 'act');
      tbody.appendChild(r);
    }
    addDiffRow('normal');
    box.appendChild(mini(['난이도', '요구 레벨', ''], tbody));
    var create = button('보스 추가', 'btn'); var more = button('난이도 줄 추가', 'btn ghost'); var close = button('닫기', 'btn ghost');
    more.addEventListener('click', function () { addDiffRow('normal'); });
    close.addEventListener('click', function () { state.creating = false; render(); });
    create.addEventListener('click', async function () {
      var difficulties = [];
      tbody.querySelectorAll('tr').forEach(function (r) { difficulties.push({ difficulty: r.querySelector('select').value, requiredLevel: Number(r.querySelector('input').value) }); });
      var body = { key: key.value.trim(), name: name.value.trim(), alias: alias.value.trim() || name.value.trim(), cycle: cycle.value, portraitSlug: slug.value.trim(), difficulties: difficulties };
      var r = await call('POST', '/admin/bosses', body);
      if (!r.ok) { show(fail('더하지 못했다', r), true); return; }
      show(body.key + ' 를 더했다', false);
      state.creating = false; state.open = body.key; load();
    });
    var acts = el('div', undefined, 'actions'); acts.appendChild(create); acts.appendChild(more); acts.appendChild(close); box.appendChild(acts);
    td.appendChild(box); tr.appendChild(td);
    return tr;
  }

  function render() {
    var rows = document.getElementById('bosses-rows'); rows.innerHTML = '';
    if (state.creating) { if (!state.newRow) state.newRow = newEditorRow(); rows.appendChild(state.newRow); } else { state.newRow = null; }
    if (!state.table) return;
    state.table.bosses.forEach(function (b, i) { rows.appendChild(bossRow(b, i)); if (state.open === b.key) rows.appendChild(editorRow(b)); });
  }

  document.getElementById('b-new').addEventListener('click', function () {
    state.creating = true; render(); state.newRow.querySelector('input').focus();
  });
  document.getElementById('save-rules').addEventListener('click', async function () {
    var r = await call('PUT', '/admin/bosses/rules', {
      weeklyBossSelectionLimit: Number(document.getElementById('rule-selection').value),
      weeklyCrystalSaleLimit: Number(document.getElementById('rule-crystal').value),
      defaultMaxPartySize: Number(document.getElementById('rule-party').value),
    });
    show(r.ok ? '규칙을 저장했다' : fail('저장하지 못했다', r), !r.ok); load();
  });

  async function load() {
    var r = await call('GET', '/v1/bosses');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    var c = r.json; state.table = c;
    document.getElementById('rule-selection').value = c.rules.weeklyBossSelectionLimit == null ? '' : c.rules.weeklyBossSelectionLimit;
    document.getElementById('rule-crystal').value = c.rules.weeklyCrystalSaleLimit == null ? '' : c.rules.weeklyCrystalSaleLimit;
    document.getElementById('rule-party').value = c.rules.defaultMaxPartySize == null ? '' : c.rules.defaultMaxPartySize;
    var diffCount = 0; c.bosses.forEach(function (b) { diffCount += b.difficulties.length; });
    document.getElementById('stat-bosses').textContent = c.bosses.length;
    document.getElementById('stat-diffs').textContent = diffCount;
    document.getElementById('stat-updated').textContent = c.updatedAt ? when(c.updatedAt) : '없음';
    document.getElementById('bosses-count').textContent = c.bosses.length + '줄 · 순서가 곧 앱의 화면 순서';
    render();
  }
  load();
</script>`,
)
