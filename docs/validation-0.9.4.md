# 0.9.4 검증 기록 — 2026-10-29

## 수정 근거

사용자는 따라잡기 버튼의 기본 반투명이 아니라 기본 재생 컨트롤과 함께 사라지는 동작을 원했다. 추가로 자동 따라잡기 켜짐은 흰색·불투명, 꺼짐은 반투명으로 구분하도록 요청했다.

공개 치지직 생방송을 일반 화질로 열어 실제 DOM과 CSS를 조회했다. `.pzp-pc__bottom` 및 오른쪽 버튼 컨테이너의 opacity는 1인 채로, `.pzp-pc.pzp-pc--controls .pzp-pc__setting-button` 등 개별 버튼의 opacity를 1로 만드는 구조였다. 컨트롤 클래스가 없을 때 실제 가위 버튼 opacity는 0이었고 추가 span에는 해당 규칙이 적용되지 않았다.

따라잡기의 Shadow DOM host도 같은 `.pzp-pc--controls` 상태에 맞춰 숨기도록 했다. 숨김에서는 opacity 0, visibility hidden, pointer-events none으로 화면과 입력 대상에서 제외한다. 별도 마우스 대기 타이머는 추가하지 않는다. 표시 중에는 자동 따라잡기 체크 여부에 따라 흰색 opacity 1 / 0.35를 적용한다. hover로 꺼짐 상태를 불투명으로 바꾸던 규칙은 제거했다.

## 검증

- 기존 채널 도구 검사 화면에 실제 플레이어의 컨트롤 클래스 구조와 가위 버튼 CSS를 반영했다. `?preview&controls`에서 기본 컨트롤 표시·숨김을 직접 전환할 수 있다.
- 실제 브라우저 클릭으로 켜짐 summary opacity 1·색상 rgb(255,255,255), 꺼짐 0.35, 기본 컨트롤 숨김 시 가위·따라잡기 host 모두 opacity 0, host와 summary visibility hidden 및 pointer-events none을 확인했다.
- 다시 표시한 뒤 체크를 켜면 흰색·opacity 1로 복원됐다. 내부 설정 조작과 바깥 클릭 닫기도 유지됐다. 로컬 검사 탭 warning/error 로그 없음.
- 기존 채널 도구 브라우저 검사 34개, 필수 core Node 검사 6개 통과. 루트 JavaScript 전체 문법 검사, manifest JSON 파싱 및 git diff --check 통과.

실제 사이트의 구조·스타일 조회와 로컬에서 변경 코드를 실행한 검증은 구분한다. 설치된 확장의 직접 재로딩 및 사용자 브라우저의 실제 재생에서 확인한 결과는 아니다. 실제 채팅 입력·전송은 수행하지 않았다. 확장 다시 로드 후 치지직 탭도 새로고침해야 한다.
