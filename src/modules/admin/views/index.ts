import { layout } from './layout'

export const INDEX_HTML = layout(
  '/admin',
  '홈',
  `<div class="head"><div><h1>메이플 루틴 관리</h1><p>운영자 화면 넷. 인증은 앞단 nginx 가 한다.</p></div></div>
<div class="links">
  <a class="card" href="/admin/notices"><h2>공지</h2><p>운영자 공지를 쓰고 고치고 알림을 보낸다</p></a>
  <a class="card" href="/admin/bosses"><h2>보스 목록</h2><p>보스와 난이도, 주간 한도 둘을 폼으로 고친다</p></a>
  <a class="card" href="/admin/manual-completion"><h2>직접 완료</h2><p>보스를 열고 닫는다</p></a>
  <a class="card" href="/admin/drop-prices"><h2>드롭 가격</h2><p>모인 시세 표본과 분포를 본다</p></a>
</div>`,
)
