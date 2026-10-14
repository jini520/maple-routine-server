import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BOSS_OPTIONS, bossNameOf, isDateKey, isKnownBoss, todayKst } from './manual-completion.ts'

describe('보스 표 사본', () => {
  it('앱이 여는 보스 둘을 안다', () => {
    assert.equal(isKnownBoss('black_mage'), true)
    assert.equal(isKnownBoss('meirin'), true)
  })

  it('모르는 key 는 거절한다', () => {
    assert.equal(isKnownBoss('blackmage'), false)
    assert.equal(isKnownBoss(''), false)
  })

  it('key 가 겹치지 않는다', () => {
    assert.equal(new Set(BOSS_OPTIONS.map((boss) => boss.key)).size, BOSS_OPTIONS.length)
  })

  it('이름을 찾고, 모르면 key 를 그대로 쓴다', () => {
    assert.equal(bossNameOf('black_mage'), '검은 마법사')
    assert.equal(bossNameOf('nope'), 'nope')
  })
})

describe('여는 날', () => {
  it('YYYY-MM-DD 만 받는다', () => {
    assert.equal(isDateKey('2026-09-17'), true)
    assert.equal(isDateKey('2026-9-17'), false)
    assert.equal(isDateKey('2026-09-17T00:00'), false)
    assert.equal(isDateKey(''), false)
  })

  it('오늘은 KST 로 잰다', () => {
    // UTC 로 9/17 15:30 이면 KST 는 이미 9/18 이다.
    assert.equal(todayKst(Date.parse('2026-09-17T15:30:00Z')), '2026-09-18')
    assert.equal(todayKst(Date.parse('2026-09-17T14:30:00Z')), '2026-09-17')
  })
})
