import { ASSET_PICKER } from './asset-picker'
import { subNav } from './edit-kit'
import { layout } from './layout'

const NAV = [
  ['/contents', '컨텐츠'],
  ['/contents/categories', '분류'],
] as const

/** 두 화면이 함께 쓰는 읽기. */
const COMMON_JS = `
  var D = null, assets = {};
  var batch = editing(function () { load(); });
  async function load() {
    var r = await call('GET', '/contents/rows'); var a = await call('GET', '/images/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    D = r.json; assets = {}; a.json.rows.forEach(function (row) { assets[row.id] = row; });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
`

function page(current: string, top: string, body: string, script: string): string {
  return layout(
    '/contents',
    '컨텐츠',
    `<div class="top"><h1>컨텐츠</h1>${subNav(NAV, current)}<span class="grow"></span><span class="updated" id="updated"></span>${top}</div>
<div id="message" class="msg" role="status" hidden></div>
${body}
${ASSET_PICKER}
<script>
${COMMON_JS}
${script}
  load();
</script>`,
  )
}

/**
 * 일간 · 주간 컨텐츠. 위에서 주기를 고르면 그 주기의 표가 선다. 줄을 누르면 작은 창에서 고친다. 그림 셋 · 완료 조건 · 공유 범위처럼
 * 서로 묶인 칸이 많아 한 번에 보고 고친다.
 *
 * key 와 주기는 캐시 · 추적 목록 · 공유 진행 기록이 들어 못 바꾸고 컨텐츠는 지우지 않는다. 끝으로 닫는다.
 */
