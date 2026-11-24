import { layout } from './layout'

/**
 * FAQ. 위에서 묶음을 고르면 그 묶음의 제목과 문항만 보인다. 묶음 하나가 앱 화면의 물음표가 여는 시트 하나다.
 *
 * 묶음 key 는 앱 코드가 들어 못 바꾼다. 묶음을 지우면 그 문항도 지워진다. 문항을 누르면 작은 창에서 질문과 답을 고친다.
 * `/faqs/sheets/<key>` 로 열면 그 묶음을 고른 채로 연다.
 */
const FAQ_PAGE = layout(
  '/faqs',
  'FAQ',
  `<div class="top"><h1>FAQ</h1><span class="grow"></span><span class="updated" id="updated"></span></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel">
  <div class="panel-head">
    <select id="sheet" class="w-md" aria-label="묶음"></select>
    <button id="up" class="btn ghost sm" type="button" title="묶음을 앞으로">↑</button><button id="down" class="btn ghost sm" type="button" title="묶음을 뒤로">↓</button>
    <span class="grow"></span>
    <button id="add-sheet" class="btn ghost sm" type="button">묶음 추가</button>
    <button id="remove-sheet" class="btn danger sm" type="button">묶음 지우기</button>
  </div>
  <div class="panel-head"><span class="rule">시트 제목 <span id="title"></span></span><span class="grow"></span><span class="dim" id="hint"></span><button id="add-item" class="btn sm" type="button">문항 추가</button></div>
  <div id="items" class="faq-items"></div>
</section>
<style>
  .faq-items { display: grid; gap: 6px }
  .faq-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; background: var(--surface-2); cursor: pointer }
  .faq-item:hover { background: var(--fill) }
  .faq-item .body { flex: 1; min-width: 0 }
  .faq-item b { display: block; font-size: 13.5px; margin-bottom: 4px }
  .faq-item p { margin: 0; font-size: 12.5px; color: var(--text-2); white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
  .faq-item .act { visibility: hidden; display: flex; gap: 4px }
  .faq-item:hover .act { visibility: visible }
  .rule .text-in { min-width: 220px }
  .form-dialog textarea { min-height: 180px }
</style>
<script>
  var data = null, current = null;
  var batch = editing(function () { load(); });
  var fromPath = location.pathname.indexOf('/faqs/sheets/') === 0 ? decodeURIComponent(location.pathname.split('/').pop()) : null;
  function itemsOf(key) { return data.items.filter(function (i) { return i.sheet === key; }); }
  function itemForm(title, it, send) {
    var box = el('div', undefined, 'form-body'), q = input('text'), a = el('textarea');
    q.maxLength = 200; a.maxLength = 5000; if (it) { q.value = it.question; a.value = it.answer; }
    box.appendChild(field('질문', undefined, q)); box.appendChild(field('답', '빈 줄로 문단을 나눈다', a));
    var go = button(it ? '저장' : '문항 추가', 'btn'); box.appendChild(go);
    var d = openForm(title, box);
    go.addEventListener('click', async function () { var r = await send({ question: q.value, answer: a.value }); show(r.ok ? '적었다' : fail('못 적었다', r), !r.ok); if (r.ok) { d.close(); load(); } });
  }
  async function move(url, direction) { var r = await call('POST', url, { direction: direction }); if (!r.ok) show(fail('못 옮겼다', r), true); load(); }
  function render() {
    batch.clear();
    var sel = document.getElementById('sheet'); sel.innerHTML = '';
    data.sheets.forEach(function (s) { var o = document.createElement('option'); o.value = s.key; o.textContent = s.title + ' · ' + s.key + ' · ' + itemsOf(s.key).length + '개'; sel.appendChild(o); });
    if (!data.sheets.some(function (s) { return s.key === current; })) current = data.sheets.length ? data.sheets[0].key : null;
    sel.value = current || '';
    var s = data.sheets.filter(function (x) { return x.key === current; })[0];
    var title = document.getElementById('title'); title.innerHTML = '';
    var list = document.getElementById('items'); list.innerHTML = '';
    document.getElementById('add-item').disabled = !s; document.getElementById('remove-sheet').disabled = !s;
    if (!s) { list.appendChild(el('p', '묶음이 없다', 'dim')); return; }
    var key = s.key, t = textCell(batch, '제목', s.title, function () { return call('PUT', '/faqs/sheets/' + key, { title: t.value() }); });
    t.input.maxLength = 50; title.appendChild(t.input);
    var items = itemsOf(key);
    document.getElementById('hint').textContent = items.length === 0 ? '문항이 없으면 앱이 이 화면의 물음표를 숨긴다' : '';
    items.forEach(function (it) {
      var row = el('div', undefined, 'faq-item'), body = el('div', undefined, 'body');
      body.appendChild(el('b', it.question)); body.appendChild(el('p', it.answer)); row.appendChild(body);
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), del = button('지우기', 'btn danger sm'), act = el('div', undefined, 'act');
      up.addEventListener('click', function (e) { e.stopPropagation(); move('/faqs/items/' + it.id + '/move', 'up'); });
      down.addEventListener('click', function (e) { e.stopPropagation(); move('/faqs/items/' + it.id + '/move', 'down'); });
      del.addEventListener('click', async function (e) { e.stopPropagation(); if (!window.confirm('‘' + it.question + '’ 문항을 지운다. 되돌릴 수 없다.')) return; var r = await call('DELETE', '/faqs/items/' + it.id); show(r.ok ? '지웠다' : fail('못 지웠다', r), !r.ok); load(); });
      act.appendChild(up); act.appendChild(down); act.appendChild(del); row.appendChild(act);
      row.addEventListener('click', function () { itemForm('문항 고치기', it, function (b) { return call('PUT', '/faqs/items/' + it.id, b); }); });
      list.appendChild(row);
    });
  }
  document.getElementById('sheet').addEventListener('change', function (e) { current = e.target.value; render(); });
  document.getElementById('up').addEventListener('click', function () { if (current) move('/faqs/sheets/' + current + '/move', 'up'); });
  document.getElementById('down').addEventListener('click', function () { if (current) move('/faqs/sheets/' + current + '/move', 'down'); });
  document.getElementById('add-item').addEventListener('click', function () { itemForm('문항 추가', null, function (b) { return call('POST', '/faqs/sheets/' + current + '/items', b); }); });
  document.getElementById('add-sheet').addEventListener('click', function () {
    var box = el('div', undefined, 'form-body'), k = input('text'), t = input('text');
    k.className = 'mono'; k.maxLength = 60; k.placeholder = 'boss-manage'; t.maxLength = 50; t.placeholder = '보스 관리';
    box.appendChild(field('key', '페이지면 라우트 이름, 안내 줄이면 기능 폴더 이름을 소문자와 붙임표로. 못 바꾼다', k)); box.appendChild(field('시트 제목', undefined, t));
    var go = button('묶음 추가', 'btn'); box.appendChild(go); var d = openForm('묶음 추가', box);
    go.addEventListener('click', async function () { var r = await call('POST', '/faqs/sheets', { key: k.value.trim(), title: t.value }); show(r.ok ? k.value.trim() + ' 를 더했다' : fail('더하지 못했다', r), !r.ok); if (r.ok) { current = k.value.trim(); d.close(); load(); } });
  });
  document.getElementById('remove-sheet').addEventListener('click', async function () {
    var n = itemsOf(current).length;
    if (!window.confirm('‘' + current + '’ 묶음을 지운다. 문항 ' + n + '개도 함께 지워진다. 되돌릴 수 없다.')) return;
    var r = await call('DELETE', '/faqs/sheets/' + current); show(r.ok ? current + ' 를 지웠다' : fail('못 지웠다', r), !r.ok); current = null; load();
  });
  async function load() {
    var r = await call('GET', '/faqs/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    data = r.json;
    if (current === null && fromPath) current = fromPath;
    document.getElementById('updated').textContent = data.updatedAt ? '마지막 갱신 ' + when(data.updatedAt) : '';
    render();
  }
  load();
</script>`,
)

/** FAQ 화면. 묶음 목록과 묶음 하나의 문항을 한 화면에서 고친다. */
export const FAQS_HTML = FAQ_PAGE
/** 묶음 하나를 고른 채로 여는 FAQ 화면. 화면은 FAQS_HTML 과 같고 주소의 끝에서 묶음을 읽는다. */
export const FAQ_SHEET_HTML = FAQ_PAGE
