import { streamBody } from './friends.dto'

describe('streamBody', () => {
  it('여섯 kind 를 받고 내역 넷과 character-state 는 date 가 있어야 한다', () => {
    const ok = streamBody.safeParse({
      tasks: [
        { kind: 'cube', date: '2026-10-01' },
        { kind: 'starforce', date: '2026-10-01' },
        { kind: 'potential', date: '2026-10-01' },
        { kind: 'soul-potential', date: '2026-10-01' },
        { kind: 'character-state', date: '2026-10-01', ocid: 'O' },
        { kind: 'character-list' },
      ],
    })
    expect(ok.success).toBe(true)
    expect(streamBody.safeParse({ tasks: [{ kind: 'cube' }] }).success).toBe(false)
    expect(streamBody.safeParse({ tasks: [{ kind: 'cube', date: '20261001' }] }).success).toBe(
      false,
    )
  })

  it('character-state 는 ocid 가 있어야 하고 모르는 kind 는 거절한다', () => {
    expect(
      streamBody.safeParse({ tasks: [{ kind: 'character-state', date: '2026-10-01' }] }).success,
    ).toBe(false)
    expect(streamBody.safeParse({ tasks: [{ kind: 'achievement' }] }).success).toBe(false)
  })

  it('작업은 하나 이상 1,000 까지다', () => {
    expect(streamBody.safeParse({ tasks: [] }).success).toBe(false)
    const many = Array.from({ length: 1001 }, () => ({ kind: 'character-list' }))
    expect(streamBody.safeParse({ tasks: many }).success).toBe(false)
    expect(streamBody.safeParse({ tasks: many.slice(0, 1000) }).success).toBe(true)
  })
})
