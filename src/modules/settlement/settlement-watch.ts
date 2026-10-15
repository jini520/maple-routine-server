/**
 * 결산 판정의 순수한 부분. 시계를 받아 밤 · 타점 · 응답을 판정으로 바꾼다.
 *
 * 밤은 00:00 ~ 06:00 KST 다. 그 밤에 결산 중을 본 뒤 200 을 보면 끝이고, 못 본 채 200 이면 시작 전이다.
 * 실패는 판정을 안 바꾼다. 실패를 결산 아님으로 읽으면 넥슨이 잠깐 죽을 때 띠가 내려갔다 올라온다.
 */

/** KST 는 서머타임이 없어 +9 시간이 곧 KST 다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
/** 이 시각(KST)부터는 밤이 아니다. 끝을 못 봤어도 결산 아님이다. */
export const WINDOW_END_HOUR = 6

export type Probe = 'settling' | 'settled' | 'unknown'

export interface WatchState {
  /** 보고 있는 밤의 날짜(KST). 창 밖이면 null. */
  nightDate: string | null
  settling: boolean
  /** 그 밤의 끝을 봤다. 남은 타점을 안 부른다. */
  finished: boolean
}

export interface SettlementView {
  settling: boolean
  startedAt: string | null
}

export const IDLE: WatchState = { nightDate: null, settling: false, finished: false }
export const NOT_SETTLING: SettlementView = { settling: false, startedAt: null }

function kstOf(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS)
}

/** 창 안이면 그 밤의 날짜(KST), 밖이면 null. */
export function nightOf(now: Date): string | null {
  const kst = kstOf(now)
  if (kst.getUTCHours() >= WINDOW_END_HOUR) return null
  return kst.toISOString().slice(0, 10)
}

/** 결산되는 하루는 밤의 전날이다. 넥슨에 묻는 date 가 이것이다. */
export function yesterdayOf(nightDate: string): string {
  const day = new Date(`${nightDate}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

/** 앱이 닫은 결산을 알아보는 열쇠. 관측 시각이 아니라 그 밤의 00:00 KST 라 재시작해도 같다. */
export function startedAtOf(nightDate: string): string {
  return new Date(`${nightDate}T00:00:00+09:00`).toISOString()
}

/** 지금 넥슨을 불러야 하면 그 밤의 날짜, 아니면 null. 창 밖이거나 그 밤의 끝을 이미 봤으면 안 부른다. */
export function probeNight(state: WatchState, now: Date): string | null {
  const night = nightOf(now)
  if (night === null) return null
  if (state.nightDate === night && state.finished) return null
  return night
}

export function reduce(state: WatchState, probe: Probe, now: Date): WatchState {
  const night = nightOf(now)
  if (night === null) return IDLE
  const base: WatchState =
    state.nightDate === night ? state : { nightDate: night, settling: false, finished: false }
  switch (probe) {
    case 'settling':
      return { ...base, settling: true }
    case 'settled':
      // 결산 중을 본 적이 없는 200 은 시작 전이다. 끝으로 읽으면 늦게 시작한 밤을 통째로 놓친다.
      return base.settling ? { ...base, settling: false, finished: true } : base
    case 'unknown':
      return base
  }
}

/** 앱에 주는 모양. 다른 밤의 상태는 06:00 이 지난 것이라 결산 아님이다. */
export function viewOf(state: WatchState, now: Date): SettlementView {
  const night = nightOf(now)
  if (night === null || state.nightDate !== night || !state.settling) return NOT_SETTLING
  return { settling: true, startedAt: startedAtOf(night) }
}
