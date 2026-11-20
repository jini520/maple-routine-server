import { layout } from './layout'

/**
 * 운영자 공지. 쓴 공지의 목록 하나이고, 쓰기와 고치기는 넓은 작은 창에서 한다. 창의 왼쪽이 입력, 오른쪽이 앱에 보일 미리 보기다.
 *
 * 올리는 시각을 예약하면 그 시각 전에는 앱에 보이지 않고, 켠 알림도 그 시각에 간다. 알림은 기본 꺼짐이다. 올라간 공지를 고칠
 * 때 오타마다 트레이가 울리지 않게 하려는 것이다. 예약 시각은 datetime-local 을 KST 로 읽어 ISO 로 바꿔 보낸다.
 *
 * 내용은 마크다운이고 서버가 블록으로 바꾼다. 그림은 브라우저가 가로 1080px 이하 WebP 로 줄여 올린다. 폰 스크린샷 원본은 그림
 * 상한 1MB 를 넘는다.
 */
export const NOTICES_HTML = layout(
  '/admin/notices',
  '공지',
  `<div class="top"><h1>공지</h1><span class="grow"></span><button id="create" class="btn" type="button">새 공지</button></div>
<div id="message" class="msg" role="status" hidden></div>
<section class="panel">
  <div class="panel-head"><p>운영자 공지다. 넥슨 공지는 여기 안 나온다. 예약한 공지는 올리는 시각 전에는 앱에 보이지 않는다</p></div>
  <table class="sheet"><thead><tr><th>상태</th><th>제목</th><th>올리는 시각</th><th>알림</th><th></th></tr></thead><tbody id="rows"></tbody></table>
</section>
<style>
  .form-dialog.wide { width: min(1040px, calc(100vw - 32px)) }
  .editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 20px; align-items: start }
  .editor-grid textarea { min-height: 260px }
  .editor-grid .preview { max-height: 62vh; overflow: auto; padding: 12px; border-radius: 10px; background: var(--surface-2) }
  .when { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px }
  @media (max-width: 900px) { .editor-grid { grid-template-columns: 1fr } }
</style>
<script>
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
  // ISO 시각을 datetime-local 의 KST 글자로. 예약한 공지를 고칠 때 칸을 채운다.
  function isoToKstLocal(iso) { var d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000); return d.toISOString().slice(0, 16); }
  function scheduled(row) { return new Date(row.publishedAt).getTime() > Date.now(); }
  // 쓰기와 고치기가 같이 쓰는 창. row 가 없으면 새 공지다.
  function openEditor(row) {
    var grid = el('div', undefined, 'editor-grid'), left = el('div', undefined, 'form-body'), right = el('div');
    var t = input('text'); t.maxLength = 200; t.value = row ? row.title : '';
    // 마크다운 이전에 쓴 공지는 원문이 없어 평문 body 를 연다.
    var b = el('textarea'); b.maxLength = 10000; b.value = row ? (row.markdown === null ? row.body : row.markdown) : '';
    var up = button('그림 올리기', 'btn ghost sm');
    var l = input('url'); l.placeholder = 'https://'; l.value = row && row.link ? row.link : '';
    left.appendChild(field('제목', undefined, t));
    left.appendChild(field('내용', '마크다운. ## 소제목 · 빈 줄로 문단 · [글](주소) 링크 · 표', b));
    left.appendChild(inline(up));
    left.appendChild(field('링크', '선택', l));
    var canSchedule = !row || scheduled(row);
    var later = input('checkbox'), at = input('datetime-local');
    if (canSchedule) {
      later.checked = !!row; at.value = row ? isoToKstLocal(row.publishedAt) : ''; at.disabled = !later.checked;
      later.addEventListener('change', function () { at.disabled = !later.checked; });
      var wl = el('label', undefined, 'check'); wl.appendChild(later); wl.appendChild(document.createTextNode(' 예약해서 올리기'));
      var whenBox = el('div', undefined, 'when'); whenBox.appendChild(wl); whenBox.appendChild(at);
      left.appendChild(field('올리는 시각', '예약하면 그 시각 전에는 앱에 보이지 않는다', whenBox));
    }
    var p = input('checkbox'); p.checked = !!(row && scheduled(row) && row.scheduledAt);
    var pt = input('text'); pt.maxLength = 100; pt.placeholder = '비우면 공지 제목'; pt.value = row && row.pushTitle ? row.pushTitle : '';
    var pb = input('text'); pb.maxLength = 200; pb.placeholder = '비우면 본문 글 앞 200자'; pb.value = row && row.pushBody ? row.pushBody : '';
    var pl = el('label', undefined, 'check'); pl.appendChild(p);
    pl.appendChild(document.createTextNode(row && !scheduled(row) ? ' 알림 다시 보내기 (지금 간다)' : ' 알림 보내기 (올리는 시각에 간다)'));
    left.appendChild(pl);
    var pg = el('div', undefined, 'grid2'); pg.appendChild(field('알림 제목', undefined, pt)); pg.appendChild(field('알림 문구', undefined, pb)); left.appendChild(pg);
    var go = button(row ? '고치기' : '저장', 'btn'); left.appendChild(go);
    var pv = el('div', undefined, 'item preview');
    right.appendChild(field('미리 보기', '저장하면 앱에 이대로 보인다', pv));
    grid.appendChild(left); grid.appendChild(right);
    var d = openForm(row ? '공지 고치기' : '새 공지', grid); d.classList.add('wide');
    attachEditor(b, up, pv);
    go.addEventListener('click', async function () {
      var publishAt = null;
      if (canSchedule && later.checked) {
        publishAt = kstLocalToIso(at.value);
        if (publishAt === null) { show('올리는 시각을 고른다', true); return; }
      }
      var payload = { title: t.value, markdown: b.value, link: orNull(l.value), publishAt: publishAt, push: p.checked ? { title: orNull(pt.value), body: orNull(pb.value) } : null };
      // 저장 중에 한 번 더 누르면 같은 공지가 둘 생긴다.
      go.disabled = true;
      var r = row ? await call('PATCH', '/admin/notices/' + row.id, payload) : await call('POST', '/admin/notices', payload);
      go.disabled = false;
      if (!r.ok) { show('저장하지 못했다 ' + r.status + '\\n' + r.text, true); return; }
      show((row ? '고쳤다' : '저장했다') + (publishAt ? ' · ' + when(publishAt) + ' 에 올라간다' : '') + (r.json && r.json.messageId ? ' · 알림 보냄' : ''), false);
      d.close(); load();
    });
  }
  document.getElementById('create').addEventListener('click', function () { openEditor(null); });
  function render(rows) {
    var tb = document.getElementById('rows'); tb.innerHTML = '';
    if (rows.length === 0) { var tr0 = el('tr'); var td0 = cell(tr0, '아직 없다', 'empty'); td0.colSpan = 5; tb.appendChild(tr0); return; }
    rows.forEach(function (row) {
      var tr = el('tr'), future = scheduled(row);
      cell(tr, future ? span('예약', 'tag accent') : span('올라감', 'tag ok'));
      var title = span(row.title); title.title = row.body; cell(tr, title);
      cell(tr, when(row.publishedAt), 'mono');
      cell(tr, row.sentAt ? '보냄 ' + when(row.sentAt) : row.scheduledAt ? '올라갈 때 보냄' : span('없음', 'dim'));
      var edit = button('고치기', 'btn ghost sm'), del = button('지우기', 'btn danger sm row-act');
      edit.addEventListener('click', function () { openEditor(row); });
      del.addEventListener('click', async function () {
        if (!window.confirm('‘' + row.title + '’ 을 지운다. 되돌릴 수 없다.')) return;
        var r = await call('DELETE', '/admin/notices/' + row.id); show(r.ok ? '지웠다' : '못 지웠다 ' + r.status, !r.ok); load();
      });
      var acts = [edit];
      if (future) {
        var now = button('지금 올리기', 'btn sm');
        now.addEventListener('click', async function () {
          if (!window.confirm('‘' + row.title + '’ 을 지금 올린다.' + (row.scheduledAt ? ' 알림도 지금 간다.' : ''))) return;
          var r = await call('POST', '/admin/notices/' + row.id + '/publish'); show(r.ok ? '지금 올렸다' : fail('못 올렸다', r), !r.ok); load();
        });
        acts.push(now);
      }
      acts.push(del);
      cell(tr, inline.apply(null, acts), 'act'); tb.appendChild(tr);
    });
  }
  async function load() { var r = await call('GET', '/admin/notices/rows'); render(r.json ? r.json.rows : []); }
  load();
</script>`,
)
