"""File-backed classroom API and local static server for the puzzle."""
from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import tempfile
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import RLock
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
STATE_PATH = Path(os.environ.get('PUZZLE_STATE_PATH', ROOT / 'data' / 'classroom.json'))
FRONTEND_ORIGIN = os.environ.get('PUZZLE_FRONTEND_ORIGIN', 'https://oscarkim0531.github.io').rstrip('/')
TEACHER_HASH = bytes.fromhex('09c403e1f4b59ae0d14b00f7c68a3405f20389450fafeeafc0c38790ff3768ad')
SALT = b'pythagoras-classroom-v1'
RATE = defaultdict(deque)
STATE_LOCK = RLock()


def initial_state():
    return {'classroom': None, 'sessions': {}}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    now = int(time.time())
    generation = state['classroom']['generation'] if state['classroom'] else None
    state['sessions'] = {key: value for key, value in state['sessions'].items()
                         if value['expires_at'] > now and (value['role'] == 'teacher' or value['generation'] == generation)}
    encoded = json.dumps(state, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='wb', dir=STATE_PATH.parent, prefix='.classroom-', suffix='.tmp', delete=False) as file:
            temporary = Path(file.name)
            os.chmod(temporary, 0o600)
            file.write(encoded)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, STATE_PATH)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


@contextmanager
def state_file():
    with STATE_LOCK:
        if STATE_PATH.exists():
            state = json.loads(STATE_PATH.read_text(encoding='utf-8'))
        else:
            state = initial_state()
        yield state


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def issue(state, role, generation=None, name=None):
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    state['sessions'][digest(token)] = {
        'role': role, 'generation': generation, 'name': name,
        'expires_at': now + 43200, 'last_seen': now,
    }
    save_state(state)
    return token


