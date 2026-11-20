import { ASSET_REFS } from '../../assets/asset-paths'

/**
 * 그림 고르개. 그림 칸에서 글자 대신 그림을 눌러 고르고, 고른 그림을 돌려준다(앱 저장소 ADR-187 결정 6).
 *
 * 페이지 본문에 이 조각을 넣으면 `openAssetPicker(options)` 와 `assetPickButton(input, rule)` 이 생긴다. 그림 목록은
 * `/admin/assets/list` 에서 읽어 보이는 이름으로 보이고, 새 그림은 그 칸이 받는 분류에 올린 뒤 바로 고른다. 미리보기는 nginx 가
 * 내는 `/assets/<해시>.<확장자>` 다. 글자 칸 옆 버튼은 고른 그림을 그 칸이 받는 글자(확장자를 뗀 이름 · 파일 이름)로 넣는다.
 * 관리 API 는 지금처럼 그 글자를 그림 id 로 푼다. 규칙은 서버 ASSET_REFS 를 그대로 싣는다.
 *
 * @example
 * openAssetPicker({ categories: ['item', 'item_ring'], uploadCategory: 'item', current: it.icon && it.icon.id, onPick: function (file) { ... } })
 * cell(tr, inline(emblem, assetPickButton(emblem, 'worldEmblem')))
 */
