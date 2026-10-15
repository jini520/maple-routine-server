import { layout } from './layout'

export const INDEX_HTML = layout(
  '관리',
  `<h1>메이플 루틴 관리</h1>
<ul>
  <li><a href="/admin/notices">공지</a> · 운영자 공지를 쓰고 고치고 알림을 보낸다</li>
  <li><a href="/admin/bosses">보스 목록</a> · JSON 을 붙여 넣어 보스와 규칙을 채운다</li>
  <li><a href="/admin/manual-completion">직접 완료</a> · 보스를 열고 닫는다</li>
  <li><a href="/admin/drop-prices">드롭 가격</a> · 모인 시세 표본과 분포를 본다</li>
</ul>`,
)
