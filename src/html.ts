/**
 * 넥슨 공지 본문(HTML)을 앱이 그릴 블록으로 바꾼다.
 *
 * **앱에 HTML 을 보내지 않는 것이 이 파일의 목적이다.** 앱은 문자열과 배열만 그리므로 본문에
 * 무엇이 들어 있든 태그가 앱에 닿지 않고, 파서가 아는 블록만 통과한다. 파서가 서버에 있는
 * 이유는 넥슨이 마크업을 바꿀 때 그날 고쳐 그날 나가야 하기 때문이다. 앱에 두면 그 수정이
 * OTA 배포 축에 실린다.
 *
 * 규칙 둘이 실측에서 나왔다(2026-09-10).
 *
 * - **이벤트·캐시샵 본문은 `<img>` 한 장뿐이라 텍스트가 0자다.** 태그를 걷어 평문으로 만드는
 *   설계면 그 두 분류가 빈 본문이 된다.
 * - **공지·업데이트는 스마트에디터가 글자를 span 수백 개로 쪼갠다.** 한글과 영문이 다른 span
 *   으로 갈리므로 조각 사이에 공백을 넣으면 `GM 소리` 가 되고, 문단 경계를 안 살리면 앞
 *   문단의 끝과 다음 문단의 시작이 붙는다.
 */

export type NoticeBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; src: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'table'; rows: string[][] }

/**
 * 한 본문이 낼 수 있는 블록 수. 업데이트 한 건이 423KB · 문단 1,200개다(실측).
 * 상한이 없으면 그 크기가 그대로 DB 와 앱으로 간다.
 */
const MAX_BLOCKS = 2000

/** 내용째 버리는 것들. 안에 든 글자가 본문이 아니다. */
const DROP_WITH_CONTENT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
const COMMENT = /<!--[\s\S]*?-->/g

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * 줄바꿈만 남기고 공백을 접는다.
 *
 * 들여쓰기와 줄바꿈이 태그 사이에 잔뜩 끼어 있어 그대로 두면 문장 사이가 벌어진다. `\n` 은
 * `<br>` 이 넣은 것이라 살린다.
 */
function tidy(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function attribute(tag: string, name: string): string | null {
  const quoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
  if (quoted?.[1] !== undefined) return quoted[1]
  const bare = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag)
  return bare?.[1] ?? null
}

/**
 * 아는 주소만 통과시킨다. 프로토콜 없는 `//host/…` 는 https 로 채운다.
 *
 * 모르는 스킴(`javascript:` · `data:`)을 통과시키면 그것을 여는 코드가 앱에 필요해진다.
 */
function safeUrl(raw: string | null): string | null {
  if (raw === null) return null
  const url = decodeEntities(raw).trim()
  if (url.startsWith('//')) return `https:${url}`
  return /^https?:\/\//i.test(url) ? url : null
}

/** 문단·제목·표 칸을 가르는 태그. 닫힐 때 지금까지 모은 글자가 한 덩어리가 된다. */
const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'])

/**
 * 본문을 블록 배열로 바꾼다. 아는 태그만 통과하고 나머지는 글자만 남기고 버린다.
 *
 * @param html 넥슨 상세 응답의 `contents`
 */
