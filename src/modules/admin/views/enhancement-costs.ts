import { layout } from './layout'

/**
 * 강화 비용. 맨 위에 규칙 셋, 그 아래 잠재 재설정 표 둘(종류마다 가로가 등급 넷, 세로가 레벨 구간), 소울 표 한 줄, 스타포스
 * 단계 표다. 칸을 제자리에서 고친다. 기간 줄이 없다.
 *
 * 고친 값은 앱이 다음에 수집하는 기록부터 쓰고 이미 저장한 합계는 안 바뀐다. 구간은 등급 넷을 한 번에 더하고 구간째 지우며
 * min_level 1 구간은 못 지운다. 단계는 끝 성수만 더하고 지운다.
 */
export const ENHANCEMENT_COSTS_HTML = layout(
  '/admin/enhancement-costs',
  '강화 비용',
  `<div class="head">
  <div>
    <h1>강화 비용</h1>
    <p>강화 1회의 메소를 매기는 재료다. 식(감정비용 = 계수 × L², 스타포스 = 1000 + L³ · (S+1)^지수 / 제수, 십의 자리 반올림)은 앱 코드가 들고 여기는 값만 든다. 고친 값은 앱이 다음에 수집하는 기록부터 쓴다. 바꾸면 <code>enhancementCosts.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-bands">–</b><span>잠재 구간</span></div>
    <div class="stat"><b id="stat-stars">–</b><span>스타포스 단계</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>규칙</h2><p>감정비용은 이 레벨 이하면 0 이고(통찰력은 전부 100 으로 본다), 파괴 방지 추가분은 할인 전 강화 비용에 붙고 할인을 안 받는다</p></header>
  <div class="body"><div class="row">
    <div class="field w-sm"><label for="r-free">감정비용 무료 상한 <small>레벨</small></label><input id="r-free" type="number" min="0"></div>
    <div class="field w-sm"><label for="r-coef">감정비용 계수</label><input id="r-coef" type="number" min="0"></div>
    <div class="field w-sm"><label for="r-surcharge">파괴 방지 추가분 <small>%</small></label><input id="r-surcharge" type="number" min="0"></div>
    <button id="r-save" class="btn" type="button">규칙 저장</button>
  </div></div>
</section>
<section class="card">
  <header><h2>잠재 재설정</h2><p>종류마다 가로가 등급, 세로가 레벨 구간이다. 장비 레벨 이하인 구간 중 가장 큰 것이 그 레벨의 줄이다. 비용은 누르기 전 등급으로 매긴다</p></header>
  <div class="body" id="potential"></div>
  <div class="body"><div class="sub">
    <h3 style="margin:0;font-size:13.5px">새 구간</h3>
    <div class="row">
      <div class="field w-md"><label for="b-type">종류</label><select id="b-type"></select></div>
      <div class="field w-sm"><label for="b-min">구간 시작 <small>레벨</small></label><input id="b-min" type="number" min="1" placeholder="275"></div>
      <div class="field w-sm"><label for="b-rare">레어</label><input id="b-rare" type="number" min="0"></div>
      <div class="field w-sm"><label for="b-epic">에픽</label><input id="b-epic" type="number" min="0"></div>
      <div class="field w-sm"><label for="b-unique">유니크</label><input id="b-unique" type="number" min="0"></div>
      <div class="field w-sm"><label for="b-legendary">레전드리</label><input id="b-legendary" type="number" min="0"></div>
      <button id="b-add" class="btn" type="button">구간 추가</button>
    </div>
  </div></div>
</section>
<section class="card">
  <header><h2>소울 잠재 재설정</h2><p>등급 하나로 정해지고 장비 레벨을 안 본다</p></header>
  <div class="body"><div class="row" id="soul"></div></div>
</section>
<section class="card">
  <header><h2>스타포스 단계</h2><p>시도 전 성수마다 지수와 제수. 0 부터 빠짐없이 있어야 해서 끝 성수만 더하고 지운다</p><span class="grow"></span><button id="s-add" class="btn ghost sm" type="button">끝 성수 더하기</button><button id="s-remove" class="btn danger sm" type="button">끝 성수 지우기</button></header>
  <div class="table"><table><thead><tr><th>성수</th><th class="num">지수</th><th class="num">제수</th><th></th></tr></thead><tbody id="stars"></tbody></table></div>
</section>
<script>
  var TYPES = [['potential', '잠재능력 재설정'], ['additional', '에디셔널 잠재능력 재설정']];
  var GRADES = [['rare', '레어'], ['epic', '에픽'], ['unique', '유니크'], ['legendary', '레전드리']];
  var state = { data: null, editingBand: null, editingStar: null };

  function nameOf(pairs, key) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === key) return pairs[i][1]; return key; }
  function bandsOf(type) {
    var levels = []; state.data.potentialResetCosts.forEach(function (c) { if (c.type === type && levels.indexOf(c.minLevel) < 0) levels.push(c.minLevel); });
    return levels.sort(function (a, b) { return b - a; });
  }
  function costOf(type, minLevel, grade) { var c = state.data.potentialResetCosts.filter(function (x) { return x.type === type && x.minLevel === minLevel && x.grade === grade; })[0]; return c ? c.costMeso : null; }

  function bandRow(type, minLevel) {
    var id = type + '/' + minLevel, editing = state.editingBand === id;
    var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, minLevel + ' 이상', 'mono');
    var inputs = {};
    GRADES.forEach(function (g) {
      var value = costOf(type, minLevel, g[0]);
      if (!editing) { cell(tr, value === null ? '-' : meso(value), 'num'); return; }
      var i = input('number'); i.min = '0'; i.value = value === null ? '' : value; inputs[g[0]] = i; cell(tr, i, 'num');
    });
    if (!editing) {
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingBand = id; render(); });
      var remove = button('지우기', 'btn danger sm'); remove.disabled = minLevel === 1; remove.title = minLevel === 1 ? '1 구간은 못 지운다' : '';
      remove.addEventListener('click', async function () { var r = await call('DELETE', '/admin/enhancement-costs/potential/' + type + '/' + minLevel); show(r.ok ? minLevel + ' 구간을 지웠다' : fail('못 지웠다', r), !r.ok); load(); });
      cell(tr, inline(edit, remove), 'act'); return tr;
    }
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      // 바뀐 칸만 보낸다. 칸마다 끝점 하나다.
      var failed = null;
      for (var i = 0; i < GRADES.length; i++) {
        var g = GRADES[i][0], next = Number(inputs[g].value);
        if (inputs[g].value.trim() === '' || next === costOf(type, minLevel, g)) continue;
        var r = await call('PUT', '/admin/enhancement-costs/potential/' + type + '/' + minLevel + '/' + g, { costMeso: next });
        if (!r.ok) { failed = r; break; }
      }
      show(failed ? fail('못 적었다', failed) : minLevel + ' 구간을 적었다', !!failed); if (!failed) state.editingBand = null; load();
    });
    close.addEventListener('click', function () { state.editingBand = null; render(); });
    cell(tr, inline(save, close), 'act'); return tr;
  }

  function renderPotential() {
    var box = document.getElementById('potential'); box.innerHTML = '';
    TYPES.forEach(function (t) {
      var wrap = el('div', undefined, 'sub'); wrap.appendChild(el('h3', t[1] + ' · 구간 ' + bandsOf(t[0]).length, 'editor'));
      var tbody = el('tbody'); bandsOf(t[0]).forEach(function (minLevel) { tbody.appendChild(bandRow(t[0], minLevel)); });
      if (bandsOf(t[0]).length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 6; tbody.appendChild(tr); }
      wrap.appendChild(mini(['구간', '레어', '에픽', '유니크', '레전드리', ''], tbody)); box.appendChild(wrap);
    });
  }

  function renderSoul() {
    var row = document.getElementById('soul'); row.innerHTML = '';
    var inputs = {};
    GRADES.forEach(function (g) {
      var c = state.data.soulPotentialResetCosts.filter(function (x) { return x.grade === g[0]; })[0];
      var i = input('number'); i.min = '0'; i.value = c ? c.costMeso : ''; i.id = 'soul-' + g[0]; inputs[g[0]] = i;
      row.appendChild(field(g[1], '메소', i));
    });
    var save = button('소울 저장', 'btn');
    save.addEventListener('click', async function () {
      var failed = null;
      for (var i = 0; i < GRADES.length; i++) {
        var g = GRADES[i][0]; if (inputs[g].value.trim() === '') continue;
        var r = await call('PUT', '/admin/enhancement-costs/soul/' + g, { costMeso: Number(inputs[g].value) });
        if (!r.ok) { failed = r; break; }
      }
      show(failed ? fail('못 적었다', failed) : '소울 비용을 적었다', !!failed); load();
    });
    row.appendChild(save);
  }

  function starRow(s) {
    var editing = state.editingStar === s.fromStar;
    var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, s.fromStar + ' → ' + (s.fromStar + 1), 'mono');
    if (!editing) {
      cell(tr, s.exponent, 'num'); cell(tr, s.divisor, 'num');
      var edit = button('수정', 'btn ghost sm'); edit.addEventListener('click', function () { state.editingStar = s.fromStar; render(); });
      cell(tr, edit, 'act'); return tr;
    }
    var exponent = input('number'); exponent.step = '0.1'; exponent.min = '0'; exponent.value = s.exponent;
    var divisor = input('number'); divisor.min = '1'; divisor.value = s.divisor;
    cell(tr, exponent, 'num'); cell(tr, divisor, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/enhancement-costs/starforce/' + s.fromStar, { exponent: Number(exponent.value), divisor: Number(divisor.value) });
      show(r.ok ? s.fromStar + ' 성을 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingStar = null; load();
    });
    close.addEventListener('click', function () { state.editingStar = null; render(); });
    cell(tr, inline(save, close), 'act'); return tr;
  }

  function render() {
    renderPotential(); renderSoul();
    var stars = document.getElementById('stars'); stars.innerHTML = '';
    state.data.starforceSteps.forEach(function (s) { stars.appendChild(starRow(s)); });
    if (state.data.starforceSteps.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 4; stars.appendChild(tr); }
  }

  TYPES.forEach(function (t) { var o = document.createElement('option'); o.value = t[0]; o.textContent = t[1]; document.getElementById('b-type').appendChild(o); });
  document.getElementById('r-save').addEventListener('click', async function () {
    var r = await call('PUT', '/admin/enhancement-costs/rules', { cubeAppraisalFreeMaxLevel: Number(document.getElementById('r-free').value), cubeAppraisalCoefficient: Number(document.getElementById('r-coef').value), starforceDestroyDefenceSurchargePercent: Number(document.getElementById('r-surcharge').value) });
    show(r.ok ? '규칙을 적었다' : fail('못 적었다', r), !r.ok); load();
  });
  document.getElementById('b-add').addEventListener('click', async function () {
    var body = { type: document.getElementById('b-type').value, minLevel: Number(document.getElementById('b-min').value), costs: { rare: Number(document.getElementById('b-rare').value), epic: Number(document.getElementById('b-epic').value), unique: Number(document.getElementById('b-unique').value), legendary: Number(document.getElementById('b-legendary').value) } };
    var r = await call('POST', '/admin/enhancement-costs/potential', body);
    show(r.ok ? body.minLevel + ' 구간을 더했다' : fail('더하지 못했다', r), !r.ok);
    if (r.ok) ['b-min', 'b-rare', 'b-epic', 'b-unique', 'b-legendary'].forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });
  document.getElementById('s-add').addEventListener('click', async function () {
    var last = state.data.starforceSteps[state.data.starforceSteps.length - 1];
    var r = await call('POST', '/admin/enhancement-costs/starforce', { exponent: last ? last.exponent : 1, divisor: last ? last.divisor : 36 });
    show(r.ok ? r.json.fromStar + ' 성을 더했다. 지수 · 제수는 끝 줄을 복사했으니 고쳐라' : fail('더하지 못했다', r), !r.ok); load();
  });
  document.getElementById('s-remove').addEventListener('click', async function () {
    var r = await call('DELETE', '/admin/enhancement-costs/starforce/last');
    show(r.ok ? '끝 성수를 지웠다' : fail('못 지웠다', r), !r.ok); load();
  });

  async function load() {
    var r = await call('GET', '/admin/enhancement-costs/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    document.getElementById('stat-bands').textContent = bandsOf('potential').length + ' · ' + bandsOf('additional').length;
    document.getElementById('stat-stars').textContent = r.json.starforceSteps.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    document.getElementById('r-free').value = r.json.rules.cubeAppraisalFreeMaxLevel == null ? '' : r.json.rules.cubeAppraisalFreeMaxLevel;
    document.getElementById('r-coef').value = r.json.rules.cubeAppraisalCoefficient == null ? '' : r.json.rules.cubeAppraisalCoefficient;
    document.getElementById('r-surcharge').value = r.json.rules.starforceDestroyDefenceSurchargePercent == null ? '' : r.json.rules.starforceDestroyDefenceSurchargePercent;
    render();
  }
  load();
</script>`,
)
