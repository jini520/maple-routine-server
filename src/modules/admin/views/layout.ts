/** 관리 화면의 공통 껍데기. 메뉴와 글꼴만 있고 나머지는 페이지가 채운다. */
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · 메이플 루틴 관리</title>
<style>
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 24px; color: #1a212c; background: #f3f5f8; max-width: 960px; }
  nav a { margin-right: 16px; color: #1b6ea4; }
  h1 { font-size: 20px; margin: 16px 0; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  textarea { width: 100%; min-height: 320px; font: 13px/1.4 ui-monospace, monospace; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e7ec; font-size: 14px; }
  button { padding: 8px 14px; border-radius: 6px; border: 0; background: #1b6ea4; color: #fff; font-weight: 600; cursor: pointer; }
  button.quiet { background: #8a94a3; }
  #message { margin: 12px 0; padding: 10px 12px; border-radius: 6px; background: #e6f0f8; white-space: pre-wrap; }
  #message.error { background: #fbe6e6; }
  #message:empty { display: none; }
  label { display: inline-block; margin-right: 12px; }
  select, input { font: inherit; padding: 6px; }
  input[type=text], input[type=url] { width: 100%; box-sizing: border-box; }
  textarea.body { min-height: 120px; font: inherit; }
  .card { background: #fff; border: 1px solid #e3e7ec; border-radius: 8px; padding: 12px 16px; margin: 10px 0; }
  .card .meta { color: #5d6878; font-size: 13px; }
  .card .actions button { margin-right: 8px; }
  .field { margin: 8px 0; }
  .field label { display: block; margin: 0 0 4px; font-size: 13px; color: #5d6878; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.deleted td { color: #8a94a3; text-decoration: line-through; }
</style>
</head>
<body>
<nav><a href="/admin">관리</a><a href="/admin/notices">공지</a><a href="/admin/bosses">보스 목록</a><a href="/admin/manual-completion">직접 완료</a><a href="/admin/drop-prices">드롭 가격</a></nav>
${body}
<script>
  function show(text, isError) {
    var box = document.getElementById('message');
    box.textContent = text;
    box.className = isError ? 'error' : '';
  }
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
</body>
</html>
`
}