export const ASSET_PICKER = `<dialog id="asset-picker" class="picker" aria-labelledby="picker-title">
  <header>
    <div><b id="picker-title">그림 고르기</b><span id="picker-dirs" class="dim"></span></div>
    <button type="button" class="btn ghost sm" id="picker-close">닫기</button>
  </header>
  <div class="picker-bar">
    <input id="picker-q" placeholder="이름 · 파일 이름으로 찾는다" class="w-md">
    <span class="grow"></span>
    <button type="button" class="btn ghost sm" id="picker-none">그림 없음</button>
  </div>
  <div id="picker-grid" class="picker-grid" role="listbox" aria-label="그림"></div>
  <footer>
    <div class="field"><label for="picker-name">새 그림 이름 <small id="picker-upload-dir"></small></label><input id="picker-name" class="mono" placeholder="dark_boss_ring"></div>
    <div class="field"><label for="picker-file">파일 <small>png · webp · jpg, 1MB 까지</small></label><input id="picker-file" type="file" accept="image/png,image/webp,image/jpeg"></div>
    <button type="button" class="btn" id="picker-upload">올리고 고르기</button>
  </footer>
</dialog>
<style>
  .picker { width: min(860px, calc(100vw - 32px)); max-height: calc(100vh - 64px); border: 0; border-radius: 14px; padding: 0; box-shadow: 0 12px 32px rgba(16,24,40,.18), 0 2px 6px rgba(16,24,40,.08); background: var(--surface); color: var(--text) }
  .picker::backdrop { background: rgba(17,24,39,.35) }
  .picker[open] { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto }
  .picker header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px 4px }
  .picker header b { font-size: 16px; margin-right: 8px }
  .picker-bar { display: flex; gap: 8px; align-items: center; padding: 10px 20px }
  .picker-bar .grow { flex: 1 }
  .picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; padding: 4px 20px 16px; overflow: auto; min-height: 200px }
  .picker-grid button { display: grid; gap: 6px; justify-items: center; padding: 8px; border: 0; border-radius: 10px; background: var(--surface-2); color: var(--text-2); cursor: pointer; font: 11px/1.3 var(--mono); overflow-wrap: anywhere; text-align: center }
  .picker-grid button:hover { background: var(--fill) }
  .picker-grid button[aria-selected="true"] { background: var(--accent-tint); box-shadow: inset 0 0 0 2px var(--accent); color: var(--accent-ink) }
  .picker-grid img { width: 64px; height: 64px; object-fit: contain; image-rendering: pixelated }
  .picker-grid button b { font: 500 12px/1.3 var(--font); color: var(--text) }
  .picker-grid button[aria-selected="true"] b { color: var(--accent-ink) }
  .picker footer { display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: flex-end; padding: 14px 20px; background: var(--surface-2) }
</style>
<script>
  var pickerState = { options: null, files: [] };
  var ASSET_RULES = ${JSON.stringify(ASSET_REFS)};
  function assetFileText(f) { return f.fileName + '.' + f.extension; }
  function assetValueOf(rule, f) { return ASSET_RULES[rule].key === 'fileName' ? assetFileText(f) : f.fileName; }
  /** 글자 칸 옆에 붙일 고르기 버튼. 고르면 칸 값을 바꾸고 input 사건을 낸다. 지금 값과 같은 그림이 골라져 열린다. */
  function assetPickButton(field, rule) {
    var b = button('고르기', 'btn ghost sm');
    b.addEventListener('click', function () {
      var r = ASSET_RULES[rule];
      openAssetPicker({ categories: r.categories, uploadCategory: r.categories[0], isCurrent: function (f) { return field.value.trim() !== '' && assetValueOf(rule, f) === field.value.trim(); }, onPick: function (f) { field.value = f ? assetValueOf(rule, f) : ''; field.dispatchEvent(new Event('input', { bubbles: true })); } });
    });
    return b;
  }
  /** data-asset 이 붙은 글자 칸마다 고르기 버튼을 붙인다. 화면의 고정 HTML 칸(새로 넣기 줄)에 쓴다. */
  function attachAssetPickers() {
    document.querySelectorAll('input[data-asset]').forEach(function (i) {
      if (i.dataset.assetBound) return; i.dataset.assetBound = '1';
      var row = el('div', undefined, 'inline'); i.parentNode.insertBefore(row, i); row.appendChild(i); row.appendChild(assetPickButton(i, i.dataset.asset));
    });
  }
  function pickerFileUrl(f) { return '/assets/' + f.file; }
  async function pickerLoad() {
    var r = await call('GET', '/admin/assets/list');
    if (!r.ok) { show(fail('그림 목록을 못 읽었다', r), true); return; }
    pickerState.files = r.json.rows;
  }
  function pickerRender() {
    var o = pickerState.options; if (o === null) return;
    var q = document.getElementById('picker-q').value.trim().toLowerCase();
    var grid = document.getElementById('picker-grid'); grid.innerHTML = '';
    var shown = pickerState.files.filter(function (f) {
      return o.categories.indexOf(f.category) >= 0 && (!q || assetFileText(f).toLowerCase().indexOf(q) >= 0 || f.label.toLowerCase().indexOf(q) >= 0);
    });
    shown.forEach(function (f) {
      var b = button(''); b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(o.isCurrent ? o.isCurrent(f) : f.id === o.current)); b.title = f.category + '/' + assetFileText(f);
      var img = el('img'); img.src = pickerFileUrl(f); img.alt = ''; img.loading = 'lazy';
      b.appendChild(img); b.appendChild(el('b', f.label)); b.appendChild(span(assetFileText(f)));
      b.addEventListener('click', function () { pickerDone(f); });
      grid.appendChild(b);
    });
    if (shown.length === 0) grid.appendChild(el('p', '맞는 그림이 없다', 'dim'));
  }
  function pickerDone(file) {
    var o = pickerState.options; pickerState.options = null;
    document.getElementById('asset-picker').close();
    if (o !== null) o.onPick(file);
  }
  async function openAssetPicker(options) {
    pickerState.options = options;
    document.getElementById('picker-dirs').textContent = options.categories.join(' · ');
    document.getElementById('picker-upload-dir').textContent = options.uploadCategory + '/';
    document.getElementById('picker-q').value = '';
    document.getElementById('asset-picker').showModal();
    await pickerLoad();
    pickerRender();
  }
  document.getElementById('picker-q').addEventListener('input', pickerRender);
  document.getElementById('picker-close').addEventListener('click', function () { pickerState.options = null; document.getElementById('asset-picker').close(); });
  document.getElementById('picker-none').addEventListener('click', function () { pickerDone(null); });
  document.getElementById('picker-upload').addEventListener('click', async function () {
    var o = pickerState.options; if (o === null) return;
    var file = document.getElementById('picker-file').files[0];
    var name = document.getElementById('picker-name').value.trim();
    var ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[file ? file.type : ''];
    if (!file || !ext || name === '') { show('새 그림 이름과 png · webp · jpg 파일을 함께 고른다', true); return; }
    var key = { category: o.uploadCategory, fileName: name, extension: ext };
    var res = await fetch('/admin/assets/file?' + new URLSearchParams(key), { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    if (!res.ok) { show('못 올렸다 ' + res.status + '\\n' + (await res.text()), true); return; }
    await pickerLoad();
    var uploaded = pickerState.files.find(function (f) { return f.category === key.category && f.fileName === key.fileName && f.extension === key.extension; });
    if (uploaded) pickerDone(uploaded); else pickerRender();
  });
</script>`
