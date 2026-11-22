# SOOP 방송 입장 전 채팅 조사 (2026-11-21)

요청은 **방송을 처음 열자마자 입장 전 최근 대화를 표시하는 것**이다. 입장 이후에 받은 채팅 보관은 이 요청의 구현이 아니다. 잘못 추가한 0.10.33의 MAIN-world 보관 코드는 0.10.34에서 철회했다. 채팅 레이아웃·탭별 겹치기는 유지한다.

2026-11-22 사용자가 별도로 **방송 입장 이후, 채팅창을 열지 않아도 대화가 쌓이는 기능**을 요청했다. 이 범위는 0.10.36에서 독립 설정 `soopChatHistory`로 구현했다. 아래의 입장 전 기록 조회 제한은 그대로다.

## 확인한 조회 경로

- 치지직 채팅에는 최근 메시지를 요청하는 `5101`과 응답 `15101`이 있다. [프로토콜 구현 문서](https://github.com/hypn4/chzzk-python/blob/main/docs/unofficial-chat-websocket-protocol.md).
- [SOOP 공식 SDK의 채팅 메세지 조회](https://developers.sooplive.com/docs/chatsdk/get-message)는 `handleMessageReceived(callback)`로 실시간 수신 이벤트를 등록하는 기능이다. 현재 문서에 과거 메시지 목록, 조회 시각, 개수 또는 커서로 기록을 요청하는 메서드는 없다. [연결 문서](https://developers.sooplive.com/docs/chatsdk/connection)의 `getRoomInfo()`는 채팅방 정보이며 메시지 이력이 아니다.
- 현재 생방송 HTML이 참조하는 `LivePlayer.js?_=202610201100`의 채팅 프로토콜 서비스 코드와 송신·수신 구현을 조사했다. 입장(`SVC_JOINCH=2`) 및 실시간 메시지(`SVC_CHATMESG=5`, `SVC_OGQ_EMOTICON=109`) 경로는 있지만, 최근 채팅을 요청·응답하는 경로를 찾지 못했다. `LiveView.js`에도 과거 기록 요청·병합 경로를 찾지 못했다. 이는 현재 확인한 클라이언트 범위의 결과이며 서버 내부에 기록이 없다는 뜻은 아니다.
- 공개된 [VOD Master의 이전 채팅 복원 구현](https://github.com/Khassarion/VOD-Master)은 VOD 정보의 `files[].chat` 주소와 `startTime`을 사용한다. 생방송 입장 전 채팅을 반환하는 API로 확인된 것이 아니다.
- 생방송의 방송 요약·키워드·시청자 분위기 API는 원문 메시지 목록을 반환하는 기능과 구별해야 한다.

## 구현 상태와 제한

입장 전의 실제 채팅 데이터를 얻는 경로를 확보하지 못했으므로, 요청한 기능은 **미구현**이다. 수신 이후의 메시지, 임의의 텍스트, 다른 방송의 메시지를 입장 전 기록처럼 보여주지 않는다.

별도의 수집 서비스가 입장 전부터 해당 방송을 수신·보관했다면 그 서비스의 기록을 가져오는 구조는 가능하다. 현재 저장소에는 그러한 수집 서버나 검증된 범용 기록 제공자가 없다. 모든 방송에서 치지직과 같은 동작을 보장하려면 SOOP의 기록 조회 기능이나 선행 수집 데이터가 필요하다. 상시 수집·외부 전송·서버 운영을 이번 조사 결과의 대체 구현으로 추가하지 않았다.

## 증거와 재검증

- `artifacts/soop-player-20261121.html`: 현재 생방송 페이지의 참조 빌드 확인.
- `artifacts/soop-liveplayer-current.js`, `artifacts/soop-liveview-source.js`: 조사한 생방송 클라이언트 원본.
- `artifacts/soop-developers-index-20261121.js`, `artifacts/soop-doc-chatsdk.BT3kmwKn.js`, `artifacts/soop-doc-openapi.B7WIrH4V.js`: 현재 공식 개발 문서의 라우트 및 API 정의.
- `artifacts/inspect-prejoin-chat-20261121.cjs`: 격리 Edge에서 두 서비스의 신규 입장 통신을 관찰하는 진단. 채팅 본문·사용자 인증 정보는 결과에 기록하지 않고 명령 코드·개수·시각만 남긴다. 입력·전송 기능은 호출하지 않는다.
- `artifacts/prejoin-chat-network-20261121.json`: 치지직 신규 페이지가 `5101`을 보내고 `15101`로 50개 메시지를 받았다. 메시지 시각이 페이지 입장 시각보다 앞선 것을 확인했다. SOOP의 해당 진단 시도는 채팅 소켓에 연결되지 않아 비교 근거로 사용할 수 없다. SOOP에 관한 결론은 현재 공식 SDK·클라이언트 소스에서 조회 경로를 확보하지 못했다는 범위로 제한한다.

0.10.34의 배포 패키지는 철회한 0.10.33 대신 바이트 대조가 완료된 0.10.32를 복구용으로 보존한다. 기록 조회 경로를 확인하기 전에는 입장 전 채팅 지원을 완료했다고 보고하지 않는다.
