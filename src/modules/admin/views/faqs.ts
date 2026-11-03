import { layout } from './layout'

/**
 * FAQ 묶음 표. 위에 새 묶음 폼, 그 아래 표 하나다. 줄의 수정을 누르면 제목이 입력으로 바뀌고, 문항을 누르면 묶음 화면으로 간다.
 *
 * key 는 앱 코드가 들어 못 바꾼다. 묶음을 지우면 그 문항도 지워진다.
 */
export const FAQS_HTML = layout(
  '/admin/faqs',
  'FAQ',
  `<div class="head">
  <div>
    <h1>FAQ</h1>
    <p>앱 화면의 물음표가 여는 FAQ 시트다. 묶음 하나가 시트 하나이고, key 가 앱이 화면에 단 값과 같아야 그 화면에서 열린다. 문항이 없는 묶음은 앱이 물음표를 숨긴다. 고친 문구는 이미 깔린 모든 앱 버전이 받는다. 바꾸면 <code>faqs.updatedAt</code> 이 움직인다.</p>
  </div>
  <div class="stats">
    <div class="stat"><b id="stat-sheets">–</b><span>묶음</span></div>
    <div class="stat"><b id="stat-items">–</b><span>문항</span></div>
    <div class="stat"><b id="stat-updated" class="mono">–</b><span>마지막 갱신</span></div>
  </div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 묶음</h2><p>key 는 페이지면 라우트 이름, 안내 줄이면 기능 폴더 이름을 소문자와 붙임표로 쓴다(BossManage → boss-manage). 한 번 정하면 못 바꾼다. 맨 뒤에 선다</p></header>
  <div class="body"><div class="row">
    <div class="field"><label for="c-key">key</label><input id="c-key" class="mono" maxlength="60" placeholder="boss-manage"></div>
    <div class="field"><label for="c-title">제목 <small>시트 제목</small></label><input id="c-title" maxlength="50" placeholder="보스 관리"></div>
    <button id="c-add" class="btn" type="button">묶음 추가</button>
  </div></div>
</section>
<section class="card">
  <header><h2>묶음</h2><p>문항을 누르면 그 묶음의 문항을 고친다</p></header>
  <div class="table"><table><thead><tr><th>#</th><th>key</th><th>제목</th><th class="num">문항</th><th></th></tr></thead><tbody id="sheets"></tbody></table></div>
</section>
<script>
  var state = { data: null, editing: null };

  function countOf(key) { return state.data.items.filter(function (i) { return i.sheet === key; }).length; }

  function sheetRow(s, i, total) {
    var editing = state.editing === s.key;
    var n = countOf(s.key);
    var tr = el('tr', undefined, editing ? 'open' : '');
    cell(tr, i + 1, 'n'); cell(tr, s.key, 'mono');
    if (!editing) {
      cell(tr, s.title); cell(tr, n === 0 ? span('없음', 'dim') : n, 'num');
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm'), del = button('삭제', 'btn danger sm');
      var items = el('a', '문항', 'btn ghost sm'); items.href = '/admin/faqs/sheets/' + s.key;
      up.disabled = i === 0; down.disabled = i === total - 1;
      up.addEventListener('click', function () { move(s, 'up'); });
      down.addEventListener('click', function () { move(s, 'down'); });
      edit.addEventListener('click', function () { state.editing = s.key; render(); });
      del.addEventListener('click', async function () {
        if (!window.confirm('‘' + s.title + '’ 묶음을 지운다. 문항 ' + n + '개도 함께 지워진다. 되돌릴 수 없다.')) return;
        var r = await call('DELETE', '/admin/faqs/sheets/' + s.key);
        show(r.ok ? s.key + ' 를 지웠다' : fail('못 지웠다', r), !r.ok); load();
      });
      cell(tr, inline(up, down, items, edit, del), 'act');
      return tr;
    }
    var title = input('text'); title.value = s.title; title.maxLength = 50;
    cell(tr, title); cell(tr, n, 'num');
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/faqs/sheets/' + s.key, { title: title.value });
      if (!r.ok) { show(fail('못 적었다', r), true); return; }
      show(s.key + ' 를 적었다', false); state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    cell(tr, inline(save, close), 'act');
    return tr;
  }

  async function move(s, direction) {
    var r = await call('POST', '/admin/faqs/sheets/' + s.key + '/move', { direction: direction });
    if (!r.ok) show(fail('못 옮겼다', r), true); load();
  }

  function render() {
    var body = document.getElementById('sheets'); body.innerHTML = '';
    var rows = state.data.sheets;
    rows.forEach(function (s, i) { body.appendChild(sheetRow(s, i, rows.length)); });
    if (rows.length === 0) { var tr = el('tr'); var td = cell(tr, '없다', 'empty'); td.colSpan = 5; body.appendChild(tr); }
  }

  document.getElementById('c-add').addEventListener('click', async function () {
    var key = document.getElementById('c-key'), title = document.getElementById('c-title');
    var r = await call('POST', '/admin/faqs/sheets', { key: key.value.trim(), title: title.value });
    if (!r.ok) { show(fail('더하지 못했다', r), true); return; }
    show(key.value.trim() + ' 를 더했다', false); key.value = ''; title.value = ''; load();
  });

  async function load() {
    var r = await call('GET', '/admin/faqs/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    state.data = r.json;
    document.getElementById('stat-sheets').textContent = r.json.sheets.length;
    document.getElementById('stat-items').textContent = r.json.items.length;
    document.getElementById('stat-updated').textContent = r.json.updatedAt ? when(r.json.updatedAt) : '없음';
    render();
  }
  load();
</script>`,
)

