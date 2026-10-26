import { layout } from './layout'

/**
 * 그림 · 크롭 화면. 위는 앱이 받는 그림 목록, 아래는 보스 초상 · 지역 지도의 크롭이다.
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
    <p>앱이 받는 그림이다. 경로는 앱 <code>src/assets/</code> 기준이고 게임 데이터 표의 그림 칸이 이 경로를 가리킨다. 같은 경로에 올리면 그림이 바뀐다. 바꾸면 <code>assets.updatedAt</code> 이 움직이고, 앱은 다음에 켜거나 돌아올 때 바뀐 그림만 받는다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-files">–</b><span>그림</span></div>
    <div class="stat"><b id="stat-size" class="mono">–</b><span>합계</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 그림</h2><p>png · webp · jpg, 1MB 까지. 경로의 확장자와 파일 내용이 같아야 한다</p></header>
  <div class="body"><div class="inline" id="new-form"></div></div>
</section>
<section class="card">
  <header><h2>그림 목록</h2><div class="grow"></div><div class="inline" id="filter"></div></header>
  <div class="table"><table><thead><tr><th>그림</th><th>경로</th><th class="num">크기</th><th>해시</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<section class="card">
  <header><h2>크롭</h2><p>크기는 <code>120% auto</code>, 위치는 <code>50% 40%</code> 모양이다. 줄이 없으면 앱은 cover · 가운데로 그린다. 미리보기 틀의 비율은 앱 자리와 비슷하게 맞춘 것이다</p><div class="grow"></div><div class="inline" id="crop-kind"></div></header>
  <div class="table"><table><thead><tr><th>미리보기</th><th>slug</th><th>크기</th><th>위치</th><th></th></tr></thead><tbody id="crop-rows"></tbody></table></div>
</section>
<style>
  .thumb { width: 48px; height: 48px; object-fit: contain; background: var(--surface-2); border-radius: 6px; display: block }
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
  var state = { files: [], crops: [], dir: '', cropKind: 'boss_portrait' };

  function kb(n) { return (n / 1024).toFixed(1) + 'KB'; }
  function urlOf(f) { return '/assets/' + f.file; }
  function dirOf(path) { return path.slice(0, path.lastIndexOf('/')); }
  function slugOf(path) { var name = path.slice(path.lastIndexOf('/') + 1); return name.slice(0, name.lastIndexOf('.')); }

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

  function renderNewForm() {
    var box = document.getElementById('new-form'); box.innerHTML = '';
    var path = input('text', 'mono'); path.placeholder = 'bosses/newBoss.webp'; path.size = 36;
    var file = input('file'); file.accept = 'image/png,image/webp,image/jpeg';
    var go = button('올리기', 'btn');
    go.addEventListener('click', function () { upload(path.value.trim(), file.files && file.files[0]); });
    box.appendChild(field('경로', '디렉터리/이름.확장자', path));
    box.appendChild(field('파일', '', file));
    box.appendChild(go);
  }

  function renderFilter() {
    var dirs = Array.from(new Set(state.files.map(function (f) { return dirOf(f.path); }))).sort();
    var s = select([['', '전체']].concat(dirs.map(function (d) { return [d, d]; })), state.dir);
    s.addEventListener('change', function () { state.dir = s.value; renderRows(); });
    var box = document.getElementById('filter'); box.innerHTML = ''; box.appendChild(s);
  }

  function renderRows() {
    var rows = document.getElementById('rows'); rows.innerHTML = '';
    var shown = state.files.filter(function (f) { return state.dir === '' || dirOf(f.path) === state.dir; });
    shown.forEach(function (f) {
      var tr = el('tr');
      var img = el('img', undefined, 'thumb'); img.src = urlOf(f); img.alt = ''; img.loading = 'lazy';
      cell(tr, img); cell(tr, f.path, 'mono'); cell(tr, kb(f.size) + ' · ' + f.width + '×' + f.height, 'num'); cell(tr, f.sha256.slice(0, 10), 'mono dim');
      var pick = filePicker(function (file) { upload(f.path, file); });
      var replace = button('바꾸기', 'btn ghost sm');
      replace.addEventListener('click', function () { pick.click(); });
      cell(tr, inline(replace, pick), 'act');
      rows.appendChild(tr);
    });
    if (shown.length === 0) { var tr = el('tr'); var td = cell(tr, '없다. 시드 스크립트가 안 돌았다', 'empty'); td.colSpan = 5; rows.appendChild(tr); }
  }

  function renderCropKind() {
    var s = select(CROP_KINDS.map(function (k) { return [k[0], k[1]]; }), state.cropKind);
    s.addEventListener('change', function () { state.cropKind = s.value; renderCrops(); });
    var box = document.getElementById('crop-kind'); box.innerHTML = ''; box.appendChild(s);
  }

  function renderCrops() {
    var kind = CROP_KINDS.find(function (k) { return k[0] === state.cropKind; });
    var rows = document.getElementById('crop-rows'); rows.innerHTML = '';
    var files = state.files.filter(function (f) { return dirOf(f.path) + '/' === kind[2]; });
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
    var r = await call('GET', '/admin/assets/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.files = r.json.assets.files; state.crops = r.json.crops.crops;
    document.getElementById('stat-files').textContent = state.files.length;
    document.getElementById('stat-size').textContent = kb(state.files.reduce(function (n, f) { return n + f.size; }, 0));
    document.getElementById('stat-updated').textContent = r.json.assets.updatedAt ? when(r.json.assets.updatedAt) : '없음';
    renderFilter(); renderRows(); renderCrops();
  }
  renderNewForm(); renderCropKind(); load();
</script>`,
)
