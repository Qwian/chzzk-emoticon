# 0.10.23 검증 기록 — 2026-11-06

## 실제 공개 페이지에서 확인한 두 원인

- 현재 [숲 홈](https://www.sooplive.com/)의 인기 방송 카드는 `div[data-type="cBox"][data-broadcast-id]`다. 기존 식별자는 `li[data-broadcast-id]` 또는 일반 li/article만 허용해 해당 카드를 전혀 인식하지 못했다. 현재 공개 DOM의 앞쪽 6개 카드 모두 기존 식별자에 걸리지 않는 것을 확인했다. 공개 DOM·SDK 관찰은 `artifacts/soop-dom-sdk-20261106.json`에 보존했다.
- 카드 식별만 수정한 실제 unpacked 검사에서는 공식 미리보기 API가 HTTP 200 / RESULT 1을 반환했지만 SDK가 `Cannot read properties of null (reading 'appendChild')`로 실패했다. 현재 [공식 PreviewPlayer.js](https://static.sooplive.com/asset/app/liveplayer/player/dist/PreviewPlayer.js)의 `_autoPlayCheck()`가 사용자 지정 parentId와 별개로 기본 `videoLayer` 부모를 필요로 하는 것을 확인했다. 해당 페이지에 그 부모가 없었다. API 재생 주소·인증 토큰은 로그에 기록하지 않았다.

## 변경

- 카드 인식에서 방송 ID 속성의 태그 제한을 없애고 현재 cBox 구조를 추가했다. 썸네일 영역 안의 링크만 시작 대상으로 하며 제목·방송자·일반 링크 및 수정키의 기존 컨텍스트 메뉴는 유지한다.
- 공식 SDK 초기 검사 부모가 없을 때만 확장 미리보기 안에 숨긴 `videoLayer`를 준비한다. 확장이 만든 부모는 종료·예외 때 정리하며 기존 사이트 부모는 제거하거나 변경하지 않는다. 공식 SDK 파일이나 미리보기 API, 계정·시청 제한을 수정하지 않는다.

## 검증

- 수정 전: 카드 모형 22개 중 현재 div/cBox 인식 2개 실패. SDK 모형 6개 중 기본 부모 준비·오류 정리·취소 관련 4개 실패. 결과를 `artifacts/regression-0.10.23-before.json`에 보존했다.
- 수정 후: 미리보기·SDK·재시도·사이드바 모형 4개 페이지, 검사 70개 통과 및 페이지 예외 없음. 기존 li 카드와 이전 숲 도메인, div 카드의 SVG 배지·재우클릭·이탈, 기존 사이트 컨테이너 보존, SDK 예외·늦은 취소 및 치지직 회귀를 포함한다.
- 계측용 SDK 래퍼 없이 실제 unpacked v0.10.23을 격리 Edge에 로드해 로그아웃 숲 홈의 공개 방송을 우클릭했다. 실제 영상 readyState 4, 음소거 false, 음량 1, 재생 시간 약 6.09→7.30초 진행을 확인했다. 다시 우클릭하면 확장 미리보기가 닫혔으며 확장 실행 예외 없음. 결과: `artifacts/soop-public-preview-0.10.23.json`. 카드 수정 후 SDK 준비 전 실패는 `artifacts/soop-public-preview-0.10.23-before.json`에 보존했다.
- 루트 JavaScript 문법과 manifest 파싱, Node 검사 34개 통과.
- 배포 ZIP 39개 리소스의 압축 무결성과 현재 프로젝트 파일 일치를 확인했다. SHA-256: `efdb4a93891794a2e2741ab4a9b89ff393b2d87e2cd85dfa038898c71b6cb2e1`.

실제 공개 페이지 검사와 모형 검사를 구분한다. 실제 오디오를 청취했다는 주장은 하지 않으며 확인한 것은 음소거/음량 상태와 영상 시간 진행이다. 사용자 웨일의 로그인 상태나 제한 방송을 검사한 것은 아니다. 확장과 열린 숲 탭을 모두 다시 로드해야 적용된다.
