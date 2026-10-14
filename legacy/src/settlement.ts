/**
 * 넥슨이 스케줄러 기록을 **결산 중인지** 밤마다 확인해 들고 있는다. 앱이 `GET /v1/settlement`
 * 로 물어 간다.
 *
 * **앱이 시각으로 가르면 틀리기 때문에 서버가 본다.** 결산의 시작과 끝이 날마다 다르다. 실측은
 * 어제 기록이 KST 01:52 에 400 `OPENAPI00009`, 03:44 에 200 이었다(2026-07-31).
 *
 * **묻는 것은 `date=어제` 하나이고 자정 전은 안 본다.** 자정 전에는 하루가 안 끝나 `date=오늘`
 * 이 400 `OPENAPI00004` 로 거절되고, 남는 `date` 없는 조회는 **결산 중에도 200 을 주어** 가를
 * 수가 없다. 2026-07-31 실측이 그것을 보였고(01:52 에 `date=어제` 는 400 인데 날짜 없는 조회는
 * 200), 여섯 밤 로그가 다시 확인했다(2026-09-25).
 *
 * **밤 하나가 타점 둘이다**(사용자 지정 2026-09-26). 00:01 에 결산 중인 것을 보고, 02:00 에 끝난
 * 것을 본다. 그 사이 두 시간은 쉰다. 여섯 밤 실측이 모두 00:00 시작 · 02:00 종료였다. 02:00 에
 * 안 끝났으면 그때부터 1분마다 묻고, 끝난 시각을 로그에 남긴다. 첫 타점에 아직 시작을 안 했으면
 * 창이 닫힐 때까지 1분마다 기다린다.
 */

/** 넥슨 응답에서 판정에 필요한 것만. 몸통은 안 본다 — 우리가 묻는 것은 «지금 되는가» 뿐이다. */
export interface Probe {
  ok: boolean
  status: number
  code: string | null
}

export interface SettlementDeps {
  /** 결산되는 날짜(어제)를 묻는다. 던지면 모름으로 친다. */
  probe: (date: string) => Promise<Probe>
  /** 테스트가 고정한다. */
  now?: () => number
}

export interface WatchState {
  settling: boolean
  /** ISO 8601. 앱이 닫은 결산을 알아보는 열쇠다. */
  startedAt: string | null
  /** 결산이 끝난 것을 본 밤. 그 밤에는 더 안 부른다. */
  doneNight: string | null
  /** 다음에 넥슨을 부를 때(epoch ms). 그 전에는 고리가 돌아도 안 부른다. */
  nextProbeAt: number | null
}

/** 앱에 주는 모양. */
export interface Settlement {
  settling: boolean
  startedAt: string | null
}

export const IDLE: WatchState = { settling: false, startedAt: null, doneNight: null, nextProbeAt: null }

/** 결산 중이라는 신호. 이 코드 하나만 «시간이 지나면 풀리는 실패» 다. */
const SETTLING_CODE = 'OPENAPI00009'

/** 끝을 못 봐도 끄는 KST 시각. 창은 자정에 열린다. */
const WATCH_TO_HOUR = 6

const MINUTE_MS = 60 * 1000

/**
 * 그 밤의 첫 타점(KST 분). 00:00 정각이 아니라 1분 뒤인 것은, 묻는 날짜가 자정에 어제로 막
 * 바뀌어서다. 경계에 바로 붙이면 넥슨과 우리 시계 차이만큼 헛짚는다.
 */
const FIRST_PROBE_MINUTE = 1

/**
 * 끝났는지 보러 가는 KST 시. **여섯 밤 실측이 모두 02:00 정각이었다**(2026-09-19 ~ 09-25).
 * 감지 시각의 위상이 밤마다 달랐는데도 교집합이 01:59:58 ~ 02:00:07 로 모였다.
 */
const EXPECTED_END_HOUR = 2

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 의 날짜와 시. 서버가 UTC 로 돌아도 판정 축은 KST 다. */
function kstParts(at: number): { date: string; hour: number } {
  const shifted = new Date(at + KST_OFFSET_MS).toISOString()
  return { date: shifted.slice(0, 10), hour: Number(shifted.slice(11, 13)) }
}

