import { MAINTENANCE_TARGETS, maintenanceFile, parseMaintenanceArgs } from './maintenance-args'

/** 2026-12-01 23:00 KST. */
const NOW = Date.parse('2026-12-01T14:00:00Z')

describe('parseMaintenanceArgs', () => {
  it('on 은 대상과 종료 예정 시각을 한국 시각으로 읽는다', () => {
    expect(
      parseMaintenanceArgs(['on', '--target', 'api', '--until', '2026-12-02 06:00'], NOW),
    ).toEqual({
      command: 'on',
      targets: ['api'],
      until: '2026-12-02T06:00:00+09:00',
    })
  })

  it('on 은 종료 예정 시각 없이도 켠다', () => {
    expect(parseMaintenanceArgs(['on', '--target', 'root'], NOW)).toEqual({
      command: 'on',
      targets: ['root'],
      until: null,
    })
  })

  // 기본값이 있으면 대상을 빠뜨렸을 때 1.0.14 사용자를 잘못 잠글 수 있다.
  it('on 과 off 는 대상 없이는 멈춘다', () => {
    expect(() => parseMaintenanceArgs(['on'], NOW)).toThrow('--target')
    expect(() => parseMaintenanceArgs(['off'], NOW)).toThrow('--target')
  })

  it('both 는 두 주소이고, 모르는 대상은 멈춘다', () => {
    expect(parseMaintenanceArgs(['off', '--target', 'both'], NOW)).toEqual({
      command: 'off',
      targets: ['api', 'root'],
    })
    expect(() => parseMaintenanceArgs(['on', '--target', 'all'], NOW)).toThrow('all')
  })

  it('status 는 대상을 빼면 두 주소를 다 묻는다', () => {
    expect(parseMaintenanceArgs(['status'], NOW)).toEqual({
      command: 'status',
      targets: ['api', 'root'],
    })
    expect(parseMaintenanceArgs(['status', '--target', 'root'], NOW)).toEqual({
      command: 'status',
      targets: ['root'],
    })
  })

  // 지난 시각을 적으면 앱이 종료 예정 칸을 그리지 않는다. 날짜를 잘못 적은 것을 켜기 전에 알린다.
  it('이미 지난 종료 예정 시각은 받지 않는다', () => {
    const on = (until: string) =>
      parseMaintenanceArgs(['on', '--target', 'api', '--until', until], NOW)
    expect(() => on('2026-12-01 22:59')).toThrow('지난')
    expect(() => on('2026-12-01 23:00')).toThrow('지난')
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
    expect(() => parseMaintenanceArgs(['on', '--target', 'api', '--until', until], NOW)).toThrow(
      '--until',
    )
  })

  it('종료 예정 시각은 on 에만 쓴다', () => {
    expect(() =>
      parseMaintenanceArgs(['off', '--target', 'api', '--until', '2026-12-02 06:00'], NOW),
    ).toThrow('--until')
    expect(() => parseMaintenanceArgs(['status', '--until', '2026-12-02 06:00'], NOW)).toThrow(
      '--until',
    )
  })

  it('모르는 명령은 던진다', () => {
    expect(() => parseMaintenanceArgs([], NOW)).toThrow()
    expect(() => parseMaintenanceArgs(['pause'], NOW)).toThrow('pause')
  })
})

describe('MAINTENANCE_TARGETS', () => {
  // 파일이 하나면 api 를 잠그는 순간 1.0.14 사용자도 잠긴다. 1.0.15 로 전환할 때 둘을 따로 잠근다.
  it('주소마다 파일과 묻는 주소가 다르다', () => {
    expect(MAINTENANCE_TARGETS.api.file).not.toBe(MAINTENANCE_TARGETS.root.file)
    expect(MAINTENANCE_TARGETS.api.statusUrl).not.toBe(MAINTENANCE_TARGETS.root.statusUrl)
  })

  // 운영 nginx 의 루트 설정과 main 의 스크립트가 이 자리를 읽고 쓴다. 옮기면 main 의 스크립트로 켠 잠금이 루트에 안 걸린다.
  it('루트의 파일은 처음 자리 그대로다', () => {
    expect(MAINTENANCE_TARGETS.root.file).toBe('/srv/maple-routine-maintenance/maintenance.json')
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
