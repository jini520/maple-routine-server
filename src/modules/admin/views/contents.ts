import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 컨텐츠 표. 맨 위에 갈래 표 8줄, 그 아래 일간 · 주간 표 둘이다. 줄의 수정을 누르면 그 아래로 편집기가 펼쳐지고, 새 컨텐츠는
 * 같은 편집기가 표 맨 아래에 열려 섹션 맨 끝에 선다.
 *
 * key 와 주기는 캐시 · 추적 목록 · 공유 진행 기록이 들어 못 바꾸고 컨텐츠는 지우지 않는다. validUntil 로 닫는다. 갈래는
 * ENUM 과 일대일이라 더하고 지우는 폼이 없다.
 */
export const CONTENTS_HTML = layout(
  '/admin/contents',
  '컨텐츠',
  `<div class="head">
  <div>
    <h1>컨텐츠</h1>
    <p>일간 · 주간 컨텐츠의 마스터 표다. API 이름으로 넥슨 응답과 맞추고, 완료 조건으로 완료를 판정한다. 공유 줄의 짧은 이름은 today 의 공유 위젯에 쓴다. 컨텐츠는 지우지 않고 validUntil 로 닫는다. 바꾸면 <code>contents.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-daily">–</b><span>일간</span></div>
    <div class="stat"><b id="stat-weekly">–</b><span>주간</span></div>
    <div class="stat"><b id="stat-shared">–</b><span>공유 줄</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>갈래</h2><p>key 는 코드가 분기에 쓰는 ENUM 이라 여기서 더하거나 지우지 않는다. 차례는 관리 화면 주간 목록의 갈래 차례이고, 공유 차례는 today 공유 위젯의 계열 차례다</p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>참고 태그</th><th>태그 숨김</th><th class="num">주간 최대 횟수</th><th class="num">공유 차례</th><th></th></tr></thead><tbody id="categories"></tbody></table></div>
</section>
<section class="card">
  <header><h2>일간</h2><p id="daily-count"></p><span class="grow"></span><button id="daily-new" class="btn ghost sm" type="button">새 컨텐츠</button></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>API 이름</th><th>갈래</th><th>완료 조건</th><th class="num">최대 횟수</th><th class="num">레벨</th><th>공유</th><th>기간</th><th></th></tr></thead><tbody id="daily"></tbody></table></div>
</section>
<section class="card">
  <header><h2>주간</h2><p id="weekly-count"></p><span class="grow"></span><button id="weekly-new" class="btn ghost sm" type="button">새 컨텐츠</button></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>API 이름</th><th>갈래</th><th>완료 조건</th><th class="num">최대 횟수</th><th class="num">레벨</th><th>공유</th><th>기간</th><th></th></tr></thead><tbody id="weekly"></tbody></table></div>
</section>
${ASSET_PICKER}
<script>
  var TYPES = [['contents', 'contents'], ['quest', 'quest']];
  var CHECKS = [['state_only', '퀘스트 상태'], ['count_only', '횟수'], ['both', '상태와 횟수'], ['score', '점수']];
  var SCOPES = [['character', '캐릭터'], ['world', '월드'], ['account', '계정']];
  // assets 는 그림 id 에서 그림 줄을 찾는 표다. 그림 칸에 파일 이름을 보인다.
  var state = { data: null, assets: {}, editingCategory: null, editing: null, adding: null };
  function iconText(id) { var a = id ? state.assets[id] : null; return id == null ? '고르지 않았다' : a ? a.fileName + '.' + a.extension : '그림 표에 없다'; }
  function pickerField(categories, holder) {
    var label = span(iconText(holder.id), 'mono'); var pick = button('고르기', 'btn ghost sm'); var clear = button('비우기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: categories, uploadCategory: categories[0], current: holder.id, onPick: function (f) { holder.id = f ? f.id : null; label.textContent = iconText(holder.id); } }); });
    clear.addEventListener('click', function () { holder.id = null; label.textContent = iconText(null); });
    return inline(label, pick, clear);
  }

  function nameOf(pairs, key) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === key) return pairs[i][1]; return key; }
  function categoryName(key) { var c = state.data.categories.filter(function (x) { return x.key === key; })[0]; return c ? c.name : key; }
  function categoryChoices() { return state.data.categories.map(function (c) { return [c.key, c.name + ' (' + c.key + ')']; }); }
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }
  function period(c) { if (!c.validFrom && !c.validUntil) return '-'; return (c.validFrom || '처음') + ' ~ ' + (c.validUntil || ''); }
  function ofSection(cycle) { return state.data.contents.filter(function (c) { return c.cycle === cycle; }); }

  function categoryRow(c, i) {
    var editing = state.editingCategory === c.key;
    var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, c.key, 'mono');
    if (!editing) {
      cell(tr, c.name); cell(tr, c.countTag || '-'); cell(tr, c.hidesCountTag ? span('숨김', 'tag') : span('-', 'dim'));
      cell(tr, c.weeklyMaxCount === null ? '-' : c.weeklyMaxCount, 'num'); cell(tr, c.sharedSortOrder === null ? '-' : c.sharedSortOrder, 'num');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/categories/' + c.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/categories/' + c.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      edit.addEventListener('click', function () { state.editingCategory = c.key; render(); });
      cell(tr, inline(up, down, edit), 'act');
      return tr;
    }
    var name = input('text'); name.value = c.name; var tag = input('text'); tag.value = c.countTag || ''; tag.placeholder = 'ID당 1회';
    var hide = input('checkbox'); hide.checked = c.hidesCountTag;
    var limit = input('number'); limit.min = '1'; limit.value = c.weeklyMaxCount === null ? '' : c.weeklyMaxCount;
    var shared = input('number'); shared.min = '0'; shared.value = c.sharedSortOrder === null ? '' : c.sharedSortOrder;
    cell(tr, name); cell(tr, tag); cell(tr, hide); cell(tr, limit, 'num'); cell(tr, shared, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/contents/categories/' + c.key, { name: name.value.trim(), countTag: orNull(tag.value), hidesCountTag: hide.checked, weeklyMaxCount: numOrNull(limit.value), sharedSortOrder: numOrNull(shared.value) });
      show(r.ok ? c.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingCategory = null; load();
    });
    close.addEventListener('click', function () { state.editingCategory = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function contentRow(c, i) {
    var tr = el('tr', undefined, state.editing === c.key ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, c.key, 'mono'); cell(tr, c.name); cell(tr, c.apiName); cell(tr, categoryName(c.category));
    cell(tr, nameOf(CHECKS, c.checkType)); cell(tr, c.maxCount === null ? '-' : c.maxCount, 'num');
    cell(tr, c.requiredLevel === null ? '-' : c.requiredLevel, 'num');
    cell(tr, c.shareScope === 'character' ? span('-', 'dim') : span(nameOf(SCOPES, c.shareScope) + ' · ' + c.shortName, 'tag accent'));
    cell(tr, period(c), 'mono');
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
    up.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/' + c.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
    down.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/' + c.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
    edit.addEventListener('click', function () { state.editing = state.editing === c.key ? null : c.key; state.adding = null; render(); });
    cell(tr, inline(up, down, edit), 'act');
    return tr;
  }

  // 편집기 하나로 새 컨텐츠와 수정을 다 한다. c 가 null 이면 새 컨텐츠이고 그 주기의 맨 끝에 선다.
  function editorRow(cycle, c) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 11;
    var box = el('div', undefined, 'editor'); box.appendChild(el('h3', c ? c.key + ' 수정' : (cycle === 'daily' ? '일간' : '주간') + ' 새 컨텐츠. 맨 끝에 선다'));
    var key = input('text', 'mono'); key.placeholder = 'epic_dungeon_aurum_regis';
    var apiName = input('text'); apiName.placeholder = '에픽 던전 : 아우룸 레기스';
    var category = select(categoryChoices(), c ? c.category : undefined);
    var name = input('text'); var shortName = input('text');
    var backgroundMap = { id: c ? c.backgroundMapAssetId : null }; var backgroundPortrait = { id: c ? c.backgroundPortraitAssetId : null }; var regionIcon = { id: c ? c.regionIconAssetId : null };
    var countTag = input('text'); countTag.placeholder = '월드 당 2회';
    var type = select(TYPES, c ? c.type : 'contents'); var checkType = select(CHECKS, c ? c.checkType : 'count_only');
    var maxCount = input('number'); maxCount.min = '1'; maxCount.placeholder = '완료 조건이 횟수일 때만';
    var requiredLevel = input('number'); requiredLevel.min = '1';
    var from = input('text', 'mono'); from.placeholder = '2026-09-17'; var until = input('text', 'mono'); until.placeholder = '비우면 끝없이';
    var shareScope = select(SCOPES, c ? c.shareScope : 'character');
    if (c) {
      apiName.value = c.apiName; name.value = c.name; shortName.value = c.shortName; countTag.value = c.countTag || '';
      maxCount.value = c.maxCount === null ? '' : c.maxCount; requiredLevel.value = c.requiredLevel === null ? '' : c.requiredLevel;
      from.value = c.validFrom || ''; until.value = c.validUntil || '';
    }
    var grid = el('div', undefined, 'grid2');
    if (!c) grid.appendChild(field('key', 'snake_case. 한 번 정하면 못 바꾼다', key));
    grid.appendChild(field('API 이름', '넥슨 응답의 content_name. 공백을 지워도 다른 줄과 달라야 한다', apiName));
    grid.appendChild(field('갈래', undefined, category));
    grid.appendChild(field('이름', '카드 · 관리 화면', name));
    grid.appendChild(field('짧은 이름', '캐릭터 줄은 남은 스케줄, 공유 줄은 공유 위젯에 쓴다', shortName));
    grid.appendChild(field('지도 배경', '지도 분류의 그림. 초상과 함께 못 든다', pickerField(['map'], backgroundMap)));
    grid.appendChild(field('보스 초상', '에픽던전. 지도와 함께 못 든다', pickerField(['boss'], backgroundPortrait)));
    grid.appendChild(field('지역 아이콘', '지도 배경이 있는 카드가 옆에 세운다', pickerField(['map_icon'], regionIcon)));
    grid.appendChild(field('참고 태그', '갈래의 태그를 이 줄만 덮는다', countTag));
    grid.appendChild(field('넥슨 type', '넥슨이 주는 값. 완료 판정에는 안 쓴다', type));
    grid.appendChild(field('완료 조건', '넥슨 응답의 무엇을 보고 완료를 판정하는지', checkType));
    grid.appendChild(field('최대 횟수', '완료 조건이 횟수인 줄만. 넥슨이 준 최대 횟수 대신 쓴다', maxCount));
    grid.appendChild(field('요구 레벨', '표시용. 비우면 없음', requiredLevel));
    grid.appendChild(field('validFrom', 'KST. 비우면 처음부터', from));
    grid.appendChild(field('validUntil', '지우지 않고 여기로 닫는다', until));
    grid.appendChild(field('공유 범위', '월드 · 계정이면 공유 위젯에 선다', shareScope));
    box.appendChild(grid);
    function body() {
      return {
        apiName: apiName.value.trim(), category: category.value, name: name.value.trim(), shortName: shortName.value.trim(),
        backgroundMapAssetId: backgroundMap.id, backgroundPortraitAssetId: backgroundPortrait.id, regionIconAssetId: regionIcon.id, countTag: orNull(countTag.value),
        type: type.value, checkType: checkType.value, maxCount: numOrNull(maxCount.value), requiredLevel: numOrNull(requiredLevel.value),
        validFrom: orNull(from.value), validUntil: orNull(until.value), shareScope: shareScope.value,
      };
    }
    var actions = el('div', undefined, 'actions');
    if (c) {
      var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
      save.addEventListener('click', async function () { var r = await call('PUT', '/admin/contents/' + c.key, body()); show(r.ok ? c.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editing = null; load(); });
      close.addEventListener('click', function () { state.editing = null; render(); });
      actions.appendChild(save); actions.appendChild(close);
    } else {
      var add = button('컨텐츠 추가', 'btn sm'), cancel = button('닫기', 'btn ghost sm');
      add.addEventListener('click', async function () {
        var b = body(); b.key = key.value.trim(); b.cycle = cycle;
        var r = await call('POST', '/admin/contents', b); show(r.ok ? b.key + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) state.adding = null; load();
      });
      cancel.addEventListener('click', function () { state.adding = null; render(); });
      actions.appendChild(add); actions.appendChild(cancel);
    }
    box.appendChild(actions); td.appendChild(box); tr.appendChild(td); return tr;
  }

  function renderSection(section) {
    var tbody = document.getElementById(section); tbody.innerHTML = '';
    var rows = ofSection(section);
    rows.forEach(function (c, i) { tbody.appendChild(contentRow(c, i)); if (state.editing === c.key) tbody.appendChild(editorRow(section, c)); });
    if (rows.length === 0 && state.adding !== section) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 11; tbody.appendChild(tr); }
    if (state.adding === section) tbody.appendChild(editorRow(section, null));
    document.getElementById(section + '-count').textContent = rows.length + '줄 · 차례가 곧 관리 화면의 차례';
  }

  function render() {
    var categories = document.getElementById('categories'); categories.innerHTML = '';
    state.data.categories.forEach(function (c, i) { categories.appendChild(categoryRow(c, i)); });
    renderSection('daily'); renderSection('weekly');
  }

  ['daily', 'weekly'].forEach(function (section) {
    document.getElementById(section + '-new').addEventListener('click', function () { state.adding = state.adding === section ? null : section; state.editing = null; render(); });
  });

  async function load() {
    var r = await call('GET', '/admin/contents/rows');
    var a = await call('GET', '/admin/assets/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    state.data = r.json;
    state.assets = {}; a.json.rows.forEach(function (row) { state.assets[row.id] = row; });
    document.getElementById('stat-daily').textContent = ofSection('daily').length;
    document.getElementById('stat-weekly').textContent = ofSection('weekly').length;
    document.getElementById('stat-shared').textContent = r.json.contents.filter(function (c) { return c.shareScope !== 'character'; }).length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