export const CONTENTS_HTML = page(
  '/contents',
  '<button id="add" class="btn sm" type="button">컨텐츠 추가</button>',
  `<section class="panel">
  <div class="panel-head" id="cycles"></div>
  <table class="sheet"><thead><tr><th>#</th><th>이름 · key</th><th>API 이름</th><th>분류</th><th>완료 조건</th><th class="num">최대</th><th class="num">레벨</th><th>공유</th><th>기간</th><th></th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>차례가 관리 화면의 차례다. API 이름으로 넥슨 응답과 맞추고 완료 조건으로 완료를 판정한다. 줄을 누르면 고친다.</p></div>
</section>`,
  `
  var TYPES = [['contents', 'contents'], ['quest', 'quest']];
  var CHECKS = [['state_only', '퀘스트 상태'], ['count_only', '횟수'], ['both', '상태와 횟수'], ['score', '점수']];
  var SCOPES = [['character', '캐릭터'], ['world', '월드'], ['account', '계정']];
  var cycle = 'daily';
  function nameOf(pairs, key) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === key) return pairs[i][1]; return key; }
  function categoryName(key) { var c = D.categories.filter(function (x) { return x.key === key; })[0]; return c ? c.name : key; }
  function numOrNull(v) { v = (v || '').trim(); return v === '' ? null : Number(v); }
  function period(c) { if (!c.validFrom && !c.validUntil) return ''; return (c.validFrom || '처음') + ' ~ ' + (c.validUntil || ''); }
  function iconText(id) { var a = id ? assets[id] : null; return id == null ? '없음' : a ? a.fileName + '.' + a.extension : '그림 표에 없다'; }
  function pickerField(categories, holder) {
    var label = span(iconText(holder.id), 'mono'); var pick = button('고르기', 'btn ghost sm'); var clear = button('비우기', 'btn ghost sm');
    pick.addEventListener('click', function () { openAssetPicker({ categories: categories, uploadCategory: categories[0], current: holder.id, onPick: function (f) { holder.id = f ? f.id : null; if (f) assets[f.id] = f; label.textContent = iconText(holder.id); } }); });
    clear.addEventListener('click', function () { holder.id = null; label.textContent = iconText(null); });
    return inline(label, pick, clear);
  }
  async function move(c, direction) { var r = await call('POST', '/contents/' + c.key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }

  // 작은 창 하나로 새 컨텐츠와 고치기를 다 한다. c 가 null 이면 새 컨텐츠이고 그 주기의 맨 끝에 선다.
  function editor(c) {
    var form = el('div', undefined, 'form-body');
    var key = input('text', 'mono'); key.placeholder = 'epic_dungeon_aurum_regis';
    var apiName = input('text'); apiName.placeholder = '에픽 던전 : 아우룸 레기스';
    var category = select(D.categories.map(function (x) { return [x.key, x.name + ' (' + x.key + ')']; }), c ? c.category : undefined);
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
    if (!c) { grid.appendChild(field('key', '못 바꾼다', key)); grid.appendChild(el('div')); }
    grid.appendChild(field('이름', '카드 · 관리 화면', name));
    grid.appendChild(field('짧은 이름', '캐릭터 줄은 남은 스케줄, 공유 줄은 공유 위젯에 쓴다', shortName));
    grid.appendChild(field('API 이름', '넥슨 응답의 content_name. 공백을 지워도 다른 줄과 달라야 한다', apiName));
    grid.appendChild(field('분류', undefined, category));
    grid.appendChild(field('완료 조건', '넥슨 응답의 무엇을 보고 완료를 판정하는지', checkType));
    grid.appendChild(field('최대 횟수', '완료 조건이 횟수인 줄만. 넥슨이 준 최대 횟수 대신 쓴다', maxCount));
    grid.appendChild(field('넥슨 type', '넥슨이 주는 값. 완료 판정에는 안 쓴다', type));
    grid.appendChild(field('참고 태그', '분류의 태그를 이 줄만 덮는다', countTag));
    grid.appendChild(field('공유 범위', '월드 · 계정이면 공유 위젯에 선다', shareScope));
    grid.appendChild(field('요구 레벨', '표시용. 비우면 없음', requiredLevel));
    grid.appendChild(field('시작', 'KST. 비우면 처음부터', from));
    grid.appendChild(field('끝', '지우지 않고 여기로 닫는다', until));
    grid.appendChild(field('지도 배경', '지도 분류의 그림. 초상과 함께 못 든다', pickerField(['map'], backgroundMap)));
    grid.appendChild(field('보스 초상', '에픽던전. 지도와 함께 못 든다', pickerField(['boss'], backgroundPortrait)));
    grid.appendChild(field('지역 아이콘', '지도 배경이 있는 카드가 옆에 세운다', pickerField(['map_icon'], regionIcon)));
    form.appendChild(grid);
    var go = button(c ? '저장' : '컨텐츠 추가', 'btn'); form.appendChild(go);
    var d = openForm(c ? c.name + ' 고치기' : (cycle === 'daily' ? '일간' : '주간') + ' 컨텐츠 추가', form); d.classList.add('mid');
    go.addEventListener('click', async function () {
      var body = {
        apiName: apiName.value.trim(), category: category.value, name: name.value.trim(), shortName: shortName.value.trim(),
        backgroundMapAssetId: backgroundMap.id, backgroundPortraitAssetId: backgroundPortrait.id, regionIconAssetId: regionIcon.id, countTag: orNull(countTag.value),
        type: type.value, checkType: checkType.value, maxCount: numOrNull(maxCount.value), requiredLevel: numOrNull(requiredLevel.value),
        validFrom: orNull(from.value), validUntil: orNull(until.value), shareScope: shareScope.value,
      };
      if (!c) { body.key = key.value.trim(); body.cycle = cycle; }
      var r = c ? await call('PUT', '/contents/' + c.key, body) : await call('POST', '/contents', body);
      show(r.ok ? (c ? c.key : body.key) + ' 를 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) { d.close(); load(); }
    });
  }

  function render() {
    if (hashKey() === 'weekly') cycle = 'weekly';
    var head = document.getElementById('cycles'); head.innerHTML = '';
    head.appendChild(segButtons([['daily', '일간'], ['weekly', '주간']], cycle, function (v) { cycle = v; setHashKey(v); render(); }));
    var rows = D.contents.filter(function (c) { return c.cycle === cycle; });
    head.appendChild(el('p', rows.length + '줄 · 공유 줄 ' + rows.filter(function (c) { return c.shareScope !== 'character'; }).length));
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    rows.forEach(function (c, i) {
      var tr = el('tr', undefined, 'click'); cell(tr, i + 1, 'n');
      var nm = span(c.name + ' '); nm.appendChild(span(c.key, 'mono dim')); cell(tr, nm, 'clip').title = c.name + ' · ' + c.key; cell(tr, c.apiName, 'clip').title = c.apiName; cell(tr, categoryName(c.category));
      cell(tr, nameOf(CHECKS, c.checkType)); cell(tr, c.maxCount === null ? '' : c.maxCount, 'num'); cell(tr, c.requiredLevel === null ? '' : c.requiredLevel, 'num');
      cell(tr, c.shareScope === 'character' ? '' : span(nameOf(SCOPES, c.shareScope) + ' · ' + c.shortName, 'tag accent')); cell(tr, period(c), 'mono');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm');
      up.addEventListener('click', function (e) { e.stopPropagation(); move(c, 'up'); }); down.addEventListener('click', function (e) { e.stopPropagation(); move(c, 'down'); });
      var act = inline(up, down); act.className = 'inline row-act'; cell(tr, act, 'act');
      tr.addEventListener('click', function () { editor(c); });
      tb.appendChild(tr);
    });
  }
  document.getElementById('add').addEventListener('click', function () { editor(null); });
`,
)

