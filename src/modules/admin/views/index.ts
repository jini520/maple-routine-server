import { layout } from './layout'

type Link = readonly [href: string, title: string, text: string]

/** 카드 묶음 하나. 글은 두 줄까지 보이므로 전체를 title 로도 단다. */
function links(items: readonly Link[]): string {
  const cards = items
    .map(
      ([href, title, text]) =>
        `<a class="card" href="${href}" title="${text}"><h3>${title}</h3><p>${text}</p></a>`,
    )
    .join('\n  ')
  return `<div class="links">\n  ${cards}\n</div>`
}

/**
 * 홈. 메뉴의 묶음을 단으로 나란히 놓아 1440×900 에 스크롤 없이 들어온다. 왼쪽 단은 공지 · FAQ · 로그 · 임시 기능이고, 오른쪽 세
 * 단은 게임데이터의 묶음이다. 세로로 쌓으면 카드 스물넷이 두 화면을 넘는다.
 */
export const INDEX_HTML = layout(
  '/',
  '홈',
  `<div class="head"><div><h1>메이플 루틴 관리</h1><p>운영자 화면 스물넷. 인증은 앞단 nginx 가 한다.</p></div></div>
<div class="home">
<div class="home-col">
<section><h2 class="section">공지</h2>
${links([['/notices', '공지', '운영자 공지를 쓰고 고치고 알림을 보낸다']])}
</section>
<section><h2 class="section">FAQ</h2>
${links([['/faqs', 'FAQ', '앱 화면의 물음표가 여는 시트. 묶음을 더하고 문항을 쓰고 고친다']])}
</section>
<section><h2 class="section">로그</h2>
${links([
  ['/drop-prices', '드롭 가격', '모인 시세 표본과 분포를 본다'],
  ['/drop-market', '드롭 시세', '월드 묶음마다 잘못 적은 값을 빼고 일봉으로 본다'],
  ['/users', '사용자', '사람 수와 그 일별 · 요일별 증감, 그 날 보낸 알림 수'],
  ['/usage', '사용 로그', '방문 · 화면 조회 · 동작 횟수와 화면별 방문자 · 체류'],
])}
</section>
<section><h2 class="section">임시 기능</h2>
${links([['/manual-completion', '보스 직접 완료', '보스를 열고 닫는다']])}
</section>
</div>
<section><h2 class="section">게임데이터</h2>
<div class="home-cols">
<div class="home-col">
<section>
${links([
  [
    '/items',
    '아이템',
    '드롭 아이템 · 강화 장비 · 사냥 전리품을 한 표에서. 이름 · 분류 · 그림 · 고가 · 착용 레벨 · 역할을 고친다',
  ],
  [
    '/images',
    '그림',
    '앱이 받는 그림을 분류로 훑고 올리고 바꾸며, 이름을 붙이고 안 쓰는 그림을 지운다. 보스 초상 · 지역 지도의 크롭도 고친다',
  ],
  [
    '/app-images',
    '앱 그림',
    '앱 코드가 key 로 찾는 그림(메소 주머니 · 포스 · 드롭 연출 프레임 등)을 바꾼다',
  ],
])}
</section>
<section><h3 class="subsection">기타</h3>
${links([
  ['/worlds', '월드', '새 챌린저스 시즌 월드를 더하고 챌린저스 · 이벤트를 켠다'],
  ['/hunting-grounds', '사냥터', '사냥 계산기의 지역 · 사냥터 · 몬스터 레벨'],
])}
</section>
</div>
<section><h3 class="subsection">보스</h3>
${links([
  ['/bosses', '보스 목록', '보스와 난이도 줄, 보스 규칙 셋을 칸에서 고친다'],
  ['/drop-boxes', '상자', '반지 상자 · 장신구 상자의 레벨 범위와 내용물'],
  ['/boss-drops', '드롭 표', '보스 한 난이도의 보상 줄을 더하고 개수 · 기간 · 차례를 고친다'],
  ['/crystal-prices', '결정석 가격', '패치마다 새 가격 줄을 열고 파티 인원 상한을 적는다'],
])}
</section>
<section><h3 class="subsection">가계부</h3>
${links([
  [
    '/cashbook-categories',
    '가계부 분류',
    '수입 · 지출 분류와 아이템 종류. 이름 · 카드 제목 · 단위를 고치고 새 분류를 더한다',
  ],
  [
    '/hunt-loot',
    '사냥 전리품',
    '사냥 전리품 판매의 조각 · 소비 · 이벤트 아이템. NPC 가격과 이벤트 기간을 고친다',
  ],
  [
    '/spend-catalog',
    '지출 카탈로그',
    '가계부 지출 목록. 묶음을 열고 닫고 항목 · 가격 · 타일을 고친다',
  ],
  ['/symbol-costs', '심볼 비용', '심볼 강화 비용. 패치마다 레벨별 새 비용 줄을 연다'],
  [
    '/hexa-matrix',
    '헥사 매트릭스',
    '헥사 코어 종류와 레벨별 조각 비용, 이름 표, 직업별 코어, 헥사 스탯',
  ],
  ['/contents', '컨텐츠', '일간 · 주간 컨텐츠 표와 분류. 공유 범위 · 위젯 글자 · 기간을 고친다'],
  [
    '/enhancement-costs',
    '강화 비용',
    '잠재능력 · 스타포스 · 슈페리얼 장비의 비용과 그 화면이 쓰는 규칙',
  ],
  ['/mvp-grades', 'MVP 등급', '등급마다 경매장 수수료와 스타포스 할인'],
])}
</section>
</div>
</section>
</div>`,
)
