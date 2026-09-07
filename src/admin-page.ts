/**
 * 관리자 화면 한 장. 빌드 도구 없이 문자열로 든다.
 *
 * 화면이 하나뿐이고 폼 다섯 칸이 전부라, 번들러와 프레임워크를 들이면 얻는 것보다 늘어나는
 * 것이 많다. 이 파일이 곧 화면이다.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>공지 작성</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#1a1a1a; --muted:#6b7280;
          --line:#d1d5db; --accent:#2563eb; --ok:#059669; --err:#dc2626; --field:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#14161a; --fg:#e8eaed; --muted:#9aa0a6; --line:#3c4043;
            --accent:#60a5fa; --ok:#34d399; --err:#f87171; --field:#1c1f24; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px 16px 48px; background:var(--bg); color:var(--fg);
         font:15px/1.55 -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  main { max-width:640px; margin:0 auto; }
  h1 { font-size:19px; margin:0 0 20px; }
  label { display:block; margin:16px 0 6px; font-size:13px; font-weight:600; }
  .hint { font-weight:400; color:var(--muted); }
  input[type=text], textarea {
    width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px;
    background:var(--field); color:var(--fg); font:inherit; }
  textarea { min-height:180px; resize:vertical; line-height:1.6; }
  #pushBody { min-height:80px; }
  fieldset { margin:24px 0 0; padding:16px; border:1px solid var(--line); border-radius:10px; }
  legend { padding:0 6px; font-size:13px; font-weight:600; }
  .check { display:flex; align-items:center; gap:8px; margin:0; font-size:14px; }
  .check input { width:18px; height:18px; }
  .row { display:flex; gap:8px; margin-top:24px; }
  button { flex:1; padding:12px; border:0; border-radius:8px; font:inherit; font-weight:600;
           cursor:pointer; }
  .send { background:var(--accent); color:#fff; }
  .dry { background:transparent; color:var(--fg); border:1px solid var(--line); }
  button:disabled { opacity:.5; cursor:default; }
  #out { margin-top:16px; padding:12px; border-radius:8px; font-size:14px;
         white-space:pre-wrap; word-break:break-all; }
  #out.ok { background:color-mix(in srgb, var(--ok) 14%, transparent); color:var(--ok); }
  #out.err { background:color-mix(in srgb, var(--err) 14%, transparent); color:var(--err); }
  #out:empty { display:none; }
</style>
</head>
<body>
<main>
  <h1>공지 작성</h1>

  <label for="title">제목</label>
  <input id="title" type="text" autocomplete="off">

  <label for="body">내용 <span class="hint">줄바꿈이 그대로 보입니다</span></label>
  <textarea id="body"></textarea>

  <fieldset>
    <legend>알림</legend>
    <label class="check" for="push">
      <input id="push" type="checkbox">
      <span>알림 전송</span>
    </label>

    <label for="pushTitle">알림 제목</label>
    <input id="pushTitle" type="text" autocomplete="off">

    <label for="pushBody">알림 내용 <span class="hint">트레이에 한두 줄로 뜹니다</span></label>
    <textarea id="pushBody"></textarea>
  </fieldset>

  <div class="row">
    <button class="dry" id="btnDry" type="button">검증만</button>
    <button class="send" id="btnSend" type="button">저장하고 보내기</button>
  </div>

  <div id="out"></div>
</main>

<script>
const $ = (id) => document.getElementById(id);
const out = $('out');

function show(kind, text) { out.className = kind; out.textContent = text; }

async function submit(dryRun) {
  const buttons = [$('btnDry'), $('btnSend')];
  buttons.forEach((b) => (b.disabled = true));
  show('', '보내는 중…');

  try {
    const res = await fetch('/admin/notices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: $('title').value,
        body: $('body').value,
        pushTitle: $('pushTitle').value,
        pushBody: $('pushBody').value,
        push: $('push').checked,
        dryRun,
      }),
    });
    const data = await res.json();

    if (!res.ok) { show('err', data.error ?? ('실패 ' + res.status)); return; }

    if (data.dryRun) {
      const lines = ['검증 통과', '페이로드 ' + data.bytes + '바이트'];
      if (data.truncated) lines.push('⚠ 본문이 길어 알림에는 잘려 나갑니다 (상세는 온전합니다)');
      if (data.messageId) lines.push('FCM ' + data.messageId);
      show('ok', lines.join('\\n'));
      return;
    }

    show('ok', data.sent ? ('보냈습니다\\n' + data.id) : ('공지만 저장했습니다\\n' + data.id));
    // 보낸 뒤에는 비운다. 같은 것을 두 번 보내는 사고를 막는다.
    for (const id of ['title', 'body', 'pushTitle', 'pushBody']) $(id).value = '';
    $('push').checked = false;
  } catch (e) {
    show('err', String(e));
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

$('btnDry').addEventListener('click', () => submit(true));
$('btnSend').addEventListener('click', () => submit(false));

// 알림을 안 보낼 거면 그 칸들을 흐리게 둔다. 왜 안 채워도 되는지가 눈에 보인다.
function syncPush() {
  const on = $('push').checked;
  for (const id of ['pushTitle', 'pushBody']) {
    $(id).disabled = !on;
    $(id).style.opacity = on ? '1' : '.5';
  }
}
$('push').addEventListener('change', syncPush);
syncPush();
</script>
</body>
</html>`
