import { formatKst, kstLocalToIso } from './kst'

describe('formatKst', () => {
  it('절대 시각을 KST 글자 YYYY-MM-DD HH:mm:ss 로 쓴다', () => {
    expect(formatKst(new Date('2026-10-16T10:08:31.463Z'))).toBe('2026-10-16 19:08:31')
  })

  // KST 는 서머타임이 없어 +9 시간이 곧 KST 다. 날짜 경계도 그 셈으로 넘어간다.
  it('UTC 자정 전 시각은 KST 로 다음 날이다', () => {
    expect(formatKst(new Date('2026-10-15T15:00:00Z'))).toBe('2026-10-16 00:00:00')
    expect(formatKst(new Date('2026-12-31T16:30:05Z'))).toBe('2027-01-01 01:30:05')
  })
})

describe('kstLocalToIso', () => {
  // 관리 화면의 datetime-local 값이다. 브라우저 시간대가 어디든 KST 로 읽는다.
  it('YYYY-MM-DDTHH:mm 을 KST 로 읽어 ISO 로 낸다', () => {
    expect(kstLocalToIso('2026-10-16T19:08')).toBe('2026-10-16T10:08:00.000Z')
    expect(kstLocalToIso('2026-10-16T19:08:31')).toBe('2026-10-16T10:08:31.000Z')
  })

  it('모양이 아니면 null 이다', () => {
    expect(kstLocalToIso('')).toBeNull()
    expect(kstLocalToIso('2026-10-16')).toBeNull()
    expect(kstLocalToIso('어제')).toBeNull()
  })
})