/**
 * 컨텐츠 분류. 칸에서 바로 고친다. key 는 코드가 분기에 쓰는 ENUM 이라 더하거나 지우지 않는다.
 * 차례는 관리 화면 주간 목록의 분류 차례이고, 공유 차례는 today 공유 위젯의 계열 차례다.
 */
export const CONTENT_CATEGORIES_HTML = page(
  '/contents/categories',
  '',
  `<section class="panel">
  <table class="sheet"><thead><tr><th>#</th><th>key</th><th>이름</th><th>참고 태그</th><th>태그 숨김</th><th class="num">주간 최대 횟수</th><th class="num">공유 차례</th><th></th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:10px"><p>참고 태그는 컨텐츠 카드에 서는 한 줄이고 컨텐츠 줄이 덮을 수 있다. 주간 최대 횟수는 한 주에 완료할 수 있는 항목 수다. 공유 차례를 비우면 공유 위젯에 안 선다.</p></div>
</section>`,
  `
  async function move(c, direction) { var r = await call('POST', '/contents/categories/' + c.key + '/move', { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }
  function render() {
    batch.clear();
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    D.categories.forEach(function (c, i) {
      var tr = el('tr'); cell(tr, i + 1, 'n'); cell(tr, c.key, 'label'); var name, tag, hide, limit, shared;
      var send = function () { return call('PUT', '/contents/categories/' + c.key, { name: name.value(), countTag: orNull(tag.value()), hidesCountTag: hide.value(), weeklyMaxCount: limit.value(), sharedSortOrder: shared.value() }); };
      name = textCell(batch, c.key, c.name, send, 'w-name'); tag = textCell(batch, c.key, c.countTag, send, 'w-name'); tag.input.placeholder = '없음';
      hide = checkCell(batch, c.key, c.hidesCountTag, send, '숨김'); limit = numCell(batch, c.key, c.weeklyMaxCount, send, 'short'); shared = numCell(batch, c.key, c.sharedSortOrder, send, 'short');
      limit.input.placeholder = '없음'; shared.input.placeholder = '없음';
      cell(tr, name.input); cell(tr, tag.input); cell(tr, hide.input); cell(tr, limit.input, 'num'); cell(tr, shared.input, 'num');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'); up.disabled = i === 0; down.disabled = i === D.categories.length - 1;
      up.addEventListener('click', function () { move(c, 'up'); }); down.addEventListener('click', function () { move(c, 'down'); });
      var act = inline(up, down); act.className = 'inline row-act'; cell(tr, act, 'act');
      tb.appendChild(tr);
    });
  }
`,
)
