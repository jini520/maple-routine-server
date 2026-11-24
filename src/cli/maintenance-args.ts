import { parseArgs } from 'node:util'

import { formatKst } from '../common/kst'

/** 점검을 거는 주소. `root` 는 1.0.14 까지의 앱이, `api` 는 1.0.15 부터의 앱이 묻는다. */
export type MaintenanceTarget = 'api' | 'root'

export type MaintenanceCommand =
  /** `until` 은 `2026-12-02T06:00:00+09:00` 꼴. 적지 않았으면 `null`. */
  | { command: 'on'; targets: MaintenanceTarget[]; until: string | null }
  | { command: 'off'; targets: MaintenanceTarget[] }
  | { command: 'status'; targets: MaintenanceTarget[] }

/**
 * 주소마다 앱 박스의 점검 파일과 앱이 묻는 주소. 그 주소의 nginx 가 그 파일이 있으면 `/v1/` 을 막는다.
 *
 * 루트의 파일은 처음 자리 그대로다. 운영 nginx 의 루트 설정과 main 의 스크립트가 이 자리를 읽고 쓴다.
 */
export const MAINTENANCE_TARGETS: Record<MaintenanceTarget, { file: string; statusUrl: string }> = {
  api: {
    file: '/srv/maple-routine-maintenance/api/maintenance.json',
    statusUrl: 'https://api.mapleroutine.store/v1/maintenance',
  },
  root: {
    file: '/srv/maple-routine-maintenance/maintenance.json',
    statusUrl: 'https://mapleroutine.store/v1/maintenance',
  },
}

const BOTH: MaintenanceTarget[] = ['api', 'root']

const OPTIONS = { until: { type: 'string' }, target: { type: 'string' } } as const

const UNTIL = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/

/** `2026-12-02 06:00`(한국 시각)을 ISO 글자로. 없는 날짜와 지난 시각은 던진다. */
function toUntil(text: string, now: number): string {
  const match = UNTIL.exec(text)
  if (match === null) throw new Error(`--until 은 "2026-12-02 06:00" 꼴의 한국 시각이다: ${text}`)
  const iso = `${match[1]}T${match[2]}:00+09:00`
  const ms = Date.parse(iso)
  // Date 는 2월 30일을 3월 2일로, 24:00 을 다음 날 00:00 으로 넘긴다. 다시 한국 시각으로 적어 같은 글자인지 본다.
  if (Number.isNaN(ms) || formatKst(new Date(ms)) !== `${text}:00`) {
    throw new Error(`--until 에 없는 날짜나 시각이 있다: ${text}`)
  }
  // 지난 시각이면 앱이 종료 예정 칸을 그리지 않는다. 날짜를 잘못 적은 것을 켜기 전에 알린다.
  if (ms <= now) throw new Error(`--until 이 이미 지난 시각이다: ${text}`)
  return iso
}

/** `--target` 의 값. 켜고 끌 때는 기본값이 없다. 빠뜨렸을 때 1.0.14 사용자를 잘못 잠그지 않게 한다. */
function toTargets(text: string | undefined, required: boolean): MaintenanceTarget[] {
  if (text === undefined) {
    if (required) throw new Error('--target 을 꼭 적는다: api | root | both')
    return BOTH
  }
  if (text === 'both') return BOTH
  if (text === 'api' || text === 'root') return [text]
  throw new Error(`모르는 대상: ${text}. api | root | both`)
}

/**
 * `npm run maintenance -- on|off|status --target api|root|both …` 의 인자. 틀리면 무엇이 틀렸는지가 메시지다.
 *
 * @param now 지금 시각(ms). 지난 종료 예정 시각을 거르는 기준
 */
export function parseMaintenanceArgs(argv: readonly string[], now: number): MaintenanceCommand {
  const [command, ...rest] = argv
  const { values } = parseArgs({ args: [...rest], options: OPTIONS, strict: true })

  switch (command) {
    case 'on':
      return {
        command,
        targets: toTargets(values.target, true),
        until: values.until === undefined ? null : toUntil(values.until, now),
      }
    case 'off':
    case 'status':
      if (values.until !== undefined) throw new Error('--until 은 on 에만 쓴다')
      return { command, targets: toTargets(values.target, command === 'off') }
    default:
      throw new Error(`모르는 명령: ${command ?? '(없음)'}. on | off | status`)
  }
}

/**
 * 점검 파일의 내용. nginx 가 `GET /v1/maintenance` 에 이 글자를 그대로 낸다.
 *
 * 앱은 `maintenance: true` 가 있어야 점검으로 읽는다. 공용 와이파이의 로그인 페이지도 200 을 주기 때문이다.
 */
export function maintenanceFile(until: string | null): string {
  return `${JSON.stringify({ maintenance: true, until })}\n`
}
