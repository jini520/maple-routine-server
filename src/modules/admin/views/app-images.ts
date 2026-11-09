import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 앱 그림 화면(앱 저장소 ADR-187 결정 6 · 8). 붙일 게임 데이터 표가 없어 앱이 key 로 찾는 그림이다. key 는 앱 코드가 들어
 * 여기서는 그림만 바꾼다. 드롭 연출 프레임은 앱이 번호 차례로 재생하므로 같은 차례로 보인다.
 */
export const APP_IMAGES_HTML = layout(
  '/admin/app-images',
  '앱 그림',
  `<div class="head">
  <div>
    <h1>앱 그림</h1>
    <p>앱 코드가 key 로 찾는 그림이다. key 는 앱 코드가 들고 있어 여기서 더하거나 지우지 않고, 그림만 바꾼다. 바꾸면 앱이 다음에 켜거나 돌아올 때 새 그림을 받는다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-count">–</b><span>key</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<div id="groups" class="groups"></div>
${ASSET_PICKER}
<style>
  .groups { display: grid; gap: 16px }
  .group header { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px 4px }
  .group header h2 { margin: 0; font-size: 15px }
  .group header span { color: var(--text-3); font-size: 12px }
  .app-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; padding: 8px 16px 16px }
  .app-tile { display: grid; gap: 6px; justify-items: center; padding: 10px 8px; border-radius: 10px; background: var(--surface-2); text-align: center; min-width: 0 }
  .app-tile img { width: 72px; height: 72px; object-fit: contain; image-rendering: pixelated }
  .app-tile .key { font: 500 11.5px/1.3 var(--mono); color: var(--text); overflow-wrap: anywhere }
  .app-tile .path { font: 400 10.5px/1.3 var(--mono); color: var(--text-3); overflow-wrap: anywhere }
</style>
<script>
  /** key 의 머리로 묶는다. 앞에서부터 처음 맞는 묶음이다. */
  var GROUPS = [
    ['보스 수익 결정석', /^boss_crystal_/],
    ['가계부 강화 줄', /^enhancement_/],
    ['메소 · 버프 · 주화', /^(meso_pouch|union_wealth|selazar_coin)$/],
    ['솔 에르다의 기운 단위', /^sol_erda_energy_/],
    ['포스', /_force$/],
    ['캐릭터', /^unknown_character$/],
    ['드롭 연출 · 화면', /^drop_effect_screen_/],
    ['드롭 연출 · 시작', /^drop_effect_pre_/],
    ['드롭 연출 · 반복', /^drop_effect_loop_/],
    ['드롭 연출 · 끝', /^drop_effect_end_/],
  ];
  var state = { images: [], assets: {} };

  function dirOf(path) { return path.slice(0, path.lastIndexOf('/')); }
  // 연출 프레임은 번호가 끝에 있어 글자 차례면 10 이 2 앞에 선다.
  function byKey(a, b) {
    var na = Number(a.key.slice(a.key.lastIndexOf('_') + 1)), nb = Number(b.key.slice(b.key.lastIndexOf('_') + 1));
    if (!isNaN(na) && !isNaN(nb) && a.key.slice(0, a.key.lastIndexOf('_')) === b.key.slice(0, b.key.lastIndexOf('_'))) return na - nb;
    return a.key < b.key ? -1 : 1;
  }

  async function change(image, asset) {
    var dir = asset ? dirOf(asset.path) : 'items';
    openAssetPicker({
      dirs: [dir], uploadDir: dir, current: image.assetId,
      onPick: async function (f) {
        if (f === null) { show('앱 그림은 비울 수 없다. 다른 그림을 고른다', true); return; }
        var r = await call('PUT', '/admin/app-images/' + image.key, { assetId: f.id });
        show(r.ok ? image.key + ' 의 그림을 바꿨다' : fail('못 바꿨다', r), !r.ok);
        if (r.ok) load();
      },
    });
  }

  function tile(image) {
    var asset = state.assets[image.assetId];
    var box = el('div', undefined, 'app-tile');
    var img = el('img'); img.alt = ''; img.loading = 'lazy'; if (asset) img.src = '/assets/' + asset.file;
    box.appendChild(img);
    box.appendChild(el('div', image.key, 'key'));
    box.appendChild(el('div', asset ? asset.path : '그림 표에 없다', 'path'));
    var b = button('바꾸기', 'btn ghost sm');
    b.addEventListener('click', function () { change(image, asset); });
    box.appendChild(b);
    return box;
  }

  function render() {
    var root = document.getElementById('groups'); root.innerHTML = '';
    var left = state.images.slice().sort(byKey);
    GROUPS.concat([['그 밖', /./]]).forEach(function (g) {
      var mine = left.filter(function (i) { return g[1].test(i.key); });
      left = left.filter(function (i) { return mine.indexOf(i) === -1; });
      if (mine.length === 0) return;
      var card = el('section', undefined, 'card group');
      var head = el('header'); head.appendChild(el('h2', g[0])); head.appendChild(span(mine.length + '개'));
      var tiles = el('div', undefined, 'app-tiles');
      mine.forEach(function (i) { tiles.appendChild(tile(i)); });
      card.appendChild(head); card.appendChild(tiles); root.appendChild(card);
    });
  }

  async function load() {
    var r = await call('GET', '/admin/app-images/rows');
    var a = await call('GET', '/admin/assets/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    state.images = r.json.images;
    state.assets = {}; a.json.rows.forEach(function (x) { state.assets[x.id] = x; });
    document.getElementById('stat-count').textContent = state.images.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)
