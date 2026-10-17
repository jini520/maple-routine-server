import { layout } from './layout'

export const INDEX_HTML = layout(
  '/admin',
  '홈',
  `<div class="head"><div><h1>메이플 루틴 관리</h1><p>운영자 화면 열둘. 인증은 앞단 nginx 가 한다.</p></div></div>
<div class="links">
  <a class="card" href="/admin/notices"><h2>공지</h2><p>운영자 공지를 쓰고 고치고 알림을 보낸다</p></a>
  <a class="card" href="/admin/bosses"><h2>보스 목록</h2><p>보스와 난이도, 주간 한도 둘을 폼으로 고친다</p></a>
  <a class="card" href="/admin/manual-completion"><h2>직접 완료</h2><p>보스를 열고 닫는다</p></a>
  <a class="card" href="/admin/drop-prices"><h2>드롭 가격</h2><p>모인 시세 표본과 분포를 본다</p></a>
  <a class="card" href="/admin/drop-items"><h2>드롭 아이템</h2><p>아이템 마스터 표. 이름 · 그림 · 고가를 고친다</p></a>
  <a class="card" href="/admin/drop-boxes"><h2>상자</h2><p>반지 상자 · 장신구 상자의 레벨 범위와 내용물</p></a>
  <a class="card" href="/admin/boss-drops"><h2>드롭 표</h2><p>보스 한 난이도의 보상 줄을 더하고 빼고 차례를 옮긴다</p></a>
  <a class="card" href="/admin/crystal-prices"><h2>결정석 가격</h2><p>패치마다 새 가격 줄을 열고 파티 인원 상한을 적는다</p></a>
  <a class="card" href="/admin/worlds"><h2>월드</h2><p>새 챌린저스 시즌 월드를 더하고 챌린저스 · 이벤트를 켠다</p></a>
  <a class="card" href="/admin/spend-catalog"><h2>지출 카탈로그</h2><p>가계부 지출 목록. 묶음을 열고 닫고 항목 · 가격 · 타일을 고친다</p></a>
  <a class="card" href="/admin/symbol-costs"><h2>심볼 비용</h2><p>심볼 강화 비용. 패치마다 레벨별 새 비용 줄을 연다</p></a>
  <a class="card" href="/admin/contents"><h2>컨텐츠</h2><p>일간 · 주간 컨텐츠 표와 갈래. 공유 범위 · 위젯 글자 · 기간을 고친다</p></a>
</div>`,
)
