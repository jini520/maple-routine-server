// 넥슨 토큰을 DB 에 넣기 전에 감싸는 자리. 여기서 막는 사고는 DB 백업이 새면 사용자
// 토큰까지 함께 새는 것이다. 토큰 하나면 그 사람의 캐릭터 목록·확률 기록·스케줄러를 읽는다.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

import { openToken, sealToken } from './token-crypto.ts'

const 원래열쇠 = process.env.TOKEN_ENC_KEY
const 열쇠 = randomBytes(32).toString('hex')

beforeEach(() => {
  process.env.TOKEN_ENC_KEY = 열쇠
})

afterEach(() => {
  if (원래열쇠 === undefined) delete process.env.TOKEN_ENC_KEY
  else process.env.TOKEN_ENC_KEY = 원래열쇠
})

test('감싼 것을 풀면 원래 값이다', () => {
  const 토큰 = 'eyJhbGciOiJIUzI1NiJ9.어쩌고.저쩌고'
  assert.equal(openToken(sealToken(토큰)), 토큰)
})

test('한글과 긴 값도 그대로 돌아온다', () => {
  const 값 = `한글 ${'가'.repeat(2000)} 끝`
  assert.equal(openToken(sealToken(값)), 값)
})

test('같은 값을 두 번 감싸면 결과가 다르다', () => {
  // 같으면 DB 를 훑는 것만으로 어느 두 사람이 같은 토큰을 쓰는지가 보인다. GCM 은 같은
  // 열쇠에 같은 iv 를 두 번 쓰면 평문까지 복구되므로, iv 는 매번 새로 뽑아야 한다.
  const a = sealToken('같은값')
  const b = sealToken('같은값')

  assert.notDeepEqual(a.cipher, b.cipher)
  assert.notDeepEqual(a.iv, b.iv)
  assert.equal(openToken(a), openToken(b))
})

test('본문을 한 바이트라도 건드리면 못 푼다', () => {
  // GCM 의 태그가 이것을 잡는다. 못 잡으면 DB 를 고칠 수 있는 사람이 토큰을 바꿔치기한다.
  const 봉한것 = sealToken('원래값')
  const 건드린것 = { ...봉한것, cipher: Buffer.from(봉한것.cipher) }
  건드린것.cipher.writeUInt8(건드린것.cipher.readUInt8(0) ^ 0xff, 0)

  assert.throws(() => openToken(건드린것))
})

test('태그를 건드려도 못 푼다', () => {
  const 봉한것 = sealToken('원래값')
  const 건드린것 = { ...봉한것, tag: Buffer.from(봉한것.tag) }
  건드린것.tag.writeUInt8(건드린것.tag.readUInt8(0) ^ 0xff, 0)

  assert.throws(() => openToken(건드린것))
})

test('다른 열쇠로는 못 푼다', () => {
  const 봉한것 = sealToken('원래값')
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString('hex')

  assert.throws(() => openToken(봉한것))
})

test('열쇠가 없으면 감싸지 않고 멈춘다', () => {
  // 조용히 평문으로 넘어가면 아무도 모르는 채 토큰이 맨몸으로 DB 에 쌓인다.
  delete process.env.TOKEN_ENC_KEY
  assert.throws(() => sealToken('값'), /TOKEN_ENC_KEY/)
})

test('열쇠 길이가 틀리면 멈춘다', () => {
  // 32바이트가 아니면 AES-256 이 아니다. 짧은 열쇠를 늘려 쓰면 그만큼 약해진다.
  process.env.TOKEN_ENC_KEY = randomBytes(16).toString('hex')
  assert.throws(() => sealToken('값'), /32바이트/)
})

test('열쇠가 hex 가 아니면 멈춘다', () => {
  process.env.TOKEN_ENC_KEY = 'hex 가 아닌 값'.padEnd(64, 'z')
  assert.throws(() => sealToken('값'))
})

test('용도가 다르면 못 푼다', () => {
  // 액세스 토큰 자리에 갱신 토큰을 옮겨 심는 것을 막는다. 둘은 수명과 권한이 다르다.
  const 봉한것 = sealToken('값', 'access')
  assert.equal(openToken(봉한것, 'access'), '값')
  assert.throws(() => openToken(봉한것, 'refresh'))
})
