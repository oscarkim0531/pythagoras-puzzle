# 피타고라스 정리 퍼즐

수업용 퍼즐 웹입니다. 학생은 수업 코드와 학번·이름을 한 번 입력한 뒤 9개의 다각형 퍼즐을 선택합니다. 선생님은 고정 패스워드로 로그인해 네 자리 수업 코드를 설정하고, 현재 접속한 학생의 명단을 봅니다. 기존 격자 퍼즐 9개의 코드와 데이터는 유지하되 학생 목록에는 표시하지 않습니다.

## 로컬 실행

```sh
python3 server.py
```

브라우저에서 `http://localhost:8000`을 엽니다. Python 표준 라이브러리만 사용합니다. 수업 정보는 `data/classroom.json` 파일에 저장되고 Git에는 포함되지 않습니다. 파일은 임시 파일을 쓴 뒤 원자적으로 교체해 저장합니다. 두 개의 브라우저 탭에서 각각 선생님과 학생으로 입장해 시험할 수 있습니다.

## 기존 GitHub Pages 주소로 공개하기

GitHub Pages에서는 Python 서버를 실행하거나 방문자들이 공유하는 JSON 파일을 수정할 수 없습니다. **기존 Pages 주소에는 HTML·CSS·JavaScript를 그대로 게시하고, `server.py`는 HTTPS와 영구 저장소가 있는 별도 서버에 배포**해야 합니다. 서버의 `PUZZLE_STATE_PATH`를 영구 저장소 안의 `classroom.json` 경로로 지정하세요. `PUZZLE_FRONTEND_ORIGIN`은 기본값인 `https://oscarkim0531.github.io`이며, GitHub Pages 주소가 달라지면 정확한 origin으로 바꾸세요.

서버 URL이 정해지면 `classroom-config.js`의 `window.CLASSROOM_API_URL`에 해당 HTTPS 주소를 입력해 GitHub Pages에 게시합니다. 예: `window.CLASSROOM_API_URL = 'https://your-server.example';`. 이 설정 전에는 Pages 화면에서 수업 서버에 접속할 수 없습니다. 배포 서버는 `PORT` 환경변수로 포트를 지정할 수 있으며, `/health`로 상태를 확인할 수 있습니다.

수업 코드가 새로 설정되면 이전 코드로 입장한 학생 세션과 명단은 무효화됩니다. 접속 중인 학생은 15초마다 상태를 갱신하며, 45초 동안 갱신되지 않으면 선생님 명단에서 사라집니다. 브라우저 탭을 새로고침해도 같은 탭의 로그인은 유지됩니다.

## 파일 구성

- `index.html`: 화면 구조와 문구
- `styles.css`: 디자인과 반응형 레이아웃
- `ebs-levels.js`: 9개 다각형 퍼즐의 조각과 목표 좌표
- `script.js`: 퍼즐 조작·판정
- `classroom.js`: 교사·학생 입장과 명단 갱신
- `server.py`: 인증, 수업 코드, JSON 파일 저장 및 로컬 정적 파일 제공
