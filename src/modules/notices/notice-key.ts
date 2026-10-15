/** 운영자 공지의 열쇠. notice-YYYYMMDD-HHMMSS(UTC). 옛 줄과 같은 꼴이라 앱이 똑같이 읽는다. */
export function operatorNoticeKey(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '')
  return `notice-${stamp.slice(0, 8)}-${stamp.slice(9, 15)}`
}
