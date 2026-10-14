/**
 * 직접 완료를 여는 자리. 보스를 골라 여는 날과 함께 켜고, 열려 있는 보스를 닫는다.
 *
 * **여는 것과 닫는 것이 다른 동작이다**(사용자 지정 2026-09-18). 넥슨이 언제 고칠지 모르므로
 * 닫는 날을 미리 못 적는다. 닫으면 그 행이 앱 응답에서 빠지고 단추도 그때 사라진다.
 *
 * 보스는 **드롭다운으로만** 고른다. key 를 손으로 치면 오타가 «아무 보스도 안 열림» 으로 조용히
 * 실패한다. 값은 전부 `textContent` 와 `value` 로 넣어 HTML 로 해석되는 길이 없다.
 */
import { adminNav, ADMIN_STYLE } from './admin-page.ts'

export const ADMIN_MANUAL_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>직접 완료 보스</title>
<style>${ADMIN_STYLE}
  select, input[type=date] {
    width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px;
    background:var(--field); color:var(--fg); font:inherit; }
  .item { display:flex; align-items:center; gap:12px; padding:12px 14px; border:1px solid var(--line);
          border-radius:10px; margin-bottom:10px; }
  .item .grow { flex:1; min-width:0; }
  .item h2 { font-size:15px; margin:0 0 2px; }
  .when { font-size:12px; color:var(--muted); }
  .item button { flex:0 0 auto; padding:8px 14px; font-size:14px; }
  .close { background:transparent; color:var(--err); border:1px solid var(--line); }
  .closed { opacity:.55; }
  .empty, .loading { padding:24px 0; text-align:center; color:var(--muted); }
  h2.section { font-size:14px; color:var(--muted); margin:28px 0 10px; }
</style>
</head>
<body>
<main>
  <h1>직접 완료 보스</h1>
  ${adminNav('manual')}
  <p class="when">여기서 켠 보스만 앱에서 직접 완료로 기록할 수 있습니다. 넥슨이 완료를 다시 주기
    시작하면 닫아 주세요.</p>

  <label for="boss">보스</label>
  <select id="boss"></select>

  <label for="from">여는 날 <span class="hint">이 날이 든 주·달부터 열립니다</span></label>
  <input type="date" id="from">

  <div class="row"><button class="send" id="open" type="button">열기</button></div>
  <div id="out"></div>

  <h2 class="section">열려 있는 보스</h2>
  <div id="list"><p class="loading">불러오는 중…</p></div>
</main>

<script>
const out = document.getElementById('out');
const list = document.getElementById('list');
const bossSelect = document.getElementById('boss');
const fromInput = document.getElementById('from');
const openButton = document.getElementById('open');

function show(kind, text) { out.className = kind; out.textContent = text; }

function when(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function card(row) {
  const item = document.createElement('div');
  item.className = row.closedAt === null ? 'item' : 'item closed';

  const grow = document.createElement('div');
  grow.className = 'grow';
  const title = document.createElement('h2');
  title.textContent = row.name;
  const meta = document.createElement('div');
  meta.className = 'when';
  meta.textContent = row.closedAt === null
    ? row.from + '부터 · ' + when(row.openedAt) + ' 켬'
    : row.from + '부터 · ' + when(row.closedAt) + ' 닫음';
  grow.append(title, meta);
  item.append(grow);

  if (row.closedAt === null) {
    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '닫기';
    close.addEventListener('click', () => { void closeBoss(row.boss, close); });
    item.append(close);
  }
  return item;
}

function render(items) {
  list.textContent = '';
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '열어 둔 보스가 없습니다';
    list.append(empty);
    return;
  }
  for (const row of items) list.append(card(row));
}

async function load() {
  const res = await fetch('/admin/manual-completion/rows');
  const data = await res.json();

  bossSelect.textContent = '';
  for (const boss of data.bosses) {
    const option = document.createElement('option');
    option.value = boss.key;
    option.textContent = boss.name + ' (' + (boss.cycle === 'monthly' ? '월간' : '주간') + ')';
    bossSelect.append(option);
  }
  // 여는 날 기본값은 오늘이다. 서버가 KST 로 재서 준다 — 브라우저 시계가 다른 표준시일 수 있다.
  if (fromInput.value === '') fromInput.value = data.today;
  render(data.items);
}

async function openBoss() {
  openButton.disabled = true;
  show('', '');
  try {
    const res = await fetch('/admin/manual-completion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boss: bossSelect.value, from: fromInput.value }),
    });
    const data = await res.json();
    if (!res.ok) { show('err', data.error || '열지 못했습니다'); return; }
    show('ok', '열었습니다');
    await load();
  } catch (error) {
    show('err', String(error));
  } finally {
    openButton.disabled = false;
  }
}

async function closeBoss(boss, button) {
  button.disabled = true;
  try {
    const res = await fetch('/admin/manual-completion/' + encodeURIComponent(boss), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { show('err', data.error || '닫지 못했습니다'); return; }
    show('ok', '닫았습니다');
    await load();
  } catch (error) {
    show('err', String(error));
  } finally {
    button.disabled = false;
  }
}

openButton.addEventListener('click', () => { void openBoss(); });
void load();
</script>
</body>
</html>
`
