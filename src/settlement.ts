/**
 * 넥슨이 스케줄러 기록을 **결산 중인지** 밤마다 확인해 들고 있는다. 앱이 `GET /v1/settlement`
 * 로 물어 간다.
 *
 * **앱이 시각으로 가르면 틀리기 때문에 서버가 본다.** 결산의 시작과 끝이 날마다 다르다. 실측은
 * 어제 기록이 KST 01:52 에 400 `OPENAPI00009`, 03:44 에 200 이었다(2026-07-31).
 *
 * **자정 전과 뒤에 부르는 조회가 다르다.** 자정 전에는 하루가 안 끝나 `date=오늘` 이 400
 * `OPENAPI00004` 로 거절되므로 `date` 없는 조회를 쓴다. 자정 뒤에는 끝난 하루(켠 날)를 묻는다.
 *
 * ⚠️ **자정 전 결산 중에 무엇이 오는지 아직 모른다.** 잰 기록이 전부 새벽 것이다. 그래서 자정
 * 전 구간은 200 만 읽고(아직 결산 전), 오류는 판정하지 않고 로그만 남긴다. 첫날 밤 로그를 보고
 * 신호를 알아낸 뒤에 이 자리를 채운다.
 */

/** 넥슨 응답에서 판정에 필요한 것만. 몸통은 안 본다 — 우리가 묻는 것은 «지금 되는가» 뿐이다. */
export interface Probe {
  ok: boolean
  status: number
  code: string | null
}

export interface SettlementDeps {
  /** `date` 가 `null` 이면 날짜 없는 조회. 던지면 모름으로 친다. */
  probe: (date: string | null) => Promise<Probe>
  /** 테스트가 고정한다. */
  now?: () => number
}

export interface WatchState {
  settling: boolean
  /** ISO 8601. 앱이 닫은 결산을 알아보는 열쇠다. */
  startedAt: string | null
  /** 결산이 끝난 것을 본 밤. 그 밤에는 더 안 부른다. */
  doneNight: string | null
}

/** 앱에 주는 모양. */
export interface Settlement {
  settling: boolean
  startedAt: string | null
}

export const IDLE: WatchState = { settling: false, startedAt: null, doneNight: null }

/** 결산 중이라는 신호. 이 코드 하나만 «시간이 지나면 풀리는 실패» 다. */
const SETTLING_CODE = 'OPENAPI00009'

/** 밤마다 확인을 켜는 KST 시각. 넥슨이 대략 22:00 에 시작하므로 두 시간 앞에서 기다린다. */
const WATCH_FROM_HOUR = 20
/** 끝을 못 봐도 끄는 KST 시각. */
const WATCH_TO_HOUR = 6

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 의 날짜와 시. 서버가 UTC 로 돌아도 판정 축은 KST 다. */
function kstParts(at: number): { date: string; hour: number } {
  const shifted = new Date(at + KST_OFFSET_MS).toISOString()
  return { date: shifted.slice(0, 10), hour: Number(shifted.slice(11, 13)) }
}

function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * 지금이 확인 창 안인가. 창 안이면 그 밤의 이름과 자정 전후를 준다.
 *
 * **밤 이름은 켠 날이다.** 자정을 넘어도 같은 이름이라, 끝을 본 밤을 그 이름 하나로 기억한다.
 */
export function nightOf(at: number): { nightKey: string; phase: 'before' | 'after' } | null {
  const { date, hour } = kstParts(at)
  if (hour >= WATCH_FROM_HOUR) return { nightKey: date, phase: 'before' }
  if (hour < WATCH_TO_HOUR) return { nightKey: previousDay(date), phase: 'after' }
  return null
}

/**
 * 한 회차. 창 밖이거나 이미 끝을 본 밤이면 **넥슨을 안 부른다.**
 *
 * @example const next = await tick(state, { probe })
 */
export async function tick(state: WatchState, deps: SettlementDeps): Promise<WatchState> {
  const at = (deps.now ?? Date.now)()
  const night = nightOf(at)

  // 창 밖이다. 끝을 못 봤어도 여기서 내린다. 06:00 이 지나도 결산 중이라고 말하면 낮 내내
  // 배너가 서 있는다.
  if (night === null) return { ...state, settling: false, startedAt: null }

  if (state.doneNight === night.nightKey) return { ...state, settling: false, startedAt: null }

  let probe: Probe
  try {
    probe = await deps.probe(night.phase === 'after' ? night.nightKey : null)
  } catch (error) {
    // 모름이다. 판정을 안 바꾼다.
    console.error('[settlement] 조회 실패', error)
    return state
  }

  if (night.phase === 'before') {
    // 200 이면 아직 결산 전이다. 그 밖의 응답이 결산 중을 뜻하는지 아직 모르므로 판정하지
    // 않고 로그만 남긴다. 이 로그가 신호를 알아내는 유일한 길이다.
    if (probe.ok) return { ...state, settling: false, startedAt: null }
    console.log('[settlement] 자정 전 응답', JSON.stringify({ status: probe.status, code: probe.code }))
    return state
  }

  if (probe.ok) {
    // 결산이 끝났다. 그날 밤은 더 안 묻는다.
    return { settling: false, startedAt: null, doneNight: night.nightKey }
  }

  if (probe.code === SETTLING_CODE) {
    // 이어지는 결산은 같은 결산이다. 시작 시각을 덮으면 앱이 닫아 둔 배너가 다시 선다.
    return {
      ...state,
      settling: true,
      startedAt: state.startedAt ?? new Date(at).toISOString(),
    }
  }

  // 키·`OPENAPI00003`·5xx 는 결산 중이 아니라 모름이다. 이미 본 결산을 지우지 않는다 —
  // 넥슨이 한 번 못 답했다고 배너가 깜빡이면 안 된다. 창이 06:00 에 닫히므로 오래 남지 않는다.
  console.error('[settlement] 모르는 응답', JSON.stringify({ status: probe.status, code: probe.code }))
  return state
}

export function settlementOf(state: WatchState): Settlement {
  return { settling: state.settling, startedAt: state.startedAt }
}

/**
 * 확인을 건다. 돌려주는 함수를 부르면 멈춘다.
 *
 * 공지 폴링과 같은 모양이다 — `setInterval` 이 아니라 끝난 뒤에 다음을 잡아, 넥슨이 느린 날
 * 회차가 겹치지 않는다.
 */
export function startSettlementWatch(
  deps: SettlementDeps,
  intervalMs: number,
): { settlement: () => Settlement; stop: () => void } {
  let state = IDLE
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  const loop = async (): Promise<void> => {
    if (stopped) return

    const before = state.settling
    state = await tick(state, deps)
    if (before !== state.settling) {
      console.log('[settlement]', JSON.stringify(settlementOf(state)))
    }

    if (!stopped) timer = setTimeout(() => void loop(), intervalMs)
  }

  void loop()

  return {
    settlement: () => settlementOf(state),
    stop: () => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
    },
  }
}
