# 메이플 루틴 서버 (maple-routine-server)

앱 저장소(`~/Developments/maple-routine`)가 쓰는 서버다. 설계 문서와 ADR 은 앱 저장소 `docs/` 에 있다(서버는
`docs/foundation/server.md`). 운영과 배포 절차는 이 저장소의 `README.md` 에 있다.

## 넥슨 Open API
- CRITICAL: **넥슨 Open API 를 부르거나 그 응답을 다루는 코드를 쓰기 전에 앱 저장소의 `docs/foundation/nexon-api/agent-guide.md` 를 읽고 따를 것.** 넥슨이 AI 에이전트용으로 낸 가이드의 원문이다. 재시도하면 안 되는 에러 코드나 식별자(ocid)를 다루는 법처럼, 코드만 봐서는 알 수 없는 넥슨 쪽 규칙이 거기 있다. 가이드가 우선이지만, 메이플스토리 경로를 직접 불러 잰 앱 저장소 `docs/foundation/nexon-api.md` 의 실측이 더 맞을 수 있다. 둘이 다르면 어느 쪽을 따를지 스스로 정하지 말고 사용자에게 물을 것

## 브랜치 전략 (앱 저장소 ADR-188 결정 9)
- CRITICAL: **main 은 운영 박스에 배포된 것만 담는다.** main 에 바로 커밋하거나 작업 브랜치를 main 으로 PR 하지 말 것. main 에는 develop · `release/x.y.z` · `hotfix/<slug>` 만 merge commit 으로 머지한다. main 이 배포된 코드와 같아야 핫픽스를 따자마자 그대로 배포할 수 있기 때문이다
- CRITICAL: **새 버전의 작업은 develop 에서 따고 develop 으로 PR 할 것.** develop 이 GitHub 기본 브랜치이고 새 버전의 앱이 쓸 서버를 모은다. 운영 서버의 고침과 기능은 아래 핫픽스로 낸다. 브랜치 이름은 `feat/` · `fix/` · `chore/` · `docs/` · `refactor/` 에 영어 slug 를 붙이고, 이슈가 있으면 끝에 번호를 단다. 본 체크아웃은 develop 에 두고 작업은 `.claude/worktrees/` 의 워크트리에서 한다
- CRITICAL: **이슈에 없는 작업은 시키지 않아도 설계 → 이슈 → 문서 → 테스트 → 구현 순서로 할 것.** 고를 것은 설계 단계에서 묻는다. 문서는 앱 저장소 `docs/` 에 쓰고 앱 develop 으로 PR 하며, 사용자 확인을 받은 뒤 테스트로 넘어간다. 서버는 앱 버전과 상관없이 배포되고 다음 작업은 앱 develop 의 문서를 읽기 때문이다(앱 저장소 ADR-188 결정 11)
- CRITICAL: **사용자에게 묻기 전에 관련된 문서 · 지금 코드 · 로직 · 실제 값을 모두 확인하고, 다듬은 질문을 한 번에 낼 것.** 앱 저장소의 ADR 결정을 뒤 결정까지 읽고, 이 저장소의 `src/database/schema.ts` 와 그 값을 쓰는 곳 · 읽는 곳을 모두 찾고, 운영 DB 의 값을 읽기 전용으로 본다. 표를 다루면 기기 표의 칸이 서버 표의 어느 칸에 대응하는지 먼저 적는다. 질문 · 보기 · 근거에 든 경우가 실제로 생기는지 확인하고, 정한 기준에서 따라 나오는 것은 묻지 않는다. 답 하나로 끝나도록 그 답에 딸린 것까지 한 질문에 담는다. 덜 확인한 질문은 사용자가 되묻게 만들고, 답을 받은 뒤 다시 조사해 고치게 되어 사용자가 같은 것을 두 번 판단하기 때문이다(앱 저장소 ADR-188 결정 10)
- CRITICAL: **배포는 main 에서만 할 것.** develop 에 지금 앱과 호환되지 않는 변경이 없으면 develop 을 head, main 을 base 로 PR 해 merge commit 으로 머지한 뒤, 있으면 hotfix 만 main 에 머지한 뒤 `README.md` 의 배포 절차를 main 에서 따른다. develop 에 선 채로 빌드하면 검토하지 않은 작업이 운영 박스에 올라간다
- CRITICAL: **핫픽스는 main 에서 `hotfix/<slug>` 를 딸 것.** develop 에서 따면 아직 배포하지 않은 작업이 함께 나간다. main 에 머지해 배포한 뒤 곧바로 main 을 develop 으로 머지한다. 미루면 다음 배포에서 그 고침이 빠진다. **그 뒤 열려 있는 작업 브랜치는 다음 커밋 전에 develop 을 머지하고 그 위에서 이어 갈 것.** 핫픽스와 겹치는 파일이 없어도 받는다. 작업 브랜치의 테스트가 핫픽스가 든 코드에서 돌아야 하기 때문이다(앱 저장소 ADR-188 결정 7)
- CRITICAL: **develop 에 지금 앱과 호환되지 않는 변경이 있는 동안에는 develop 을 운영에 배포하지 말 것.** 2026-11-20 부터 앱 저장소 #947 의 새 표가 develop 에 들어간다. 그동안 운영 서버의 고침과 기능은 main 에서 `hotfix/<slug>` 를 따서 지금 표와 모듈을 고치고, main 에 머지해 배포한 뒤 곧바로 main 을 develop 으로 머지한다. 새 버전의 앱이 `release/x.y.z` 를 따면 서버도 develop 에서 `release/x.y.z` 를 따서 심사용 서버를 띄우고, 심사 중의 서버 고침도 거기에 넣는다. 앱이 게시되면 그 브랜치를 main 에 머지해 배포한다. 서버에는 앱의 `patch/x.y.z` 가 없다. 어느 버전의 일인지는 앱 저장소 이슈의 마일스톤으로 정하고, 없거나 둘에 걸치면 묻는다. 로직을 고친 hotfix 는 새 표 위의 코드에도 필요한지 확인한다. 앱과 같은 모양으로 두어야 운영 · 릴리즈 대기 · 새 버전이라는 역할을 두 저장소가 같은 뜻으로 쓰기 때문이다(앱 저장소 ADR-188 결정 9 · 11)
- CRITICAL: **새 표는 develop 에서 `src/database/schema.ts` 를 바로 바꾸고, 표 묶음마다 PR 할 것.** 묶음마다 표 · 그 표를 쓰는 모듈과 응답 · 마이그레이션 · 옛 DB 에서 옮기는 몫을 함께 바꿔 develop 이 늘 타입 검사와 테스트를 통과하게 한다. 새 표를 따로 두는 폴더는 만들지 않는다. 스키마가 둘이면 어느 쪽이 지금 것인지 헷갈린다. 차례는 설계 페이지의 묶음 차례이고 다른 묶음이 가리키는 표를 먼저 바꾼다(앱 저장소 ADR-099 결정 65)
- CRITICAL: **ADR 새 번호는 앱 저장소에서 `node scripts/adr-number.mjs` 로 받을 것.** 서버의 결정도 앱 저장소 ADR 에 적으므로 번호를 손으로 고르면 앱 쪽 작업과 겹친다
- CRITICAL: **새 표로 바꾼 표의 표와 칸 이름은 설계에서 뽑은 `src/database/design-tables.json` 과 같아야 한다.** `src/database/schema.spec.ts` 가 바꾼 표의 목록(`CONVERTED`)에 든 표의 표 이름 · 칸 이름 · 형 · 가리키는 표 · enum 값을 견준다. 묶음 PR 마다 그 묶음의 표를 목록에 더한다. 설계가 바뀌면 설계 페이지의 원본에서 그 파일부터 다시 뽑는다. 손으로 고치면 설계와 스키마가 서로를 맞다고 보증하게 되어 테스트가 아무것도 잡지 못한다
- CRITICAL: **묶음 PR 마다 옛 DB 를 새 DB 로 옮기는 `src/cli/move-old-db.ts` 에 그 묶음의 표를 더하고, 운영 서버의 hotfix 가 표를 바꾸면 main 을 develop 에 머지할 때 `src/database/old-schema.ts` 도 고칠 것.** 옮기는 스크립트는 옛 표를 그 사본으로 읽는다. 사본이 운영 표와 다르면 옛 칸을 읽지 못하고, 묶음의 몫이 빠지면 운영 덤프로 옮기기를 미리 연습할 수 없다(앱 저장소 ADR-099 결정 65)
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:, chore:)
