import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 헥사 매트릭스. 카드 넷이다. 코어 종류(줄의 수정을 누르면 그 아래로 레벨마다 비용 칸이 펼쳐진다) · 직업 · 직업별 코어 · 헥사 스탯.
 *
 * 코어는 종류를 직접 가리킨다. 차례는 같은 직업 · 같은 종류 안의 차례이고, 앱이 전직업의 코어를 섞어 종류 차례로 다시 늘어놓는다.
 * 비용은 기간 줄 없이 레벨 전부를 한 번에 갈아 끼운다. 빈 레벨이 있으면 앱의 구간 합이 틀려서다.
 */
export const HEXA_MATRIX_HTML = layout(
  '/admin/hexa-matrix',
  '헥사 매트릭스',
  `<div class="head">
  <div>
    <h1>헥사 매트릭스</h1>
    <p>가계부 헥사 강화 지출의 데이터다. 코어는 종류를 직접 고른다. 모든 직업이 쓰는 코어는 전직업에 둔다. 비용은 Lv.n → n+1 의 솔 에르다 조각과 솔 에르다이고 레벨 전부를 한 번에 적는다. 바꾸면 <code>hexaMatrix.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-types">–</b><span>종류</span></div>
    <div class="stat"><b id="stat-jobs">–</b><span>직업</span></div>
    <div class="stat"><b id="stat-cores">–</b><span>코어</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>

<section class="card">
  <header><h2>코어 종류</h2><p>넥슨 타입마다 기본 종류는 하나다. 표에 없는 코어를 넥슨 타입으로 맞출 때 쓴다. 줄의 수정에서 레벨 전부의 비용을 적는다</p></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th>넥슨 타입</th><th>기본</th><th class="num">만렙</th><th>그림</th><th class="num">비용 레벨</th><th></th></tr></thead><tbody id="types"></tbody></table></div>
  <div class="body"><div class="row">
    <div class="field"><label for="t-key">key</label><input id="t-key" class="mono" placeholder="skill_3rd"></div>
    <div class="field"><label for="t-name">이름</label><input id="t-name" placeholder="3rd 스킬 코어"></div>
    <div class="field"><label for="t-api">넥슨 타입 <small>hexa_core_type</small></label><input id="t-api" placeholder="스킬 코어"></div>
    <div class="field w-sm"><label for="t-max">만렙</label><input id="t-max" type="number" min="1" value="30"></div>
    <div class="field"><label>그림 <small>아이템 분류의 그림</small></label><div class="inline"><span id="t-icon" class="mono dim">고르지 않았다</span><button id="t-icon-pick" class="btn ghost sm" type="button">고르기</button></div></div>
    <label class="check"><input id="t-default" type="checkbox"> 기본 종류</label>
    <button id="t-add" class="btn" type="button">종류 추가</button>
  </div></div>
</section>

<section class="card">
  <header><h2>직업</h2><p>넥슨 character_class 이름이다. 전직업은 모든 직업이 함께 쓰는 코어를 둔다</p></header>
  <div class="table"><table><thead><tr><th>이름</th><th class="num">코어</th><th></th></tr></thead><tbody id="jobs"></tbody></table></div>
  <div class="body"><div class="row">
    <div class="field"><label for="b-name">직업 이름 <small>character_class</small></label><input id="b-name" placeholder="아크메이지(불,독)"></div>
    <button id="b-add" class="btn" type="button">직업 추가</button>
  </div></div>
</section>

<section class="card">
  <header><h2>직업별 코어</h2><p>차례는 같은 종류 안에서 hexamatrix 응답의 차례다. 그림은 그림 화면의 스킬 분류에 먼저 올린다</p></header>
  <div class="body"><div class="row">
    <div class="field w-md"><label for="c-job">직업</label><select id="c-job"></select></div>
  </div><div class="row">
    <div class="field"><label for="c-name">코어 이름</label><input id="c-name" placeholder="인페르날 웨이브"></div>
    <div class="field w-md"><label for="c-type">종류</label><select id="c-type"></select></div>
    <div class="field"><label>그림 <small>스킬 분류의 그림</small></label><div class="inline"><span id="c-icon" class="mono dim">고르지 않았다</span><button id="c-icon-pick" class="btn ghost sm" type="button">고르기</button></div></div>
    <button id="c-add" class="btn" type="button">코어 추가</button>
  </div></div>
  <div class="table"><table><thead><tr><th>#</th><th>코어 이름</th><th>종류</th><th>그림</th><th></th></tr></thead><tbody id="cores"></tbody></table></div>
</section>

<section class="card">
  <header><h2>헥사 스탯</h2><p>활성화 조각을 모르면 비운다. 앱이 활성화 체크를 막는다</p></header>
  <div class="table"><table><thead><tr><th>key</th><th>이름</th><th class="num">활성화 조각</th><th></th></tr></thead><tbody id="stats"></tbody></table></div>
  <div class="body"><div class="row">
    <div class="field"><label for="s-key">key</label><input id="s-key" class="mono" placeholder="hexa_stat_4"></div>
    <div class="field"><label for="s-name">이름</label><input id="s-name" placeholder="헥사 스탯 Ⅳ"></div>
    <div class="field w-sm"><label for="s-act">활성화 조각</label><input id="s-act" type="number" min="0"></div>
    <button id="s-add" class="btn" type="button">스탯 추가</button>
  </div></div>
</section>
${ASSET_PICKER}
<script>
  // assets 는 그림 id 에서 그림 줄을 찾는 표다. 그림 칸에 파일 이름을 보인다.
  var state = { data: null, assets: {}, openType: null, editingJob: null, editingCore: null, editingStat: null, job: null, newTypeIcon: null, newCoreIcon: null };
  var TYPE_ICONS = ['item', 'item_ring'];
  var CORE_ICONS = ['skill'];
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }
  function v(id) { return document.getElementById(id).value.trim(); }
  function after(r, okText, failText) { show(r.ok ? okText : fail(failText, r), !r.ok); return r.ok; }
  function iconText(id) { var a = id ? state.assets[id] : null; return id === null ? '고르지 않았다' : a ? a.fileName + '.' + a.extension : '그림 표에 없다'; }
  function pickIcon(categories, current, onPick) {
    openAssetPicker({ categories: categories, uploadCategory: categories[0], current: current, onPick: function (f) { if (f) onPick(f.id); } });
  }
  function iconField(categories, holder) {
    var label = span(iconText(holder.id), 'mono'); var pick = button('고르기', 'btn ghost sm');
    pick.addEventListener('click', function () { pickIcon(categories, holder.id, function (id) { holder.id = id; label.textContent = iconText(id); }); });
    return inline(label, pick);
  }
  function typeById(id) { return state.data.hexaCoreTypes.filter(function (t) { return t.id === id; })[0]; }
  function costsOf(type) { return state.data.hexaCoreLevelCosts.filter(function (c) { return c.typeId === type.id; }); }

  function typeRow(t, tbody) {
    var isOpen = state.openType === t.key; var tr = el('tr', undefined, isOpen ? 'open' : '');
    cell(tr, t.key, 'mono'); cell(tr, t.name); cell(tr, t.apiType); cell(tr, t.isDefault ? span('기본', 'tag accent') : '');
    cell(tr, t.maxLevel, 'num'); cell(tr, iconText(t.iconAssetId), 'mono');
    var have = costsOf(t).length; cell(tr, have === t.maxLevel ? String(have) : span(have + ' / ' + t.maxLevel, 'tag'), 'num');
    var toggle = button(isOpen ? '닫기' : '수정', 'btn ghost sm');
    toggle.addEventListener('click', function () { state.openType = isOpen ? null : t.key; render(); });
    cell(tr, toggle, 'act'); tbody.appendChild(tr);
    if (isOpen) tbody.appendChild(typeEditor(t));
  }

  function typeEditor(t) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 8;
    var box = el('div', undefined, 'editor'); box.appendChild(el('h3', t.name + ' 의 칸과 비용'));
    var name = input('text'); name.value = t.name; var api = input('text'); api.value = t.apiType;
    var max = input('number'); max.min = '1'; max.value = t.maxLevel; var icon = { id: t.iconAssetId };
    var def = input('checkbox'); def.checked = t.isDefault; var defLabel = el('label', undefined, 'check'); defLabel.appendChild(def); defLabel.appendChild(document.createTextNode(' 기본 종류'));
    var saveMeta = button('종류 저장', 'btn ghost sm');
    saveMeta.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hexa-matrix/types/' + t.key, { name: name.value.trim(), apiType: api.value.trim(), isDefault: def.checked, maxLevel: Number(max.value), iconAssetId: icon.id });
      after(r, t.key + ' 를 적었다', '못 적었다'); load();
    });
    var meta = el('div', undefined, 'row'); meta.appendChild(field('이름', undefined, name)); meta.appendChild(field('넥슨 타입', undefined, api)); meta.appendChild(field('만렙', '비용 줄 아래로는 못 내린다', max)); meta.appendChild(field('그림', undefined, iconField(TYPE_ICONS, icon))); meta.appendChild(defLabel); meta.appendChild(saveMeta); box.appendChild(meta);

    var current = {}; costsOf(t).forEach(function (c) { current[c.fromLevel] = c; });
    var inputs = []; var tbody = el('tbody');
    for (var level = 0; level < t.maxLevel; level++) {
      var row = el('tr'); var c = current[level];
      cell(row, 'Lv.' + level + ' → ' + (level + 1), 'mono');
      var frag = input('number'); frag.min = '0'; frag.value = c ? c.fragmentQuantity : '';
      var sol = input('number'); sol.min = '0'; sol.value = c ? c.solErdaQuantity : '';
      cell(row, frag); cell(row, sol); inputs.push({ level: level, frag: frag, sol: sol }); tbody.appendChild(row);
    }
    box.appendChild(mini(['레벨', '조각', '솔 에르다'], tbody));
    var saveCosts = button('비용 전부 저장', 'btn sm');
    saveCosts.addEventListener('click', async function () {
      var costs = inputs.map(function (i) { return { fromLevel: i.level, fragmentQuantity: numOrNull(i.frag.value), solErdaQuantity: numOrNull(i.sol.value) }; });
      if (costs.some(function (c) { return c.fragmentQuantity === null || c.solErdaQuantity === null; })) { show('빈 칸이 있다. 레벨 전부를 적는다', true); return; }
      var r = await call('PUT', '/admin/hexa-matrix/types/' + t.key + '/costs', { costs: costs });
      after(r, t.key + ' 의 비용 ' + costs.length + '줄을 적었다', '못 적었다'); load();
    });
    box.appendChild(saveCosts);
    box.appendChild(el('p', '만렙을 바꾸면 먼저 종류를 저장하고 비용 칸을 다시 연다. 레벨이 빠지거나 겹치면 서버가 거절한다.', 'hint'));
    td.appendChild(box); tr.appendChild(td); return tr;
  }

  function jobRow(j, tbody) {
    var editing = state.editingJob === j.id; var tr = el('tr', undefined, editing ? 'open' : '');
    var count = state.data.hexaCores.filter(function (c) { return c.jobId === j.id; }).length;
    if (!editing) {
      cell(tr, j.isAllJobs ? inline(document.createTextNode(j.name), span('공용 코어', 'tag accent')) : j.name); cell(tr, count, 'num');
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingJob = j.id; render(); });
      cell(tr, edit, 'act'); tbody.appendChild(tr); return;
    }
    var name = input('text'); name.value = j.name; cell(tr, name); cell(tr, count, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hexa-matrix/jobs/' + j.id, { name: name.value.trim() });
      if (after(r, name.value.trim() + ' 로 고쳤다', '못 고쳤다')) state.editingJob = null; load();
    });
    close.addEventListener('click', function () { state.editingJob = null; render(); });
    cell(tr, inline(save, close), 'act'); tbody.appendChild(tr);
  }

  function typeOptions(select, selectedId) {
    state.data.hexaCoreTypes.forEach(function (t) { var o = document.createElement('option'); o.value = t.key; o.textContent = t.name; if (t.id === selectedId) o.selected = true; select.appendChild(o); });
    return select;
  }

  function coreRow(c, i, count, tbody) {
    var editing = state.editingCore === c.id; var tr = el('tr', undefined, editing ? 'open' : '');
    var type = typeById(c.typeId);
    cell(tr, i + 1, 'n');
    if (!editing) {
      cell(tr, c.name); cell(tr, type ? type.name : '모르는 종류'); cell(tr, iconText(c.iconAssetId), 'mono');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm'), del = button('지우기', 'btn danger sm');
      up.disabled = i === 0; down.disabled = i === count - 1;
      up.addEventListener('click', function () { moveCore(c, 'up'); });
      down.addEventListener('click', function () { moveCore(c, 'down'); });
      edit.addEventListener('click', function () { state.editingCore = c.id; render(); });
      del.addEventListener('click', async function () {
        if (!window.confirm(c.name + ' 를 지운다.')) return;
        var r = await call('DELETE', '/admin/hexa-matrix/cores/' + c.id); after(r, '지웠다', '못 지웠다'); load();
      });
      cell(tr, inline(up, down, edit, del), 'act'); tbody.appendChild(tr); return;
    }
    var name = input('text'); name.value = c.name; var typeSelect = typeOptions(document.createElement('select'), c.typeId); var icon = { id: c.iconAssetId };
    cell(tr, name); cell(tr, typeSelect); cell(tr, iconField(CORE_ICONS, icon));
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hexa-matrix/cores/' + c.id, { name: name.value.trim(), typeKey: typeSelect.value, iconAssetId: icon.id });
      if (after(r, c.name + ' 를 적었다', '못 적었다')) state.editingCore = null; load();
    });
    close.addEventListener('click', function () { state.editingCore = null; render(); });
    cell(tr, inline(save, close), 'act'); tbody.appendChild(tr);
  }

  async function moveCore(c, direction) {
    var r = await call('POST', '/admin/hexa-matrix/cores/' + c.id + '/move', { direction: direction });
    if (!r.ok) show(fail('못 옮겼다', r), true); load();
  }

  function statRow(s, tbody) {
    var editing = state.editingStat === s.key; var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, s.key, 'mono');
    if (!editing) {
      cell(tr, s.name); cell(tr, s.activationFragmentQuantity === null ? span('모름', 'tag') : meso(s.activationFragmentQuantity), 'num');
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingStat = s.key; render(); });
      cell(tr, edit, 'act'); tbody.appendChild(tr); return;
    }
    var name = input('text'); name.value = s.name; var act = input('number'); act.min = '0'; act.value = s.activationFragmentQuantity === null ? '' : s.activationFragmentQuantity;
    cell(tr, name); cell(tr, act);
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/hexa-matrix/stats/' + s.key, { name: name.value.trim(), activationFragmentQuantity: numOrNull(act.value) });
      if (after(r, s.key + ' 를 적었다', '못 적었다')) state.editingStat = null; load();
    });
    close.addEventListener('click', function () { state.editingStat = null; render(); });
    cell(tr, inline(save, close), 'act'); tbody.appendChild(tr);
  }

  function empty(tbody, cols) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = cols; tbody.appendChild(tr); }

  function fillSelect(sel, options, keep) {
    sel.innerHTML = ''; options.forEach(function (o) { var opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1]; sel.appendChild(opt); });
    if (keep && options.some(function (o) { return o[0] === keep; })) sel.value = keep;
  }

  function render() {
    var d = state.data;
    var types = document.getElementById('types'); types.innerHTML = '';
    d.hexaCoreTypes.forEach(function (t) { typeRow(t, types); }); if (d.hexaCoreTypes.length === 0) empty(types, 8);
    var jobs = document.getElementById('jobs'); jobs.innerHTML = '';
    d.jobs.forEach(function (j) { jobRow(j, jobs); }); if (d.jobs.length === 0) empty(jobs, 3);
    var stats = document.getElementById('stats'); stats.innerHTML = '';
    d.hexaStats.forEach(function (s) { statRow(s, stats); }); if (d.hexaStats.length === 0) empty(stats, 4);

    var ids = d.jobs.map(function (j) { return j.id; });
    if (state.job === null || ids.indexOf(state.job) === -1) state.job = ids[0] || null;
    fillSelect(document.getElementById('c-job'), d.jobs.map(function (j) { return [j.id, j.name]; }), state.job);
    fillSelect(document.getElementById('c-type'), d.hexaCoreTypes.map(function (t) { return [t.key, t.name]; }), document.getElementById('c-type').value);
    var cores = document.getElementById('cores'); cores.innerHTML = '';
    var mine = d.hexaCores.filter(function (c) { return c.jobId === state.job; });
    // 차례는 종류마다 따로라 ↑ ↓ 도 같은 종류 안에서만 연다.
    d.hexaCoreTypes.forEach(function (t) {
      var group = mine.filter(function (c) { return c.typeId === t.id; });
      group.forEach(function (c, i) { coreRow(c, i, group.length, cores); });
    });
    if (mine.length === 0) empty(cores, 5);
  }

  document.getElementById('c-job').addEventListener('change', function (e) { state.job = e.target.value; state.editingCore = null; render(); });
  document.getElementById('t-icon-pick').addEventListener('click', function () {
    pickIcon(TYPE_ICONS, state.newTypeIcon, function (id) { state.newTypeIcon = id; document.getElementById('t-icon').textContent = iconText(id); });
  });
  document.getElementById('c-icon-pick').addEventListener('click', function () {
    pickIcon(CORE_ICONS, state.newCoreIcon, function (id) { state.newCoreIcon = id; document.getElementById('c-icon').textContent = iconText(id); });
  });

  document.getElementById('t-add').addEventListener('click', async function () {
    var body = { key: v('t-key'), name: v('t-name'), apiType: v('t-api'), isDefault: document.getElementById('t-default').checked, maxLevel: Number(v('t-max')), iconAssetId: state.newTypeIcon };
    var r = await call('POST', '/admin/hexa-matrix/types', body);
    if (after(r, body.key + ' 를 더했다. 수정에서 레벨 전부의 비용을 넣는다', '더하지 못했다')) { ['t-key', 't-name', 't-api'].forEach(function (id) { document.getElementById(id).value = ''; }); state.newTypeIcon = null; document.getElementById('t-icon').textContent = iconText(null); }
    load();
  });
  document.getElementById('b-add').addEventListener('click', async function () {
    var body = { name: v('b-name') };
    var r = await call('POST', '/admin/hexa-matrix/jobs', body);
    if (after(r, body.name + ' 를 더했다', '더하지 못했다')) { state.job = r.json.id; document.getElementById('b-name').value = ''; }
    load();
  });
  document.getElementById('c-add').addEventListener('click', async function () {
    var body = { jobId: state.job, name: v('c-name'), typeKey: v('c-type'), iconAssetId: state.newCoreIcon };
    var r = await call('POST', '/admin/hexa-matrix/cores', body);
    if (after(r, body.name + ' 를 더했다', '더하지 못했다')) { document.getElementById('c-name').value = ''; state.newCoreIcon = null; document.getElementById('c-icon').textContent = iconText(null); }
    load();
  });
  document.getElementById('s-add').addEventListener('click', async function () {
    var body = { key: v('s-key'), name: v('s-name'), activationFragmentQuantity: numOrNull(v('s-act')) };
    var r = await call('POST', '/admin/hexa-matrix/stats', body);
    if (after(r, body.key + ' 를 더했다', '더하지 못했다')) ['s-key', 's-name', 's-act'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });

  async function load() {
    var r = await call('GET', '/admin/hexa-matrix/rows');
    var a = await call('GET', '/admin/assets/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    state.data = r.json;
    state.assets = {}; a.json.rows.forEach(function (row) { state.assets[row.id] = row; });
    document.getElementById('stat-types').textContent = r.json.hexaCoreTypes.length;
    document.getElementById('stat-jobs').textContent = r.json.jobs.length;
    document.getElementById('stat-cores').textContent = r.json.hexaCores.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
