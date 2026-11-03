# 0.10.15 검증 기록 — 2026-11-03

## 확인한 원인과 변경

- F의 기존 `inspect('theater')`는 광고가 보이거나 극장 버튼을 찾지 못하면 이벤트를 치지직에 넘겼다. 모형에서 두 조건 모두 기본 전체화면 핸들러 실행을 재현했다. F는 광고 중에도 극장 전환을 소유하고, 버튼이 숨겨지거나 재생성되는 동안에도 keydown/keyup을 차단한다. 입력창·조합키·모달 제외 및 Space/M의 광고 중 네이티브 처리는 유지한다.
- 2026-11-03 내려받은 [공개 플레이어 코드](https://ssl.pstatic.net/static/nng/glive/resource/p/static/js/index-BcgE118t.js)는 `#live_player_layout`과 `#midAdPlayerWrapper`를 형제로 생성한다. [공개 CSS](https://ssl.pstatic.net/static/nng/glive/resource/p/static/css/index-BBGwzDvs.css)는 `.miniplayer`를 353×198 고정 위치로 만들고 `.mid_ad_mini #midAdVideoContainer`의 크기를 `!important`로 강제한다. 이전 검사는 이 바깥 본방송 레이아웃과 광고 크기 선택자 우선순위를 빠뜨렸다.
- 본방송의 `#live_player_layout`까지 복원하고, 네이티브 CSS보다 우선하는 범위 제한 선택자로 본방송 전체 크기와 광고 26% 크기를 유지한다. 네이티브 클래스를 삭제하지 않으며 광고 종료·기능 해제·채널 이동 시 확장 클래스를 제거한다.

## 검증 결과

- 수정 전: 최신 CSS를 확장보다 늦게 로드한 `ad-live-layout-harness.html?native`에서 12개 중 5개 실패. 본방송 크기와 광고 크기·재개·설정 재적용 실패를 보존했다. F 광고/숨김 버튼 테스트에서도 전체화면 누출을 재현했다.
- 수정 후: 단축키·광고 관련 브라우저 모형 16개 페이지의 검사 233개 통과, 페이지 예외 없음. 공유 영역 및 네이티브 레이아웃, CHZZK/SOOP F/Space/M/모달, 광고 준비·초기화·SDK 분리·음량·배속·스킵·설정·종료 정리를 포함한다.
- 실제 unpacked v0.10.15를 격리 Edge 프로필에 로드한 정상 초기화와 시작 helper 누락 복구 2개 경로 통과. manifest 오류·확장 예외 없음, 광고 스킵·음소거 확인.
- 로그아웃 공개 치지직 다시보기에서 실제 F 키로 일반→넓은 화면→일반 전환을 확인했다. 세 상태 모두 `document.fullscreenElement` 없음, 페이지 예외 없음. 실제 생방송 광고가 뜬 상태의 검증은 아니다.
- 루트 JavaScript 전체 문법과 manifest 파싱, Node 검사 29개 통과.
- 사용자 웨일의 로그인 생방송 광고 및 채팅 입력·전송은 수행하지 않았다. 모형 결과를 사용자 환경의 증상 해소 확인으로 간주하지 않는다.

원본 공개 소스, 수정 전후 결과 JSON, 확장 테스트 프로필과 배포 ZIP은 Git에서 제외되는 `artifacts/`에 보존한다.
