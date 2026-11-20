import { subNav } from './edit-kit'
import { layout } from './layout'

const NAV = [
  ['/admin/assets', '그림'],
  ['/admin/assets/crops', '크롭'],
] as const

/** 두 화면이 함께 쓰는 읽기. 그림은 nginx 가 `/assets/<해시>.<확장자>` 로 내므로 미리보기도 그 주소를 쓴다. */
const COMMON_JS = `
  var D = null;
  var batch = editing(function () { load(); });
  function urlOf(f) { return '/assets/' + f.file; }
  function keyText(r) { return r.category + '/' + r.fileName + '.' + r.extension; }
  // 연출 프레임은 숫자 이름이라 글자 차례면 10 이 2 앞에 선다. 앱이 숫자 차례로 재생하므로 같은 차례로 보인다.
  function byFile(a, b) {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    var na = Number(a.fileName), nb = Number(b.fileName);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return keyText(a) < keyText(b) ? -1 : 1;
  }
  async function load() {
    var r = await call('GET', '/admin/assets/list');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    D = r.json;
    document.getElementById('updated').textContent = D.updatedAt ? '마지막 갱신 ' + when(D.updatedAt) : '';
    render();
  }
`

function page(current: string, top: string, body: string, script: string): string {
  return layout(
    '/admin/assets',
    '그림',
    `<div class="top"><h1>그림</h1>${subNav(NAV, current)}${top}<span class="grow"></span><span class="updated" id="updated"></span></div>
<div id="message" class="msg" role="status" hidden></div>
${body}
<script>
${COMMON_JS}
${script}
  load();
</script>`,
  )
}

/**
 * 앱이 받는 그림. 왼쪽 분류는 아이템이 쓰는 그림을 그 아이템의 묶음으로, 나머지를 그림 분류(폴더)로 묶는다. 오른쪽은 고른 분류의
 * 그림이 18장씩 선다. 보이는 이름은 칸에서 바로 고치고, 비우면 그 그림을 쓰는 곳의 이름을 보인다.
 *
 * 같은 경로에 올리면 그림이 바뀐다. 표가 쓰지 않는 그림만 지울 수 있다.
 */
