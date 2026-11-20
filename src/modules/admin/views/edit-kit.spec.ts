import { runInNewContext } from 'node:vm'

import { EDIT_JS, subNav } from './edit-kit'

interface Cell {
  changed: () => boolean
  commit: () => void
  revert: () => void
}
interface Batch {
  add: (key: string, cell: Cell, send: () => Promise<{ ok: boolean; status: number }>) => void
  count: () => number
  revert: () => void
  save: () => Promise<{ key: string }[]>
}

/** 관리 화면 스크립트에 그대로 들어가는 글자라, 브라우저처럼 그 글자를 실행해 함수를 꺼낸다. */
const { EditBatch, numText } = runInNewContext(`${EDIT_JS}; ({ EditBatch, numText })`) as {
  EditBatch: (onChange?: () => void) => Batch
  numText: (v: number | string | null) => string
}

/** 처음 값과 지금 값을 들고 있는 가짜 칸. 화면의 칸과 같은 셋을 낸다. */
function fakeCell(start: string, now: string) {
  const cell = {
    start,
    now,
    changed: () => cell.now !== cell.start,
    commit: () => {
      cell.start = cell.now
    },
    revert: () => {
      cell.now = cell.start
    },
  }
  return cell
}

describe('관리 화면 칸 편집 묶음', () => {
  // 고치지 않은 줄까지 보내면 운영자가 손대지 않은 값을 다른 사람이 그사이 바꾼 값 위에 덮어쓴다.
  it('저장은 바뀐 칸이 있는 key 만 한 번씩 보내고, 한 key 의 칸 여럿은 요청 하나로 간다', async () => {
    const batch = EditBatch()
    const sent: string[] = []
    const send = (key: string) => () => {
      sent.push(key)
      return Promise.resolve({ ok: true, status: 204 })
    }
    batch.add('star:1', fakeCell('36', '40'), send('star:1'))
    batch.add('star:1', fakeCell('1', '1.5'), send('star:1'))
    batch.add('star:2', fakeCell('36', '36'), send('star:2'))
    expect(batch.count()).toBe(2)

    expect(await batch.save()).toEqual([])
    expect(sent).toEqual(['star:1'])
    expect(batch.count()).toBe(0)
  })

  // 실패한 칸의 표시를 지우면 운영자는 저장된 줄 알고 떠난다.
  it('실패한 key 의 칸은 바뀐 채로 남고 성공한 key 의 칸만 처음 값이 바뀐다. 되돌리기는 남은 칸을 처음 값으로 돌린다', async () => {
    const batch = EditBatch()
    const ok = fakeCell('100', '200')
    const bad = fakeCell('300', '400')
    batch.add('a', ok, () => Promise.resolve({ ok: true, status: 204 }))
    batch.add('b', bad, () => Promise.resolve({ ok: false, status: 400 }))

    const failed = await batch.save()
    expect(failed.map((f) => f.key)).toEqual(['b'])
    expect([ok.start, bad.start, bad.now]).toEqual(['200', '300', '400'])
    expect(batch.count()).toBe(1)

    batch.revert()
    expect(bad.now).toBe('300')
    expect(batch.count()).toBe(0)
  })

  it('보내다 던지면 그 key 를 실패로 세고 다음 key 를 보낸다', async () => {
    const batch = EditBatch()
    const later = fakeCell('1', '2')
    batch.add('throws', fakeCell('1', '2'), () => Promise.reject(new Error('끊김')))
    batch.add('later', later, () => Promise.resolve({ ok: true, status: 204 }))
    expect((await batch.save()).map((f) => f.key)).toEqual(['throws'])
    expect(later.start).toBe('2')
  })

  it('숫자는 쉼표로 끊고 소수는 그대로 둔다', () => {
    expect(numText(20_000_000)).toBe('20,000,000')
    expect(numText('2.7')).toBe('2.7')
    expect(numText(null)).toBe('')
  })

  it('전환 막대는 지금 화면에만 aria-current 를 단다', () => {
    const html = subNav(
      [
        ['/admin/x', '가'],
        ['/admin/x/b', '나'],
      ],
      '/admin/x/b',
    )
    expect(html).toBe(
      '<nav class="seg"><a href="/admin/x">가</a><a href="/admin/x/b" aria-current="page">나</a></nav>',
    )
  })
})
