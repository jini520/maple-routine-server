import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { MarketPublishService } from './market-publish.service'

/** 오늘의 KST 날짜에서 하루 앞. 메이플의 하루가 KST 0시에 바뀐다. */
export function kstYesterday(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3_600_000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - 1)).toISOString().slice(0, 10)
}

/** KST 0시가 지나면 전날 시세를 낸다. 서버가 멈춰 건너뛴 날이 있으면 차례로 함께 낸다. */
@Injectable()
export class MarketPublishJob {
  constructor(private readonly publish: MarketPublishService) {}

  @Cron('0 5 0 * * *', { name: 'market-publish', timeZone: 'Asia/Seoul' })
  async run(): Promise<void> {
    await this.publish.catchUp(kstYesterday(new Date()))
  }
}
