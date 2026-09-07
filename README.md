# maple-routine-server

[메이플 루틴](https://github.com/jini520/maple-routine) 의 서버. 운영자 공지를 보내고 조회를 받는다.

앱 저장소와 **가른 이유는 배포 축이 달라서**다. 서버는 심사를 안 받고 원할 때 나가지만 앱은
스토어 심사와 OTA 를 탄다. 한 저장소에 두면 커밋 하나가 두 배포 축을 건드리게 되고, 어느 쪽이
이미 나갔는지가 흐려진다.

## 어디에 사는가

```
사용자 앱 ──▶ Oracle (nginx)
                ├─ 정적 사이트          mapleroutine.store 의 /privacy 등. Oracle 이 직접 서빙
                └─ /v1/…    ──▶ 집 미니 PC :4000 ──▶ 이 서버
                                                      └─▶ postgres (도커 네트워크)
```

정적 사이트가 Oracle 에 있는 것은 **가용성의 등급이 달라서**다. `/privacy` 는 스토어에 등록된
URL 이고 `/app-ads.txt` 는 AdMob 판매 권한 선언이라, 집 정전이 그것을 끊게 두면 안 된다.
**이 서버가 죽어도 그 둘은 열린다.** 공지 조회만 안 되고, 앱은 기기에 쌓아 둔 공지를 그대로
보여 준다.

## 계약

`Notice` 는 **앱의 `src/types/notice.ts` 와 같은 모양**이다. 푸시 `data` · 목록 항목 · 상세 응답
셋이 전부 이 모양이라 앱의 화면이 출처를 안 가린다.

```ts
interface Notice {
  id: string
  title: string
  body: string
  publishedAt: string   // ISO 8601
  link?: string
}
```

```
GET /v1/notices?limit=20&cursor=…   → { items: Notice[], nextCursor: string | null }
GET /v1/notices/{id}                → Notice
GET /healthz                        → { ok: true }
```

**인증이 없다.** 공개 정보라서다. `limit` 상한은 50 이고 그 밖의 속도 제한은 앞단 nginx 가 건다.

한쪽만 바꾸면 다른 저장소의 타입 검사가 못 잡는다. 필드를 더할 때 **양쪽을 함께 볼 것.**

## 발송은 CLI 다

API 에 발송 경로가 없다. 열면 인증을 만들어야 하고, 인증 없는 서버에서 그 경로는 **아무나 전
사용자에게 알림을 쏘는 문**이 된다. CLI 는 그 문을 SSH 로 대신하고 SSH 는 이미 열쇠로 잠겨 있다.

```bash
npm run notice -- send --id 2026-09-08-maint --title '점검 안내' --body '…' --dry
npm run notice -- send --id 2026-09-08-maint --title '점검 안내' --body '…'
npm run notice -- list
```

`--dry` 는 FCM 이 검증만 하고 배달하지 않는다. **먼저 이것으로 확인할 것.**

**저장이 발송보다 먼저다.** 발송에 성공했는데 저장이 실패하면 알림은 갔는데 목록에 없는 공지가
생기고 되돌릴 방법이 없다. 반대는 다시 쏘면 된다.

## 4KB 상한

FCM 메시지 전체가 4KB 를 넘으면 안 된다. 넘으면 거부되는 것이 아니라 **잘려 나갈 수 있어서**,
보내기 전에 `send.ts` 가 잰다. 긴 공지는 푸시에 요약이 가고 상세는 조회가 채운다.

## 자격증명

**이 저장소는 public 이다.** FCM 서비스 계정 키 하나로 전 사용자에게 푸시를 쏠 수 있고
`DATABASE_URL` 에는 DB 비밀번호가 들어간다. 실제 값은 서버의 `~/.config/maple-routine-server/`
에 살고 `.gitignore` 가 이 저장소로 오는 길을 막는다. 필요한 이름은 `.env.example` 이 말한다.

## 배포

```bash
docker compose up -d --build
```

네트워크는 기존 `infra` 프로젝트가 만든 `infra_network` 를 **빌려 쓴다**(external). 그래서 DB 에
IP 가 아니라 `postgres:5432` 로 붙는다.