export function parseContents(html: string): NoticeBlock[] {
  const source = html.replace(DROP_WITH_CONTENT, ' ').replace(COMMENT, ' ')

  const blocks: NoticeBlock[] = []
  let buffer = ''
  let heading = false
  /** 이 문단에서 떼어 낸 링크들. 문단 글자를 먼저 내보내고 그 뒤에 선다. */
  let links: { text: string; href: string }[] = []

  /** 지금 `<a>` 안이면 글자가 문단이 아니라 여기로 간다. */
  let anchorHref: string | null = null
  let anchorText = ''

  /** 표 안에서는 글자가 칸으로 간다. 중첩 표는 가장 바깥 것 하나로 접는다. */
  let tableDepth = 0
  let rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inCell = false

  const push = (block: NoticeBlock): void => {
    if (blocks.length < MAX_BLOCKS) blocks.push(block)
  }

  const flushText = (): void => {
    const text = tidy(buffer)
    buffer = ''
    if (text !== '') push(heading ? { type: 'heading', text } : { type: 'text', text })
    for (const link of links) push({ type: 'link', ...link })
    links = []
  }

  const write = (text: string): void => {
    if (inCell) cell += text
    else if (anchorHref !== null) anchorText += text
    else buffer += text
  }

  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
  let cursor = 0

  for (let match = tagPattern.exec(source); match !== null; match = tagPattern.exec(source)) {
    write(decodeEntities(source.slice(cursor, match.index)))
    cursor = match.index + match[0].length

    const tag = match[0]
    const name = (match[1] ?? '').toLowerCase()
    const closing = tag.startsWith('</')

    if (name === 'br') {
      write('\n')
      continue
    }

    if (name === 'img' && !closing) {
      const src = safeUrl(attribute(tag, 'src'))
      // 표 안의 이미지는 버린다. 칸에 그림을 넣을 자리가 앱 화면에 없다.
      if (src !== null && tableDepth === 0) {
        flushText()
        push({ type: 'image', src })
      }
      continue
    }

    if (name === 'a') {
      if (!closing) {
        anchorHref = safeUrl(attribute(tag, 'href'))
        anchorText = ''
        continue
      }
      // 아는 주소가 아니면 글자만 문단에 남긴다. 주소를 버리는 것이 못 여는 링크를 세우는
      // 것보다 낫다.
      const text = tidy(anchorText)
      if (anchorHref !== null && text !== '') links.push({ text, href: anchorHref })
      else if (text !== '') buffer += buffer.endsWith(' ') || buffer === '' ? text : ` ${text}`
      anchorHref = null
      anchorText = ''
      continue
    }

    if (name === 'table') {
      if (closing) {
        tableDepth = Math.max(0, tableDepth - 1)
        if (tableDepth === 0) {
          if (row.length > 0) rows.push(row)
          if (rows.length > 0) push({ type: 'table', rows })
          rows = []
          row = []
        }
      } else {
        if (tableDepth === 0) flushText()
        tableDepth += 1
      }
      continue
    }

    if (name === 'td' || name === 'th') {
      if (closing) {
        row.push(tidy(cell))
        cell = ''
        inCell = false
      } else {
        inCell = true
        cell = ''
      }
      continue
    }

    if (name === 'tr' && closing) {
      if (row.length > 0) rows.push(row)
      row = []
      continue
    }

    if (BLOCK_TAGS.has(name)) {
      // 표 안에서는 문단이 칸을 나누지 않는다. 줄만 바꾼다.
      if (tableDepth > 0) {
        if (closing) write('\n')
        continue
      }
      if (closing) {
        flushText()
        heading = false
      } else if (/^h[1-6]$/.test(name)) {
        flushText()
        heading = true
      }
    }
  }

  write(decodeEntities(source.slice(cursor)))
  flushText()

  return blocks
}

/**
 * 블록에서 평문을 뽑는다. 푸시 `data` 의 미리보기와 목록의 두 줄 요약이 이것을 쓴다.
 *
 * 이미지와 표는 세지 않는다. 앞의 것은 글자가 없고, 뒤의 것은 칸을 이어 붙이면 미리보기에서
 * 읽히지 않는 줄이 된다.
 *
 * @param maxChars 넘으면 말줄임표까지 포함해 이 길이로 자른다. 글자 단위다(바이트가 아니다).
 */
export function toPlainText(blocks: readonly NoticeBlock[], maxChars?: number): string {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'text' || block.type === 'link') {
      lines.push(block.text)
    }
  }

  const text = lines.join('\n').trim()
  if (maxChars === undefined) return text

  const chars = [...text]
  return chars.length <= maxChars ? text : `${chars.slice(0, maxChars - 1).join('')}…`
}
