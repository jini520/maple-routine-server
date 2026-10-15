import {
  IDLE,
  nightOf,
  probeNight,
  reduce,
  startedAtOf,
  viewOf,
  type WatchState,
  yesterdayOf,
} from './settlement-watch'

/** KST 시각을 UTC Date 로. */
const kst = (text: string) => new Date(`${text}+09:00`)

describe('nightOf', () => {
  it('00:00 부터 05:59 까지가 그 날짜의 밤이고 그 밖은 null 이다', () => {
    expect(nightOf(kst('2026-10-14T23:59:59'))).toBeNull()
    expect(nightOf(kst('2026-10-15T00:00:00'))).toBe('2026-10-15')
    expect(nightOf(kst('2026-10-15T05:59:59'))).toBe('2026-10-15')
    expect(nightOf(kst('2026-10-15T06:00:00'))).toBeNull()
    expect(nightOf(kst('2026-10-15T12:00:00'))).toBeNull()
  })

  it('월초 새벽도 KST 로 센다', () => {
    expect(nightOf(new Date('2026-10-31T15:30:00Z'))).toBe('2026-11-01')
  })
})

describe('yesterdayOf', () => {
  it('달과 해를 넘어 하루 전을 준다', () => {
    expect(yesterdayOf('2026-10-15')).toBe('2026-10-14')
    expect(yesterdayOf('2026-11-01')).toBe('2026-10-31')
    expect(yesterdayOf('2027-01-01')).toBe('2026-12-31')
  })
})

describe('startedAtOf', () => {
  it('그 밤의 00:00 KST 를 ISO 로 낸다', () => {
    expect(startedAtOf('2026-10-15')).toBe('2026-10-14T15:00:00.000Z')
  })
})

describe('probeNight', () => {
  const night = (finished: boolean): WatchState => ({
    nightDate: '2026-10-15',
    settling: !finished,
    finished,
  })

  it('창 밖이면 안 부른다', () => {
    expect(probeNight(IDLE, kst('2026-10-15T06:00:00'))).toBeNull()
  })

  it('창 안이고 끝을 못 봤으면 그 밤을 준다', () => {
    expect(probeNight(IDLE, kst('2026-10-15T00:01:00'))).toBe('2026-10-15')
    expect(probeNight(night(false), kst('2026-10-15T03:00:00'))).toBe('2026-10-15')
  })

  it('그 밤의 끝을 봤으면 안 부르고, 다른 밤의 상태는 무시한다', () => {
    expect(probeNight(night(true), kst('2026-10-15T03:00:00'))).toBeNull()
    expect(probeNight(night(true), kst('2026-10-16T00:01:00'))).toBe('2026-10-16')
  })
})

describe('reduce', () => {
  const t = (text: string) => kst(`2026-10-15T${text}`)

  it('결산 중을 보면 settling 이고, 그 뒤 200 이면 끝이다', () => {
    const started = reduce(IDLE, 'settling', t('00:01:00'))
    expect(started).toEqual({ nightDate: '2026-10-15', settling: true, finished: false })

    const ended = reduce(started, 'settled', t('02:01:00'))
    expect(ended).toEqual({ nightDate: '2026-10-15', settling: false, finished: true })
  })

  it('결산 중을 못 본 200 은 시작 전이라 끝으로 안 읽는다', () => {
    const state = reduce(IDLE, 'settled', t('00:01:00'))
    expect(state).toEqual({ nightDate: '2026-10-15', settling: false, finished: false })
  })

  it('모름은 판정을 안 바꾼다', () => {
    const started = reduce(IDLE, 'settling', t('00:01:00'))
    expect(reduce(started, 'unknown', t('00:11:00'))).toEqual(started)
    expect(reduce(IDLE, 'unknown', t('00:11:00'))).toEqual({
      nightDate: '2026-10-15',
      settling: false,
      finished: false,
    })
  })

  it('다른 밤의 상태는 버리고 새 밤으로 시작한다', () => {
    const old: WatchState = { nightDate: '2026-10-14', settling: true, finished: false }
    expect(reduce(old, 'settled', t('00:01:00'))).toEqual({
      nightDate: '2026-10-15',
      settling: false,
      finished: false,
    })
  })

  it('창 밖에서는 IDLE 이다', () => {
    const started = reduce(IDLE, 'settling', t('00:01:00'))
    expect(reduce(started, 'settling', t('06:00:00'))).toEqual(IDLE)
  })
})

describe('viewOf', () => {
  const settling: WatchState = { nightDate: '2026-10-15', settling: true, finished: false }

  it('결산 중이면 startedAt 이 그 밤의 00:00 KST 이고 재시작해도 같다', () => {
    expect(viewOf(settling, kst('2026-10-15T00:30:00'))).toEqual({
      settling: true,
      startedAt: '2026-10-14T15:00:00.000Z',
    })
    expect(viewOf(settling, kst('2026-10-15T01:30:00'))).toEqual({
      settling: true,
      startedAt: '2026-10-14T15:00:00.000Z',
    })
  })

  it('06:00 이 지나면 상태가 남아 있어도 결산 아님이다', () => {
    expect(viewOf(settling, kst('2026-10-15T06:00:00'))).toEqual({
      settling: false,
      startedAt: null,
    })
  })

  it('끝을 봤거나 시작 전이면 결산 아님이다', () => {
    expect(
      viewOf({ ...settling, settling: false, finished: true }, kst('2026-10-15T02:30:00')),
    ).toEqual({ settling: false, startedAt: null })
    expect(viewOf(IDLE, kst('2026-10-15T00:30:00'))).toEqual({ settling: false, startedAt: null })
  })
})
