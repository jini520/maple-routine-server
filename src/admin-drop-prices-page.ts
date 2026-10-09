/**
 * 모인 드롭 가격의 노이즈를 보는 자리(이슈 #610).
 *
 * **평균을 안 보인다.** 보려는 것이 노이즈이고, 평균은 0 을 하나 더 친 한 건에 끌려가 분포를
 * 가린다. 최소 · 중앙 · 최대 셋과 **최대÷중앙 배수**를 보이고, 그 배수가 큰 것이 의심스러운
 * 아이템이다.
 *
 * **사람 수를 함께 보인다.** 표본 20건이 한 사람에게서 나온 것과 스무 사람에게서 나온 것은
 * 같은 숫자가 아니다.
 *
 * 값은 전부 `textContent` 로 넣는다. 아이템 key 는 앱이 보낸 글자라 HTML 로 해석되는 길을 안 둔다.
 */
import { adminNav, ADMIN_STYLE } from './admin-page.ts'

export const ADMIN_DROP_PRICES_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>드롭 가격</title>
<style>${ADMIN_STYLE}
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { padding:8px 6px; border-bottom:1px solid var(--line); text-align:right;
           white-space:nowrap; }
  th { color:var(--muted); font-weight:500; text-align:right; position:sticky; top:0;
       background:var(--bg); }
  th:first-child, td:first-child { text-align:left; white-space:normal; }
  .wrap { overflow-x:auto; }
  .loud { color:var(--err); font-weight:600; }
  .gone { opacity:.5; text-decoration:line-through; }
  .empty, .loading { padding:24px 0; text-align:center; color:var(--muted); }
  h2.section { font-size:14px; color:var(--muted); margin:28px 0 10px; }
</style>
</head>
<body>
<main>
  <h1>드롭 가격</h1>
  ${adminNav('drop-prices')}
  <p class="when">사용자가 적은 판매 총액입니다. 가격을 고치면 줄이 쌓이고 <strong>마지막 한
    줄만</strong> 아래 분포에 듭니다. 거둔 줄은 최근 목록에 취소선으로 남습니다.</p>

  <h2 class="section">아이템별 분포 <span class="hint">표본이 많은 것부터</span></h2>
  <div id="stats"><p class="loading">불러오는 중…</p></div>

  <h2 class="section">최근에 들어온 줄</h2>
  <div id="recent"><p class="loading">불러오는 중…</p></div>
</main>

<script>
const statsBox = document.getElementById('stats');
const recentBox = document.getElementById('recent');

/** 억 단위로 접는다. 메소는 자리가 길어 그대로 보이면 표가 안 읽힌다. */
function meso(n) {
  if (n >= 100000000) {
    const eok = n / 100000000;
    return (eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10) + '억';
  }
  if (n >= 10000) return Math.round(n / 10000) + '만';
  return String(n);
}

function when(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function cell(row, text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  row.appendChild(td);
  return td;
}

function table(headers) {
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const el = document.createElement('table');
  const head = el.createTHead().insertRow();
  for (const text of headers) {
    const th = document.createElement('th');
    th.textContent = text;
    head.appendChild(th);
  }
  el.appendChild(document.createElement('tbody'));
  wrap.appendChild(el);
  return { wrap, body: el.tBodies[0] };
}

function drawStats(rows) {
  statsBox.replaceChildren();
  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '아직 들어온 가격이 없습니다.';
    statsBox.appendChild(p);
    return;
  }

  const { wrap, body } = table(['아이템', '표본', '사람', '최소', '중앙', '최대', '최대÷중앙', '마지막']);
  for (const one of rows) {
    const tr = body.insertRow();
    cell(tr, one.itemKey);
    cell(tr, String(one.samples));
    cell(tr, String(one.people));
    cell(tr, meso(one.minMeso));
    cell(tr, meso(one.medianMeso));
    cell(tr, meso(one.maxMeso));
    // 중앙값이 0 일 수는 없다(가격은 양의 정수만 받는다). 10배를 넘으면 눈에 걸리게 칠한다.
    const ratio = one.maxMeso / one.medianMeso;
    cell(tr, ratio.toFixed(1) + '배', ratio >= 10 ? 'loud' : '');
    cell(tr, when(one.lastReceivedAt));
  }
  statsBox.appendChild(wrap);
}

function drawRecent(rows) {
  recentBox.replaceChildren();
  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '아직 들어온 줄이 없습니다.';
    recentBox.appendChild(p);
    return;
  }

  const { wrap, body } = table(['아이템', '가격', '기간', '월드', '반지', '받은 때']);
  for (const one of rows) {
    const tr = body.insertRow();
    if (one.supersededAt !== null) tr.className = 'gone';
    cell(tr, one.itemKey);
    cell(tr, meso(one.priceMeso));
    cell(tr, one.periodKey);
    cell(tr, one.worldKey === null ? '모름' : one.worldKey);
    cell(tr, one.ringLevel === null ? '' : one.ringLevel + '렙');
    cell(tr, when(one.receivedAt));
  }
  recentBox.appendChild(wrap);
}

async function load() {
  try {
    const response = await fetch('/admin/drop-prices/rows', { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    drawStats(data.stats);
    drawRecent(data.recent);
  } catch {
    for (const box of [statsBox, recentBox]) {
      box.replaceChildren();
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '불러오지 못했습니다.';
      box.appendChild(p);
    }
  }
}

load();
</script>
</body>
</html>`