/**
 * FAQ 묶음 하나의 문항. 위에 새 문항 폼, 그 아래 문항 목록이다. 수정을 누르면 그 문항 아래에 질문과 답 입력이 펼쳐진다.
 *
 * 묶음 key 는 주소의 끝에서 읽는다. 답은 글 한 칸이고 빈 줄로 문단을 나눈다. 서버가 문단 블록으로 바꾸므로,
 * 고칠 때는 블록의 글을 빈 줄로 이어 채운다.
 */
export const FAQ_SHEET_HTML = layout(
  '/admin/faqs',
  'FAQ 묶음',
  `<div class="head">
  <div>
    <h1 id="title">FAQ 묶음</h1>
    <p><span id="key" class="tag mono"></span> 문항은 이 차례로 시트에 선다. 답은 빈 줄로 문단을 나누고, 문단 안의 줄바꿈은 그대로 남는다.</p>
  </div>
  <div><a class="btn ghost sm" href="/admin/faqs">목록으로</a></div>
</div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 문항</h2><p>맨 뒤에 선다</p></header>
  <div class="body">
    <div class="field"><label for="c-question">질문</label><input id="c-question" maxlength="200"></div>
    <div class="field"><label for="c-answer">답 <small>빈 줄로 문단을 나눈다</small></label><textarea id="c-answer" maxlength="5000"></textarea></div>
    <div class="actions"><button id="c-add" class="btn" type="button">문항 추가</button></div>
  </div>
</section>
<section class="card">
  <header><h2>문항</h2><p id="count"></p></header>
  <div id="items" class="list"></div>
</section>
<script>
  var KEY = location.pathname.split('/').pop();
  var state = { items: [], editing: null };

  function answerText(blocks) { return blocks.map(function (b) { return b.text; }).join('\\n\\n'); }

  function itemCard(it, i, total) {
    var card = el('article', undefined, 'item');
    var top = el('div', undefined, 'top');
    top.appendChild(span(String(i + 1), 'tag mono')); top.appendChild(el('h3', it.question));
    card.appendChild(top);
    if (state.editing !== it.id) {
      card.appendChild(el('p', answerText(it.answer), 'text'));
      var up = button('↑', 'btn ghost sm'), down = button('↓', 'btn ghost sm'), edit = button('수정', 'btn ghost sm'), del = button('삭제', 'btn danger sm');
      up.disabled = i === 0; down.disabled = i === total - 1;
      up.addEventListener('click', function () { move(it, 'up'); });
      down.addEventListener('click', function () { move(it, 'down'); });
      edit.addEventListener('click', function () { state.editing = it.id; render(); });
      del.addEventListener('click', async function () {
        if (!window.confirm('‘' + it.question + '’ 문항을 지운다. 되돌릴 수 없다.')) return;
        var r = await call('DELETE', '/admin/faqs/items/' + it.id);
        show(r.ok ? '지웠다' : fail('못 지웠다', r), !r.ok); load();
      });
      card.appendChild(inline(up, down, edit, del));
      return card;
    }
    var form = el('div', undefined, 'sub');
    var question = input('text'); question.value = it.question; question.maxLength = 200;
    var answer = el('textarea'); answer.value = answerText(it.answer); answer.maxLength = 5000;
    form.appendChild(field('질문', null, question)); form.appendChild(field('답', '빈 줄로 문단을 나눈다', answer));
    var save = button('저장', 'btn sm'), close = button('닫기', 'btn ghost sm');
    save.addEventListener('click', async function () {
      var r = await call('PUT', '/admin/faqs/items/' + it.id, { question: question.value, answer: answer.value });
      if (!r.ok) { show(fail('못 적었다', r), true); return; }
      show('적었다', false); state.editing = null; load();
    });
    close.addEventListener('click', function () { state.editing = null; render(); });
    form.appendChild(inline(save, close));
    card.appendChild(form);
    return card;
  }

  async function move(it, direction) {
    var r = await call('POST', '/admin/faqs/items/' + it.id + '/move', { direction: direction });
    if (!r.ok) show(fail('못 옮겼다', r), true); load();
  }

  function render() {
    var list = document.getElementById('items'); list.innerHTML = '';
    state.items.forEach(function (it, i) { list.appendChild(itemCard(it, i, state.items.length)); });
    if (state.items.length === 0) list.appendChild(el('div', '문항이 없다. 앱은 이 묶음의 물음표를 숨긴다', 'empty-text'));
  }

  document.getElementById('c-add').addEventListener('click', async function () {
    var question = document.getElementById('c-question'), answer = document.getElementById('c-answer');
    var r = await call('POST', '/admin/faqs/sheets/' + KEY + '/items', { question: question.value, answer: answer.value });
    if (!r.ok) { show(fail('더하지 못했다', r), true); return; }
    show('문항을 더했다', false); question.value = ''; answer.value = ''; load();
  });

  async function load() {
    var r = await call('GET', '/admin/faqs/rows');
    if (!r.ok) { show('못 읽었다 ' + r.status, true); return; }
    var sheet = r.json.sheets.filter(function (s) { return s.key === KEY; })[0];
    document.getElementById('key').textContent = KEY;
    if (!sheet) { show('모르는 묶음이다: ' + KEY, true); document.getElementById('c-add').disabled = true; return; }
    state.items = r.json.items.filter(function (it) { return it.sheet === KEY; });
    document.getElementById('title').textContent = sheet.title;
    document.getElementById('count').textContent = state.items.length + '개';
    render();
  }
  load();
</script>`,
)
