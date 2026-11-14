import MarkdownIt from 'markdown-it'

import type { NoticeBlock } from './notice.types'

type Token = MarkdownIt.Token
type Link = { text: string; href: string }
/** 문단 하나를 그림 자리에서 나눈 조각. 글이거나 그림이다. */
type Piece = string | { src: string }

/** HTML 은 글자로 남긴다. 앱에 HTML 을 그리는 블록이 없다. */
const md = new MarkdownIt({ html: false, linkify: false })

/** 저장을 거절하는 본문. 메시지가 그대로 관리 화면에 간다. */
export class MarkdownRejected extends Error {}

/**
 * 운영자 공지의 마크다운을 앱이 그리는 블록 다섯 가지와 평문 body 로 바꾸는 변환. 미리 보기와 저장이 같이 쓴다.
 *
 * body 는 today 배너 · 알림 문구가 읽는 평문이라 소제목과 글만 잇는다.
 */
export function markdownToNotice(markdown: string): { blocks: NoticeBlock[]; body: string } {
  const blocks = toBlocks(md.parse(markdown, {}))
  if (blocks.length === 0) throw new MarkdownRejected('앱에 보일 내용이 없다')
  const body = blocks
    .flatMap((block) => (block.type === 'heading' || block.type === 'text' ? [block.text] : []))
    .join('\n')
  return { blocks, body }
}

function toBlocks(tokens: Token[]): NoticeBlock[] {
  const blocks: NoticeBlock[] = []
  /** 목록 · 표 안의 링크. 링크 블록은 한 줄을 차지해서 목록 · 표가 끝난 뒤에 둔다. */
  let heldLinks: Link[] = []
  /** 목록 하나가 글 하나라서 목록이 끝날 때 내보낸다. */
  let listLines: string[] = []
  let listDepth = 0
  let marker: string | null = null
  let table: string[][] | null = null

  const flushList = (): void => {
    if (listLines.length > 0) blocks.push({ type: 'text', text: listLines.join('\n') })
    listLines = []
  }
  const pushLinks = (links: Link[]): void => {
    for (const link of links) blocks.push({ type: 'link', ...link })
  }
  const addListText = (text: string): void => {
    const indent = '  '.repeat(listDepth - 1)
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      listLines.push(`${indent}${marker ?? ''}${line.trim()}`)
      marker = null
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    switch (token.type) {
      case 'bullet_list_open':
      case 'ordered_list_open':
        listDepth += 1
        break
      case 'bullet_list_close':
      case 'ordered_list_close':
        listDepth -= 1
        if (listDepth === 0) {
          flushList()
          pushLinks(heldLinks)
          heldLinks = []
        }
        break
      case 'list_item_open':
        marker = token.info === '' ? '• ' : `${token.info}${token.markup} `
        break
      case 'table_open':
        table = []
        break
      case 'tr_open':
        table?.push([])
        break
      case 'table_close':
        if (table !== null && table.length > 0) blocks.push({ type: 'table', rows: table })
        table = null
        pushLinks(heldLinks)
        heldLinks = []
        break
      case 'fence':
      case 'code_block': {
        const text = token.content.replace(/\n+$/, '')
        if (listDepth > 0) addListText(text)
        else if (text.trim() !== '') blocks.push({ type: 'text', text })
        break
      }
      case 'inline': {
        const { pieces, links } = readInline(token.children ?? [])
        const kind = tokens[i - 1]?.type === 'heading_open' ? 'heading' : 'text'

        if (table !== null) {
          table[table.length - 1]?.push(
            pieces
              .filter((p) => typeof p === 'string')
              .join('')
              .trim(),
          )
          heldLinks.push(...links)
        } else if (listDepth > 0) {
          for (const piece of pieces) {
            if (typeof piece === 'string') {
              addListText(piece)
            } else {
              flushList()
              blocks.push({ type: 'image', src: piece.src })
            }
          }
          heldLinks.push(...links)
        } else if (kind === 'text' && isLinkOnly(pieces, links)) {
          pushLinks(links)
        } else {
          for (const piece of pieces) {
            if (typeof piece !== 'string') blocks.push({ type: 'image', src: piece.src })
            else if (piece.trim() !== '') blocks.push({ type: kind, text: piece.trim() })
          }
          pushLinks(links)
        }
        break
      }
    }
  }
  return blocks
}

/** 인라인 토큰을 그림 자리에서 나눈 조각과 그 안의 링크로 읽는다. 굵게 · 기울임 같은 꾸밈 토큰은 글자만 남긴다. */
function readInline(children: Token[]): { pieces: Piece[]; links: Link[] } {
  const pieces: Piece[] = []
  const links: Link[] = []
  let text = ''
  let link: Link | null = null

  for (const child of children) {
    switch (child.type) {
      case 'text':
      case 'code_inline':
        text += child.content
        if (link !== null) link.text += child.content
        break
      case 'softbreak':
      case 'hardbreak':
        text += '\n'
        break
      case 'link_open':
        link = { text: '', href: httpsOnly(String(child.attrGet('href') ?? '')) }
        break
      case 'link_close':
        if (link !== null) links.push({ text: link.text.trim() || link.href, href: link.href })
        link = null
        break
      case 'image':
        pieces.push(text, { src: httpsOnly(String(child.attrGet('src') ?? '')) })
        text = ''
        break
    }
  }
  pieces.push(text)
  return { pieces, links }
}

/** 링크 하나뿐인 문단. 글 블록 없이 링크 블록 하나가 된다. 그림이 없는 문단은 조각이 글 하나다. */
function isLinkOnly(pieces: Piece[], links: Link[]): boolean {
  const [only] = pieces
  return (
    links.length === 1 &&
    pieces.length === 1 &&
    typeof only === 'string' &&
    only.trim() === links[0].text
  )
}

/** iOS 는 평문 http 그림을 막고, 상대 주소는 앱에서 갈 곳이 없다. */
function httpsOnly(url: string): string {
  let protocol: string | null = null
  try {
    protocol = new URL(url).protocol
  } catch {
    // 상대 주소는 URL 이 못 읽는다.
  }
  if (protocol !== 'https:') throw new MarkdownRejected(`https 가 아닌 주소다: ${url}`)
  return url
}
