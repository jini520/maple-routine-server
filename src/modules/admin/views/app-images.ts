import { ASSET_PICKER } from './asset-picker'
import { layout } from './layout'

/**
 * 앱 그림 화면(앱 저장소 ADR-187 결정 6 · 8). 붙일 게임 데이터 표가 없어 앱이 key 로 찾는 그림이다. key 는 앱 코드가 들어
 * 여기서는 그림만 바꾼다. 왼쪽은 key 의 머리로 묶은 묶음이고, 오른쪽은 고른 묶음의 그림 칸이다. 칸을 눌러 그림을 고르고 저장
 * 막대로 한 번에 보낸다. 드롭 연출 프레임은 앱이 번호 차례로 재생하므로 같은 차례로 보인다.
 */
export const APP_IMAGES_HTML = layout(
  '/admin/app-images',
  '앱 그림',
  `<div class="top"><h1>앱 그림</h1><span class="grow"></span><span class="updated" id="updated"></span></div>
<div id="message" class="msg" role="status" hidden></div>
<div class="split"><nav class="picklist" id="list" aria-label="묶음"></nav><section class="panel" id="detail"></section></div>
${ASSET_PICKER}
<style>
  .app-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px }
  .app-tile { display: grid; gap: 4px; justify-items: center; padding: 8px 6px; border-radius: 10px; background: var(--surface-2); min-width: 0 }
  .app-tile .asset-cell { flex-direction: column; width: 100%; max-width: none; padding: 4px }
  .app-tile .asset-cell img { width: 56px; height: 56px; object-fit: contain; image-rendering: pixelated }
  .app-tile .asset-cell span { white-space: normal; font: 10.5px/1.3 var(--mono); overflow-wrap: anywhere; text-align: center }
  .app-tile .key { font: 500 11.5px/1.3 var(--mono); color: var(--text); overflow-wrap: anywhere; text-align: center }
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
    ['그 밖', /./],
  ];
  var D = null, assets = {}, current = null;
  var batch = editing(function () { load(); });
  function lookup(id) { return assets[id]; }

  // 연출 프레임은 번호가 끝에 있어 글자 차례면 10 이 2 앞에 선다.
  function byKey(a, b) {
    var na = Number(a.key.slice(a.key.lastIndexOf('_') + 1)), nb = Number(b.key.slice(b.key.lastIndexOf('_') + 1));
    if (!isNaN(na) && !isNaN(nb) && a.key.slice(0, a.key.lastIndexOf('_')) === b.key.slice(0, b.key.lastIndexOf('_'))) return na - nb;
    return a.key < b.key ? -1 : 1;
  }

  function groups() {
    var left = D.images.slice().sort(byKey);
    return GROUPS.map(function (g) {
      var mine = left.filter(function (i) { return g[1].test(i.key); });
      left = left.filter(function (i) { return mine.indexOf(i) === -1; });
      return { key: g[0], title: g[0], meta: String(mine.length), images: mine };
    }).filter(function (g) { return g.images.length > 0; });
  }

  function render() {
    batch.clear();
    var all = groups();
    if (current === null) current = hashKey();
    if (!all.some(function (g) { return g.key === current; })) current = all.length ? all[0].key : null;
    pickList(document.getElementById('list'), all, current, function (k) { if (!discardOk(batch)) return; current = k; setHashKey(k); render(); });
    var box = document.getElementById('detail'); box.innerHTML = '';
    var group = all.filter(function (g) { return g.key === current; })[0];
    if (!group) { box.appendChild(el('p', '앱 그림이 없다', 'dim')); return; }
    var tiles = el('div', undefined, 'app-tiles');
    group.images.forEach(function (image) {
      var asset = assets[image.assetId];
      var category = asset ? asset.category : 'item';
      var cellRef = { c: null };
      var send = function () { return call('PUT', '/admin/app-images/' + image.key, { assetId: cellRef.c.value() }); };
      cellRef.c = assetCell(batch, image.key, image.assetId, send, { categories: [category], uploadCategory: category, lookup: lookup });
      var tile = el('div', undefined, 'app-tile');
      tile.appendChild(cellRef.c.input); tile.appendChild(el('div', image.key, 'key'));
      tiles.appendChild(tile);
    });
    box.appendChild(tiles);
    box.appendChild(el('p', 'key 는 앱 코드가 들고 있어 여기서 더하거나 지우지 않는다. 앱 그림은 비울 수 없다. 바꾸면 앱이 다음에 켜거나 돌아올 때 새 그림을 받는다.', 'hint'));
  }

  async function load() {
    var r = await call('GET', '/admin/app-images/rows');
    var a = await call('GET', '/admin/assets/list');
    if (!r.ok || !a.ok) { show('못 읽었다 ' + (r.ok ? a.status : r.status), true); return; }
    D = r.json; assets = {}; a.json.rows.forEach(function (x) { assets[x.id] = x; });
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
  load();
</script>`,
)
