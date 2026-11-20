import { maintenanceFile, parseMaintenanceArgs } from './maintenance-args'

/** 2026-12-01 23:00 KST. */
const NOW = Date.parse('2026-12-01T14:00:00Z')

describe('parseMaintenanceArgs', () => {
  it('on 은 종료 예정 시각을 한국 시각으로 읽는다', () => {
    expect(parseMaintenanceArgs(['on', '--until', '2026-12-02 06:00'], NOW)).toEqual({
      command: 'on',
      until: '2026-12-02T06:00:00+09:00',
    })
  })

  it('on 은 종료 예정 시각 없이도 켠다', () => {
    expect(parseMaintenanceArgs(['on'], NOW)).toEqual({ command: 'on', until: null })
  })

  // 지난 시각을 적으면 앱이 종료 예정 칸을 그리지 않는다. 날짜를 잘못 적은 것을 켜기 전에 알린다.
  it('이미 지난 종료 예정 시각은 받지 않는다', () => {
    expect(() => parseMaintenanceArgs(['on', '--until', '2026-12-01 22:59'], NOW)).toThrow('지난')
    expect(() => parseMaintenanceArgs(['on', '--until', '2026-12-01 23:00'], NOW)).toThrow('지난')
  })

  // `2026-02-30` 을 Date 에 넘기면 3월 2일로 넘어간다. 없는 날짜를 조용히 다른 날로 읽지 않는다.
  it.each([
    '내일 새벽',
    '2026-12-02',
    '2026-12-02T06:00',
    '2026-12-02 24:00',
    '2026-12-02 06:60',
    '2027-02-30 06:00',
  ])('읽을 수 없는 시각 %p 는 받지 않는다', (until) => {
    expect(() => parseMaintenanceArgs(['on', '--until', until], NOW)).toThrow('--until')
  })

  it('off 와 status 는 인자를 받지 않는다', () => {
    expect(parseMaintenanceArgs(['off'], NOW)).toEqual({ command: 'off' })
    expect(parseMaintenanceArgs(['status'], NOW)).toEqual({ command: 'status' })
    expect(() => parseMaintenanceArgs(['off', '--until', '2026-12-02 06:00'], NOW)).toThrow(
      '--until',
    )
  })

  it('모르는 명령은 던진다', () => {
    expect(() => parseMaintenanceArgs([], NOW)).toThrow()
    expect(() => parseMaintenanceArgs(['pause'], NOW)).toThrow('pause')
  })
})

describe('maintenanceFile', () => {
  // 앱은 `maintenance: true` 가 있어야 점검으로 읽는다. 공용 와이파이의 로그인 페이지도 200 을 주기 때문이다.
  it('앱이 점검으로 읽는 표시와 종료 예정 시각을 적는다', () => {
    expect(JSON.parse(maintenanceFile('2026-12-02T06:00:00+09:00'))).toEqual({
      maintenance: true,
      until: '2026-12-02T06:00:00+09:00',
    })
    expect(JSON.parse(maintenanceFile(null))).toEqual({ maintenance: true, until: null })
  })
})
