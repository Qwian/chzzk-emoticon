# 0.10.37 검증 기록 — 2026-11-22

## 재현과 원인

사용자가 보고한 오류는 `free-chat.js:406`의 `Cannot read properties of null (reading 'videoMain')`이다. 기존 확장 컨텍스트가 무효화된 상태에서 모니터 프로필이 바뀌면 `syncMonitor → save → persist → chrome.storage.local.set`이 동기 예외를 던질 수 있다. `failure → stop → teardownMount`가 `mount`를 null로 정리한 뒤 `render`가 계속 진행해 보고된 줄에서 접근한다.

수정 전 `tests/free-chat-tabs.browser.cjs`의 화면 변경 재현에서 정확히 동일한 `videoMain` TypeError가 발생했다. 드래그 시작에서 동일한 저장 오류가 나면 해제된 컨트롤러의 `render → install`이 도구를 다시 만드는 별도 경로도 확인했다(정리 뒤 도구 2개가 남아 검사 실패).

## 수정

렌더링·도구 설치는 이미 종료된 컨트롤러에서 시작하지 않는다. `syncMonitor`의 저장 호출과 드래그 시작 중 렌더링이 반환된 직후에도 `disposed`와 `mount`를 다시 검사한다. 정리가 실행됐으면 남은 처리를 종료한다. 원래 채팅 DOM과 작성 내용은 건드리지 않는다.

## 검증

- 루트 JavaScript 전체 문법 검사, 변경한 브라우저 검사기 2개 문법 검사, manifest 0.10.37 파싱, git diff --check 통과.
- 번들 Node 테스트 57개 실행·통과. 실패·건너뜀 없음.
- `tests/free-chat-tabs.browser.cjs`: 치지직·SOOP 각각 resize·pointerdown 중 동기 저장 예외 뒤 페이지 오류 없음, 도구·스타일 재생성 없음, 기존 작성 문장 보존. 기존 탭별 겹치기·새 탭·새로고침·단축키·배치 공유·설정 재시작·채팅 DOM 교체 검사도 통과.
- `tests/free-chat-invalidation.browser.cjs`: 격리 Whale에 실제 unpacked 0.10.37을 로드하고, `chrome.runtime.reload()`로 기존 페이지의 실제 확장 API 컨텍스트를 무효화한 뒤 CDP의 화면 크기를 바꿨다. 치지직·SOOP 모형 페이지 모두 페이지 오류 없이 도구 정리 완료, 원래 입력창 객체·문장 유지. 결과: `artifacts/free-chat-invalidation-0.10.37.json`.
- 명령행 unpacked 설치는 runtime.reload 뒤 확장이 내려갈 수 있어 플랫폼마다 독립 프로필에서 검사했다. 새 버전의 사용자 프로필 재로드 성공을 뜻하는 검사는 아니다. 사용자 Whale의 제어 바인딩 오류는 앞선 작업에서 확인된 적용 제한이며, 이번 검사에서는 사용자 창을 조작하지 않았다. 적용에는 사용자 프로필의 확장 재로드와 열린 방송 탭 새로고침이 필요하다.
- 실제 방송 채팅을 입력·전송하지 않았고 게임 창을 조작하지 않았다. 테스트용 프로필은 브라우저 종료 후 경로를 검사하여 자동 삭제했다.

## 배포본·보존

`tools/package-release.py --clean`이 런타임 39개 파일의 전체 바이트와 manifest 참조를 검증했다. SHA-256: `25090bae8887be744d55d57f98c506fdcc84cdc201fec51f8523e51ab555cdc5`.

현재 0.10.37과 Git 원본으로 확인한 복구용 0.10.36을 보존했다. 기존 자동 패키징 정리 경로가 바이트 일치하는 0.10.35 ZIP을 정리해 ZIP 합계 13,145,354 → 12,814,005바이트, 331,349바이트를 확보했다. 동일 버전 Git과 일치하지 않는 기존 ZIP 33개는 보존했다. 별도 영구 설치본은 만들지 않았으며 기존 unpacked 프로젝트 루트를 갱신했다.
