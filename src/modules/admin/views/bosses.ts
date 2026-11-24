import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 보스 목록. 위는 보스 규칙 셋, 왼쪽은 보스 목록, 오른쪽은 고른 보스 하나의 줄인 이름 · 유효 기간 · 난이도 줄이다.
 *
 * 보스는 더하기만 있고 지우기는 없다. 직접 완료 줄이 참조할 수 있어서다. 이름 · 시즌 보스 · 주기 · 초상화는 고치는 경로가 없다.
 * 마지막 난이도는 못 지운다. 난이도 없는 보스가 생기면 앱이 표 전체를 거절한다. 시즌 보스는 시즌이 끝나는 날을 끝에 적는다.
 */
export const BOSSES_HTML = layout(
  '/bosses',
  '보스 목록',
  `<div class="top"><h1>보스 목록</h1><span class="top-rules" id="rules"></span><span class="grow"></span><span class="updated" id="updated"></span><button id="b-new" class="btn sm" type="button">새 보스</button></div>
<div id="message" class="msg" role="status" hidden></div>
<div class="split"><nav class="picklist" id="list" aria-label="보스"></nav><section class="panel" id="detail"></section></div>
${ASSET_PICKER}
<script>
  var DIFFS = ['easy', 'normal', 'hard', 'chaos', 'extreme'];
  var LETTER = { easy: 'E', normal: 'N', hard: 'H', chaos: 'C', extreme: 'X' };
  var CYCLES = [['weekly', '주간'], ['monthly', '월간']];
  var D = null, R = null, assets = {}, current = null;
  var batch = editing(function () { load(); });
  var ruleCells = {};

  function periodBody(from, until) { return { validFrom: orNull(from.value()), validUntil: orNull(until.value()) }; }
  function periodCell(key, value, send, empty) { var c = textCell(batch, key, value, send, 'period'); c.input.placeholder = empty; return c; }
  function ruleCell(label, field) {
    var w = el('span', undefined, 'rule'); w.appendChild(document.createTextNode(label));
    ruleCells[field] = numCell(batch, '보스 규칙', R ? R[field] : null, function () {
      var body = {}; Object.keys(ruleCells).forEach(function (k) { body[k] = ruleCells[k].value(); });
      return call('PUT', '/game-rules', body);
    }, 'short');
    w.appendChild(ruleCells[field].input); return w;
  }

  function renderDetail(b) {
    var box = document.getElementById('detail'); box.innerHTML = '';
    if (!b) { box.appendChild(el('p', '보스가 없다', 'dim')); return; }
    var head = el('div', undefined, 'detail-head');
    var a = assets[b.portraitAssetId]; var img = el('img'); img.alt = ''; if (a) img.src = '/assets/' + a.file; head.appendChild(img);
    var title = el('div'); title.appendChild(el('h2', b.name)); title.appendChild(span(b.key + (a ? ' · ' + a.fileName + '.' + a.extension : ' · 그림 표에 없는 초상'), 'mono dim')); head.appendChild(title);
    head.appendChild(span('', 'grow'));
    if (b.isSeasonBoss) head.appendChild(span('시즌 보스', 'tag accent'));
    box.appendChild(head);

    var fields = el('div', undefined, 'fields');
    var short = textCell(batch, b.key + ' 줄인 이름', b.shortName, function () { return call('PUT', '/bosses/' + b.key + '/short-name', { shortName: short.value() }); });
    var s1 = el('span', '줄인 이름 ', 'rule'); s1.appendChild(short.input); fields.appendChild(s1);
    var from, until;
    var sendPeriod = function () { return call('PUT', '/bosses/' + b.key + '/period', periodBody(from, until)); };
    from = periodCell(b.key + ' 기간', b.validFrom, sendPeriod, '처음부터'); until = periodCell(b.key + ' 기간', b.validUntil, sendPeriod, '끝없이');
    var s2 = el('span', '기간 ', 'rule'); s2.appendChild(from.input); s2.appendChild(document.createTextNode('~')); s2.appendChild(until.input); fields.appendChild(s2);
    box.appendChild(fields);

    var t = el('table', undefined, 'sheet'); var thead = el('thead'); var hr = el('tr');
    ['난이도', '주기', '요구 레벨', '시작', '끝', ''].forEach(function (h, i) { var th = el('th', h); if (i === 2) th.className = 'num'; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead); var tb = el('tbody');
    b.difficulties.forEach(function (d) {
      var tr = el('tr'); cell(tr, d.difficulty, 'label'); cell(tr, d.cycle === 'monthly' ? '월간' : '주간', 'label');
      var lv = numCell(batch, b.key + ' ' + d.difficulty + ' 레벨', d.requiredLevel, function () { return call('PUT', '/bosses/' + b.key + '/difficulties/' + d.difficulty, { cycle: d.cycle, requiredLevel: lv.value() }); }, 'short');
      cell(tr, lv.input, 'num');
      var df, du; var sendD = function () { return call('PUT', '/bosses/' + b.key + '/difficulties/' + d.difficulty + '/period', periodBody(df, du)); };
      df = periodCell(b.key + ' ' + d.difficulty + ' 기간', d.validFrom, sendD, '보스 기간'); du = periodCell(b.key + ' ' + d.difficulty + ' 기간', d.validUntil, sendD, '보스 기간');
      cell(tr, df.input); cell(tr, du.input);
      var rm = button('지우기', 'btn danger sm row-act'); if (b.difficulties.length === 1) rm.hidden = true;
      rm.addEventListener('click', async function () { if (!window.confirm(b.name + ' ' + d.difficulty + ' 줄을 지운다.')) return; var r = await call('DELETE', '/bosses/' + b.key + '/difficulties/' + d.difficulty); show(r.ok ? '지웠다' : fail('못 지웠다', r), !r.ok); load(); });
      cell(tr, rm, 'act'); tb.appendChild(tr);
    });
    t.appendChild(tb); box.appendChild(t);
    var foot = el('div', undefined, 'panel-head'); foot.style.marginTop = '10px';
    foot.appendChild(el('p', '목록 차례가 앱의 화면 차례다. 기간은 KST 2026-07-03 또는 2026-11-05T10:00. 난이도 기간을 비우면 보스 기간을 따른다. 끝은 그 날을 품은 주까지 선다.'));
    foot.appendChild(span('', 'grow'));
    var rest = DIFFS.filter(function (x) { return !b.difficulties.some(function (d) { return d.difficulty === x; }); });
    if (rest.length > 0) { var add = button('난이도 추가', 'btn ghost sm'); add.addEventListener('click', function () { addDifficulty(b, rest); }); foot.appendChild(add); }
    box.appendChild(foot);
  }

  function addDifficulty(b, rest) {
    var form = el('div', undefined, 'form-body');
    var diff = select(rest.map(function (x) { return [x, x]; }), rest[0]); var cyc = select(CYCLES, b.difficulties[0] ? b.difficulties[0].cycle : 'weekly');
    var lv = input('number'); lv.min = '1'; var from = input('text', 'mono'); from.placeholder = '2026-09-17T10:00'; var until = input('text', 'mono');
    form.appendChild(field('난이도', undefined, diff)); form.appendChild(field('주기', undefined, cyc)); form.appendChild(field('요구 레벨', undefined, lv));
    form.appendChild(field('시작', '새로 생긴 난이도면 패치 시각', from)); form.appendChild(field('끝', '비우면 끝없이', until));
    var go = button('난이도 추가', 'btn'); form.appendChild(go);
    var d = openForm(b.name + ' 난이도 추가', form);
    go.addEventListener('click', async function () {
      var r = await call('PUT', '/bosses/' + b.key + '/difficulties/' + diff.value, { cycle: cyc.value, requiredLevel: Number(lv.value), validFrom: orNull(from.value), validUntil: orNull(until.value) });
      show(r.ok ? diff.value + ' 을 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }

  function newBoss() {
    var form = el('div', undefined, 'form-body');
    var key = input('text', 'mono'); key.placeholder = 'jupiter'; var name = input('text'); var short = input('text');
    var season = input('checkbox'); var seasonLabel = el('label', undefined, 'check'); seasonLabel.appendChild(season); seasonLabel.appendChild(document.createTextNode('시즌 보스 (주간 선택 한도에서 빠진다)'));
    var portrait = { id: null }; var portraitText = span('고르지 않았다', 'mono dim'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: ['boss'], uploadCategory: 'boss', current: portrait.id, onPick: function (f) { portrait.id = f ? f.id : null; portraitText.textContent = f ? f.fileName + '.' + f.extension : '고르지 않았다'; } }); });
    var grid = el('div', undefined, 'grid2');
    grid.appendChild(field('key', '넥슨 응답의 보스 이름을 맞출 때 쓴다', key)); grid.appendChild(field('초상화', '보스 분류의 그림', inline(portraitText, pick)));
    grid.appendChild(field('이름', '넥슨 API content_name 표기', name)); grid.appendChild(field('줄인 이름', '비우면 이름 그대로', short));
    form.appendChild(grid); form.appendChild(seasonLabel);
    var tb = el('tbody');
    function addRow() {
      var tr = el('tr'); var d = select(DIFFS.map(function (x) { return [x, x]; }), 'normal'); d.className = 'diff'; var c = select(CYCLES, 'weekly'); c.className = 'cycle'; var lv = input('number'); lv.min = '1';
      cell(tr, d); cell(tr, c); cell(tr, lv); var rm = button('빼기', 'btn danger sm'); rm.addEventListener('click', function () { tr.remove(); }); cell(tr, rm, 'act'); tb.appendChild(tr);
    }
    addRow(); form.appendChild(mini(['난이도', '주기', '요구 레벨', ''], tb));
    var more = button('난이도 줄 추가', 'btn ghost sm'); more.addEventListener('click', addRow);
    var go = button('보스 추가', 'btn'); form.appendChild(inline(go, more));
    var dlg = openForm('새 보스', form); dlg.classList.add('mid');
    go.addEventListener('click', async function () {
      if (portrait.id === null) { show('초상화를 고른다', true); return; }
      var difficulties = []; tb.querySelectorAll('tr').forEach(function (tr) { difficulties.push({ difficulty: tr.querySelector('select.diff').value, cycle: tr.querySelector('select.cycle').value, requiredLevel: Number(tr.querySelector('input').value) }); });
      var body = { key: key.value.trim(), name: name.value.trim(), shortName: short.value.trim() || name.value.trim(), isSeasonBoss: season.checked, portraitAssetId: portrait.id, difficulties: difficulties };
      var r = await call('POST', '/bosses', body);
      show(r.ok ? body.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { dlg.close(); current = body.key; setHashKey(current); load(); }
    });
  }

  function render() {
    batch.clear(); ruleCells = {};
    var rules = document.getElementById('rules'); rules.innerHTML = '';
    rules.appendChild(ruleCell('주간 보스 선택 한도', 'weeklyBossSelectionLimit'));
    rules.appendChild(ruleCell('주간 결정석 판매 한도', 'weeklyCrystalSaleLimit'));
    rules.appendChild(ruleCell('파티 인원 상한 기본값', 'defaultMaxPartySize'));
    if (!D.bosses.some(function (b) { return b.key === current; })) current = D.bosses.length ? D.bosses[0].key : null;
    pickList(document.getElementById('list'), D.bosses.map(function (b) {
      return { key: b.key, title: b.name, meta: b.difficulties.map(function (d) { return LETTER[d.difficulty]; }).join('') };
    }), current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); });
    renderDetail(D.bosses.filter(function (b) { return b.key === current; })[0]);
  }

  document.getElementById('b-new').addEventListener('click', newBoss);
  async function load() {
    var r = await call('GET', '/bosses/rows'); var a = await call('GET', '/images/list'); var g = await call('GET', '/game-rules');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    D = r.json; R = g.ok ? g.json.gameRules : null;
    assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    if (current === null) current = hashKey();
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
