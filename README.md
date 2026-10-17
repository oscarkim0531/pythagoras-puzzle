# 피타고라스 정리 퍼즐

[웹사이트](https://oscarkim0531.github.io/pythagoras-puzzle/)는 교사·학생 구분이나 수업 코드 없이 시작합니다. [EBSMath 원본 퍼즐](https://www.ebsmath.co.kr/innovativelrms/web_lrms/content/resource/PC/29725/index.html)의 2~10번 조각 이미지를 원래 배치와 회전에 맞춰 사용합니다. 처음의 두 정사각형은 직각삼각형의 두 직각변 위에, 아래 정사각형은 빗변 위에 그려집니다. 각 퍼즐에서 조각을 직접 이동·회전하고 학번을 입력해 현재 퍼즐 영역을 PNG로 제출합니다. 조각을 옮긴 뒤에도 두 정사각형의 테두리가 조각 아래에 남습니다. 조각은 자동으로 회전하거나 붙지 않으며 완료 판정도 없습니다.

## 조작

- 조각을 누른 채 드래그해 옮깁니다.
- 선택한 조각 위에 나타나는 회전 손잡이를 드래그하거나 아래 15°/1° 버튼으로 회전합니다. 필요한 조각은 `좌우 반전` 버튼으로 뒤집을 수 있습니다.
- 선택한 조각은 방향키로 2단위씩 이동하고, Shift+방향키로 10단위씩 이동합니다. 크롬북 트랙패드의 두 손가락 스크롤로도 조각을 조금씩 움직일 수 있습니다.
- `현재 퍼즐 제출하기`를 누르고 학번을 입력합니다. 이미지 이름은 `학번_퍼즐번호.png`입니다. 같은 학번과 퍼즐을 다시 제출하면 Google Drive에 같은 이름의 파일이 하나 더 생깁니다.

## 제출 연결

Google Drive 폴더의 공유 링크만으로는 웹페이지가 파일을 API로 업로드할 수 없습니다. `apps-script/Code.gs`를 Google Apps Script 웹 앱으로 배포하고 `submission-config.js`에 생성된 `/exec` URL을 넣어야 합니다. 웹 앱은 `apps-script/appsscript.json`의 `drive.file` 및 `script.external_request` 범위를 요청하고, `Code.gs`에 지정된 [제출 폴더](https://drive.google.com/drive/folders/10Flk0SE0m5Xaa3ynOLxzTlP6n3DA7l2T)에 PNG를 저장합니다. 웹 앱은 **나(배포 계정)의 인증 정보로 실행**, **액세스 권한이 있는 사용자: 모든 사용자**로 배포합니다. 따라서 학생은 Google 계정에 로그인하지 않고 제출할 수 있으며, 저장된 파일의 소유자는 배포 계정입니다. 제출 URL을 아는 사람도 파일을 보낼 수 있으므로 수업이 끝나면 배포 접근 권한을 다시 제한할 수 있습니다.

`submission-config.js`가 비어 있으면 제출 버튼은 업로드 실패를 알리며 성공 메시지를 표시하지 않습니다.

## 파일 구성

- `index.html`: 페이지 구조와 문구
- `styles.css`: 디자인과 반응형 레이아웃
- `ebs-levels.js`: 원본 조각 배치와 피타고라스 정리가 정확히 성립하는 세 정사각형 좌표
- `assets/ebs/`: EBSMath 원본 퍼즐의 조각 이미지 56개(같은 이미지를 여러 조각에서 재사용)
- `script.js`: 조각 조작, PNG 생성, 제출 흐름
- `submission-config.js`: Apps Script 웹 앱 주소
- `apps-script/`: Google Drive 업로드 웹 앱 코드
- `archive/legacy-rectangle-data.js`: 이전 직사각형 퍼즐 9개의 구성 데이터
