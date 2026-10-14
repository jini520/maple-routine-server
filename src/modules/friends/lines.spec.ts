import {
  doneLine,
  endLine,
  failLine,
  isJsonObject,
  nextCursorOf,
  pageLine,
  pathOf,
  sanitizeBody,
} from './lines'

describe('pathOf', () => {
  it('내역 넷의 첫 쪽에 count 와 date 를 붙이고, 다음 쪽에는 cursor 만 붙인다', () => {
    expect(pathOf({ kind: 'cube', date: '2026-10-01' }, null)).toBe(
      '/maplestory/v1/history/cube?count=1000&date=2026-10-01',
    )
    expect(pathOf({ kind: 'soul-potential', date: '2026-10-01' }, 'C1=')).toBe(
      '/maplestory/v1/history/soul-potential?count=1000&cursor=C1%3D',
    )
    expect(pathOf({ kind: 'starforce', date: '2026-10-01' }, null)).toContain('/history/starforce?')
    expect(pathOf({ kind: 'potential', date: '2026-10-01' }, null)).toContain('/history/potential?')
  })

  it('character-state 는 ocid 와 date 를 붙이고 character-list 는 아무것도 안 붙인다', () => {
    expect(pathOf({ kind: 'character-state', date: '2026-10-01', ocid: 'O/1' }, null)).toBe(
      '/maplestory/v1/scheduler/character-state?ocid=O%2F1&date=2026-10-01',
    )
    expect(pathOf({ kind: 'character-list' }, null)).toBe('/maplestory/v1/character/list')
  })
})

describe('sanitizeBody', () => {
  it('개행과 CR 을 공백으로 바꾸고 길이를 지킨다', () => {
    const raw = '{"a":\r\n1,\n"b":"한"}'
    const out = sanitizeBody(Buffer.from(raw))
    expect(out.toString()).toBe('{"a":  1, "b":"한"}')
    expect(out.length).toBe(Buffer.byteLength(raw))
  })
})

describe('nextCursorOf', () => {
  it('커서를 꺼내고, 없거나 비었거나 null 이면 null 이다', () => {
    expect(nextCursorOf(Buffer.from('{"count":2,"next_cursor":"abc=","cube_history":[]}'))).toBe(
      'abc=',
    )
    expect(nextCursorOf(Buffer.from('{"count":2,"next_cursor": "x" }'))).toBe('x')
    expect(nextCursorOf(Buffer.from('{"next_cursor":""}'))).toBeNull()
    expect(nextCursorOf(Buffer.from('{"next_cursor":null}'))).toBeNull()
    expect(nextCursorOf(Buffer.from('{"count":0}'))).toBeNull()
  })
})

describe('isJsonObject', () => {
  it('앞 공백을 건너뛰고 { 를 본다', () => {
    expect(isJsonObject(Buffer.from('  \n{"a":1}'))).toBe(true)
    expect(isJsonObject(Buffer.from('<html>'))).toBe(false)
    expect(isJsonObject(Buffer.alloc(0))).toBe(false)
  })
})

describe('줄', () => {
  it('pageLine 은 본문을 파싱하지 않고 그대로 싣고 한 줄 JSON 이 된다', () => {
    const body = Buffer.from('{"count":1,"cube_history":[{"id":"x"}]}')
    const line = pageLine({ kind: 'cube', date: '2026-10-01' }, 2, body).toString()
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(JSON.parse(line)).toEqual({
      t: 'page',
      kind: 'cube',
      date: '2026-10-01',
      n: 2,
      body: { count: 1, cube_history: [{ id: 'x' }] },
    })
  })

  it('done · fail · end 줄은 작업의 kind · date · ocid 를 그대로 돌려준다', () => {
    expect(
      JSON.parse(
        doneLine({ kind: 'character-state', date: '2026-10-01', ocid: 'O' }, 1).toString(),
      ),
    ).toEqual({ t: 'done', kind: 'character-state', date: '2026-10-01', ocid: 'O', pages: 1 })
    expect(JSON.parse(failLine({ kind: 'character-list' }, 429).toString())).toEqual({
      t: 'fail',
      kind: 'character-list',
      status: 429,
    })
    expect(endLine('deadline').toString()).toBe('{"t":"end","reason":"deadline"}\n')
  })
})
