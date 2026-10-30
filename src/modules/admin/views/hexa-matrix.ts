import { layout } from './layout'

/**
 * 헥사 매트릭스. 카드 넷이다. 코어 종류(줄의 수정을 누르면 그 아래로 레벨마다 비용 칸이 펼쳐진다) · 이름 표 · 직업별 코어 · 헥사 스탯.
 *
 * 코어의 종류는 이름 표에 있으면 그 종류, 없으면 API 타입의 기본 종류다. 그래서 새 종류는 종류 한 줄과 이름 몇 줄로 끝난다.
 * 비용은 기간 줄 없이 레벨 전부를 한 번에 갈아 끼운다. 빈 레벨이 있으면 앱의 구간 합이 틀려서다.
 */
export const HEXA_MATRIX_HTML = layout(
  '/admin/hexa-matrix',
  '헥사 매트릭스',
  `<div class="head">
  <div>
    <h1>헥사 매트릭스</h1>
    <p>가계부 헥사 강화 지출의 데이터다. 코어의 종류는 이름 표에 그 이름이 있으면 그 종류이고, 없으면 그 API 타입의 기본 종류다. 비용은 Lv.n → n+1 의 솔 에르다 조각과 솔 에르다이고 레벨 전부를 한 번에 적는다. 바꾸면 <code>hexaMatrix.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-kinds">–</b><span>종류</span></div>
    <div class="stat"><b id="stat-names">–</b><span>이름 표</span></div>
    <div class="stat"><b id="stat-jobs">–</b><span>직업</span></div>
    <div class="stat"><b id="stat-cores">–</b><span>직업별 코어</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>

<section class="card">
  <header><h2>코어 종류</h2><p>API 타입마다 기본 종류는 하나다. 줄의 수정에서 레벨 전부의 비용을 적는다</p></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th>API 타입</th><th>기본</th><th class="num">만렙</th><th>그림 파일</th><th class="num">비용 레벨</th><th></th></tr></thead><tbody id="kinds"></tbody></table></div>
  <div class="body"><div class="row">
    <div class="field"><label for="k-key">key</label><input id="k-key" class="mono" placeholder="skill_3rd"></div>
    <div class="field"><label for="k-name">이름</label><input id="k-name" placeholder="3rd 스킬 코어"></div>
    <div class="field"><label for="k-api">API 타입 <small>hexa_core_type</small></label><input id="k-api" placeholder="스킬 코어"></div>
    <div class="field w-sm"><label for="k-max">만렙</label><input id="k-max" type="number" min="1" value="30"></div>
    <div class="field"><label for="k-icon">그림 파일 <small>src/assets/items/</small></label><input id="k-icon" class="mono" placeholder="hexa_core_skill.webp"></div>
    <label class="check"><input id="k-default" type="checkbox"> 기본 종류</label>
    <button id="k-add" class="btn" type="button">종류 추가</button>
  </div></div>
</section>

<section class="card">
  <header><h2>이름 표</h2><p>기본 종류가 아닌 코어만 적는다. 이름은 앞뒤 공백을 걷어 적는다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="n-name">코어 이름</label><input id="n-name" placeholder="레이지 익스플로젼"></div>
    <div class="field w-md"><label for="n-kind">종류</label><select id="n-kind"></select></div>
    <button id="n-add" class="btn" type="button">이름 추가</button>
  </div></div>
  <div class="table"><table><thead><tr><th>코어 이름</th><th>종류</th><th></th></tr></thead><tbody id="names"></tbody></table></div>
</section>

<section class="card">
  <header><h2>직업별 코어</h2><p>직업 안 차례가 hexamatrix 응답의 차례다. 그림은 그림 화면의 스킬(skills/)에 먼저 올린다</p></header>
  <div class="body"><div class="row">
    <div class="field w-md"><label for="j-filter">직업</label><select id="j-filter"></select></div>
  </div><div class="row">
    <div class="field"><label for="j-job">직업 <small>character_class</small></label><input id="j-job" list="j-jobs" placeholder="아크메이지(불,독)"><datalist id="j-jobs"></datalist></div>
    <div class="field"><label for="j-name">코어 이름</label><input id="j-name" placeholder="인페르날 웨이브"></div>
    <div class="field"><label for="j-api">API 타입</label><input id="j-api" list="api-types" placeholder="스킬 코어"><datalist id="api-types"></datalist></div>
    <div class="field"><label for="j-icon">그림 파일 <small>src/assets/skills/</small></label><input id="j-icon" class="mono" placeholder="KFPDKDPEMA.webp"></div>
    <button id="j-add" class="btn" type="button">코어 추가</button>
  </div></div>
  <div class="table"><table><thead><tr><th>#</th><th>코어 이름</th><th>API 타입</th><th>그림 파일</th><th></th></tr></thead><tbody id="cores"></tbody></table></div>
</section>

<section class="card">
  <header><h2>헥사 스탯</h2><p>활성화 비용을 모르면 비운다. 앱이 활성화 체크를 막는다</p></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th class="num">활성화 조각</th><th></th></tr></thead><tbody id="stats"></tbody></table></div>
  <div class="body"><div class="row">
    <div class="field"><label for="s-key">key</label><input id="s-key" class="mono" placeholder="hexa_stat_4"></div>
    <div class="field"><label for="s-name">이름</label><input id="s-name" placeholder="헥사 스탯 Ⅳ"></div>
    <div class="field w-sm"><label for="s-act">활성화 조각</label><input id="s-act" type="number" min="0"></div>
    <button id="s-add" class="btn" type="button">스탯 추가</button>
  </div></div>
</section>
<script>
  var state = { data: null, openKind: null, editingCore: null, editingStat: null, job: null };
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }
  function costsOf(kind) { return state.data.levelCosts.filter(function (c) { return c.kind === kind; }); }
  function v(id) { return document.getElementById(id).value.trim(); }
  function after(r, okText, failText) { show(r.ok ? okText : fail(failText, r), !r.ok); return r.ok; }

  function kindRow(k, tbody) {
    var isOpen = state.openKind === k.key; var tr = el('tr', undefined, isOpen ? 'open' : '');
    cell(tr, k.key, 'mono'); cell(tr, k.name); cell(tr, k.apiType); cell(tr, k.isDefault ? span('기본', 'tag accent') : '');
    cell(tr, k.maxLevel, 'num'); cell(tr, k.iconFile, 'mono');
    var have = costsOf(k.key).length; cell(tr, have === k.maxLevel ? String(have) : span(have + ' / ' + k.maxLevel, 'tag'), 'num');
    var toggle = button(isOpen ? '닫기' : '수정', 'btn ghost sm');
    toggle.addEventListener('click', function () { state.openKind = isOpen ? null : k.key; render(); });
    cell(tr, toggle, 'act'); tbody.appendChild(tr);
    if (isOpen) tbody.appendChild(kindEditor(k));
  }

  function kindEditor(k) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 8;
    var box = el('div', undefined, 'editor'); box.appendChild(el('h3', k.name + ' 의 칸과 비용'));
    var name = input('text'); name.value = k.name; var api = input('text'); api.value = k.apiType;
    var max = input('number'); max.min = '1'; max.value = k.maxLevel; var icon = input('text', 'mono'); icon.value = k.iconFile;
    var def = input('checkbox'); def.checked = k.isDefault; var defLabel = el('label', undefined, 'check'); defLabel.appendChild(def); defLabel.appendChild(document.createTextNode(' 기본 종류'));
    var saveMeta = button('종류 저장', 'btn ghost sm');
    saveMeta.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hexa-matrix/kinds/' + k.key, { name: name.value.trim(), apiType: api.value.trim(), isDefault: def.checked, maxLevel: Number(max.value), iconFile: icon.value.trim() });
      after(r, k.key + ' 를 적었다', '못 적었다'); load();
    });
    var meta = el('div', undefined, 'row'); meta.appendChild(field('이름', undefined, name)); meta.appendChild(field('API 타입', undefined, api)); meta.appendChild(field('만렙', '비용 줄 아래로는 못 내린다', max)); meta.appendChild(field('그림 파일', undefined, icon)); meta.appendChild(defLabel); meta.appendChild(saveMeta); box.appendChild(meta);

    var current = {}; costsOf(k.key).forEach(function (c) { current[c.level] = c; });
    var inputs = []; var tbody = el('tbody');
    for (var level = 0; level < k.maxLevel; level++) {
      var row = el('tr'); var c = current[level];
      cell(row, 'Lv.' + level + ' → ' + (level + 1), 'mono');
      var frag = input('number'); frag.min = '0'; frag.value = c ? c.fragments : '';
      var sol = input('number'); sol.min = '0'; sol.value = c ? c.solErda : '';
      cell(row, frag); cell(row, sol); inputs.push({ level: level, frag: frag, sol: sol }); tbody.appendChild(row);
    }
    box.appendChild(mini(['레벨', '조각', '솔 에르다'], tbody));
    var saveCosts = button('비용 전부 저장', 'btn sm');
    saveCosts.addEventListener('click', async function () {
      var costs = inputs.map(function (i) { return { level: i.level, fragments: numOrNull(i.frag.value), solErda: numOrNull(i.sol.value) }; });
      if (costs.some(function (c) { return c.fragments === null || c.solErda === null; })) { show('빈 칸이 있다. 레벨 전부를 적는다', true); return; }
      var r = await call('PUT', '/admin/hexa-matrix/kinds/' + k.key + '/costs', { costs: costs });
      after(r, k.key + ' 의 비용 ' + costs.length + '줄을 적었다', '못 적었다'); load();
    });
    box.appendChild(saveCosts);
    box.appendChild(el('p', '만렙을 바꾸면 먼저 종류를 저장하고 비용 칸을 다시 연다. 레벨이 빠지거나 겹치면 서버가 거절한다.', 'hint'));
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  function nameRow(n, tbody) {
    var tr = el('tr'); cell(tr, n.name); var kind = state.data.kinds.filter(function (k) { return k.key === n.kind; })[0];
    cell(tr, kind ? kind.name : n.kind);
    var del = button('지우기', 'btn danger sm');
    del.addEventListener('click', async function () {
      if (!window.confirm(n.name + ' 를 이름 표에서 지운다. 그 코어는 API 타입의 기본 종류가 된다.')) return;
      var r = await call('DELETE', '/admin/hexa-matrix/names/' + n.id); after(r, '지웠다', '못 지웠다'); load();
    });
    cell(tr, del, 'act'); tbody.appendChild(tr);
  }

  function coreRow(c, i, count, tbody) {
    var editing = state.editingCore === c.id; var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, i + 1, 'n');
    if (!editing) {
      cell(tr, c.name); cell(tr, c.apiType); cell(tr, c.iconFile, 'mono');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm'), del = button('지우기', 'btn danger sm');
      up.disabled = i === 0; down.disabled = i === count - 1;
      up.addEventListener('click', function () { moveCore(c, 'up'); });
      down.addEventListener('click', function () { moveCore(c, 'down'); });
      edit.addEventListener('click', function () { state.editingCore = c.id; render(); });
      del.addEventListener('click', async function () {
        if (!window.confirm(c.job + ' 의 ' + c.name + ' 를 지운다.')) return;
        var r = await call('DELETE', '/admin/hexa-matrix/job-cores/' + c.id); after(r, '지웠다', '못 지웠다'); load();
      });
      cell(tr, inline(up, down, edit, del), 'act'); tbody.appendChild(tr); return;
    }
    var name = input('text'); name.value = c.name; var api = input('text'); api.value = c.apiType; api.setAttribute('list', 'api-types');
    var icon = input('text', 'mono'); icon.value = c.iconFile;
    cell(tr, name); cell(tr, api); cell(tr, icon);
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hexa-matrix/job-cores/' + c.id, { name: name.value.trim(), apiType: api.value.trim(), iconFile: icon.value.trim() });
      if (after(r, c.name + ' 를 적었다', '못 적었다')) state.editingCore = null; load();
    });
    close.addEventListener('click', function () { state.editingCore = null; render(); });
    cell(tr, inline(save, close), 'act'); tbody.appendChild(tr);
  }

  async function moveCore(c, direction) {
    var r = await call('POST', '/admin/hexa-matrix/job-cores/' + c.id + '/move', { direction: direction });
    if (!r.ok) show(fail('못 옮겼다', r), true); load();
  }

  function statRow(s, tbody) {
    var editing = state.editingStat === s.key; var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, s.key, 'mono');
    if (!editing) {
      cell(tr, s.name); cell(tr, s.activationFragments === null ? span('모름', 'tag') : meso(s.activationFragments), 'num');
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingStat = s.key; render(); });
      cell(tr, edit, 'act'); tbody.appendChild(tr); return;
    }
    var name = input('text'); name.value = s.name; var act = input('number'); act.min = '0'; act.value = s.activationFragments === null ? '' : s.activationFragments;
    cell(tr, name); cell(tr, act);
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hexa-matrix/stats/' + s.key, { name: name.value.trim(), activationFragments: numOrNull(act.value) });
      if (after(r, s.key + ' 를 적었다', '못 적었다')) state.editingStat = null; load();
    });
    close.addEventListener('click', function () { state.editingStat = null; render(); });
    cell(tr, inline(save, close), 'act'); tbody.appendChild(tr);
  }

  function empty(tbody, cols) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = cols; tbody.appendChild(tr); }

  function jobsOf() { var seen = {}; var jobs = []; state.data.jobCores.forEach(function (c) { if (!seen[c.job]) { seen[c.job] = true; jobs.push(c.job); } }); return jobs; }

  function fillSelect(sel, options, keep) {
    sel.innerHTML = ''; options.forEach(function (o) { var opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1]; sel.appendChild(opt); });
    if (keep && options.some(function (o) { return o[0] === keep; })) sel.value = keep;
  }

  function render() {
    var d = state.data;
    var kinds = document.getElementById('kinds'); kinds.innerHTML = '';
    d.kinds.forEach(function (k) { kindRow(k, kinds); }); if (d.kinds.length === 0) empty(kinds, 8);
    var names = document.getElementById('names'); names.innerHTML = '';
    d.nameKinds.forEach(function (n) { nameRow(n, names); }); if (d.nameKinds.length === 0) empty(names, 3);
    var stats = document.getElementById('stats'); stats.innerHTML = '';
    d.stats.forEach(function (s) { statRow(s, stats); }); if (d.stats.length === 0) empty(stats, 4);

    fillSelect(document.getElementById('n-kind'), d.kinds.filter(function (k) { return !k.isDefault; }).map(function (k) { return [k.key, k.name + ' (' + k.apiType + ')']; }), document.getElementById('n-kind').value);
    var jobs = jobsOf(); if (state.job === null || jobs.indexOf(state.job) === -1) state.job = jobs[0] || null;
    fillSelect(document.getElementById('j-filter'), jobs.map(function (j) { return [j, j]; }), state.job);
    var list = document.getElementById('j-jobs'); list.innerHTML = ''; jobs.forEach(function (j) { var o = document.createElement('option'); o.value = j; list.appendChild(o); });
    var apis = document.getElementById('api-types'); apis.innerHTML = '';
    d.kinds.map(function (k) { return k.apiType; }).filter(function (a, i, all) { return all.indexOf(a) === i; }).forEach(function (a) { var o = document.createElement('option'); o.value = a; apis.appendChild(o); });
    var cores = document.getElementById('cores'); cores.innerHTML = '';
    var mine = d.jobCores.filter(function (c) { return c.job === state.job; });
    mine.forEach(function (c, i) { coreRow(c, i, mine.length, cores); }); if (mine.length === 0) empty(cores, 5);
  }

  document.getElementById('j-filter').addEventListener('change', function (e) { state.job = e.target.value; state.editingCore = null; render(); });

  document.getElementById('k-add').addEventListener('click', async function () {
    var body = { key: v('k-key'), name: v('k-name'), apiType: v('k-api'), isDefault: document.getElementById('k-default').checked, maxLevel: Number(v('k-max')), iconFile: v('k-icon') };
    var r = await call('POST', '/admin/hexa-matrix/kinds', body);
    if (after(r, body.key + ' 를 더했다. 수정에서 레벨 전부의 비용을 넣는다', '더하지 못했다')) ['k-key', 'k-name', 'k-api', 'k-icon'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });
  document.getElementById('n-add').addEventListener('click', async function () {
    var body = { name: v('n-name'), kind: v('n-kind') };
    var r = await call('POST', '/admin/hexa-matrix/names', body);
    if (after(r, body.name + ' 를 더했다', '더하지 못했다')) document.getElementById('n-name').value = '';
    load();
  });
  document.getElementById('j-add').addEventListener('click', async function () {
    var body = { job: v('j-job'), name: v('j-name'), apiType: v('j-api'), iconFile: v('j-icon') };
    var r = await call('POST', '/admin/hexa-matrix/job-cores', body);
    if (after(r, body.job + ' 에 ' + body.name + ' 를 더했다', '더하지 못했다')) { state.job = body.job; ['j-name', 'j-icon'].forEach(function (id) { document.getElementById(id).value = ''; }); }
    load();
  });
  document.getElementById('s-add').addEventListener('click', async function () {
    var body = { key: v('s-key'), name: v('s-name'), activationFragments: numOrNull(v('s-act')) };
    var r = await call('POST', '/admin/hexa-matrix/stats', body);
    if (after(r, body.key + ' 를 더했다', '더하지 못했다')) ['s-key', 's-name', 's-act'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/hexa-matrix/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    document.getElementById('stat-kinds').textContent = r.json.kinds.length;
    document.getElementById('stat-names').textContent = r.json.nameKinds.length;
    document.getElementById('stat-jobs').textContent = jobsOf().length;
    document.getElementById('stat-cores').textContent = r.json.jobCores.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
