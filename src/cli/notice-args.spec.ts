import { parseNoticeArgs } from './notice-args'

describe('parseNoticeArgs', () => {
  it('send 는 title 과 body 가 필수이고 id · link · dry 는 선택이다', () => {
    expect(parseNoticeArgs(['send', '--title', '점검', '--body', '본문'])).toEqual({
      command: 'send',
      id: undefined,
      title: '점검',
      body: '본문',
      link: undefined,
      dry: false,
    })
    expect(
      parseNoticeArgs([
        'send',
        '--id',
        '2026-09-08-maint',
        '--title',
        't',
        '--body',
        'b',
        '--link',
        'https://l',
        '--dry',
      ]),
    ).toMatchObject({ id: '2026-09-08-maint', link: 'https://l', dry: true })
    expect(() => parseNoticeArgs(['send', '--title', 't'])).toThrow('body')
  })

  it('list 는 kind 를 검사하고 limit 기본은 20 이다', () => {
    expect(parseNoticeArgs(['list', '--kind', 'game'])).toEqual({
      command: 'list',
      kind: 'game',
      limit: 20,
    })
    expect(parseNoticeArgs(['list', '--limit', '5'])).toEqual({
      command: 'list',
      kind: undefined,
      limit: 5,
    })
    expect(() => parseNoticeArgs(['list', '--kind', 'web'])).toThrow('kind')
  })

  it('push 는 id 가 필수이고 dry 를 받는다', () => {
    expect(parseNoticeArgs(['push', '--id', 'game-1', '--dry'])).toEqual({
      command: 'push',
      id: 'game-1',
      dry: true,
    })
    expect(() => parseNoticeArgs(['push'])).toThrow('id')
  })

  it('모르는 명령은 던진다', () => {
    expect(() => parseNoticeArgs([])).toThrow()
    expect(() => parseNoticeArgs(['nuke'])).toThrow('nuke')
  })
})
