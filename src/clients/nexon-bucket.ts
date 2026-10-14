import { Injectable } from '@nestjs/common'

/** 자격 쌍마다 하나씩 두는 초당 토큰 버킷. 넥슨 fetch 는 여기서 토큰을 집어야 나간다. */
@Injectable()
export class NexonBucket {}
