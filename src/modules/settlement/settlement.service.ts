import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'

import { NexonOpenApiClient, NexonOpenApiError } from '../../clients/nexon-open-api.client'
import type { Env } from '../../config/env.schema'
import {
  IDLE,
  NOT_SETTLING,
  type Probe,
  probeNight,
  reduce,
  type SettlementView,
  viewOf,
  type WatchState,
  yesterdayOf,
} from './settlement-watch'

/** 넥슨이 하루 치 기록을 아직 만드는 중이라는 에러 이름. 결산 중의 유일한 신호다. */
export const SETTLING_ERROR = 'OPENAPI00009'

/**
 * 창 안 10분 간격. 00:01 부터라 자정 경계에서 넥슨과 우리 시계 차이만큼 헛짚지 않는다.
 * 자리는 KST 로 적고 서버 시계가 어디 있든 같다.
 */
export const PROBE_CRON = '0 1-59/10 0-5 * * *'

/**
 * 밤마다 낟낟 캐릭터의 어제 기록을 물어 결산 중인지 든다. 판정은 프로세스 메모리다. 인스턴스가 하나다.
 *
 * 부팅 때 창 안이면 바로 한 번 본다. 재시작한 서버가 다음 타점까지 거짓 false 를 내지 않게.
 */
@Injectable()
export class SettlementService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettlementService.name)
  private readonly ocid: string | undefined
  private state: WatchState = IDLE
  private running = false
  /** 스펙이 바꿔 끼우는 시계. */
  clock: () => Date = () => new Date()

  constructor(
    private readonly nexon: NexonOpenApiClient,
    config: ConfigService<Env, true>,
  ) {
    this.ocid = config.get('SETTLEMENT_OCID', { infer: true })
  }

  get enabled(): boolean {
    return this.nexon.enabled && this.ocid !== undefined
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.warn('NEXON_KEY 나 SETTLEMENT_OCID 가 없어 결산을 안 본다. 늘 결산 아님이다')
      return
    }
    void this.tick()
  }

  /** 앱이 받는 모양. settling 이 참일 때만 startedAt 이 있다. */
  current(): SettlementView {
    if (!this.enabled) return NOT_SETTLING
    return viewOf(this.state, this.clock())
  }

  /** 한 타점. 부를 자리가 아니거나 앞 회차가 돌고 있으면 null 이다. */
  @Cron(PROBE_CRON, { name: 'settlement-probe', timeZone: 'Asia/Seoul' })
  async tick(): Promise<Probe | null> {
    if (!this.enabled || this.running) return null
    const now = this.clock()
    const night = probeNight(this.state, now)
    if (night === null) return null
    this.running = true
    try {
      const date = yesterdayOf(night)
      const probe = await this.probe(date)
      this.state = reduce(this.state, probe, this.clock())
      if (probe !== 'unknown') this.logger.log(`결산 확인 ${date}: ${probe}`)
      return probe
    } finally {
      this.running = false
    }
  }

  private async probe(date: string): Promise<Probe> {
    if (this.ocid === undefined) return 'unknown'
    try {
      await this.nexon.characterState(this.ocid, date)
      return 'settled'
    } catch (error) {
      if (error instanceof NexonOpenApiError && error.errorName === SETTLING_ERROR)
        return 'settling'
      this.logger.warn(`결산 확인 실패 ${date}: ${String(error)}`)
      return 'unknown'
    }
  }
}
