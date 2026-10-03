"""Start a class on this Mac and connect the existing GitHub Pages URL to it."""
from __future__ import annotations

import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / 'classroom-config.json'
PUBLIC_CONFIG = 'https://oscarkim0531.github.io/pythagoras-puzzle/classroom-config.json'
PORT = 8000
TUNNEL_PATTERN = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com')


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def publish(api, expires_at):
    CONFIG.write_text(json.dumps({'api': api, 'expiresAt': expires_at}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    git('add', 'classroom-config.json')
    git('commit', '-m', 'Open classroom' if api else 'Close classroom')
    git('push', 'origin', 'main')


def wait_for_public_config(api, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urlopen(f'{PUBLIC_CONFIG}?t={time.time_ns()}', timeout=8) as response:
                if json.load(response).get('api') == api:
                    return True
        except Exception:
            pass
        time.sleep(4)
    return False


def wait_for_local_server(process):
    for _ in range(40):
        if process.poll() is not None:
            raise RuntimeError('로컬 서버가 종료되었습니다. 8000번 포트를 확인해 주세요.')
        try:
            with urlopen(f'http://127.0.0.1:{PORT}/health', timeout=1) as response:
                if json.load(response).get('ok'):
                    return
        except Exception:
            time.sleep(.25)
    raise RuntimeError('로컬 서버가 시작되지 않았습니다.')


def tunnel_url(process):
    lines = queue.Queue()
    def collect():
        for line in process.stdout:
            lines.put(line)
    threading.Thread(target=collect, daemon=True).start()
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('HTTPS 터널이 종료되었습니다. 인터넷 연결을 확인해 주세요.')
        try:
            line = lines.get(timeout=1)
        except queue.Empty:
            continue
        match = TUNNEL_PATTERN.search(line)
        if match:
            return match.group(0)
    raise RuntimeError('HTTPS 터널 주소를 받지 못했습니다.')


def stop(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def main():
    if git('branch', '--show-current') != 'main':
        raise RuntimeError('main 브랜치에서 실행해 주세요.')
    if git('status', '--porcelain'):
        raise RuntimeError('커밋되지 않은 파일이 있습니다. 변경 사항을 먼저 정리해 주세요.')
    git('pull', '--ff-only', 'origin', 'main')
    binary = ROOT / '.local-tools' / 'cloudflared'
    if not binary.exists():
        found = shutil.which('cloudflared')
        if not found:
            raise RuntimeError('cloudflared가 없습니다. README의 설치 안내를 확인해 주세요.')
        binary = Path(found)

    server = tunnel = None
    published = False
    try:
        environment = os.environ.copy()
        environment['PORT'] = str(PORT)
        server = subprocess.Popen([sys.executable, str(ROOT / 'server.py')], cwd=ROOT, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        wait_for_local_server(server)
        tunnel = subprocess.Popen([str(binary), 'tunnel', '--url', f'http://127.0.0.1:{PORT}'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        api = tunnel_url(tunnel)
        print(f'임시 HTTPS 서버: {api}', flush=True)
        publish(api, int(time.time() * 1000) + 8 * 60 * 60 * 1000)
        published = True
        print('GitHub Pages에 수업 연결 정보를 게시했습니다. 배포 확인 중...', flush=True)
        if not wait_for_public_config(api):
            raise RuntimeError('GitHub Pages 반영을 확인하지 못했습니다. 몇 분 뒤 다시 확인해 주세요.')
        print('수업이 열렸습니다: https://oscarkim0531.github.io/pythagoras-puzzle/', flush=True)
        print('이 창을 켜 두세요. 수업을 마치려면 Ctrl+C를 누르세요.', flush=True)
        while server.poll() is None and tunnel.poll() is None:
            time.sleep(2)
        raise RuntimeError('로컬 서버 또는 HTTPS 연결이 끊어졌습니다.')
    except KeyboardInterrupt:
        print('\n수업을 종료합니다.', flush=True)
    finally:
        stop(tunnel)
        stop(server)
        if published:
            try:
                publish('', 0)
                print('GitHub Pages를 수업 종료 상태로 되돌렸습니다.', flush=True)
            except Exception as error:
                print(f'수업 종료 설정을 게시하지 못했습니다: {error}', file=sys.stderr, flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'수업 시작 실패: {error}', file=sys.stderr)
        sys.exit(1)
