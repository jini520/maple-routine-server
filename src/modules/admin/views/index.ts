import { layout } from './layout'

export const INDEX_HTML = layout(
  '/admin',
  '홈',
  `<div class="head"><div><h1>메이플 루틴 관리</h1><p>운영자 화면 열일곱. 인증은 앞단 nginx 가 한다.</p></div></div>
<h2 class="section">공지</h2>
<div class="links">
  <a class="card" href="/admin/notices"><h3>공지</h3><p>운영자 공지를 쓰고 고치고 알림을 보낸다</p></a>
</div>
<h2 class="section">게임데이터</h2>
<h3 class="subsection">보스</h3>
<div class="links">
  <a class="card" href="/admin/bosses"><h3>보스 목록</h3><p>보스와 난이도, 주간 한도 둘을 폼으로 고친다</p></a>
  <a class="card" href="/admin/drop-items"><h3>드롭 아이템</h3><p>아이템 마스터 표. 이름 · 그림 · 고가를 고친다</p></a>
  <a class="card" href="/admin/drop-boxes"><h3>상자</h3><p>반지 상자 · 장신구 상자의 레벨 범위와 내용물</p></a>
  <a class="card" href="/admin/boss-drops"><h3>드롭 표</h3><p>보스 한 난이도의 보상 줄을 더하고 빼고 차례를 옮긴다</p></a>
  <a class="card" href="/admin/crystal-prices"><h3>결정석 가격</h3><p>패치마다 새 가격 줄을 열고 파티 인원 상한을 적는다</p></a>
</div>
<h3 class="subsection">가계부</h3>
<div class="links">
  <a class="card" href="/admin/cashbook-categories"><h3>가계부 갈래</h3><p>수입 · 지출 갈래와 아이템 종류. 이름 · 카드 제목 · 단위를 고치고 새 갈래를 더한다</p></a>
  <a class="card" href="/admin/spend-catalog"><h3>지출 카탈로그</h3><p>가계부 지출 목록. 묶음을 열고 닫고 항목 · 가격 · 타일을 고친다</p></a>
  <a class="card" href="/admin/symbol-costs"><h3>심볼 비용</h3><p>심볼 강화 비용. 패치마다 레벨별 새 비용 줄을 연다</p></a>
  <a class="card" href="/admin/contents"><h3>컨텐츠</h3><p>일간 · 주간 컨텐츠 표와 갈래. 공유 범위 · 위젯 글자 · 기간을 고친다</p></a>
  <a class="card" href="/admin/enhancement-costs"><h3>강화 비용</h3><p>잠재 · 소울 재설정 비용과 스타포스 단계, 규칙 셋</p></a>
  <a class="card" href="/admin/mvp-grades"><h3>MVP 등급</h3><p>등급마다 경매장 수수료와 스타포스 할인</p></a>
</div>
<h3 class="subsection">기타</h3>
<div class="links">
  <a class="card" href="/admin/worlds"><h3>월드</h3><p>새 챌린저스 시즌 월드를 더하고 챌린저스 · 이벤트를 켠다</p></a>
  <a class="card" href="/admin/equipment-items"><h3>장비</h3><p>강화 비용을 매길 장비 표. 이름 · 착용 레벨을 고치고 새 장비를 더한다</p></a>
  <a class="card" href="/admin/hunting-grounds"><h3>사냥터</h3><p>사냥 계산기의 지역 · 사냥터 · 몬스터 레벨</p></a>
</div>
<h2 class="section">로그</h2>
<div class="links">
  <a class="card" href="/admin/drop-prices"><h3>드롭 가격</h3><p>모인 시세 표본과 분포를 본다</p></a>
  <a class="card" href="/admin/drop-market"><h3>드롭 시세</h3><p>월드 묶음마다 잘못 적은 값을 빼고 일봉으로 본다</p></a>
</div>
<h2 class="section">임시 기능</h2>
<div class="links">
  <a class="card" href="/admin/manual-completion"><h3>보스 직접 완료</h3><p>보스를 열고 닫는다</p></a>
</div>`,
)
