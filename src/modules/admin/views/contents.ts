import { layout } from './layout'

/**
 * 컨텐츠 표. 맨 위에 갈래 표 8줄, 그 아래 일간 · 주간 표 둘이다. 줄의 수정을 누르면 그 아래로 편집기가 펼쳐지고, 새 컨텐츠는
 * 같은 편집기가 표 맨 아래에 열려 섹션 맨 끝에 선다.
 *
 * key 와 섹션은 캐시 · 추적 목록 · 공유 원장이 들어 못 바꾸고 컨텐츠는 지우지 않는다. until 로 닫는다. 갈래는 ENUM 과
 * 일대일이라 더하고 지우는 폼이 없다.
 */
export const CONTENTS_HTML = layout(
  '/admin/contents',
  '컨텐츠',
  `<div class="head">
  <div>
    <h1>컨텐츠</h1>
    <p>일간 · 주간 컨텐츠의 마스터 표다. API 이름으로 넥슨 응답과 맞추고, 공유 줄은 today 의 공유 위젯 글자를 든다. 컨텐츠는 지우지 않고 until 로 닫는다. 바꾸면 <code>contents.updatedAt</code> 이 움직인다.</p>
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
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>참고 태그</th><th>태그 숨김</th><th class="num">주간 한도</th><th class="num">공유 차례</th><th></th></tr></thead><tbody id="categories"></tbody></table></div>
</section>
<section class="card">
  <header><h2>일간</h2><p id="daily-count"></p><span class="grow"></span><button id="daily-new" class="btn ghost sm" type="button">새 컨텐츠</button></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>API 이름</th><th>갈래</th><th>종류</th><th class="num">상한</th><th class="num">레벨</th><th>공유</th><th>기간</th><th></th></tr></thead><tbody id="daily"></tbody></table></div>
</section>
<section class="card">
  <header><h2>주간</h2><p id="weekly-count"></p><span class="grow"></span><button id="weekly-new" class="btn ghost sm" type="button">새 컨텐츠</button></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>이름</th><th>API 이름</th><th>갈래</th><th>종류</th><th class="num">상한</th><th class="num">레벨</th><th>공유</th><th>기간</th><th></th></tr></thead><tbody id="weekly"></tbody></table></div>
</section>
<script>
  var TYPES = [['contents', '카운트'], ['quest', '퀘스트']];
  var SCOPES = [['character', '캐릭터'], ['world', '월드'], ['account', '계정']];
  var state = { data: null, editingCategory: null, editing: null, adding: null };

  function nameOf(pairs, key) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === key) return pairs[i][1]; return key; }
  function categoryName(key) { var c = state.data.categories.filter(function (x) { return x.key === key; })[0]; return c ? c.name : key; }
  function categoryChoices() { return state.data.categories.map(function (c) { return [c.key, c.name + ' (' + c.key + ')']; }); }
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }
  function period(c) { if (!c.from && !c.until) return '-'; return (c.from || '처음') + ' ~ ' + (c.until || ''); }
  function ofSection(section) { return state.data.contents.filter(function (c) { return c.section === section; }); }

  function categoryRow(c, i) {
    var editing = state.editingCategory === c.key;
    var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, c.key, 'mono');
    if (!editing) {
      cell(tr, c.name); cell(tr, c.countTag || '-'); cell(tr, c.hideCountTag ? span('숨김', 'tag') : span('-', 'dim'));
      cell(tr, c.weeklyLimit === null ? '-' : c.weeklyLimit, 'num'); cell(tr, c.sharedOrder === null ? '-' : c.sharedOrder, 'num');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
      up.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/categories/' + c.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      down.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/categories/' + c.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
      edit.addEventListener('click', function () { state.editingCategory = c.key; render(); });
      cell(tr, inline(up, down, edit), 'act');
      return tr;
    }
    var name = input('text'); name.value = c.name; var tag = input('text'); tag.value = c.countTag || ''; tag.placeholder = 'ID당 1회';
    var hide = input('checkbox'); hide.checked = c.hideCountTag;
    var limit = input('number'); limit.min = '1'; limit.value = c.weeklyLimit === null ? '' : c.weeklyLimit;
    var shared = input('number'); shared.min = '0'; shared.value = c.sharedOrder === null ? '' : c.sharedOrder;
    cell(tr, name); cell(tr, tag); cell(tr, hide); cell(tr, limit, 'num'); cell(tr, shared, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/contents/categories/' + c.key, { name: name.value.trim(), countTag: orNull(tag.value), hideCountTag: hide.checked, weeklyLimit: numOrNull(limit.value), sharedOrder: numOrNull(shared.value) });
      show(r.ok ? c.key + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) state.editingCategory = null; load();
    });
    close.addEventListener('click', function () { state.editingCategory = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  function contentRow(c, i) {
    var tr = el('tr', undefined, state.editing === c.key ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, c.key, 'mono'); cell(tr, c.displayName); cell(tr, c.apiName); cell(tr, categoryName(c.category));
    cell(tr, nameOf(TYPES, c.type)); cell(tr, c.maxCountOverride === null ? c.maxCount : c.maxCount + ' → ' + c.maxCountOverride, 'num');
    cell(tr, c.requiredLevel === null ? '-' : c.requiredLevel, 'num');
    cell(tr, c.shareScope === 'character' ? span('-', 'dim') : span(nameOf(SCOPES, c.shareScope) + ' · ' + c.sharedShortName, 'tag accent'));
    cell(tr, period(c), 'mono');
    var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm');
    up.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/' + c.key + '/move', { direction: 'up' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
    down.addEventListener('click', async function () { var r = await call('POST', '/admin/contents/' + c.key + '/move', { direction: 'down' }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); });
    edit.addEventListener('click', function () { state.editing = state.editing === c.key ? null : c.key; state.adding = null; render(); });
    cell(tr, inline(up, down, edit), 'act');
    return tr;
  }

  // 편집기 하나로 새 컨텐츠와 수정을 다 한다. c 가 null 이면 새 컨텐츠이고 section 의 맨 끝에 선다.
  function editorRow(section, c) {
    var tr = el('tr', undefined, 'expand'); var td = document.createElement('td'); td.colSpan = 11;
    var box = el('div', undefined, 'editor'); box.appendChild(el('h3', c ? c.key + ' 수정' : (section === 'daily' ? '일간' : '주간') + ' 새 컨텐츠. 섹션 맨 끝에 선다'));
    var key = input('text', 'mono'); key.placeholder = 'epic_dungeon_aurum_regis';
    var apiName = input('text'); apiName.placeholder = '에픽 던전 : 아우룸 레기스';
    var category = select(categoryChoices(), c ? c.category : undefined);
    var displayName = input('text'); var shortName = input('text');
    var backgroundMap = input('text', 'mono'); backgroundMap.placeholder = 'roadOfVanishing'; var backgroundPortrait = input('text', 'mono'); backgroundPortrait.placeholder = 'lesa';
    var countTag = input('text'); countTag.placeholder = '월드 당 2회';
    var type = select(TYPES, c ? c.type : 'contents'); var maxCount = input('number'); maxCount.min = '0';
    var requiredLevel = input('number'); requiredLevel.min = '1'; var maxCountOverride = input('number'); maxCountOverride.min = '1'; maxCountOverride.placeholder = 'API 오류를 덮을 때만';
    var from = input('text', 'mono'); from.placeholder = '2026-09-17'; var until = input('text', 'mono'); until.placeholder = '비우면 끝없이';
    var shareScope = select(SCOPES, c ? c.shareScope : 'character'); var sharedShortName = input('text'); sharedShortName.placeholder = '공유 줄만. 앵글러컴퍼니';
    var onlyWhenScheduled = input('checkbox'), trustRegistrationFlag = input('checkbox'), cumulativeScore = input('checkbox');
    if (c) {
      apiName.value = c.apiName; displayName.value = c.displayName; shortName.value = c.shortName;
      backgroundMap.value = c.backgroundMap || ''; backgroundPortrait.value = c.backgroundPortrait || ''; countTag.value = c.countTag || '';
      maxCount.value = c.maxCount; requiredLevel.value = c.requiredLevel === null ? '' : c.requiredLevel; maxCountOverride.value = c.maxCountOverride === null ? '' : c.maxCountOverride;
      from.value = c.from || ''; until.value = c.until || ''; sharedShortName.value = c.sharedShortName || '';
      onlyWhenScheduled.checked = c.onlyWhenScheduled; trustRegistrationFlag.checked = c.trustRegistrationFlag; cumulativeScore.checked = c.cumulativeScore;
    } else { maxCount.value = '0'; }
    function check(ctrl, text) { var l = el('label', undefined, 'check'); l.appendChild(ctrl); l.appendChild(document.createTextNode(' ' + text)); return l; }
    var grid = el('div', undefined, 'grid2');
    if (!c) grid.appendChild(field('key', 'snake_case. 한 번 정하면 못 바꾼다', key));
    grid.appendChild(field('API 이름', '넥슨 응답의 content_name. 공백을 지워도 다른 줄과 달라야 한다', apiName));
    grid.appendChild(field('갈래', undefined, category));
    grid.appendChild(field('이름', '카드 · 관리 화면', displayName));
    grid.appendChild(field('짧은 이름', '좁은 자리', shortName));
    grid.appendChild(field('지도 배경', 'src/assets/maps/ 의 slug. 초상과 함께 못 든다', backgroundMap));
    grid.appendChild(field('보스 초상', '에픽던전. 지도와 함께 못 든다', backgroundPortrait));
    grid.appendChild(field('참고 태그', '갈래의 태그를 이 줄만 덮는다', countTag));
    grid.appendChild(field('종류', '카운트형은 상한으로, 퀘스트형은 상태로 완료를 본다', type));
    grid.appendChild(field('상한', '수동 모드 기본값', maxCount));
    grid.appendChild(field('상한 덮기', 'API 의 알려진 오류만. 게임 규칙은 안 적는다', maxCountOverride));
    grid.appendChild(field('요구 레벨', '표시용. 비우면 없음', requiredLevel));
    grid.appendChild(field('from', 'KST. 비우면 처음부터', from));
    grid.appendChild(field('until', '지우지 않고 여기로 닫는다', until));
    grid.appendChild(field('공유 범위', '월드 · 계정이면 위젯 글자를 든다', shareScope));
    grid.appendChild(field('위젯 글자', 'today 공유 위젯. 갈래명을 뺀 나머지', sharedShortName));
    var switches = el('div', undefined, 'inline');
    switches.appendChild(check(onlyWhenScheduled, '추적 중인 캐릭터의 스케줄러에 없으면 위젯이 안 그린다'));
    switches.appendChild(check(trustRegistrationFlag, '응답의 registration_flag 를 믿는다'));
    switches.appendChild(check(cumulativeScore, '리셋 없이 누적되는 개인 점수'));
    grid.appendChild(field('스위치', '앞 둘은 공유 줄만', switches));
    box.appendChild(grid);
    function body() {
      return {
        apiName: apiName.value.trim(), category: category.value, displayName: displayName.value.trim(), shortName: shortName.value.trim(),
        backgroundMap: orNull(backgroundMap.value), backgroundPortrait: orNull(backgroundPortrait.value), countTag: orNull(countTag.value),
        type: type.value, maxCount: Number(maxCount.value), requiredLevel: numOrNull(requiredLevel.value), from: orNull(from.value), until: orNull(until.value),
        shareScope: shareScope.value, sharedShortName: orNull(sharedShortName.value),
        onlyWhenScheduled: onlyWhenScheduled.checked, trustRegistrationFlag: trustRegistrationFlag.checked, cumulativeScore: cumulativeScore.checked,
        maxCountOverride: numOrNull(maxCountOverride.value),
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
        var b = body(); b.key = key.value.trim(); b.section = section;
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
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    document.getElementById('stat-daily').textContent = ofSection('daily').length;
    document.getElementById('stat-weekly').textContent = ofSection('weekly').length;
    document.getElementById('stat-shared').textContent = r.json.contents.filter(function (c) { return c.shareScope !== 'character'; }).length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
