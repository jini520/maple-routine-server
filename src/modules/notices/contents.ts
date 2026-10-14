import * as cheerio from 'cheerio'
import { isTag, isText } from 'domhandler'

import type { NoticeBlock } from './notice.types'

/** 블록 수 상한. 업데이트 한 건이 1,200 문단이라 무한히 늘지 않게 자른다. */
export const MAX_BLOCKS = 2000

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const SKIP = new Set(['script', 'style', 'br', 'head', 'title', 'meta', 'link'])

/** 이 안에 있으면 통째로 글로 접지 않고 안으로 들어간다. */
const DESCEND_SELECTOR =
  'div,p,section,article,ul,ol,li,blockquote,figure,center,table,h1,h2,h3,h4,h5,h6,img,a[href]'

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * 넥슨 공지 본문 HTML 을 블록 배열로 바꾼다. 썬데이 메이플의 본문에만 쓴다.
 *
 * 인라인 스타일과 태그는 버리고 글 · 제목 · 그림 · 링크 · 표만 남긴다.
 */
export function parseContents(html: string): NoticeBlock[] {
  const blocks: NoticeBlock[] = []
  if (html.trim() === '') return blocks
  const $ = cheerio.load(html)

  const push = (block: NoticeBlock): boolean => {
    if (blocks.length >= MAX_BLOCKS) return false
    blocks.push(block)
    return true
  }

  const walk = (nodes: ReturnType<typeof $>): void => {
    nodes.each((_, node) => {
      if (blocks.length >= MAX_BLOCKS) return false
      if (isText(node)) {
        const text = clean(node.data)
        if (text !== '') push({ type: 'text', text })
        return
      }
      if (!isTag(node)) return
      const el = $(node)
      const name = node.name.toLowerCase()
      if (SKIP.has(name)) return
      if (name === 'img') {
        const src = node.attribs.src?.trim() ?? ''
        if (src !== '') push({ type: 'image', src })
        return
      }
      if (name === 'a' && typeof node.attribs.href === 'string' && el.find('img').length === 0) {
        const text = clean(el.text())
        const href = node.attribs.href.trim()
        if (href !== '') push({ type: 'link', text: text === '' ? href : text, href })
        return
      }
      if (HEADINGS.has(name)) {
        const text = clean(el.text())
        if (text !== '') push({ type: 'heading', text })
        return
      }
      if (name === 'table') {
        const rows: string[][] = []
        el.find('tr').each((_i, tr) => {
          const cells = $(tr)
            .children('th,td')
            .toArray()
            .map((cell) => clean($(cell).text()))
          if (cells.some((cell) => cell !== '')) rows.push(cells)
        })
        if (rows.length > 0) push({ type: 'table', rows })
        return
      }
      if (el.find(DESCEND_SELECTOR).length > 0) {
        walk(el.contents())
        return
      }
      const text = clean(el.text())
      if (text !== '') push({ type: 'text', text })
    })
  }

  walk($('body').contents())
  return blocks
}