export const ASSETS_HTML = page(
  '/admin/assets',
  '<input id="q" type="search" class="on-bg" placeholder="이름 · 경로로 찾는다"><button type="button" class="btn danger sm" id="unused" hidden></button>',
  `<div class="split"><nav class="picklist tree" id="tree" aria-label="그림 분류"></nav><section class="panel">
  <div class="panel-head" id="head"></div>
  <table class="sheet tight"><thead><tr><th>그림</th><th>보이는 이름 · 경로</th><th>쓰는 곳</th><th class="num">크기</th><th></th></tr></thead><tbody id="rows"></tbody></table>
  <div class="panel-head" style="margin-top:8px"><p id="summary"></p><span class="grow"></span><span id="pages"></span></div>
</section></div>
<style>
  .tree .k { font-size: 11.5px; font-weight: 700; color: var(--text-3); letter-spacing: .04em; padding: 8px 10px 2px }
  .tree button.child { padding-left: 22px }
  .thumb { width: 28px; height: 28px; object-fit: contain; background: var(--surface-2); border-radius: 6px; display: block; image-rendering: pixelated }
  .tag.bad { background: var(--danger-tint); color: var(--danger-ink) }
  button.tag { border: 0; cursor: pointer }
</style>`,
  `
  /**
   * 그림 분류. 잎이 그림 분류(category) 하나다. 부모를 고르면 자식 분류 전부를 보인다. 아이템이 쓰는 그림은 여기에
   * 안 들고 아이템 묶음에 든다. 분류 목록은 서버 asset-paths.ts 의 ASSET_CATEGORIES 와 같다.
   */
  var FOLDERS = [
    { key: 'f:boss', label: '보스 초상', category: 'boss' },
    { key: 'f:item', label: '아이템 폴더', children: [{ key: 'f:item:item', label: '일반', category: 'item' }, { key: 'f:item:ring', label: '반지', category: 'item_ring' }] },
    { key: 'f:map', label: '지도', children: [{ key: 'f:map:bg', label: '배경', category: 'map' }, { key: 'f:map:icon', label: '아이콘', category: 'map_icon' }] },
    { key: 'f:world', label: '월드 엠블럼', category: 'world' },
    { key: 'f:mvp', label: 'MVP 명패', category: 'mvp' },
    { key: 'f:force', label: '포스', category: 'force' },
    { key: 'f:skill', label: '스킬', category: 'skill' },
    { key: 'f:character', label: '캐릭터', category: 'character' },
    { key: 'f:effect', label: '고가 드롭 연출', children: [
      { key: 'f:effect:screen', label: '화면', category: 'drop_effect_screen' }, { key: 'f:effect:pre', label: '시작', category: 'drop_effect_pre' },
      { key: 'f:effect:loop', label: '반복', category: 'drop_effect_loop' }, { key: 'f:effect:end', label: '끝', category: 'drop_effect_end' },
    ] },
  ];
  var EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };
  var PAGE = 18, nodeKey = 'all', pageAt = 0;
  function kb(n) { return (n / 1024).toFixed(1) + 'KB'; }
  function usedByItem(r) { return r.uses.some(function (u) { return u.kind === '아이템'; }); }
  function nodes() {
    var l = [{ key: 'all', label: '전체', test: function () { return true; } }, { key: 'unused', label: '표가 안 쓰는 그림', test: function (r) { return r.uses.length === 0; } }];
    D.categories.forEach(function (k) {
      l.push({ head: '아이템 · ' + k.name });
      k.groups.forEach(function (g) { l.push({ key: 'i:' + g.key, label: g.name, test: function (r) { return usedByItem(r) && r.itemCategory === g.key; } }); });
    });
    l.push({ key: 'i:', label: '아이템 · 분류 없음', test: function (r) { return usedByItem(r) && r.itemCategory === null; } });
    l.push({ head: '그 밖' });
    FOLDERS.forEach(function (f) {
      var cats = f.children ? f.children.map(function (c) { return c.category; }) : [f.category];
      l.push({ key: f.key, label: f.label, category: f.category, test: function (r) { return !usedByItem(r) && cats.indexOf(r.category) >= 0; } });
      (f.children || []).forEach(function (c) { l.push({ key: c.key, label: c.label, category: c.category, child: true, test: function (r) { return !usedByItem(r) && r.category === c.category; } }); });
    });
    return l;
  }
  function nodeOf(key) { return nodes().filter(function (n) { return n.key === key; })[0] || nodes()[0]; }

  /** 그림 하나를 올린다. 확장자가 없으면(새 그림) 파일 형식에서 정한다. 있으면(바꾸기) 파일 형식이 같아야 한다. */
  async function upload(target, file) {
    if (!file) { show('파일을 고른다', true); return false; }
    var key = { category: target.category, fileName: target.fileName, extension: target.extension || EXT[file.type] || '' };
    var res = await fetch('/admin/assets/file?' + new URLSearchParams(key), { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    var text = await res.text();
    if (!res.ok) { show('못 올렸다 ' + res.status + '\\n' + text, true); return false; }
    var json = JSON.parse(text);
    show(keyText(key) + (json.result === 'same' ? ' 는 내용이 같아 그대로다' : json.result === 'created' ? ' 를 더했다' : ' 를 바꿨다'), false);
    load(); return true;
  }
  function filePicker(onPick) {
    var f = input('file'); f.accept = 'image/png,image/webp,image/jpeg'; f.hidden = true;
    f.addEventListener('change', function () { if (f.files && f.files[0]) onPick(f.files[0]); f.value = ''; });
    return f;
  }
  function uploadForm(category) {
    var form = el('div', undefined, 'form-body'); var name = input('text', 'mono'); name.placeholder = category.indexOf('drop_effect') === 0 ? '24' : 'newName'; var file = input('file'); file.accept = 'image/png,image/webp,image/jpeg';
    form.appendChild(field('파일 이름', category + ' 분류. 확장자는 파일 형식에서 정한다', name)); form.appendChild(field('파일', 'png · webp · jpg, 1MB 까지', file));
    var go = button('올리기', 'btn'); form.appendChild(go); var d = openForm('새 그림 올리기', form);
    go.addEventListener('click', async function () { if (await upload({ category: category, fileName: name.value.trim() }, file.files && file.files[0])) d.close(); });
  }
  function usesDialog(r) {
    var form = el('div', undefined, 'form-body'); var list = el('div', undefined, 'tags');
    r.uses.forEach(function (u) { list.appendChild(span(u.kind + ' · ' + u.name, 'tag')); }); form.appendChild(list); openForm(keyText(r) + ' 를 쓰는 곳', form);
  }

  function render() {
    batch.clear();
    var all = nodes(), node = nodeOf(nodeKey);
    var tree = document.getElementById('tree'); tree.innerHTML = '';
    all.forEach(function (n) {
      if (n.head) { tree.appendChild(el('div', n.head, 'k')); return; }
      var c = D.rows.filter(n.test).length; if (c === 0 && n.key.indexOf('i:') === 0) return;
      var b = button('', n.child ? 'child' : ''); b.setAttribute('aria-current', n.key === node.key ? 'true' : 'false'); b.appendChild(el('b', n.label)); b.appendChild(span(String(c), 'pl-meta'));
      b.addEventListener('click', function () { if (n.key === nodeKey || !discardOk(batch)) return; nodeKey = n.key; pageAt = 0; setHashKey(n.key); render(); });
      tree.appendChild(b);
    });
    var head = document.getElementById('head'); head.innerHTML = ''; head.appendChild(el('b', node.label)); head.appendChild(span('', 'grow'));
    if (node.category && !node.children) { var up = button('새 그림 올리기', 'btn ghost sm'); up.addEventListener('click', function () { uploadForm(node.category); }); head.appendChild(up); }
    else if (node.key.indexOf('i:') === 0) head.appendChild(el('p', '아이템 그림은 아이템 화면의 그림 칸에서 고르거나 올린다'));
    var q = document.getElementById('q').value.trim().toLowerCase();
    var shown = D.rows.filter(function (r) { return node.test(r) && (!q || r.label.toLowerCase().indexOf(q) >= 0 || keyText(r).toLowerCase().indexOf(q) >= 0); }).sort(byFile);
    var pages = Math.max(1, Math.ceil(shown.length / PAGE)); if (pageAt >= pages) pageAt = pages - 1;
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    shown.slice(pageAt * PAGE, pageAt * PAGE + PAGE).forEach(function (r) {
      var tr = el('tr'); var img = el('img', undefined, 'thumb'); img.src = urlOf(r); img.alt = ''; img.loading = 'lazy'; cell(tr, img);
      var name = textCell(batch, keyText(r), r.name || '', function () { return call('PUT', '/admin/assets/' + r.id + '/name', { name: name.value() }); }, 'w-mid');
      name.input.placeholder = r.uses[0] ? r.uses[0].name : r.fileName;
      var box = el('div', undefined, 'pair'); box.appendChild(name.input); box.appendChild(el('small', keyText(r))); cell(tr, box);
      var uses = r.uses.length === 0 ? span('표가 안 씀', 'tag bad') : button(r.uses.length + '곳', 'tag accent');
      if (r.uses.length > 0) uses.addEventListener('click', function () { usesDialog(r); });
      cell(tr, uses); cell(tr, r.width + '×' + r.height + ' · ' + kb(r.sizeBytes), 'num mono');
      var pick = filePicker(function (file) { upload(r, file); }); var replace = button('바꾸기', 'btn ghost sm'); replace.addEventListener('click', function () { pick.click(); });
      var act = inline(replace, pick);
      if (r.uses.length === 0) {
        var del = button('지우기', 'btn danger sm');
        del.addEventListener('click', async function () { if (!window.confirm(keyText(r) + ' 를 지운다. 이 그림의 크롭도 함께 지운다. 되돌릴 수 없다')) return; var res = await call('DELETE', '/admin/assets/' + r.id); show(res.ok ? keyText(r) + ' 를 지웠다' : fail('못 지웠다', res), !res.ok); if (res.ok) load(); });
        act.appendChild(del);
      }
      act.classList.add('row-act'); cell(tr, act, 'act'); tb.appendChild(tr);
    });
    if (shown.length === 0) { var e = el('tr'); var td = cell(e, '맞는 그림이 없다', 'empty'); td.colSpan = 5; tb.appendChild(e); }
    document.getElementById('summary').textContent = shown.length + '장 · 전체 ' + D.rows.length + '장 · ' + kb(D.rows.reduce(function (n, f) { return n + f.sizeBytes; }, 0)) + ' · 이름을 비우면 쓰는 곳의 이름을 보인다';
    var pg = document.getElementById('pages'); pg.innerHTML = '';
    pg.appendChild(pager(pages, pageAt, function (v) { if (!discardOk(batch)) return; pageAt = v; render(); }));
    var unused = D.rows.filter(function (x) { return x.uses.length === 0; }).length; var ub = document.getElementById('unused');
    ub.hidden = unused === 0; ub.textContent = '표가 안 쓰는 그림 ' + unused + '장';
  }
  if (hashKey()) nodeKey = hashKey();
  document.getElementById('q').addEventListener('input', function () { pageAt = 0; render(); });
  document.getElementById('unused').addEventListener('click', function () { if (!discardOk(batch)) return; nodeKey = 'unused'; pageAt = 0; setHashKey('unused'); render(); });
`,
)

