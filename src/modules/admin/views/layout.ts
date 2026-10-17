/** 왼쪽 메뉴의 차례. 경로와 이름 */
const MENU = [
  ['/admin', '홈'],
  ['/admin/notices', '공지'],
  ['/admin/bosses', '보스 목록'],
  ['/admin/manual-completion', '직접 완료'],
  ['/admin/drop-prices', '드롭 가격'],
  ['/admin/drop-items', '드롭 아이템'],
  ['/admin/drop-boxes', '상자'],
  ['/admin/boss-drops', '드롭 표'],
  ['/admin/crystal-prices', '결정석 가격'],
  ['/admin/worlds', '월드'],
  ['/admin/spend-catalog', '지출 카탈로그'],
  ['/admin/symbol-costs', '심볼 비용'],
  ['/admin/contents', '컨텐츠'],
  ['/admin/equipment-items', '장비'],
  ['/admin/enhancement-costs', '강화 비용'],
  ['/admin/mvp-grades', 'MVP 등급'],
] as const

/**
 * 관리 화면의 공통 껍데기. 왼쪽 메뉴와 글꼴, 부품 스타일, 페이지가 쓰는 도우미 셋(call · show · when)을 든다.
 *
 * 도우미 스크립트가 페이지 본문보다 **앞**이어야 한다. 페이지가 스크립트 끝에서 바로 load() 를 부르므로 뒤에 두면 그 순간 call 이 없다.
 * 색 · 둥글기 · 그림자는 :root 토큰에만 있다. 페이지는 부품 클래스(card · field · btn · tag · table)만 조립한다.
 *
 * @param path 지금 보는 화면의 경로. 메뉴의 그 항목에 aria-current 가 붙는다
 */
