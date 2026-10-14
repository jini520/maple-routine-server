import { MAX_BLOCKS, parseContents } from './contents'

describe('parseContents', () => {
  it('그림뿐인 본문은 image 블록 하나다', () => {
    const html =
      '<div class="gen_container"><img src="https://file.nexon.com/x.png" style="width:100%" alt=""></div>'
    expect(parseContents(html)).toEqual([{ type: 'image', src: 'https://file.nexon.com/x.png' }])
  })

  it('제목 · 문단 · 링크 · 표를 각각의 블록으로 낸다', () => {
    const html = [
      '<h2>안내</h2>',
      '<p>첫 <b>문단</b>입니다.</p>',
      '<p><a href="https://maplestory.nexon.com/e">이벤트 보기</a></p>',
      '<table><tr><th>항목</th><th>값</th></tr><tr><td>A</td><td>1</td></tr></table>',
    ].join('')
    expect(parseContents(html)).toEqual([
      { type: 'heading', text: '안내' },
      { type: 'text', text: '첫 문단입니다.' },
      { type: 'link', text: '이벤트 보기', href: 'https://maplestory.nexon.com/e' },
      {
        type: 'table',
        rows: [
          ['항목', '값'],
          ['A', '1'],
        ],
      },
    ])
  })

  it('인라인 스타일과 빈 문단은 버리고 글만 남긴다', () => {
    const html =
      '<p style="margin:0"><span style="font-size:12px"> </span></p><div><div><span>겹친 글</span></div></div><p>&nbsp;</p>'
    expect(parseContents(html)).toEqual([{ type: 'text', text: '겹친 글' }])
  })

  it('블록은 MAX_BLOCKS 까지다', () => {
    const html = '<p>a</p>'.repeat(MAX_BLOCKS + 10)
    expect(parseContents(html)).toHaveLength(MAX_BLOCKS)
  })

  it('HTML 이 아니면 빈 배열이다', () => {
    expect(parseContents('')).toEqual([])
  })
})