/**
 * 보스 초상 · 컨텐츠 지역 지도의 크롭. 위에서 종류를 고르면 그 종류에 쓰는 그림마다 미리보기와 숫자 셋(폭 · 가로 · 세로 %)이 선다.
 * 미리보기 틀의 비율은 앱 자리와 비슷하게 맞춘 것이다. 줄이 없으면 앱은 cover · 가운데로 그린다.
 */
export const ASSET_CROPS_HTML = page(
  '/admin/assets/crops',
  '',
  `<section class="panel">
  <div class="panel-head"><span id="kinds"></span><span class="grow"></span><p>칸은 차례로 폭 · 가로 · 세로 % 다</p></div>
  <div class="crops" id="crops"></div>
  <div class="panel-head" style="margin-top:10px"><p>폭은 놓이는 자리의 폭에 대한 %, 위치는 가로 · 세로 % 다. 폭을 비우면 크롭이 없고 앱은 cover · 가운데로 그린다.</p></div>
</section>
<style>
  .crops { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 6px 8px }
  .crop-card { position: relative; display: grid; gap: 4px; padding: 6px; border-radius: 10px; background: var(--surface-2) }
  .crop-card .nm { position: absolute; left: 10px; right: 10px; top: 10px; display: flex; align-items: center; gap: 6px; font: 11.5px var(--mono); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.8) }
  .crop-card .nm .grow { flex: 1 }
  .crop-card .nm .btn { visibility: hidden; background: var(--surface); padding: 3px 7px }
  .crop-card:hover .nm .btn { visibility: visible }
  .crop-card .nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px }
  .crop-card .num-in { width: 100%; padding: 4px 6px; background: var(--surface) }
  .crop { background-color: var(--surface); background-repeat: no-repeat; border-radius: 8px }
  .crop.boss_portrait { width: 100%; aspect-ratio: 2 / 1 }
  .crop.boss_portrait_icon { width: 56px; height: 56px; border-radius: 50%; justify-self: center; margin-top: 16px }
  .crop.daily_quest_region { width: 100%; aspect-ratio: 5 / 2 }
</style>`,
  `
  var KINDS = [['boss_portrait', '보스 카드', 'boss'], ['boss_portrait_icon', '보스 원형 아이콘', 'boss'], ['daily_quest_region', '컨텐츠 카드 지도', 'map']];
  var kind = 'boss_portrait';
  function render() {
    batch.clear();
    var k = KINDS.filter(function (x) { return x[0] === kind; })[0];
    var head = document.getElementById('kinds'); head.innerHTML = '';
    head.appendChild(segButtons(KINDS.map(function (x) { return [x[0], x[1]]; }), kind, function (v) { if (!discardOk(batch)) return; kind = v; setHashKey(v); render(); }));
    var box = document.getElementById('crops'); box.innerHTML = '';
    D.rows.filter(function (f) { return f.category === k[2]; }).sort(byFile).forEach(function (f) {
      var saved = D.crops.filter(function (c) { return c.type === kind && c.assetId === f.id; })[0];
      var card = el('div', undefined, 'crop-card'); var prev = el('div', undefined, 'crop ' + kind); prev.style.backgroundImage = 'url(' + urlOf(f) + ')';
      var w, x, y;
      var send = function () { return call('PUT', '/admin/image-crops/' + kind + '/' + f.id, { widthPercent: w.value(), positionXPercent: x.value() === null ? 50 : x.value(), positionYPercent: y.value() === null ? 50 : y.value() }); };
      w = numCell(batch, f.fileName + ' 크롭', saved ? saved.widthPercent : null, send); x = numCell(batch, f.fileName + ' 크롭', saved ? saved.positionXPercent : null, send); y = numCell(batch, f.fileName + ' 크롭', saved ? saved.positionYPercent : null, send);
      w.input.placeholder = 'cover'; x.input.placeholder = '50'; y.input.placeholder = '50';
      function preview() {
        var wv = numRaw(w.input.value), xv = numRaw(x.input.value), yv = numRaw(y.input.value);
        prev.style.backgroundSize = wv ? wv + '% auto' : 'cover'; prev.style.backgroundPosition = xv || yv ? (xv || '50') + '% ' + (yv || '50') + '%' : 'center';
      }
      [w, x, y].forEach(function (c) { c.input.addEventListener('input', preview); c.input.addEventListener('blur', preview); }); preview();
      var nm = el('div', undefined, 'nm'); nm.appendChild(span(f.fileName)); nm.appendChild(span('', 'grow'));
      if (saved) { var rm = button('지우기', 'btn danger sm'); rm.addEventListener('click', async function () { var r = await call('DELETE', '/admin/image-crops/' + kind + '/' + f.id); show(r.ok ? f.fileName + ' 크롭을 지웠다' : fail('못 지웠다', r), !r.ok); if (r.ok) load(); }); nm.appendChild(rm); }
      w.input.title = '폭 %'; x.input.title = '가로 위치 %'; y.input.title = '세로 위치 %';
      var nums = el('div', undefined, 'nums'); nums.appendChild(w.input); nums.appendChild(x.input); nums.appendChild(y.input);
      card.appendChild(prev); card.appendChild(nm); card.appendChild(nums); box.appendChild(card);
    });
  }
  if (hashKey()) kind = hashKey();
`,
)