function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** KST 그날 시:분의 epoch ms. */
function kstMoment(date: string, hour: number, minute: number): number {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return Date.parse(`${date}T${hh}:${mm}:00+09:00`)
}

/**
 * 한 회차. **타점이 아니면 넥슨을 안 부른다.**
 *
 * 밤 하나가 타점 둘로 끝나는 것이 보통이다. 00:01 에 결산 중인 것을 보고, 02:00 에 끝난 것을
 * 본다. 그 사이 두 시간은 쉰다. 02:00 에 안 끝났으면 그때부터 1분마다 묻는다.
 *
 * @example const next = await tick(state, { probe })
 */
export async function tick(state: WatchState, deps: SettlementDeps): Promise<WatchState> {
  const at = (deps.now ?? Date.now)()
  const { date, hour } = kstParts(at)

  // 창 밖이다. 끝을 못 봤어도 여기서 내린다. 06:00 이 지나도 결산 중이라고 말하면 낮 내내
  // 배너가 서 있는다. 타점도 지워 다음 밤이 첫 타점부터 다시 센다.
  if (hour >= WATCH_TO_HOUR) {
    return { ...state, settling: false, startedAt: null, nextProbeAt: null }
  }

  const night = previousDay(date)
  if (state.doneNight === night) {
    return { ...state, settling: false, startedAt: null, nextProbeAt: null }
  }

  const plannedAt = state.nextProbeAt ?? kstMoment(date, 0, FIRST_PROBE_MINUTE)
  if (at < plannedAt) return state

  let probe: Probe
  try {
    probe = await deps.probe(night)
  } catch (error) {
    // 모름이다. 판정을 안 바꾸고 1분 뒤에 다시 묻는다.
    console.error('[settlement] 조회 실패', error)
    return { ...state, nextProbeAt: at + MINUTE_MS }
  }

  const endAt = kstMoment(date, EXPECTED_END_HOUR, 0)

  if (probe.ok) {
    // 결산을 아직 본 적이 없다. 넥슨이 시작을 늦춘 것일 수 있으므로 창이 닫힐 때까지 기다린다
    // (사용자 결정 2026-09-26). 여기서 밤을 끄면 늦게 시작한 결산을 통째로 놓친다.
    if (!state.settling) return { ...state, nextProbeAt: at + MINUTE_MS }

    // 02:00 타점이 못 본 종료다. 한 밤에 한 번만 찍힌다. 1분의 여유는 타점이 그 분 안에서
    // 흔들리기 때문이다.
    if (at >= endAt + MINUTE_MS) {
      console.warn(
        '[settlement] 02:00 을 넘겨 끝났다',
        JSON.stringify({ endedAt: new Date(at).toISOString() }),
      )
    }
    return { settling: false, startedAt: null, doneNight: night, nextProbeAt: null }
  }

  if (probe.code === SETTLING_CODE) {
    // 이어지는 결산은 같은 결산이다. 시작 시각을 덮으면 앱이 닫아 둔 배너가 다시 선다.
    return {
      ...state,
      settling: true,
      startedAt: state.startedAt ?? new Date(at).toISOString(),
      // 02:00 이 아직이면 거기까지 쉬고, 이미 지났으면 1분마다 끝을 기다린다.
      nextProbeAt: at < endAt ? endAt : at + MINUTE_MS,
    }
  }

  // 키·`OPENAPI00003`·5xx 는 결산 중이 아니라 모름이다. 이미 본 결산을 지우지 않는다 —
  // 넥슨이 한 번 못 답했다고 배너가 깜빡이면 안 된다. 창이 06:00 에 닫히므로 오래 남지 않는다.
  console.error('[settlement] 모르는 응답', JSON.stringify({ status: probe.status, code: probe.code }))
  return { ...state, nextProbeAt: at + MINUTE_MS }
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
