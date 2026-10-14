/**
 * 관리자 화면 둘 중 손보는 자리. 쓴 공지를 세우고 고치고 지운다.
 *
 * **수정 폼이 카드 자리에서 펼쳐진다.** 화면을 또 하나 두지 않는 이유는 고치는 일이 목록을
 * 보다가 생기기 때문이다. 다녀오는 길이 있으면 어느 글을 고치고 있었는지를 화면이 잊는다.
 *
 * 값은 전부 `textContent` 와 `value` 로 넣는다. 공지 본문이 HTML 로 해석되는 길이 없다.
 */
import { adminNav, ADMIN_STYLE } from './admin-page.ts'

export const ADMIN_LIST_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>공지 목록</title>
<style>${ADMIN_STYLE}
  .item { padding:14px 16px; border:1px solid var(--line); border-radius:10px; margin-bottom:12px; }
  .item h2 { font-size:16px; margin:2px 0 6px; }
  .when { font-size:12px; color:var(--muted); }
  .body { margin:0; font-size:14px; color:var(--muted); white-space:pre-wrap;
          display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .push { margin:10px 0 0; font-size:12px; color:var(--muted); white-space:pre-wrap; }
  .item .row { margin-top:12px; justify-content:flex-end; }
  .item button { flex:0 0 auto; padding:8px 14px; font-size:14px; }
  .del { background:transparent; color:var(--err); border:1px solid var(--line); }
  .item label { margin-top:12px; }
  .item textarea { min-height:140px; }
  .item .f-push-body { min-height:70px; }
  .item fieldset { margin-top:16px; }
  .empty, .loading { padding:28px 0; text-align:center; color:var(--muted); }
</style>
</head>
<body>
<main>
  <h1>공지 목록</h1>
  ${adminNav('list')}

  <div id="list"><p class="loading">불러오는 중…</p></div>
  <div id="out"></div>
</main>

<script>
const list = document.getElementById('list');
const out = document.getElementById('out');

/** 지금 화면에 선 것. 수정을 취소하면 여기서 원래 값을 되찾는다. */
let items = [];

function show(kind, text) { out.className = kind; out.textContent = text; }

function when(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return (d.getMonth() + 1) + '/' + d.getDate() + '(' + day + ') ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const VIEW = [
  '<div class="when"></div>',
  '<h2 class="title"></h2>',
  '<p class="body"></p>',
  '<p class="push"></p>',
  '<div class="row">',
  '<button class="dry act-unschedule" type="button" hidden>예약 취소</button>',
  '<button class="dry act-edit" type="button">수정</button>',
  '<button class="del act-del" type="button">삭제</button>',
  '</div>',
].join('');

const EDIT = [
  '<label>제목</label>',
  '<input class="f-title" type="text" autocomplete="off">',
  '<label>내용 <span class="hint">줄바꿈이 그대로 보입니다</span></label>',
  '<textarea class="f-body"></textarea>',
  '<fieldset>',
  '<legend>알림</legend>',
  '<label class="check"><input class="f-push" type="checkbox"><span>고친 내용을 알림으로 다시 보내기</span></label>',
  '<label>알림 제목</label>',
  '<input class="f-push-title" type="text" autocomplete="off">',
  '<label>알림 내용 <span class="hint">트레이에 한두 줄로 뜹니다</span></label>',
  '<textarea class="f-push-body"></textarea>',
  '</fieldset>',
  '<div class="row">',
  '<button class="dry act-cancel" type="button">취소</button>',
  '<button class="send act-save" type="button">수정 저장</button>',
  '</div>',
].join('');

/** 알림이 어디까지 갔나. 보낸 것 · 시각을 잡아 둔 것 · 안 보낸 것 셋이다. */
function pending(notice) {
  return notice.sentAt === null && notice.scheduledAt !== null;
}

function card(notice) {
  const el = document.createElement('article');
  el.className = 'item';
  el.dataset.id = notice.id;
  el.innerHTML = VIEW;

  const state = notice.sentAt !== null
    ? ' · 알림 보냄'
    : pending(notice) ? ' · 알림 예약 ' + when(notice.scheduledAt) : ' · 알림 안 보냄';

  el.querySelector('.when').textContent = when(notice.publishedAt) + state;
  el.querySelector('.title').textContent = notice.title;
  el.querySelector('.body').textContent = notice.body;
  // 그때 뭐라고 보냈나. 공지 문구와 다를 수 있어 따로 남는 기록이다. 예약 중이면 보낼 문구다.
  el.querySelector('.push').textContent =
    notice.sentAt !== null
      ? '보낸 알림  ' + notice.pushTitle + '\\n' + notice.pushBody
      : pending(notice) ? '보낼 알림  ' + notice.pushTitle + '\\n' + notice.pushBody : '';
  // 예약을 내리는 단추는 예약이 걸린 카드에만 선다. 나간 알림은 못 거둔다.
  el.querySelector('.act-unschedule').hidden = !pending(notice);

  return el;
}

function render() {
  list.textContent = '';
  if (items.length === 0) {
    list.innerHTML = '<p class="empty">아직 쓴 공지가 없습니다.</p>';
    return;
  }
  for (const notice of items) list.append(card(notice));
}

async function load() {
  try {
    const res = await fetch('/admin/notices');
    const data = await res.json();
    if (!res.ok) { show('err', data.error ?? ('실패 ' + res.status)); return; }
    items = data.items;
    render();
  } catch (e) {
    list.textContent = '';
    show('err', String(e));
  }
}

function openEdit(el, notice) {
  el.innerHTML = EDIT;
  el.querySelector('.f-title').value = notice.title;
  el.querySelector('.f-body').value = notice.body;

  // 알림을 안 보낼 거면 그 칸들을 흐리게 둔다. 왜 안 채워도 되는지가 눈에 보인다.
  const check = el.querySelector('.f-push');
  const sync = () => {
    for (const one of el.querySelectorAll('.f-push-title, .f-push-body')) {
      one.disabled = !check.checked;
      one.style.opacity = check.checked ? '1' : '.5';
    }
  };
  check.addEventListener('change', sync);
  sync();
}

async function save(el, id) {
  const buttons = el.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  show('', '저장하는 중…');

  try {
    const res = await fetch('/admin/notices/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: el.querySelector('.f-title').value,
        body: el.querySelector('.f-body').value,
        pushTitle: el.querySelector('.f-push-title').value,
        pushBody: el.querySelector('.f-push-body').value,
        push: el.querySelector('.f-push').checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) { show('err', data.error ?? ('실패 ' + res.status)); return; }

    show('ok', data.sent ? '고치고 알림을 보냈습니다' : '고쳤습니다');
    await load();
  } catch (e) {
    show('err', String(e));
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function unschedule(id) {
  // 다시 예약하는 길은 없다. 시각을 바꾸려면 취소하고 새로 쓴다.
  if (!confirm('알림 예약을 내립니다. 공지는 남고, 다시 예약할 수는 없습니다.')) return;
  show('', '예약을 내리는 중…');

  try {
    const res = await fetch('/admin/notices/' + encodeURIComponent(id) + '/schedule', { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { show('err', data.error ?? ('실패 ' + res.status)); return; }

    show('ok', '예약을 내렸습니다');
    await load();
  } catch (e) {
    show('err', String(e));
  }
}

async function remove(id) {
  // 되돌릴 수 없다. 지운 공지는 앱이 다음에 목록을 받을 때 기기에서도 사라진다.
  if (!confirm('이 공지를 지웁니다. 되돌릴 수 없습니다.')) return;
  show('', '지우는 중…');

  try {
    const res = await fetch('/admin/notices/' + encodeURIComponent(id), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { show('err', data.error ?? ('실패 ' + res.status)); return; }

    show('ok', '지웠습니다');
    await load();
  } catch (e) {
    show('err', String(e));
  }
}

list.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button === null) return;

  const el = button.closest('.item');
  const id = el.dataset.id;
  const notice = items.find((one) => one.id === id);
  if (notice === undefined) return;

  if (button.classList.contains('act-edit')) openEdit(el, notice);
  else if (button.classList.contains('act-unschedule')) unschedule(id);
  else if (button.classList.contains('act-del')) remove(id);
  else if (button.classList.contains('act-cancel')) el.replaceWith(card(notice));
  else if (button.classList.contains('act-save')) save(el, id);
});

load();
</script>
</body>
</html>`
