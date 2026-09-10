// 넥슨 공지 본문을 블록으로 바꾸는 규칙. **표본은 전부 실제 응답에서 잘라 왔다**(2026-09-10).
//
// 이 파서가 존재하는 이유가 두 가지 실측이다. 이벤트·캐시샵 본문은 이미지 한 장이라 태그를
// 걷으면 빈 문자열만 남고, 공지·업데이트는 스마트에디터가 글자를 span 수백 개로 쪼개 놓아
// 경계를 안 살리면 문장이 서로 붙는다.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseContents, toPlainText } from './html.ts'

test('이벤트·캐시샵 본문은 이미지 한 장이 된다', () => {
  // 실제 event/detail?notice_id=1374 의 contents 그대로.
  const html = `      \t<!-- 카피영역 --><div class="gen_container" style="position: relative; max-width: 876px; margin: 0 auto;overflow:hidden;">  <img src="https://lwi.nexon.com/maplestory/2026/0820_board/260820_78D81WM5IA5L3366.png" style="width: 100%; height: auto;"></div><!-- //카피영역 -->            `

  assert.deepEqual(parseContents(html), [
    { type: 'image', src: 'https://lwi.nexon.com/maplestory/2026/0820_board/260820_78D81WM5IA5L3366.png' },
  ])
})

test('문단 경계가 살아 문장이 안 붙는다', () => {
  // 태그만 걷으면 '감사드리며,Tver.1.2.205' 가 된다. 그것이 이 테스트가 막는 것이다.
  const html =
    '<p><span>감사드리며,</span></p><p><span lang="EN-US">Tver.1.2.205</span><span>&nbsp;우수테스터 안내 드립니다.</span></p>'

  assert.deepEqual(parseContents(html), [
    { type: 'text', text: '감사드리며,' },
    { type: 'text', text: 'Tver.1.2.205 우수테스터 안내 드립니다.' },
  ])
})

test('한 문단 안의 span 조각은 사이에 공백을 안 넣고 붙인다', () => {
  // 스마트에디터가 한글과 영문을 다른 span 으로 가른다. 여기에 공백을 넣으면 'GM 소리' 가 된다.
  const html = '<p><span>GM</span><span>소리</span><span lang="EN-US">입니다.</span></p>'

  assert.deepEqual(parseContents(html), [{ type: 'text', text: 'GM소리입니다.' }])
})

test('br 은 한 문단 안의 줄바꿈이다', () => {
  assert.deepEqual(parseContents('<p>첫 줄<br>둘째 줄</p>'), [
    { type: 'text', text: '첫 줄\n둘째 줄' },
  ])
})

test('빈 문단은 버린다', () => {
  // se-zws-run 이 줄 간격을 내려고 넣는 빈 span 이 실제 본문의 절반이다.
  const html = '<p><span class="se-zws-run"><br></span></p><p>본문</p><p>&nbsp;</p>'

  assert.deepEqual(parseContents(html), [{ type: 'text', text: '본문' }])
})

test('h1 은 heading 이 된다', () => {
  const html = '<h1 id="toc_56d0"><span style="background-color: rgb(0, 255, 0);">신규 보스 : 벨로나</span></h1>'

  assert.deepEqual(parseContents(html), [{ type: 'heading', text: '신규 보스 : 벨로나' }])
})

test('표는 행과 칸을 지킨다', () => {
  const html =
    '<table><tbody><tr><td><p>최우수 테스터</p></td><td><p>10만 메이플포인트</p></td></tr><tr><td>우수 테스터</td><td>5만 메이플포인트</td></tr></tbody></table>'

  assert.deepEqual(parseContents(html), [
    {
      type: 'table',
      rows: [
        ['최우수 테스터', '10만 메이플포인트'],
        ['우수 테스터', '5만 메이플포인트'],
      ],
    },
  ])
})

test('링크는 문단에서 떼어 낸 블록이 된다', () => {
  // 앵커 글자를 문단에 남기고 주소를 또 블록으로 내면 같은 말이 두 번 보인다.
  const html = '<p>선발 기준은 <a href="https://maplestory.nexon.com/News/Notice/110655">[바로가기]</a></p>'

  assert.deepEqual(parseContents(html), [
    { type: 'text', text: '선발 기준은' },
    { type: 'link', text: '[바로가기]', href: 'https://maplestory.nexon.com/News/Notice/110655' },
  ])
})

test('http 가 아닌 주소와 빈 이미지는 버린다', () => {
  // 아는 것만 통과시킨다. 모르는 스킴이 앱까지 흘러가면 그것을 여는 코드가 앱에 필요해진다.
  const html =
    '<p><a href="javascript:alert(1)">눌러</a></p><img src="data:image/png;base64,AAAA"><img src="">'

  assert.deepEqual(parseContents(html), [{ type: 'text', text: '눌러' }])
})

test('script 와 style 은 내용째 버린다', () => {
  const html = '<style>p{color:red}</style><p>본문</p><script>alert(1)</script>'

  assert.deepEqual(parseContents(html), [{ type: 'text', text: '본문' }])
})

test('주석도 버린다', () => {
  assert.deepEqual(parseContents('<!-- 카피영역 --><p>본문</p>'), [{ type: 'text', text: '본문' }])
})

test('엔티티를 푼다', () => {
  assert.deepEqual(parseContents('<p>&lt;공지&gt; &amp; &quot;안내&quot;&nbsp;&#39;끝&#39;</p>'), [
    { type: 'text', text: '<공지> & "안내" \'끝\'' },
  ])
})

test('프로토콜 없는 주소는 https 로 채운다', () => {
  assert.deepEqual(parseContents('<img src="//lwi.nexon.com/a.png">'), [
    { type: 'image', src: 'https://lwi.nexon.com/a.png' },
  ])
})

test('블록 수에 상한이 있다', () => {
  // 업데이트 한 건이 423KB · 문단 1,200개다. 상한이 없으면 그 크기가 그대로 DB 와 앱으로 간다.
  const html = '<p>줄</p>'.repeat(3000)
  const blocks = parseContents(html)

  assert.equal(blocks.length, 2000)
})

test('평문은 블록을 이어 붙이되 이미지는 세지 않는다', () => {
  const blocks = parseContents('<h1>제목</h1><p>본문</p><img src="https://x.test/a.png"><p>끝</p>')

  assert.equal(toPlainText(blocks), '제목\n본문\n끝')
})

test('평문에 상한을 걸 수 있다', () => {
  // 푸시 data 는 4KB 안에 들어가야 한다. 자르는 자리가 글자 중간이면 안 된다.
  assert.equal(toPlainText(parseContents('<p>가나다라마바사</p>'), 5), '가나다라…')
})
