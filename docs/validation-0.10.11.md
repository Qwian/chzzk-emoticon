# 0.10.11 검증 기록 — 2026-11-01

## 요청과 기본 버튼 확인

- 치지직·숲 모두 F로 극장모드를 전환한다. 치지직의 기본 넓은 화면 버튼은 `.pzp-pc__viewmode-button` 계열이고 숲은 `button.btn_screen_mode`다.
- SOOP 공식 플레이어 `https://static.sooplive.com/asset/app/liveplayer/view/dist/LiveView.js?_=202610201100`에서 기본 F가 keyup 전체화면 버튼, S가 스크린모드 버튼을 실행함을 확인했다. F의 down/up을 모두 소유해 전체화면으로 다시 전환되는 것을 막는다.
- 같은 공식 소스에서 `#time_shift_play`는 이용 가능 여부를 검사하는 타임머신 일시정지 버튼이며, `#play.stop`은 `sendEndBroad`, `#play.play`는 `sendLoadBroad`를 실행하는 별도 정지/재생 버튼임을 확인했다. [공식 타임머신 안내](https://sotong.sooplive.com/?b_no=8425&board_type=servicenotice&work=view)도 기능의 이용 조건을 설명한다.

## 변경

- 플랫폼별 기본 극장 버튼을 구분해 F 한 번당 한 번 전환한다. 입력창·채팅·조합키·IME 조합 중에는 개입하지 않는다. 포커스 이동·설정 해제 뒤 대응 keyup에서도 전체화면이 중복 실행되지 않는다.
- 숲 Space는 기존 네이티브 처리를 기다리고, 재생 상태와 타임머신 버튼 상태가 그대로일 때만 기본 정지/재생 버튼을 실행한다. 비동기 타임머신 전환을 위해 150ms 여유를 두며, 정상 버튼 상태 전환은 영상 상태가 늦게 바뀌더라도 존중한다.
- 정지로 영상이 제거되면 남은 기본 재생 버튼의 play 상태를 인식해 Space로 재시작한다. 타임머신 구매·권한·서버 응답을 변경하지 않는다.
- 기존 playerShortcuts 설정을 함께 사용하고 팝업 이름을 F·정지 기능에 맞췄다. 저장 데이터와 권한은 변경하지 않았다.

## 검증

- 신규 동작 모형: 치지직 11개·숲 19개 통과. 플랫폼별 버튼, F 네이티브 전체화면 중복, 반복·IME·입력창·모달·설정/blur, 타임머신 허용/불허·지연 및 정지로 영상 제거 후 재생을 확인했다.
- 기존 치지직·숲 단축키 21개씩, 모달 회귀 15개, 팝업 Space 상태 표시 검사 통과.
- 실제 공개 치지직 다시보기에서 F로 넓은 화면 false → true → false 및 fullscreen=false를 확인했다.
- 실제 SOOP 공개 플레이어 `https://play.sooplive.com/soop`에서 F로 body.screen_mode false → true → false 및 fullscreen=false를 확인했다. 해당 채널은 정지/오프라인 상태였으므로 이 결과를 실제 생방송 정지·재생 검증으로 간주하지 않는다. 네이티브 `auto play block` 오류는 확장 없는 별도 프로필에서도 재현돼 확장 오류와 구분했다.
- 루트 JavaScript 전체 문법, manifest JSON 파싱, Node 검사 29개 통과. 로그인 채팅 입력·전송과 게임 창 조작은 수행하지 않았다.
- 사용자 웨일과 실제 SOOP 생방송의 타임머신 구독 조합·정지/재접속은 미확인이다.