class Handler(BaseHTTPRequestHandler):
    def cors_origin(self):
        origin = self.headers.get('Origin', '').rstrip('/')
        return origin if origin == FRONTEND_ORIGIN or origin == f'http://localhost:{self.server.server_port}' or origin == f'http://127.0.0.1:{self.server.server_port}' else None

    def send_common_headers(self, status, content_type='application/json; charset=utf-8', length=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        if length is not None:
            self.send_header('Content-Length', str(length))
        origin = self.cors_origin()
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_common_headers(status, length=len(body))
        self.wfile.write(body)

    def fail(self, status, message):
        self.reply(status, {'error': message})

    def do_OPTIONS(self):
        self.send_common_headers(204, length=0)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith('/api/'):
            return self.api('GET', path, {})
        if path == '/health':
            return self.reply(200, {'ok': True})
        if path == '/':
            path = '/index.html'
        candidate = (ROOT / path.lstrip('/')).resolve()
        if not candidate.is_relative_to(ROOT) or candidate.name.startswith('.') or candidate.suffix not in ('.html', '.css', '.js', '.svg', '.png', '.ico') or not candidate.is_file():
            return self.fail(404, '파일을 찾을 수 없습니다.')
        body = candidate.read_bytes()
        self.send_common_headers(200, mimetypes.guess_type(candidate.name)[0] or 'application/octet-stream', len(body))
        self.wfile.write(body)

    def do_POST(self):
        path = urlsplit(self.path).path
        if not path.startswith('/api/'):
            return self.fail(404, '주소를 찾을 수 없습니다.')
        origin = self.headers.get('Origin')
        if origin and not self.cors_origin():
            return self.fail(403, '허용되지 않은 출처입니다.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length > 4096:
                return self.fail(413, '입력 값이 너무 깁니다.')
            data = json.loads(self.rfile.read(length) or b'{}')
            if not isinstance(data, dict):
                raise ValueError()
        except (ValueError, json.JSONDecodeError):
            return self.fail(400, '입력 형식을 확인해 주세요.')
        self.api('POST', path, data)

    def session(self, state):
        header = self.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            return None, None
        token_hash = digest(header[7:])
        user = state['sessions'].get(token_hash)
        if not user or user['expires_at'] <= int(time.time()):
            return None, None
        return token_hash, user

    def too_many_failures(self, key):
        now = time.monotonic()
        hits = RATE[(self.client_address[0], key)]
        while hits and now - hits[0] > 300:
            hits.popleft()
        return len(hits) >= 20

    def record_failure(self, key):
        RATE[(self.client_address[0], key)].append(time.monotonic())

    def api(self, method, path, data):
        with state_file() as state:
            token_hash, user = self.session(state)
            classroom = state['classroom']
            current = user and (user['role'] == 'teacher' or classroom and user['generation'] == classroom['generation'])
            if path == '/api/session' and method == 'GET':
                if not current:
                    return self.reply(200, {'role': None})
                return self.reply(200, {'role': user['role'], 'name': user['name'], 'code': classroom['code'] if classroom else None})
            if path == '/api/teacher/login' and method == 'POST':
                if self.too_many_failures('teacher'):
                    return self.fail(429, '시도 횟수가 많습니다. 5분 뒤 다시 시도해 주세요.')
                password = data.get('password', '')
                if not isinstance(password, str) or not hmac.compare_digest(hashlib.pbkdf2_hmac('sha256', password.encode(), SALT, 200000), TEACHER_HASH):
                    self.record_failure('teacher')
                    return self.fail(401, '패스워드가 일치하지 않습니다.')
                return self.reply(200, {'token': issue(state, 'teacher'), 'code': classroom['code'] if classroom else None})
            if path == '/api/teacher/code' and method == 'POST':
                if not user or user['role'] != 'teacher':
                    return self.fail(401, '선생님 로그인이 필요합니다.')
                code = data.get('code')
                if not isinstance(code, str) or not re.fullmatch(r'[0-9]{4}', code):
                    return self.fail(400, '숫자 네 자리를 입력해 주세요.')
                generation = (classroom['generation'] + 1) if classroom else 1
                state['classroom'] = {'code': code, 'generation': generation}
                save_state(state)
                return self.reply(200, {'code': code})
            if path == '/api/teacher/classroom' and method == 'GET':
                if not user or user['role'] != 'teacher':
                    return self.fail(401, '선생님 로그인이 필요합니다.')
                if not classroom:
                    return self.reply(200, {'code': None, 'students': []})
                cutoff = int(time.time()) - 45
                students = [entry for entry in state['sessions'].values() if entry['role'] == 'student' and entry['generation'] == classroom['generation'] and entry['expires_at'] > int(time.time()) and entry['last_seen'] >= cutoff]
                students.sort(key=lambda entry: entry['last_seen'], reverse=True)
                return self.reply(200, {'code': classroom['code'], 'students': [{'name': entry['name']} for entry in students]})
            if path == '/api/student/code' and method == 'POST':
                if self.too_many_failures('student'):
                    return self.fail(429, '시도 횟수가 많습니다. 5분 뒤 다시 시도해 주세요.')
                code = data.get('code')
                if not classroom or not isinstance(code, str) or not hmac.compare_digest(code, classroom['code']):
                    self.record_failure('student')
                    return self.fail(401, '수업 코드가 일치하지 않습니다.')
                return self.reply(200, {'token': issue(state, 'pending', classroom['generation'])})
            if path == '/api/student/join' and method == 'POST':
                if not current or user['role'] != 'pending':
                    return self.fail(401, '수업 코드를 먼저 입력해 주세요.')
                name = data.get('name')
                if not isinstance(name, str) or not 0 < len(name.strip()) <= 60:
                    return self.fail(400, '학번과 이름을 입력해 주세요.')
                name = name.strip()
                user['role'] = 'student'
                user['name'] = name
                user['last_seen'] = int(time.time())
                save_state(state)
                return self.reply(200, {'name': name})
            if path == '/api/student/ping' and method == 'POST':
                if not current or user['role'] != 'student':
                    return self.fail(401, '학생 입장이 필요합니다.')
                user['last_seen'] = int(time.time())
                save_state(state)
                return self.reply(200, {'ok': True})
            if path == '/api/logout' and method == 'POST':
                if token_hash:
                    del state['sessions'][token_hash]
                    save_state(state)
                return self.reply(200, {'ok': True})
            self.fail(404, '주소를 찾을 수 없습니다.')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f'Classroom server: http://localhost:{port}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
