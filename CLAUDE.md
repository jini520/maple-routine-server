# 메이플 루틴 서버 (maple-routine-server)

앱 저장소(`~/Developments/maple-routine`)가 쓰는 서버다. 설계 문서와 ADR 은 앱 저장소 `docs/` 에 있다(서버는
`docs/foundation/server.md`). 운영과 배포 절차는 이 저장소의 `README.md` 에 있다.

## 브랜치 전략 (앱 저장소 ADR-188 결정 9)
- CRITICAL: **main 은 운영 박스에 배포된 것만 담는다.** main 에 바로 커밋하거나 작업 브랜치를 main 으로 PR 하지 말 것. main 에는 develop 과 `hotfix/<slug>` 만 merge commit 으로 머지한다. main 이 배포된 코드와 같아야 핫픽스를 따자마자 그대로 배포할 수 있기 때문이다
- CRITICAL: **모든 작업은 develop 에서 따고 develop 으로 PR 할 것.** develop 이 GitHub 기본 브랜치다. 브랜치 이름은 `feat/` · `fix/` · `chore/` · `docs/` · `refactor/` 에 영어 slug 를 붙이고, 이슈가 있으면 끝에 번호를 단다. 본 체크아웃은 develop 에 두고 작업은 `.claude/worktrees/` 의 워크트리에서 한다
- CRITICAL: **이슈에 없는 작업은 시키지 않아도 설계 → 이슈 → 문서 → 테스트 → 구현 순서로 할 것.** 고를 것은 설계 단계에서 묻는다. 문서는 앱 저장소 `docs/` 에 쓰고 사용자 확인을 받은 뒤 테스트로 넘어간다
- CRITICAL: **배포는 main 에서만 할 것.** develop 을 head, main 을 base 로 PR 해 merge commit 으로 머지한 뒤 `README.md` 의 배포 절차를 main 에서 따른다. develop 에 선 채로 빌드하면 검토하지 않은 작업이 운영 박스에 올라간다
- CRITICAL: **핫픽스는 main 에서 `hotfix/<slug>` 를 딸 것.** develop 에서 따면 아직 배포하지 않은 작업이 함께 나간다. main 에 머지해 배포한 뒤 곧바로 main 을 develop 으로 머지한다. 미루면 다음 배포에서 그 고침이 빠진다
- CRITICAL: **ADR 새 번호는 앱 저장소에서 `node scripts/adr-number.mjs` 로 받을 것.** 서버의 결정도 앱 저장소 ADR 에 적으므로 번호를 손으로 고르면 앱 쪽 작업과 겹친다
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:, chore:)
