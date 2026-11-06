/**
 * 앱 라우트 이름 → 그 화면 머리 줄의 제목. 사용 로그 화면이 라우트 이름 위에 크게 보인다.
 *
 * 표에 없는 이름은 라우트 이름만 보인다. 앱이 화면을 더해도 서버를 먼저 배포하지 않아도 된다.
 * 머리 줄 제목이 없거나 내용마다 바뀌는 화면(로그인 · 캐릭터 선택 · MVP 등급 둘 · 공지 상세 · 소식)은 사용자가 정한 이름이다.
 */
export const SCREEN_NAMES: Readonly<Record<string, string>> = {
  Today: 'today',
  Content: '컨텐츠 스케줄러',
  Boss: '보스 스케줄러',
  Appointments: '파티 스케줄',
  Profit: '보스 수입',
  Cashbook: '가계부',
  Stats: '통계',
  Utility: '유틸리티',
  Settings: '더보기',
  SignIn: '로그인',
  CharacterSetup: '캐릭터 선택',
  MvpGradePick: 'MVP 등급 고르기',
  MvpGradeConfirm: 'MVP 등급 확인',
  ContentManage: '컨텐츠 관리',
  DropHistory: '히스토리',
  DropPrice: '아이템 가격 입력',
  SettingsReleaseNotes: '개발 노트',
  SettingsAbout: '앱 정보 및 계정',
  UtilityItemSplit: '판매 분배금 계산기',
  UtilityBossProfitCalculator: '주간 보스 수입 계산기',
  UtilityBossProfitCalculatorRecords: '계산 기록',
  SettingsCharacters: '캐릭터 관리',
  BossManage: '보스 관리',
  SettingsTheme: '테마',
  SettingsTextSize: '글자 크기',
  SettingsBarOrder: '하단 탭 순서',
  SettingsNotices: '소식',
  SettingsNoticeAlerts: '알림 설정',
  SettingsMvpGrade: 'MVP 등급',
  SettingsMvpGradeHistory: 'MVP 등급 이력',
  AppSettings: '설정',
  SettingsNoticeDetail: '공지 상세',
}
