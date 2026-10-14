import { eq, sql } from 'drizzle-orm'

import { sha256 } from '../../common/hash'
import { nexonLoginAttempts, nexonSessions, users } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { AttemptsRepository } from './attempts.repository'

describeDb('AttemptsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: AttemptsRepository

  const inTenMinutes = () => new Date(Date.now() + 10 * 60_000)

  let seq = 0
  // 한 스펙 안에서 세션을 둘 만들 때 uid 가 겹치지 않게 번호를 붙인다.
  async function sessionRow(): Promise<string> {
    seq += 1
    const [user] = await db
      .insert(users)
      .values({ nexonUid: `u${seq}` })
      .returning({ id: users.id })
    const [session] = await db
      .insert(nexonSessions)
      .values({
        sessionHash: sha256(`s${seq}`),
        userId: user.id,
        platform: 'ios',
        accessSealed: Buffer.from('a'),
        accessExpiresAt: new Date(),
        refreshSealed: Buffer.from('r'),
        refreshExpiresAt: new Date(),
      })
      .returning({ id: nexonSessions.id })
    return session.id
  }

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new AttemptsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('create 는 아직 집히지 않은 짝을 만든다', async () => {
    const { id } = await repo.create({
      state: 'st',
      redeemHash: sha256('rk'),
      platform: 'android',
      expiresAt: inTenMinutes(),
    })

    const [row] = await db.select().from(nexonLoginAttempts).where(eq(nexonLoginAttempts.id, id))
    expect(row?.claimedAt).toBeNull()
    expect(row?.platform).toBe('android')
  })

  it('claim 은 한 번만 집을 수 있고 두 번째는 null 이 된다', async () => {
    await repo.create({
      state: 'st',
      redeemHash: sha256('rk'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })

    expect(await repo.claim('st')).toMatchObject({ platform: 'ios' })
    expect(await repo.claim('st')).toBeNull()
  })

  it('만료된 짝은 claim 이 null 이 된다', async () => {
    await repo.create({
      state: 'st',
      redeemHash: sha256('rk'),
      platform: 'ios',
      expiresAt: new Date(Date.now() - 1_000),
    })

    expect(await repo.claim('st')).toBeNull()
  })

  it('seal 뒤의 redeem 은 봉한 것을 돌려주고 행을 지운다', async () => {
    const { id } = await repo.create({
      state: 'st',
      redeemHash: sha256('rk'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    await repo.claim('st')
    const sessionId = await sessionRow()
    await repo.seal(id, {
      receiptHash: sha256('rc'),
      sessionSealed: Buffer.from('sealed'),
      sessionId,
    })

    const sealed = await repo.redeem(sha256('rk'), sha256('rc'))

    expect(sealed?.toString()).toBe('sealed')
    expect(await db.select().from(nexonLoginAttempts)).toHaveLength(0)
  })

  it('receipt 가 틀리면 redeem 은 null 이고 행은 남는다', async () => {
    const { id } = await repo.create({
      state: 'st',
      redeemHash: sha256('rk'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    await repo.claim('st')
    await repo.seal(id, {
      receiptHash: sha256('rc'),
      sessionSealed: Buffer.from('x'),
      sessionId: await sessionRow(),
    })

    expect(await repo.redeem(sha256('rk'), sha256('wrong'))).toBeNull()
    expect(await db.select().from(nexonLoginAttempts)).toHaveLength(1)
  })

  it('봉한 지 60초가 지나면 redeem 은 null 이 된다', async () => {
    const { id } = await repo.create({
      state: 'st',
      redeemHash: sha256('rk'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    await repo.claim('st')
    await repo.seal(id, {
      receiptHash: sha256('rc'),
      sessionSealed: Buffer.from('x'),
      sessionId: await sessionRow(),
    })
    await db
      .update(nexonLoginAttempts)
      .set({ sealedAt: sql`now() - interval '61 seconds'` })
      .where(eq(nexonLoginAttempts.id, id))

    expect(await repo.redeem(sha256('rk'), sha256('rc'))).toBeNull()
  })

  it('peek 은 짝이 어느 단계인지 알려 준다', async () => {
    const { id } = await repo.create({
      state: 'st',
      redeemHash: sha256('rk'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    expect(await repo.peek(sha256('rk'))).toMatchObject({ claimedAt: null, sealedAt: null })

    await repo.claim('st')
    expect((await repo.peek(sha256('rk')))?.claimedAt).toBeInstanceOf(Date)
    expect((await repo.peek(sha256('rk')))?.sealedAt).toBeNull()

    await repo.seal(id, {
      receiptHash: sha256('rc'),
      sessionSealed: Buffer.from('x'),
      sessionId: await sessionRow(),
    })
    expect((await repo.peek(sha256('rk')))?.sealedAt).toBeInstanceOf(Date)

    expect(await repo.peek(sha256('none'))).toBeNull()
  })

  it('sweep 은 만료된 짝, 봉한 지 2분 지난 짝과 그 고아 세션, 콜백 도중에 죽은 짝을 치우고 살아 있는 것은 남긴다', async () => {
    // 1. 집히지 않은 채 만료
    await repo.create({
      state: 'expired',
      redeemHash: sha256('1'),
      platform: 'ios',
      expiresAt: new Date(Date.now() - 1_000),
    })
    // 2. 봉한 지 2분 경과, 세션 있음
    const sealedOld = await repo.create({
      state: 'sealed-old',
      redeemHash: sha256('2'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    await repo.claim('sealed-old')
    const orphanSession = await sessionRow()
    await repo.seal(sealedOld.id, {
      receiptHash: sha256('r2'),
      sessionSealed: Buffer.from('x'),
      sessionId: orphanSession,
    })
    await db
      .update(nexonLoginAttempts)
      .set({ sealedAt: sql`now() - interval '3 minutes'` })
      .where(eq(nexonLoginAttempts.id, sealedOld.id))
    // 3. 집혔는데 2분 넘게 봉해지지 않음
    const stuck = await repo.create({
      state: 'stuck',
      redeemHash: sha256('3'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    await repo.claim('stuck')
    await db
      .update(nexonLoginAttempts)
      .set({ claimedAt: sql`now() - interval '3 minutes'` })
      .where(eq(nexonLoginAttempts.id, stuck.id))
    // 4. 살아 있는 것: 방금 만든 짝, 방금 봉한 짝
    await repo.create({
      state: 'fresh',
      redeemHash: sha256('4'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    const sealedNew = await repo.create({
      state: 'sealed-new',
      redeemHash: sha256('5'),
      platform: 'ios',
      expiresAt: inTenMinutes(),
    })
    await repo.claim('sealed-new')
    const liveSession = await sessionRow()
    await repo.seal(sealedNew.id, {
      receiptHash: sha256('r5'),
      sessionSealed: Buffer.from('x'),
      sessionId: liveSession,
    })

    const { orphanSessions } = await repo.sweep()

    expect(orphanSessions).toBe(1)
    const left = (await db.select({ state: nexonLoginAttempts.state }).from(nexonLoginAttempts))
      .map((r) => r.state)
      .sort()
    expect(left).toEqual(['fresh', 'sealed-new'])
    const sessions = (await db.select({ id: nexonSessions.id }).from(nexonSessions)).map(
      (r) => r.id,
    )
    expect(sessions).toEqual([liveSession])
  })
})
