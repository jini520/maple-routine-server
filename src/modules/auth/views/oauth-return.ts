/**
 * 안드로이드에서 App Link 검증이 안 된 기기가 보는 폴백 페이지.
 *
 * receipt 는 서버가 본문에 적지 않는다. 브라우저가 location 에서 읽어 intent 주소에 붙인다.
 * 패키지 이름을 명시한 인텐트는 그 이름의 앱 하나에만 가고, 한 기기에 같은 이름의 앱은 둘일 수 없다.
 */
export const OAUTH_RETURN_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>메이플 루틴</title>
<style>
  body { font: 17px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 32px 24px; color: #1a212c; background: #f3f5f8; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { margin: 0 0 20px; color: #5d6878; }
  a { display: inline-block; padding: 14px 22px; border-radius: 8px; background: #1b6ea4; color: #fff; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<h1>앱이 열리지 않았어요</h1>
<p>아래 버튼을 누르면 메이플 루틴으로 돌아갑니다.</p>
<p><a id="back" href="#">앱으로 돌아가기</a></p>
<script>
  var receipt = new URLSearchParams(location.search).get('receipt') || '';
  document.getElementById('back').href =
    'intent://oauth/callback?receipt=' + encodeURIComponent(receipt) +
    '#Intent;scheme=com.mapleroutine.app;package=com.mapleroutine.app;end';
</script>
</body>
</html>
`
