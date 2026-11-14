import { MarkdownRejected, markdownToNotice } from './markdown-blocks'

const IMAGE = 'https://mapleroutine.store/assets/3f9a.webp'

describe('markdownToNotice', () => {
  it('제목 · 문단 · 표를 소제목 · 글 · 표로 바꾸고 표는 머리 줄이 첫 줄이다', () => {
    const { blocks } = markdownToNotice(
      [
        '## 가계부 메모',
        '',
        '줄을 길게 눌러요',
        '',
        '| 칸 | 뜻 |',
        '|---|---|',
        '| 메모 | 한 줄 |',
      ].join('\n'),
    )

    expect(blocks).toEqual([
      { type: 'heading', text: '가계부 메모' },
      { type: 'text', text: '줄을 길게 눌러요' },
      {
        type: 'table',
        rows: [
          ['칸', '뜻'],
          ['메모', '한 줄'],
        ],
      },
    ])
  })

  it('문단 안에서 한 번 누른 줄바꿈은 남고 꾸밈은 글자만 남는다', () => {
    const { blocks } = markdownToNotice('첫 줄은 **굵게** _기울여_\n둘째 줄')

    expect(blocks).toEqual([{ type: 'text', text: '첫 줄은 굵게 기울여\n둘째 줄' }])
  })

  it('목록은 목록마다 글 하나이고 항목 앞에 점이나 번호를 붙인다', () => {
    const { blocks } = markdownToNotice(['- 하나', '- 둘', '', '1. 첫째', '2. 둘째'].join('\n'))

    expect(blocks).toEqual([
      { type: 'text', text: '• 하나\n• 둘' },
      { type: 'text', text: '1. 첫째\n2. 둘째' },
    ])
  })

  it('문단 안의 그림은 문단을 그림 앞뒤로 나눈다', () => {
    const { blocks } = markdownToNotice(`앞 글\n![](${IMAGE})\n뒤 글`)

    expect(blocks).toEqual([
      { type: 'text', text: '앞 글' },
      { type: 'image', src: IMAGE },
      { type: 'text', text: '뒤 글' },
    ])
  })

  it('링크만 있는 문단은 링크이고, 글 사이 링크는 글을 남긴 채 문단 뒤에 온다', () => {
    const { blocks } = markdownToNotice(
      [
        '[자세한 설명](https://g.test/a)',
        '',
        '자세한 건 [가이드](https://g.test/b) 를 보세요.',
        '',
        '끝',
      ].join('\n'),
    )

    expect(blocks).toEqual([
      { type: 'link', text: '자세한 설명', href: 'https://g.test/a' },
      { type: 'text', text: '자세한 건 가이드 를 보세요.' },
      { type: 'link', text: '가이드', href: 'https://g.test/b' },
      { type: 'text', text: '끝' },
    ])
  })

  it('인용은 안의 내용으로, 코드와 HTML 은 글자 그대로 글이 되고 구분선은 버린다', () => {
    const { blocks } = markdownToNotice(
      ['> 인용 글', '', '```', 'code line', '```', '', '<b>굵게</b>', '', '---', '', '끝'].join(
        '\n',
      ),
    )

    expect(blocks).toEqual([
      { type: 'text', text: '인용 글' },
      { type: 'text', text: 'code line' },
      { type: 'text', text: '<b>굵게</b>' },
      { type: 'text', text: '끝' },
    ])
  })

  it('https 가 아닌 그림 · 링크 주소는 그 주소를 들어 거절한다', () => {
    for (const [source, url] of [
      ['![](http://x.test/a.png)', 'http://x.test/a.png'],
      ['[글](http://x.test/b)', 'http://x.test/b'],
      ['[글](/settings)', '/settings'],
    ]) {
      expect(() => markdownToNotice(source)).toThrow(MarkdownRejected)
      expect(() => markdownToNotice(source)).toThrow(url)
    }
  })

  it('블록이 하나도 안 나오면 거절한다', () => {
    expect(() => markdownToNotice('---')).toThrow(MarkdownRejected)
  })

  it('body 는 소제목과 글만 줄바꿈으로 잇는다', () => {
    const { body } = markdownToNotice(
      [
        '## 새 기능',
        '',
        `![](${IMAGE})`,
        '',
        '메모를 붙여요',
        '',
        '[가이드](https://g.test)',
        '',
        '| a |',
        '|---|',
        '| b |',
      ].join('\n'),
    )

    expect(body).toBe('새 기능\n메모를 붙여요')
  })
})
