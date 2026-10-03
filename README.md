# 피타고라스 정리 퍼즐

수업용 퍼즐 웹입니다. 학생은 수업 코드와 학번·이름을 한 번 입력한 뒤 9개의 다각형 퍼즐을 선택합니다. 선생님은 고정 패스워드로 로그인해 네 자리 수업 코드를 설정하고, 현재 접속한 학생의 명단을 봅니다. 기존 격자 퍼즐 9개의 코드와 데이터는 유지하되 학생 목록에는 표시하지 않습니다.

## 선생님 컴퓨터에서 수업 열기

이 저장소의 `main` 브랜치를 선생님 Mac에서 열고, 터미널에서 다음을 실행합니다.

```sh
python3 start_class.py
```

스크립트가 로컬 서버와 임시 HTTPS 터널을 켜고 `classroom-config.json`을 GitHub Pages에 게시합니다. **“수업이 열렸습니다”라는 메시지가 나온 뒤** 선생님과 학생 모두 [기존 웹 주소](https://oscarkim0531.github.io/pythagoras-puzzle/)에 접속합니다. 터미널 창과 컴퓨터를 수업 내내 켜 두세요. 수업을 마칠 때 터미널에서 `Ctrl+C`를 누르면 연결 정보가 종료 상태로 바뀝니다. 수업 코드와 명단은 선생님 컴퓨터의 `data/classroom.json`에 저장되며 GitHub에는 올라가지 않습니다.

이 Mac에는 `.local-tools/cloudflared`가 설치되어 있습니다. 다른 컴퓨터에서 시작한다면 [Cloudflare 공식 다운로드 안내](https://developers.cloudflare.com/tunnel/downloads/)에 따라 `cloudflared`를 설치하세요. GitHub에 `main` 브랜치를 push할 수 있어야 수업 연결 정보를 갱신할 수 있습니다. 임시 터널 주소는 수업마다 바뀌지만 학생에게 안내하는 GitHub Pages 주소는 같습니다.

계정이 필요 없는 [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)을 사용합니다. Cloudflare는 이 방식을 개발·시험용으로 안내하며 가동을 보장하지 않습니다. 컴퓨터가 꺼지거나 연결이 끊기면 학생들도 접속할 수 없습니다. 학생이 입력한 이름과 수업 코드는 HTTPS 연결 과정에서 Cloudflare를 거쳐 선생님 컴퓨터로 전달됩니다.

## 로컬 확인

```sh
python3 server.py
```

`http://localhost:8000`에서 교사·학생 화면을 두 탭으로 확인할 수 있습니다. Python 표준 라이브러리만 사용합니다. 수업 상태는 `data/classroom.json` 파일에 원자적으로 저장되며 Git에는 포함되지 않습니다.

## 구성

- `index.html`: 화면 구조와 문구
- `styles.css`: 디자인과 반응형 레이아웃
- `ebs-levels.js`: 9개 다각형 퍼즐의 조각과 목표 좌표
- `script.js`: 퍼즐 조작·판정
- `classroom.js`: 교사·학생 입장과 명단 갱신
- `server.py`: 인증, 수업 코드, JSON 파일 저장 및 로컬 정적 파일 제공
- `start_class.py`: 수업 시간에 로컬 서버·HTTPS 터널을 켜고 GitHub Pages를 연결
