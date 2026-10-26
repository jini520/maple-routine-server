import { z } from 'zod'

import { eachInBatch, recordIdOf } from './batch'

class Known extends Error {}

const schema = z.object({ id: z.string(), value: z.number() })
const reasonOf = (error: unknown) => (error instanceof Known ? `아는 실패: ${error.message}` : null)

describe('eachInBatch', () => {
  // 틀린 한 건 때문에 묶음 전체를 거절하면 앱이 같은 묶음을 계속 다시 보내 과거 올리기가 멈춘다.
  it('본문이 틀린 건과 아는 실패는 그 건만 실패로 적고 나머지는 적는다', async () => {
    const saved: string[] = []
    const save = async (item: { id: string; value: number }) => {
      if (item.value < 0) throw new Known(item.id)
      saved.push(item.id)
    }

    const results = await eachInBatch(
      [
        { id: 'a', value: 1 },
        { id: 'b', value: '틀림' },
        { id: 'c', value: -1 },
        { id: 'd', value: 2 },
      ],
      schema,
      (raw) => recordIdOf(raw, 'id'),
      save,
      reasonOf,
    )

    expect(saved).toEqual(['a', 'd'])
    expect(results.map((r) => [r.recordId, r.ok])).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
      ['d', true],
    ])
    expect(results[2]).toEqual({ recordId: 'c', ok: false, reason: '아는 실패: c' })
  })

  // 모르는 오류는 서버 잘못이다. 실패로 적으면 앱이 그 건을 5 회 뒤 버려 기록을 잃는다.
  it('모르는 오류는 던진다', async () => {
    await expect(
      eachInBatch(
        [{ id: 'a', value: 1 }],
        schema,
        () => 'a',
        async () => {
          throw new Error('db')
        },
        reasonOf,
      ),
    ).rejects.toThrow('db')
  })

  it('기록 id 를 못 꺼내면 null 이다', () => {
    expect(recordIdOf(null, 'id')).toBeNull()
    expect(recordIdOf({ id: 3 }, 'id')).toBeNull()
  })
})
