# 0.10.1 검증 기록 — 2026-11-01

공개 치지직 다시보기에서 넓은 화면 버튼을 눌러 확인했다. 페이지의 실제 스크롤 소유자는 html/body가 아니라 `section._container_*._is_large_*`였다. 측정한 section은 clientHeight 720, scrollHeight 4407, overflow-y auto, scrollbar-width auto였다. 유튜브 쪽 스크롤바 규칙은 치지직에 적용되지 않았다.

`#player_layout`을 포함한 넓은 화면 section에만 scrollbar-width none과 WebKit 스크롤바 숨김을 적용했다. overflow는 바꾸지 않아 휠 스크롤을 유지하고 채팅 목록의 스크롤바는 건드리지 않는다. 채팅이 닫혀도 적용되며 일반 화면 복귀나 라이브 플레이어에는 적용되지 않는다. 별도 F11 감지나 키 가로채기는 추가하지 않았다.

기존 0.10.0 코드를 보존해 같은 fixture로 비교하면 넓은 화면의 스크롤바 숨김과 채팅 닫은 뒤 숨김 유지 2개가 실패한다. 수정 후 다시보기 배치·스크롤 검사 14개가 모두 통과했고 해당 검사 탭의 warning/error 로그는 없었다. 루트 JavaScript 전체 문법 검사, core 테스트 6개, manifest 파싱 및 git diff --check도 통과했다.

실제 공개 사이트의 스크롤 구조 조회와 로컬 fixture의 수정 코드 검증을 구분한다. 사용자 브라우저의 설치된 확장 재로딩과 실제 F11 조합은 직접 확인하지 않았다. 확장과 기존 다시보기 탭을 다시 로드해야 새 규칙이 적용된다.
