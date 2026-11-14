import { layout } from './layout'

/**
 * 운영자 공지. 위는 쓰는 폼, 아래는 쓴 것을 고치는 목록이다.
 *
 * 알림은 기본이 꺼짐이다. 켜면 지금 보내거나 시각을 예약한다. 수정 폼에는 예약이 없고, 오타를 고칠 때마다
 * 트레이가 울리지 않게 알림이 기본 꺼짐이다. 예약 시각은 datetime-local 을 KST 로 읽어 ISO 로 바꿔 보낸다.
 *
 * 내용은 마크다운이고 서버가 블록으로 바꾼다. 저장하면 곧바로 앱에 보여서, 입력 칸 아래에 서버가 바꾼 블록을 미리 그린다.
 * 그림은 브라우저가 가로 1080px 이하 WebP 로 줄여 올린다. 폰 스크린샷 원본은 그림 상한 1MB 를 넘는다.
 */
export const NOTICES_HTML = layout(
  '/admin/notices',
  '공지',
  `<div class="head"><div><h1>공지</h1><p>운영자 공지를 쓰고 고친다. 저장이 먼저고 알림은 켠 때만 간다. 넥슨 공지는 여기 안 나온다.</p></div></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="card">
  <header><h2>새 공지</h2><p>알림은 기본 꺼짐. 켜면 지금 보내거나 시각을 예약한다</p></header>
  <div class="body">
    <div class="field"><label for="title">제목</label><input id="title" type="text" maxlength="200"></div>
    <div class="field"><label for="markdown">내용 <small>마크다운. ## 소제목 · 빈 줄로 문단 · [글](주소) 링크 · 표</small></label><textarea id="markdown" maxlength="10000"></textarea></div>
    <div class="row"><button id="upload" class="btn ghost sm" type="button">그림 올리기</button></div>
    <div class="field"><label>미리 보기 <small>저장하면 앱에 이대로 보인다</small></label><div id="preview" class="item"></div></div>
    <div class="field"><label for="link">링크 <small>선택</small></label><input id="link" type="url" placeholder="https://"></div>
    <label class="check"><input id="push" type="checkbox"> 알림 보내기</label>
    <div id="push-fields" class="sub" hidden>
      <div class="row">
        <label class="check"><input type="radio" name="when" value="now" checked> 지금</label>
        <label class="check"><input type="radio" name="when" value="later"> 예약</label>
        <input id="scheduled" type="datetime-local" class="w-auto">
      </div>
      <div class="grid2">
        <div class="field"><label for="push-title">알림 제목 <small>비우면 공지 제목</small></label><input id="push-title" type="text" maxlength="100"></div>
        <div class="field"><label for="push-body">알림 문구 <small>비우면 본문 글 앞 200자</small></label><input id="push-body" type="text" maxlength="200"></div>
      </div>
    </div>
    <div class="actions"><button id="create" class="btn" type="button">저장</button></div>
  </div>
</section>
<section class="card">
  <header><h2>쓴 공지</h2><p id="list-count"></p></header>
  <div id="list" class="list"></div>
</section>
<script>
  var pushBox = document.getElementById('push');
  pushBox.addEventListener('change', function () {
    document.getElementById('push-fields').hidden = !pushBox.checked;
  });
  function orNull(value) { return value.trim() === '' ? null : value.trim(); }
  // 가로 1080px 이하로 줄여 WebP 로 만든다. WebP 를 못 만드는 브라우저는 JPEG 로 만든다.
  async function shrink(file) {
    var bitmap = await createImageBitmap(file);
    var scale = Math.min(1, 1080 / bitmap.width);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    var webp = await new Promise(function (done) { canvas.toBlob(done, 'image/webp', 0.9); });
    if (webp && webp.type === 'image/webp') return webp;
    return await new Promise(function (done) { canvas.toBlob(done, 'image/jpeg', 0.9); });
  }
  // 커서 자리에 한 줄을 넣고 앞뒤를 빈 줄로 띄운다. 그림이 문단 하나가 된다.
  function insertLine(area, line) {
    var before = area.value.slice(0, area.selectionStart), after = area.value.slice(area.selectionEnd);
    var lead = before === '' || /\\n\\n$/.test(before) ? '' : /\\n$/.test(before) ? '\\n' : '\\n\\n';
    var text = lead + line + '\\n\\n';
    area.value = before + text + after;
    area.selectionStart = area.selectionEnd = (before + text).length;
    area.focus();
  }
  function blockEl(b) {
    if (b.type === 'heading') return el('h3', b.text);
    if (b.type === 'text') return el('p', b.text, 'text');
    if (b.type === 'image') { var img = el('img'); img.src = b.src; img.alt = ''; img.style.maxWidth = '100%'; return img; }
    if (b.type === 'link') { var a = el('a', b.text); a.href = b.href; a.target = '_blank'; a.rel = 'noopener'; return a; }
    var t = el('table');
    b.rows.forEach(function (row, i) { var tr = el('tr'); row.forEach(function (c) { tr.appendChild(el(i === 0 ? 'th' : 'td', c)); }); t.appendChild(tr); });
    return t;
  }
  // 본문 칸 하나에 그림 올리기와 미리 보기를 붙인다. 쓰기 폼과 고치기 폼이 같이 쓴다.
  function attachEditor(area, upload, preview) {
    preview.style.maxWidth = '390px';
    var seq = 0;
    async function render() {
      var mine = ++seq;
      if (area.value.trim() === '') { preview.replaceChildren(el('p', '내용을 쓰면 앱에 보일 모양이 여기 나온다', 'text')); return; }
      var r = await call('POST', '/admin/notices/preview', { markdown: area.value });
      if (mine !== seq) return;
      if (!r.ok) { preview.replaceChildren(el('p', '저장할 수 없다 ' + r.status + '\\n' + ((r.json && r.json.message) || r.text), 'text')); return; }
      preview.replaceChildren.apply(preview, r.json.blocks.map(blockEl));
    }
    var timer = null;
    area.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(render, 400); });
    var file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    upload.after(file);
    upload.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', async function () {
      var picked = file.files[0]; file.value = '';
      if (!picked) return;
      upload.disabled = true;
      try {
        var blob = await shrink(picked);
        var res = await fetch('/admin/notices/images', { method: 'PUT', headers: { 'content-type': blob.type }, body: blob });
        if (!res.ok) { show('그림을 못 올렸다 ' + res.status + '\\n' + (await res.text()), true); return; }
        insertLine(area, '![](' + (await res.json()).url + ')');
        render();
      } catch (e) {
        show('그림을 못 읽었다 ' + e.message, true);
      } finally {
        upload.disabled = false;
      }
    });
    render();
    return render;
  }
  var renderPreview = attachEditor(document.getElementById('markdown'), document.getElementById('upload'), document.getElementById('preview'));
  function pushOf(prefix, withSchedule) {
    var box = document.getElementById(prefix + 'push');
    if (!box.checked) return null;
    var push = { title: orNull(document.getElementById(prefix + 'push-title').value), body: orNull(document.getElementById(prefix + 'push-body').value) };
    if (withSchedule) {
      var later = document.querySelector('input[name=when]:checked').value === 'later';
      var local = document.getElementById('scheduled').value;
      if (later && !local) throw new Error('예약 시각을 고른다');
      push.scheduledAt = later ? kstLocalToIso(local) : null;
      if (later && push.scheduledAt === null) throw new Error('예약 시각 모양이 틀리다');
    }
    return push;
  }
  document.getElementById('create').addEventListener('click', async function () {
    var payload;
    try {
      payload = { title: document.getElementById('title').value, markdown: document.getElementById('markdown').value, link: orNull(document.getElementById('link').value), push: pushOf('', true) };
    } catch (e) { show(e.message, true); return; }
    var r = await call('POST', '/admin/notices', payload);
    if (!r.ok) { show('저장하지 못했다 ' + r.status + '\\n' + r.text, true); return; }
    show('저장했다 ' + r.json.noticeKey + (r.json.messageId ? ' · 알림 보냄' : payload.push ? ' · 알림 예약' : ''), false);
    document.getElementById('title').value = ''; document.getElementById('markdown').value = ''; document.getElementById('link').value = '';
    renderPreview(); load();
  });
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function field(label, input) { var d = el('div', undefined, 'field'); d.appendChild(el('label', label)); d.appendChild(input); return d; }
  function render(rows) {
    var list = document.getElementById('list'); list.innerHTML = '';
    document.getElementById('list-count').textContent = rows.length + '줄';
    if (rows.length === 0) { list.appendChild(el('p', '아직 없다', 'empty-text')); return; }
    rows.forEach(function (row) {
      var card = el('article', undefined, 'item');
      var top = el('div', undefined, 'top'); top.appendChild(el('h3', row.title));
      top.appendChild(row.sentAt ? el('span', '알림 보냄', 'tag ok') : row.scheduledAt ? el('span', '예약', 'tag accent') : el('span', '알림 없음', 'tag'));
      card.appendChild(top);
      var meta = el('div', undefined, 'meta');
      meta.appendChild(el('span', row.noticeKey, 'mono'));
      meta.appendChild(el('span', '올림 ' + when(row.publishedAt)));
      if (row.sentAt) meta.appendChild(el('span', '알림 ' + when(row.sentAt)));
      else if (row.scheduledAt) meta.appendChild(el('span', '예약 ' + when(row.scheduledAt)));
      if (row.pushTitle || row.pushBody) meta.appendChild(el('span', '문구 ‘' + (row.pushTitle || row.title) + ' / ' + (row.pushBody || '') + '’'));
      card.appendChild(meta);
      card.appendChild(el('p', row.body, 'text'));
      if (row.link) { var a = el('a', row.link); a.href = row.link; card.appendChild(a); }
      var actions = el('div', undefined, 'actions');
      var edit = el('button', '수정', 'btn ghost sm'); edit.type = 'button'; actions.appendChild(edit);
      var del = el('button', '삭제', 'btn danger sm'); del.type = 'button'; actions.appendChild(del);
      if (row.scheduledAt && !row.sentAt) { var cancel = el('button', '예약 취소', 'btn ghost sm'); cancel.type = 'button'; actions.appendChild(cancel);
        cancel.addEventListener('click', async function () {
          var r = await call('DELETE', '/admin/notices/' + row.id + '/schedule');
          show(r.ok ? '예약을 내렸다. 공지는 남는다' : '못 내렸다 ' + r.status, !r.ok); load();
        }); }
      card.appendChild(actions);
      del.addEventListener('click', async function () {
        if (!window.confirm('‘' + row.title + '’ 을 지운다. 되돌릴 수 없다.')) return;
        var r = await call('DELETE', '/admin/notices/' + row.id);
        show(r.ok ? '지웠다' : '못 지웠다 ' + r.status, !r.ok); load();
      });
      edit.addEventListener('click', function () {
        if (card.querySelector('form')) return;
        var form = document.createElement('form'); form.className = 'sub'; form.addEventListener('submit', function (e) { e.preventDefault(); });
        var t = document.createElement('input'); t.type = 'text'; t.value = row.title; t.maxLength = 200;
        // 마크다운 이전에 쓴 공지는 원문이 없어 평문 body 를 연다.
        var b = document.createElement('textarea'); b.value = row.markdown === null ? row.body : row.markdown; b.maxLength = 10000;
        var up = button('그림 올리기', 'btn ghost sm'); var pv = el('div', undefined, 'item');
        var l = document.createElement('input'); l.type = 'url'; l.value = row.link || '';
        var p = document.createElement('input'); p.type = 'checkbox'; p.id = 'e' + row.id + 'push';
        var pt = document.createElement('input'); pt.type = 'text'; pt.id = 'e' + row.id + 'push-title'; pt.maxLength = 100;
        var pb = document.createElement('input'); pb.type = 'text'; pb.id = 'e' + row.id + 'push-body'; pb.maxLength = 200;
        form.appendChild(field('제목', t)); form.appendChild(field('내용', b)); form.appendChild(inline(up));
        form.appendChild(field('미리 보기', pv)); form.appendChild(field('링크', l));
        var pl = el('label', undefined, 'check'); pl.appendChild(p); pl.appendChild(document.createTextNode(' 알림 다시 보내기 (기본 꺼짐)')); form.appendChild(pl);
        var grid = el('div', undefined, 'grid2'); grid.appendChild(field('알림 제목', pt)); grid.appendChild(field('알림 문구', pb)); form.appendChild(grid);
        var acts = el('div', undefined, 'actions');
        var save = el('button', '고치기', 'btn'); save.type = 'button'; var close = el('button', '닫기', 'btn ghost'); close.type = 'button';
        acts.appendChild(save); acts.appendChild(close); form.appendChild(acts);
        close.addEventListener('click', function () { form.remove(); });
        save.addEventListener('click', async function () {
          var r = await call('PATCH', '/admin/notices/' + row.id, { title: t.value, markdown: b.value, link: orNull(l.value), push: pushOf('e' + row.id, false) });
          show(r.ok ? '고쳤다' + (r.json && r.json.messageId ? ' · 알림 보냄' : '') : '못 고쳤다 ' + r.status + '\\n' + r.text, !r.ok); load();
        });
        card.appendChild(form);
        attachEditor(b, up, pv);
      });
      list.appendChild(card);
    });
  }
  async function load() { var r = await call('GET', '/admin/notices/rows'); render(r.json ? r.json.rows : []); }
  load();
</script>`,
)
