import type { ConfigService } from '@nestjs/config'

import { type NexonOpenApiClient, NexonOpenApiError } from '../../clients/nexon-open-api.client'
import type { Env } from '../../config/env.schema'
import { SettlementService } from './settlement.service'

const kst = (text: string) => new Date(`${text}+09:00`)

function build(options: { key?: boolean; ocid?: string } = {}) {
  const nexon = { enabled: options.key ?? true, characterState: jest.fn() }
  const config = {
    get: () => ('ocid' in options ? options.ocid : 'OCID'),
  } as unknown as ConfigService<Env, true>
  const service = new SettlementService(nexon as unknown as NexonOpenApiClient, config)
  return { service, nexon }
}

const settlingError = () =>
  new NexonOpenApiError(400, JSON.stringify({ error: { name: 'OPENAPI00009', message: '' } }))

describe('SettlementService', () => {
  it('키나 ocid 가 없으면 안 부르고 늘 결산 아님이다', async () => {
    for (const { service, nexon } of [build({ key: false }), build({ ocid: undefined })]) {
      service.clock = () => kst('2026-10-15T00:01:00')
      expect(service.enabled).toBe(false)
      expect(await service.tick()).toBeNull()
      expect(nexon.characterState).not.toHaveBeenCalled()
      expect(service.current()).toEqual({ settling: false, startedAt: null })
    }
  })

  it('창 밖이면 안 부른다', async () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T12:00:00')

    expect(await service.tick()).toBeNull()
    expect(nexon.characterState).not.toHaveBeenCalled()
  })

  it('어제 날짜로 묻고, OPENAPI00009 면 결산 중이고 startedAt 은 그 밤의 00:00 KST 다', async () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T00:01:00')
    nexon.characterState.mockRejectedValue(settlingError())

    expect(await service.tick()).toBe('settling')

    expect(nexon.characterState).toHaveBeenCalledWith('OCID', '2026-10-14')
    expect(service.current()).toEqual({ settling: true, startedAt: '2026-10-14T15:00:00.000Z' })
  })

  it('결산 중을 본 뒤 200 이면 끝이고 그 밤의 남은 타점은 안 부른다', async () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T00:01:00')
    nexon.characterState.mockRejectedValueOnce(settlingError()).mockResolvedValue(undefined)
    await service.tick()

    service.clock = () => kst('2026-10-15T02:01:00')
    expect(await service.tick()).toBe('settled')
    expect(service.current()).toEqual({ settling: false, startedAt: null })

    service.clock = () => kst('2026-10-15T02:11:00')
    expect(await service.tick()).toBeNull()
    expect(nexon.characterState).toHaveBeenCalledTimes(2)
  })

  it('결산 중을 못 본 200 은 시작 전이라 다음 타점에 다시 묻는다', async () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T00:01:00')
    nexon.characterState.mockResolvedValue(undefined)

    expect(await service.tick()).toBe('settled')
    expect(service.current()).toEqual({ settling: false, startedAt: null })

    service.clock = () => kst('2026-10-15T00:11:00')
    expect(await service.tick()).toBe('settled')
    expect(nexon.characterState).toHaveBeenCalledTimes(2)
  })

  it('실패는 모름이고 판정을 안 바꾼다', async () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T00:01:00')
    nexon.characterState.mockRejectedValueOnce(settlingError())
    await service.tick()

    service.clock = () => kst('2026-10-15T00:11:00')
    nexon.characterState.mockRejectedValueOnce(new Error('네트워크'))
    expect(await service.tick()).toBe('unknown')
    expect(service.current()).toEqual({ settling: true, startedAt: '2026-10-14T15:00:00.000Z' })

    nexon.characterState.mockRejectedValueOnce(
      new NexonOpenApiError(400, JSON.stringify({ error: { name: 'OPENAPI00003' } })),
    )
    expect(await service.tick()).toBe('unknown')
    expect(service.current().settling).toBe(true)
  })

  it('06:00 이 지나면 상태가 남아 있어도 결산 아님이다', async () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T00:01:00')
    nexon.characterState.mockRejectedValue(settlingError())
    await service.tick()

    service.clock = () => kst('2026-10-15T06:00:00')
    expect(service.current()).toEqual({ settling: false, startedAt: null })
  })

  it('부팅이 창 안이면 바로 한 번 본다', async () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T00:30:00')
    nexon.characterState.mockRejectedValue(settlingError())

    service.onApplicationBootstrap()
    await new Promise((resolve) => setImmediate(resolve))

    expect(nexon.characterState).toHaveBeenCalledWith('OCID', '2026-10-14')
    expect(service.current().settling).toBe(true)
  })

  it('부팅이 창 밖이면 안 본다', () => {
    const { service, nexon } = build()
    service.clock = () => kst('2026-10-15T12:00:00')

    service.onApplicationBootstrap()

    expect(nexon.characterState).not.toHaveBeenCalled()
  })
})
