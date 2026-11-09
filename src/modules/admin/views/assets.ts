import { layout } from './layout'

/**
 * 그림 · 크롭 화면(앱 저장소 ADR-187 결정 5 · 6). 왼쪽 트리는 아이템이 쓰는 그림을 그 아이템의 분류로, 나머지를 그림
 * 분류(폴더)로 묶는다. 오른쪽은 한 줄에 그림 하나다. 아래는 보스 초상 · 지역 지도의 크롭이다.
 *
 * 그림은 nginx 가 `/assets/<해시>.<확장자>` 로 내므로 미리보기도 그 주소를 쓴다. 크롭 값이 CSS background 문법이라
 * 미리보기는 같은 값을 background-size · background-position 에 그대로 넣는다.
 */
export const ASSETS_HTML = layout(
  '/admin/assets',
  '그림',
  `<div class="head">
  <div>
    <h1>그림</h1>
    <p>앱이 받는 그림이다. 아이템이 쓰는 그림은 아이템 분류로, 나머지는 그림 분류로 묶인다. 경로는 앱 <code>src/assets/</code> 기준이고 같은 경로에 올리면 그림이 바뀐다. 이름은 비워 두면 그 그림을 쓰는 곳의 이름을 보인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-files">–</b><span>그림</span></div>
    <div class="stat"><b id="stat-size" class="mono">–</b><span>합계</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<div id="unused" class="notice" hidden><span id="unused-text"></span><span class="grow"></span><button type="button" class="btn sm" id="unused-show">모아 보기</button></div>
<section class="card">
  <div class="assets-split">
    <nav class="tree" id="tree" aria-label="그림 분류"></nav>
    <div class="assets-main">
      <div class="bar"><input id="q" type="search" placeholder="이름 · 경로로 찾는다" class="w-md"><span class="grow"></span><div class="inline" id="new-form"></div></div>
      <div class="table"><table><thead><tr><th>그림</th><th>보이는 이름 · 경로</th><th>쓰는 곳</th><th class="num">크기</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    </div>
  </div>
</section>
<section class="card">
  <header><h2>크롭</h2><p>크기는 <code>120% auto</code>, 위치는 <code>50% 40%</code> 모양이다. 줄이 없으면 앱은 cover · 가운데로 그린다. 미리보기 틀의 비율은 앱 자리와 비슷하게 맞춘 것이다</p><div class="grow"></div><div class="inline" id="crop-kind"></div></header>
  <div class="table"><table><thead><tr><th>미리보기</th><th>slug</th><th>크기</th><th>위치</th><th></th></tr></thead><tbody id="crop-rows"></tbody></table></div>
</section>
<style>
  .notice { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--r-card); background: var(--danger-tint); color: var(--danger-ink); font-weight: 500 }
  .notice .btn { background: var(--danger-ink) }
  .notice .grow, .bar .grow { flex: 1 }
  .assets-split { display: grid; grid-template-columns: 210px minmax(0, 1fr) }
  @media (max-width: 760px) { .assets-split { grid-template-columns: 1fr } }
  .tree { display: flex; flex-direction: column; gap: 2px; padding: 12px; background: var(--surface-2) }
  .tree .k { font-size: 11.5px; font-weight: 700; color: var(--text-3); letter-spacing: .04em; padding: 10px 10px 4px }
  .tree button { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-2); font: 500 13px/1.3 var(--font); text-align: left; cursor: pointer }
  .tree button:hover { background: var(--surface); color: var(--text) }
  .tree button[aria-current="true"] { background: var(--accent-tint); color: var(--accent-ink) }
  .tree button.child { padding-left: 24px; font-weight: 400 }
  .tree button span { color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums }
  .assets-main { min-width: 0 }
  .bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; padding: 14px 16px 6px }
  .thumb { width: 48px; height: 48px; object-fit: contain; background: var(--surface-2); border-radius: 6px; display: block; image-rendering: pixelated }
  td.wrap { white-space: normal; width: 100%; min-width: 180px }
  .label { font-weight: 500; overflow-wrap: anywhere }
  .label small { display: block; color: var(--text-3); font-weight: 400; font-size: 11.5px }
  .label .path { display: block; font: 400 11.5px/1.4 var(--mono); color: var(--text-3); overflow-wrap: anywhere }
  .tag.bad { background: var(--danger-tint); color: var(--danger-ink) }
  button.tag { border: 0; cursor: pointer }
  tr.uses td { background: var(--surface-2); padding: 10px 16px }
  .uses-list { display: flex; flex-wrap: wrap; gap: 6px }
  .crop { background-color: var(--surface-2); background-repeat: no-repeat; border-radius: 8px; flex: none }
  .crop.boss_portrait { width: 180px; height: 90px }
  .crop.boss_portrait_icon { width: 56px; height: 56px; border-radius: 50% }
  .crop.boss_portrait_modal { width: 72px; height: 160px }
  .crop.daily_quest_region { width: 180px; height: 72px }
</style>
<script>
  var CROP_KINDS = [
    ['boss_portrait', '보스 카드', 'bosses/'],
    ['boss_portrait_icon', '보스 원형 아이콘', 'bosses/'],
    ['boss_portrait_modal', '파티 분배 모달 띠', 'bosses/'],
    ['daily_quest_region', '컨텐츠 카드 지도', 'maps/'],
  ];
  /**
   * 그림 분류. 잎이 앱 경로의 디렉터리 하나다. 부모를 고르면 자식 디렉터리 전부를 보인다. 아이템이 쓰는 그림은 여기에
   * 안 들고 아이템 분류에 든다. 디렉터리 목록은 서버 asset-paths.ts 의 ASSET_DIRS 와 같다.
   */
  var FOLDERS = [
    { label: '보스 초상', dir: 'bosses' },
    { label: '아이템 폴더', children: [{ label: '일반', dir: 'items' }, { label: '반지', dir: 'items/rings' }] },
    { label: '지도', children: [{ label: '배경', dir: 'maps' }, { label: '아이콘', dir: 'maps/icons' }] },
    { label: '월드 엠블럼', dir: 'worlds' },
    { label: 'MVP 명패', dir: 'mvp' },
    { label: '포스', dir: 'force' },
    { label: '스킬', dir: 'skills' },
    { label: '캐릭터', dir: 'characters' },
    { label: '고가 드롭 연출', children: [
      { label: '화면', dir: 'drop-effect/screen' }, { label: '시작', dir: 'drop-effect/pre' },
      { label: '반복', dir: 'drop-effect/loop' }, { label: '끝', dir: 'drop-effect/end' },
    ] },
  ];
  var ALL = { kind: 'all', label: '전체' };
  var UNUSED = { kind: 'unused', label: '표가 안 쓰는 그림' };
  var NO_CATEGORY = { kind: 'item', category: null, label: '분류 없음' };
  var state = { rows: [], crops: [], categories: [], node: ALL, q: '', open: null, editing: null, cropKind: 'boss_portrait' };

  function kb(n) { return (n / 1024).toFixed(1) + 'KB'; }
  function urlOf(f) { return '/assets/' + f.file; }
  function dirOf(path) { return path.slice(0, path.lastIndexOf('/')); }
  function slugOf(path) { var name = path.slice(path.lastIndexOf('/') + 1); return name.slice(0, name.lastIndexOf('.')); }
  function usedByItem(r) { return r.uses.some(function (u) { return u.kind === '아이템'; }); }
  function dirsOf(node) { return node.children ? node.children.map(function (c) { return c.dir; }) : [node.dir]; }
  function inNode(r, node) {
    if (node.kind === 'all') return true;
    if (node.kind === 'unused') return r.uses.length === 0;
    if (node.kind === 'item') return usedByItem(r) && r.itemCategory === node.category;
    return !usedByItem(r) && dirsOf(node).indexOf(dirOf(r.path)) !== -1;
  }
  function countOf(node) { return state.rows.filter(function (r) { return inNode(r, node); }).length; }
  // 연출 프레임은 숫자 이름이라 글자 차례면 10 이 2 앞에 선다. 앱이 숫자 차례로 재생하므로 같은 차례로 보인다.
  function byPath(a, b) {
    var da = dirOf(a.path), db = dirOf(b.path);
    if (da !== db) return da < db ? -1 : 1;
    var na = Number(slugOf(a.path)), nb = Number(slugOf(b.path));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.path < b.path ? -1 : 1;
  }

  async function upload(path, file) {
    if (!file) { show('파일을 고른다', true); return; }
    var res = await fetch('/admin/assets/file?path=' + encodeURIComponent(path), { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    var text = await res.text();
    if (!res.ok) { show('못 올렸다 ' + res.status + '\\n' + text, true); return; }
    var json = JSON.parse(text);
    show(path + (json.result === 'same' ? ' 는 내용이 같아 그대로다' : json.result === 'created' ? ' 를 더했다' : ' 를 바꿨다'), false);
    load();
  }

  function filePicker(onPick) {
    var f = input('file'); f.accept = 'image/png,image/webp,image/jpeg'; f.hidden = true;
    f.addEventListener('change', function () { if (f.files && f.files[0]) onPick(f.files[0]); f.value = ''; });
    return f;
  }

  function pick(node) { state.node = node; state.open = null; state.editing = null; renderTree(); renderNewForm(); renderRows(); }

  function renderTree() {
    var box = document.getElementById('tree'); box.innerHTML = '';
    function item(node, isChild) {
      var n = countOf(node);
      if (n === 0 && node.kind === 'item') return;
      var b = button('', isChild ? 'child' : '');
      b.appendChild(document.createTextNode(node.label));
      b.appendChild(span(String(n)));
      b.setAttribute('aria-current', state.node === node ? 'true' : 'false');
      b.addEventListener('click', function () { pick(node); });
      box.appendChild(b);
    }
    item(ALL, false); item(UNUSED, false);
    state.categories.forEach(function (kind) {
      var groups = kind.groups.filter(function (g) { return countOf(g.node) > 0; });
      if (groups.length === 0) return;
      box.appendChild(el('div', '아이템 · ' + kind.name, 'k'));
      groups.forEach(function (g) { item(g.node, false); });
    });
    if (countOf(NO_CATEGORY) > 0) item(NO_CATEGORY, false);
    box.appendChild(el('div', '그 밖', 'k'));
    FOLDERS.forEach(function (node) { item(node, false); (node.children || []).forEach(function (c) { item(c, true); }); });
  }

  function renderNewForm() {
    var box = document.getElementById('new-form'); box.innerHTML = '';
    var node = state.node;
    if (node.kind === 'item') { box.appendChild(span('아이템 그림은 아이템 화면에서 아이템을 열고 고르거나 올린다', 'dim')); return; }
    if (node.kind !== undefined || node.children) { box.appendChild(span('그 밖의 하위 분류를 고르면 새 그림을 올릴 수 있다', 'dim')); return; }
    var dir = node.dir;
    var name = input('text', 'mono'); name.placeholder = dir.indexOf('drop-effect') === 0 ? '24.webp' : 'newName.webp'; name.size = 24;
    var file = input('file'); file.accept = 'image/png,image/webp,image/jpeg';
    var go = button('올리기', 'btn');
    go.addEventListener('click', function () { upload(dir + '/' + name.value.trim(), file.files && file.files[0]); });
    box.appendChild(field('파일 이름', dir + '/ 아래', name));
    box.appendChild(field('파일', '', file));
    box.appendChild(go);
  }

  async function saveName(r, value) {
    var res = await call('PUT', '/admin/assets/' + r.id + '/name', { name: value });
    show(res.ok ? (value.trim() ? r.path + ' 이름을 적었다' : r.path + ' 이름을 비웠다. 쓰는 곳의 이름을 보인다') : fail('이름을 못 적었다', res), !res.ok);
    if (res.ok) { state.editing = null; load(); }
  }

  async function remove(r) {
    if (!confirm(r.path + ' 를 지운다. 이 그림의 크롭도 함께 지운다. 되돌릴 수 없다')) return;
    var res = await call('DELETE', '/admin/assets/' + r.id);
    show(res.ok ? r.path + ' 를 지웠다' : fail('못 지웠다', res), !res.ok);
    if (res.ok) load();
  }

  function nameCell(r) {
    if (state.editing === r.id) {
      var box = el('div', undefined, 'inline');
      var name = input('text'); name.value = r.name || ''; name.placeholder = r.uses[0] ? r.uses[0].name : slugOf(r.path); name.size = 22;
      var save = button('저장', 'btn sm'), cancel = button('취소', 'btn ghost sm');
      save.addEventListener('click', function () { saveName(r, name.value); });
      cancel.addEventListener('click', function () { state.editing = null; renderRows(); });
      name.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveName(r, name.value); });
      box.appendChild(name); box.appendChild(save); box.appendChild(cancel);
      setTimeout(function () { name.focus(); }, 0);
      return box;
    }
    var d = el('div', undefined, 'label');
    d.appendChild(document.createTextNode(r.label));
    if (r.name) d.appendChild(el('small', '적은 이름'));
    d.appendChild(span(r.path, 'path'));
    return d;
  }

  function renderRows() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    var q = state.q.trim().toLowerCase();
    var shown = state.rows.filter(function (r) {
      return inNode(r, state.node) && (!q || r.label.toLowerCase().indexOf(q) !== -1 || r.path.toLowerCase().indexOf(q) !== -1);
    }).sort(byPath);
    shown.forEach(function (r) {
      var tr = el('tr');
      var img = el('img', undefined, 'thumb'); img.src = urlOf(r); img.alt = ''; img.loading = 'lazy';
      cell(tr, img);
      cell(tr, nameCell(r), 'wrap');
      var uses;
      if (r.uses.length === 0) uses = span('표가 안 씀', 'tag bad');
      else {
        uses = button(r.uses.length + '곳', 'tag accent');
        uses.setAttribute('aria-expanded', state.open === r.id ? 'true' : 'false');
        uses.addEventListener('click', function () { state.open = state.open === r.id ? null : r.id; renderRows(); });
      }
      cell(tr, uses);
      cell(tr, r.width + '×' + r.height + ' · ' + kb(r.size), 'num mono');
      var pickFile = filePicker(function (file) { upload(r.path, file); });
      var replace = button('바꾸기', 'btn ghost sm');
      replace.addEventListener('click', function () { pickFile.click(); });
      var rename = button('이름', 'btn ghost sm');
      rename.addEventListener('click', function () { state.editing = r.id; renderRows(); });
      var actions = inline(rename, replace, pickFile);
      if (r.uses.length === 0) {
        var del = button('지우기', 'btn danger sm');
        del.addEventListener('click', function () { remove(r); });
        actions.appendChild(del);
      }
      cell(tr, actions, 'act');
      rows.appendChild(tr);
      if (state.open === r.id) {
        var more = el('tr', undefined, 'uses');
        var list = el('div', undefined, 'uses-list');
        r.uses.forEach(function (u) { list.appendChild(span(u.kind + ' · ' + u.name, 'tag')); });
        var td = cell(more, list); td.colSpan = 5;
        rows.appendChild(more);
      }
    });
    if (shown.length === 0) { var tr = el('tr'); var td = cell(tr, '맞는 그림이 없다', 'empty'); td.colSpan = 5; rows.appendChild(tr); }
  }

  function renderCropKind() {
    var s = select(CROP_KINDS.map(function (k) { return [k[0], k[1]]; }), state.cropKind);
    s.addEventListener('change', function () { state.cropKind = s.value; renderCrops(); });
    var box = document.getElementById('crop-kind'); box.innerHTML = ''; box.appendChild(s);
  }

  function renderCrops() {
    var kind = CROP_KINDS.find(function (k) { return k[0] === state.cropKind; });
    var rows = document.getElementById('crop-rows'); rows.innerHTML = '';
    var files = state.rows.filter(function (f) { return dirOf(f.path) + '/' === kind[2]; }).sort(byPath);
    files.forEach(function (f) {
      var slug = slugOf(f.path);
      var saved = state.crops.find(function (c) { return c.kind === kind[0] && c.slug === slug; });
      var tr = el('tr');
      var box = el('div', undefined, 'crop ' + kind[0]); box.style.backgroundImage = 'url(' + urlOf(f) + ')';
      var size = input('text', 'mono'); size.value = saved ? saved.size : ''; size.placeholder = 'cover'; size.size = 12;
      var pos = input('text', 'mono'); pos.value = saved ? saved.position : ''; pos.placeholder = 'center'; pos.size = 12;
      function preview() { box.style.backgroundSize = size.value.trim() || 'cover'; box.style.backgroundPosition = pos.value.trim() || 'center'; }
      size.addEventListener('input', preview); pos.addEventListener('input', preview); preview();
      var save = button('저장', 'btn sm'), remove = button('지우기', 'btn danger sm');
      save.addEventListener('click', async function () {
        var r = await call('PUT', '/admin/image-crops/' + kind[0] + '/' + encodeURIComponent(slug), { size: size.value.trim(), position: pos.value.trim() });
        show(r.ok ? slug + ' 크롭을 적었다' : fail('못 적었다', r), !r.ok); if (r.ok) load();
      });
      remove.addEventListener('click', async function () {
        var r = await call('DELETE', '/admin/image-crops/' + kind[0] + '/' + encodeURIComponent(slug));
        show(r.ok ? slug + ' 크롭을 지웠다' : fail('못 지웠다', r), !r.ok); if (r.ok) load();
      });
      cell(tr, box); cell(tr, slug, 'mono'); cell(tr, size); cell(tr, pos);
      cell(tr, saved ? inline(save, remove) : save, 'act');
      rows.appendChild(tr);
    });
    if (files.length === 0) { var tr = el('tr'); var td = cell(tr, '그림이 없다', 'empty'); td.colSpan = 5; rows.appendChild(tr); }
  }

  async function load() {
    var r = await call('GET', '/admin/assets/list');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.rows = r.json.rows; state.crops = r.json.crops;
    // 트리 노드는 다시 읽어도 같은 것을 가리켜야 고른 자리가 남는다.
    var keep = state.node.kind === 'item' ? state.node.category : undefined;
    state.categories = r.json.categories.map(function (kind) {
      return { key: kind.key, name: kind.name, groups: kind.groups.map(function (g) {
        var node = { kind: 'item', category: g.key, label: g.name };
        if (keep === g.key) state.node = node;
        return { key: g.key, name: g.name, node: node };
      }) };
    });
    var unused = state.rows.filter(function (x) { return x.uses.length === 0; }).length;
    document.getElementById('unused').hidden = unused === 0;
    document.getElementById('unused-text').textContent = '표가 쓰지 않는 그림이 ' + unused + '장 있다. 지워도 앱에서 빠지는 그림이 없다';
    document.getElementById('stat-files').textContent = state.rows.length;
    document.getElementById('stat-size').textContent = kb(state.rows.reduce(function (n, f) { return n + f.size; }, 0));
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    renderTree(); renderNewForm(); renderRows(); renderCrops();
  }
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderRows(); });
  document.getElementById('unused-show').addEventListener('click', function () { pick(UNUSED); });
  renderCropKind(); load();
</script>`,
)