export function layout(path: string, title: string, body: string): string {
  const menu = MENU.map(
    ([href, label]) =>
      `<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('\n    ')
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · 메이플 루틴 관리</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --bg: #F5F6F8; --surface: #FFFFFF; --surface-2: #F8F9FB; --row-hover: #F6F8FC; --nav-bg: #FBFBFC;
    --line: #E5E7EB; --line-strong: #D2D6DC;
    --text: #111827; --text-2: #4B5563; --text-3: #6B7280;
    --accent: #2F5BEA; --accent-hover: #2449C7; --accent-ink: #1E40AF; --accent-tint: #E9EEFF; --on-accent: #FFFFFF;
    --ok-ink: #15803D; --ok-tint: #DCFCE7; --danger-ink: #B91C1C; --danger-tint: #FEE2E2;
    --r-card: 10px; --r-input: 8px; --r-btn: 8px;
    --shadow: 0 1px 2px rgba(16,24,40,.05);
    --font: 'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
    --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    color-scheme: light;
  }
  * { box-sizing: border-box }
  [hidden] { display: none !important }
  html, body { margin: 0 }
  body { background: var(--bg); color: var(--text); font: 14px/1.5 var(--font) }

  .shell { display: grid; grid-template-columns: 224px minmax(0, 1fr); min-height: 100vh }
  .nav { display: flex; flex-direction: column; gap: 2px; padding: 20px 12px; background: var(--nav-bg); border-right: 1px solid var(--line); position: sticky; top: 0; align-self: start; min-height: 100vh }
  .brand { display: flex; align-items: center; gap: 10px; margin: 0 8px 18px; font-weight: 700; font-size: 14px; letter-spacing: -.01em; color: var(--text); text-decoration: none; white-space: nowrap }
  .brand .mark { width: 26px; height: 26px; border-radius: 8px; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; flex: none }
  .brand .mark svg { width: 16px; height: 16px }
  .brand small { color: var(--text-3); font-weight: 500 }
  .nav a:not(.brand) { color: var(--text-2); text-decoration: none; font-weight: 500; font-size: 13.5px; padding: 8px 12px; border-radius: 8px; white-space: nowrap }
  .nav a:not(.brand):hover { background: var(--surface-2); color: var(--text) }
  .nav a[aria-current="page"] { color: var(--accent-ink); background: var(--accent-tint) }
  .nav a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
  .main { padding: 28px 24px 56px; min-width: 0 }
  .page { max-width: 1120px; display: grid; gap: 20px }
  @media (max-width: 760px) {
    .shell { grid-template-columns: 1fr }
    .nav { position: static; min-height: 0; flex-direction: row; flex-wrap: wrap; align-items: center; border-right: 0; border-bottom: 1px solid var(--line); padding: 10px 16px }
    .brand { width: 100%; margin: 0 0 6px }
    .main { padding: 20px 16px 48px }
  }

  .head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px }
  .head h1 { font-size: 22px; font-weight: 700; letter-spacing: -.02em; margin: 0 0 6px; text-wrap: balance }
  .head p { margin: 0; color: var(--text-2); max-width: 62ch }
  code { font-family: var(--mono); font-size: 12.5px; background: var(--surface-2); border: 1px solid var(--line); padding: 1px 6px; border-radius: 6px }
  .stats { display: flex; gap: 8px; flex-wrap: wrap }
  .stat { display: grid; gap: 2px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); min-width: 96px }
  .stat b { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -.01em }
  .stat b.mono { font-size: 13px; line-height: 27px }
  .stat span { font-size: 11.5px; color: var(--text-3); letter-spacing: .02em }

  .msg { display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px; border-radius: var(--r-input); font-weight: 500; white-space: pre-wrap; border: 1px solid transparent }
  .msg::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; margin-top: 7px }
  .msg.ok { background: var(--ok-tint); color: var(--ok-ink); border-color: color-mix(in srgb, var(--ok-ink) 22%, transparent) }
  .msg.error { background: var(--danger-tint); color: var(--danger-ink); border-color: color-mix(in srgb, var(--danger-ink) 22%, transparent) }

  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--shadow); overflow: hidden }
  .card > header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 16px; padding: 16px 20px 0 }
  .card > header h2 { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -.01em }
  .card > header p { margin: 0; color: var(--text-3); font-size: 12.5px }
  .card > header .grow { flex: 1 }
  .hint { margin: 0; color: var(--text-3); font-size: 12.5px }
  .card > .body { padding: 16px 20px 18px; display: grid; gap: 14px }
  .card > .table { border-top: 1px solid var(--line); margin-top: 14px; overflow-x: auto }
  .card > .list { display: grid; gap: 1px; background: var(--line); border-top: 1px solid var(--line); margin-top: 14px }
  .sub { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--r-input); background: var(--surface-2) }

  .row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 16px }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px }
  @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr } }
  .field { display: grid; gap: 5px; min-width: 0 }
  .field label { font-size: 12.5px; font-weight: 500; color: var(--text-2) }
  .field label small { color: var(--text-3); font-weight: 400; margin-left: 4px }
  .field.w-sm { width: 120px }
  .check { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; color: var(--text-2); cursor: pointer }
  .check input { width: 15px; height: 15px; margin: 0; accent-color: var(--accent) }
  input, select, textarea { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--r-input); padding: 8px 11px; min-width: 0; width: 100% }
  textarea { min-height: 120px; resize: vertical }
  input.mono { font-family: var(--mono); font-size: 13px }
  input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; border-color: var(--accent) }
  input::placeholder { color: var(--text-3) }
  select { appearance: none; padding-right: 30px; background-image: linear-gradient(45deg, transparent 50%, var(--text-3) 50%), linear-gradient(135deg, var(--text-3) 50%, transparent 50%); background-position: calc(100% - 15px) 55%, calc(100% - 10px) 55%; background-size: 5px 5px; background-repeat: no-repeat }
  input[type=number] { font-variant-numeric: tabular-nums }
  .w-auto { width: auto }
  .w-md { width: 240px }
  .inline { display: flex; align-items: center; gap: 6px }
  .inline input, .inline select { width: auto }
  .inline input[type=number] { width: 64px }
  .inline input.w-period { width: 150px }
  .inline select { width: 100px }

  .btn { font: 600 13.5px/1 var(--font); padding: 9px 15px; border-radius: var(--r-btn); border: 1px solid transparent; background: var(--accent); color: var(--on-accent); cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px }
  .btn:hover { background: var(--accent-hover) }
  .btn.ghost { background: transparent; color: var(--text-2); border-color: var(--line-strong) }
  .btn.ghost:hover { background: var(--surface-2); color: var(--text) }
  .btn.danger { background: transparent; color: var(--danger-ink); border-color: transparent }
  .btn.danger:hover { background: var(--danger-tint) }
  .btn.sm { padding: 6px 10px; font-size: 12.5px }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center }

  table { border-collapse: collapse; width: 100%; font-size: 13.5px }
  th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); padding: 10px 12px; background: var(--surface-2); border-bottom: 1px solid var(--line); white-space: nowrap }
  td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; white-space: nowrap }
  tbody tr:last-child td { border-bottom: 0 }
  tbody tr:hover td { background: var(--row-hover) }
  .mono { font-family: var(--mono); font-size: 12.5px }
  .dim { color: var(--text-3) }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums }
  td.n { color: var(--text-3); font-variant-numeric: tabular-nums; width: 1% }
  td.act { text-align: right; white-space: nowrap }
  td.empty { color: var(--text-3); text-align: center; padding: 22px 14px }
  tr.deleted td { color: var(--text-3); text-decoration: line-through }
  .mini { border: 1px solid var(--line); border-radius: var(--r-input); overflow-x: auto; background: var(--surface) }
  .mini th { padding: 8px 12px }
  .mini td { padding: 6px 12px }
  tbody tr.open td, tbody tr.open:hover td { background: var(--accent-tint) }
  tbody tr.open td:first-child { box-shadow: inset 3px 0 0 var(--accent) }
  tbody tr.expand td, tbody tr.expand:hover td { background: var(--surface-2); padding: 14px 20px 18px; white-space: normal }
  .editor { display: grid; gap: 12px; max-width: 1040px }
  .editor h3 { margin: 0; font-size: 13.5px; font-weight: 600 }

  .tag { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; letter-spacing: .01em; border: 1px solid var(--line-strong); color: var(--text-2); background: var(--surface); white-space: nowrap }
  .tag.accent { background: var(--accent-tint); color: var(--accent-ink); border-color: transparent }
  .tag.ok { background: var(--ok-tint); color: var(--ok-ink); border-color: transparent }
  .tag.mono { font-family: var(--mono); font-weight: 500 }
  .tags { display: flex; gap: 4px; flex-wrap: wrap }

  .item { background: var(--surface); padding: 16px 20px; display: grid; gap: 8px }
  .item h3 { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -.01em }
  .item .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px }
  .item .meta { color: var(--text-3); font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 4px 12px }
  .item .text { margin: 0; white-space: pre-wrap; color: var(--text-2) }
  .item a { color: var(--accent-ink); word-break: break-all }
  .empty-text { color: var(--text-3); text-align: center; padding: 22px 20px; background: var(--surface) }

  .links { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px }
  .links a { display: grid; gap: 6px; padding: 18px 20px; text-decoration: none; color: inherit }
  .links a:hover { border-color: var(--line-strong); background: var(--surface-2) }
  .links h2 { font-size: 15px; font-weight: 600; margin: 0; color: var(--accent-ink) }
  .links p { margin: 0; color: var(--text-2); font-size: 13px }

  @media (prefers-reduced-motion: no-preference) { .btn, .nav a, .links a { transition: background-color .12s ease, color .12s ease } }
</style>
</head>
<body>
<div class="shell">
  <nav class="nav" aria-label="관리 메뉴">
    <a class="brand" href="/admin"><span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c.6 2.4 1.8 4.2 3.6 5.4l-1.2 1.8 3.6-.6c.3 2 1.3 3.5 3 4.5l-2.4 1.2 2.4 2.1-3.9.3-.9 3.3-3-2.4-.6 4.4h-1.2l-.6-4.4-3 2.4-.9-3.3-3.9-.3 2.4-2.1L3 13.1c1.7-1 2.7-2.5 3-4.5l3.6.6-1.2-1.8C10.2 6.2 11.4 4.4 12 2z"/></svg></span>메이플 루틴 <small>관리</small></a>
    ${menu}
  </nav>
  <main class="main">
  <div class="page">
<script>
  function show(text, isError) {
    var box = document.getElementById('message');
    box.textContent = text;
    box.className = isError ? 'msg error' : 'msg ok';
    box.hidden = text === '';
  }
  // 보이는 시각은 전부 KST 다. 브라우저 시간대에 기대지 않는다. KST 는 서머타임이 없어 +9 시간이 곧 KST 다.
  function when(iso) {
    if (!iso) return '';
    var d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
  }
  // datetime-local 값을 KST 로 읽는다. 브라우저가 어디 있든 같은 시각이다.
  function kstLocalToIso(local) {
    if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$/.test(local)) return null;
    return new Date((local.length === 16 ? local + ':00' : local) + '+09:00').toISOString();
  }
  // 표 화면들이 함께 쓰는 DOM 도우미. 페이지가 같은 이름을 다시 선언하면 그쪽이 이긴다.
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function span(text, cls) { return el('span', text, cls); }
  function cell(tr, child, cls) { var td = document.createElement('td'); if (child === undefined || child === null) td.textContent = ''; else if (typeof child === 'string' || typeof child === 'number') td.textContent = String(child); else td.appendChild(child); if (cls) td.className = cls; tr.appendChild(td); return td; }
  function input(type, cls) { var i = document.createElement('input'); i.type = type; if (cls) i.className = cls; return i; }
  function select(options, value) { var s = document.createElement('select'); options.forEach(function (o) { var opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1]; s.appendChild(opt); }); if (value !== undefined && value !== null) s.value = value; return s; }
  function button(text, cls) { var b = el('button', text, cls); b.type = 'button'; return b; }
  function inline() { var d = el('div', undefined, 'inline'); for (var i = 0; i < arguments.length; i++) d.appendChild(arguments[i]); return d; }
  function field(label, small, control) { var d = el('div', undefined, 'field'); var l = el('label', label); if (small) { l.appendChild(document.createTextNode(' ')); l.appendChild(el('small', small)); } d.appendChild(l); d.appendChild(control); return d; }
  function mini(headers, tbody) { var wrap = el('div', undefined, 'mini'); var t = el('table'); var thead = el('thead'); var hr = el('tr'); headers.forEach(function (h) { hr.appendChild(el('th', h)); }); thead.appendChild(hr); t.appendChild(thead); t.appendChild(tbody); wrap.appendChild(t); return wrap; }
  function fail(what, r) { return what + ' ' + r.status + '\\n' + r.text; }
  function orNull(v) { v = (v || '').trim(); return v === '' ? null : v; }
  function meso(n) { return Number(n).toLocaleString('ko-KR'); }
  async function call(method, url, body) {
    var res = await fetch(url, {
      method: method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    return { ok: res.ok, status: res.status, json: json, text: text };
  }
</script>
${body}
  </div>
  </main>
</div>
</body>
</html>
`
}
