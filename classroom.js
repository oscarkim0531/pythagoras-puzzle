(async () => {
  const $ = (selector) => document.querySelector(selector);
  const game = window.PuzzleGame;
  let apiBase = '';
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!local) {
    try {
      const response = await fetch(`classroom-config.json?t=${Date.now()}`, { cache: 'no-store' });
      const config = await response.json();
      const url = new URL(config.api);
      if (url.protocol === 'https:' && !url.username && !url.password && Date.now() < config.expiresAt) {
        apiBase = url.origin;
      }
    } catch {}
    if (!apiBase) {
      $('#classroom-unavailable').hidden = false;
      return;
    }
  }
  $('#role-actions').hidden = false;
  let token = sessionStorage.getItem('puzzleSession') || '';
  let role = null;
  let rosterTimer = null;
  let heartbeatTimer = null;

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${apiBase}/api${path}`, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...options,
      });
    } catch {
      throw new Error('수업 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  }

  function errorAt(id, message = '') { $(id).textContent = message; }
  function stopPolling() {
    clearInterval(rosterTimer); clearInterval(heartbeatTimer);
    rosterTimer = null; heartbeatTimer = null;
  }
  function show(name) { game.showScreen(name); }
  function enterStudent(name) {
    role = 'student';
    game.setStudentName(name);
    show('select');
    stopPolling();
    heartbeatTimer = setInterval(async () => {
      try { await request('/student/ping', { method: 'POST', body: '{}' }); }
      catch { stopPolling(); role = null; show('start'); }
    }, 15000);
  }
  async function refreshRoster() {
    try {
      const data = await request('/teacher/classroom');
      if (!data.code) { show('teacherCode'); return; }
      $('#dashboard-code').textContent = data.code;
      const roster = $('#student-roster');
      roster.replaceChildren();
      for (const student of data.students) {
        const item = document.createElement('li');
        item.textContent = student.name;
        roster.append(item);
      }
      $('#student-count').textContent = `접속한 학생 ${data.students.length}명`;
      $('#roster-empty').hidden = data.students.length > 0;
      errorAt('#dashboard-error');
    } catch (error) { errorAt('#dashboard-error', error.message); }
  }
  function enterTeacher(code) {
    role = 'teacher';
    stopPolling();
    if (!code) { show('teacherCode'); return; }
    $('#dashboard-code').textContent = code;
    show('teacherDashboard');
    refreshRoster();
    rosterTimer = setInterval(refreshRoster, 3000);
  }
  async function logout() {
    stopPolling();
    try { await request('/logout', { method: 'POST', body: '{}' }); } catch {}
    token = ''; sessionStorage.removeItem('puzzleSession');
    role = null;
    show('start');
  }
  function bindForm(form, error, work) {
    $(form).addEventListener('submit', async (event) => {
      event.preventDefault(); errorAt(error);
      const button = $(form).querySelector('button[type="submit"]');
      button.disabled = true;
      try { await work(); } catch (issue) { errorAt(error, issue.message); }
      finally { button.disabled = false; }
    });
  }

  $('#teacher-button').addEventListener('click', () => show('teacherLogin'));
  $('#student-button').addEventListener('click', () => show('studentCode'));
  document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => show(button.dataset.back)));
  $('#teacher-code-logout').addEventListener('click', logout);
  $('#teacher-logout').addEventListener('click', logout);
  $('#change-code').addEventListener('click', () => { stopPolling(); $('#teacher-code').value = ''; show('teacherCode'); });
  $('#select-home').addEventListener('click', logout);

  bindForm('#teacher-login-form', '#teacher-login-error', async () => {
    const password = $('#teacher-password').value;
    const data = await request('/teacher/login', { method: 'POST', body: JSON.stringify({ password }) });
    token = data.token; sessionStorage.setItem('puzzleSession', token);
    $('#teacher-password').value = '';
    enterTeacher(data.code);
  });
  bindForm('#teacher-code-form', '#teacher-code-error', async () => {
    const code = $('#teacher-code').value;
    const data = await request('/teacher/code', { method: 'POST', body: JSON.stringify({ code }) });
    enterTeacher(data.code);
  });
  bindForm('#student-code-form', '#student-code-error', async () => {
    const code = $('#student-code').value;
    const data = await request('/student/code', { method: 'POST', body: JSON.stringify({ code }) });
    token = data.token; sessionStorage.setItem('puzzleSession', token);
    show('studentName'); $('#student-name').focus();
  });
  bindForm('#student-name-form', '#student-name-error', async () => {
    const name = $('#student-name').value.trim();
    if (!name) throw new Error('학번과 이름을 입력해 주세요.');
    const data = await request('/student/join', { method: 'POST', body: JSON.stringify({ name }) });
    enterStudent(data.name);
  });

  window.Classroom = { isStudent: () => role === 'student' };
  request('/session').then((session) => {
    if (session.role === 'teacher') enterTeacher(session.code);
    else if (session.role === 'student') enterStudent(session.name);
    else if (session.role === 'pending') show('studentName');
  }).catch(() => {});
})();
