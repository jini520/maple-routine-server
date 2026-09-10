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
type NoticeKind = 'app' | 'game' | 'update' | 'event' | 'cashshop'

interface Notice {
  id: string
  kind: NoticeKind
  title: string
  body: string          // 블록에서 뽑은 평문. 목록 미리보기와 푸시가 쓴다
  publishedAt: string   // ISO 8601
  link?: string
  blocks?: NoticeBlock[]  // 상세에서만 온다
}
```

```
GET /v1/notices?limit=20&cursor=…&kind=game,update  → { items: Notice[], nextCursor }
GET /v1/notices/{id}                                → Notice (blocks 포함)
GET /healthz                                        → { ok: true }
```

**목록은 `blocks` 를 안 준다.** 업데이트 한 건이 블록 797개 · JSON 57KB다(실측). 20건에 실으면
한 응답이 MB 단위가 된다.

**인증이 없다.** 공개 정보라서다. `limit` 상한은 50 이고 그 밖의 속도 제한은 앞단 nginx 가 건다.

한쪽만 바꾸면 다른 저장소의 타입 검사가 못 잡는다. 필드를 더할 때 **양쪽을 함께 볼 것.**

## 넥슨 공지를 받는다

`NEXON_KEY` 가 있으면 1분마다 네 분류의 목록을 조회하고, 처음 보는 글은 상세까지 받아 저장한 뒤
알림을 보낸다(`src/poll.ts`).

```
공지사항  /maplestory/v1/notice            → kind 'game'
업데이트  /maplestory/v1/notice-update     → kind 'update'
이벤트    /maplestory/v1/notice-event      → kind 'event'
캐시샵    /maplestory/v1/notice-cashshop   → kind 'cashshop'
```

**1분마다 도는 이유는 나중에 받아 오는 길이 없기 때문이다.** 넥슨 상세는 **목록에 지금 떠 있는
것만** 답한다(실측 2026-09-10 · 목록 밖 id 는 전부 400 `OPENAPI00004`). 목록에서 빠지면 그 글은
영영 못 받고, 썬데이 메이플은 일요일 하루짜리라 그날의 목록에만 잠깐 뜬다. **우리 DB 가 그 글의
유일한 아카이브다.**

본문은 HTML 로 오고 `src/html.ts` 가 블록 배열로 바꾼다. 앱에 HTML 을 보내지 않으므로 넥슨
본문에 무엇이 들어 있든 태그가 앱에 닿지 않는다. 파서가 서버에 있는 이유는 넥슨이 마크업을 바꿀
때 그날 고쳐 그날 나가야 하기 때문이다.

### 알림을 안 보내는 세 경우

셋 다 **저장은 한다.** 목록에는 나오고 알림만 안 간다.

| 언제 | 왜 |
|---|---|
| 그 분류의 첫 회차 | 빈 표로 처음 돌면 79건이 전부 새 항목이다. 그대로 두면 알림 79개가 나간다 |
| 올라온 지 6시간 넘은 글 | 씨 뿌리기가 429 로 끊기거나 서버가 하루 죽었다 살아날 때 밀린 알림이 터진다 |
| 썬데이가 아닌 이벤트 | 사용자 지정. 패치 날 이벤트 5건과 캐시샵 4건이 같은 분에 올라온다 |

### 알림 문구

**제목은 분류가 정하고 내용은 공지 제목이다**(사용자 지정). 공지 제목을 알림 제목에 넣지 않는
이유는 트레이가 한 줄로 자르기 때문이다. 거기에 `클라이언트 1.2.418 업데이트 안내 (신규 HEXA
스킬 및…` 이 서면 무엇이 왔는지가 안 남는다.

| 분류 | 알림 제목 | 알림 내용 |
|---|---|---|
| `game` | 새 공지 사항이 올라왔어요. | 9/10(목) 넥슨 정기점검 안내 |
| `update` | 새 업데이트 확인해보세요. | 클라이언트 1.2.418 업데이트 안내 |
| `event` | 새로운 이벤트가 시작돼요. | 스페셜 썬데이 메이플 |
| `cashshop` | 캐시 아이템이 업데이트 됐어요. | 마스터라벨 플러스 |

**캐시샵만 제목을 손본다.** 원본이 `8월 20일 캐시아이템 업데이트 - 마스터라벨 플러스` 꼴이라
앞이 전부 같다. 그대로 두면 알림 스무 개가 같은 열두 글자로 시작하고 다른 것은 뒤쪽뿐이다.
못 떼면 제목을 통째로 쓴다 - 넥슨이 꼴을 바꿨을 때 빈 알림을 보내는 것보다 낫다.

운영자 공지(`app`)는 이 규칙을 안 탄다. `/admin` 과 CLI 가 문구를 직접 받는다.

### 토픽은 넷이다

| 앱의 토글 | 토픽 | 담는 `kind` |
|---|---|---|
| 앱 공지사항 | `notice` | `app` |
| 게임 공지사항 | `notice-game` | `game` |
| 업데이트·이벤트 | `notice-update-event` | `update` · `event` |
| 캐시샵 | `notice-cashshop` | `cashshop` |

**`notice` 라는 이름은 못 바꾼다.** 이미 스토어에 나간 바이너리가 그것을 구독하고 있어서, 게임
공지로 돌리면 업데이트를 안 받은 기기가 켠 적 없는 알림을 받는다.

## 발송은 CLI 다

API 에 발송 경로가 없다. 열면 인증을 만들어야 하고, 인증 없는 서버에서 그 경로는 **아무나 전
사용자에게 알림을 쏘는 문**이 된다. CLI 는 그 문을 SSH 로 대신하고 SSH 는 이미 열쇠로 잠겨 있다.

```bash
npm run notice -- send --id 2026-09-08-maint --title '점검 안내' --body '…' --dry
npm run notice -- send --id 2026-09-08-maint --title '점검 안내' --body '…'
npm run notice -- list --kind game
npm run notice -- push --id game-149862 --dry   # 이미 쌓인 것을 다시 쏜다
```

`send` 는 공지를 **만들어** 보내고 `push` 는 있는 것을 **다시** 보낸다. `push` 의 문구는 그
분류의 규칙이 만든다 - 폴러가 저절로 보낼 때와 같은 문구여야 손으로 쏜 것이 사용자에게 다르게
보이지 않는다.

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
