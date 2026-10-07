const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (selector) => document.querySelector(selector);
const stage = $('#puzzle-stage');
const screens = { start: $('#start-screen'), select: $('#select-screen'), game: $('#game-screen') };
const state = { level: 0, pieces: [], transforms: new Map(), selected: null, dragging: null, seconds: 0, clock: null, pendingAction: null, upload: null };
const STAGE_VIEWBOX = '-325 -280 650 720';
function trustedUploadOrigin(origin) {
  return origin === 'https://script.google.com' ||
    /^https:\/\/[a-z0-9-]*script\.googleusercontent\.com$/.test(origin);
}

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function pathForPolygon(vertices) {
  return `M ${vertices.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}

function polygonCenter(vertices) {
  let twiceArea = 0;
  let centerX = 0;
  let centerY = 0;
  vertices.forEach(([x1, y1], index) => {
    const [x2, y2] = vertices[(index + 1) % vertices.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    centerX += (x1 + x2) * cross;
    centerY += (y1 + y2) * cross;
  });
  return { x: centerX / (3 * twiceArea), y: centerY / (3 * twiceArea) };
}

function piecePath(piece) {
  // Keep the corners traced from the nine supplied screenshots.
  const center = polygonCenter(piece.polygon);
  return pathForPolygon(piece.polygon.map(([x, y]) => [
    center.x + (x - center.x) * 1.09,
    center.y + (y - center.y) * 1.09,
  ]));
}

function drawGallery() {
  document.querySelectorAll('.level-card').forEach((card) => {
    const level = Number(card.dataset.level);
    const svg = svgElement('svg', { viewBox: '-290 -310 580 380', 'aria-hidden': 'true' });
    EBS_LEVELS[level].pieces.forEach((piece) => svg.append(svgElement('path', {
      d: piecePath(piece), fill: piece.color, stroke: '#8f612c', 'stroke-width': 3,
      'stroke-linejoin': 'round',
    })));
    card.querySelector('.level-art').append(svg);
  });
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => { screen.hidden = key !== name; });
  if (name !== 'game') stopClock();
  if (name === 'game') renderStage();
}

function updateTimer() {
  $('#timer').textContent = `${String(Math.floor(state.seconds / 60)).padStart(2, '0')}:${String(state.seconds % 60).padStart(2, '0')}`;
}

function stopClock() {
  if (state.clock) clearInterval(state.clock);
  state.clock = null;
}

function startClock() {
  stopClock();
  state.clock = setInterval(() => {
    if (screens.game.hidden || $('#confirm-dialog').open || $('#submit-dialog').open) return;
    state.seconds += 1;
    updateTimer();
  }, 1000);
}

function beginLevel(level) {
  state.level = level;
  state.pieces = EBS_LEVELS[level].pieces;
  state.transforms = new Map(state.pieces.map((piece) => [piece.id, { x: 0, y: 0, angle: 0 }]));
  state.selected = null;
  state.dragging = null;
  state.seconds = 0;
  updateTimer();
  $('#level-number').textContent = `퍼즐 ${String(level + 1).padStart(2, '0')}`;
  showScreen('game');
  startClock();
  $('#game-status').textContent = '퍼즐을 시작했습니다.';
}

function pieceById(id) { return state.pieces.find((piece) => piece.id === id); }
function transformFor(id) { return state.transforms.get(id); }

function updatePieceElement(id) {
  const group = stage.querySelector(`[data-piece="${id}"]`);
  if (!group) return;
  const { x, y, angle } = transformFor(id);
  const { x: cx, y: cy } = polygonCenter(pieceById(id).polygon);
  group.setAttribute('transform', `translate(${x} ${y}) rotate(${angle} ${cx} ${cy})`);
}

function renderStage() {
  if (screens.game.hidden) return;
  const data = EBS_LEVELS[state.level];
  const [tx, ty] = data.target.center;
  const [tw, th] = data.target.size;
  stage.setAttribute('viewBox', STAGE_VIEWBOX);
  stage.replaceChildren();
  const grid = svgElement('g', { 'aria-hidden': 'true' });
  for (let x = -325; x <= 325; x += 60) grid.append(svgElement('path', {
    d: `M ${x} -280 V 440`, fill: 'none', stroke: '#d9e0e3', 'stroke-width': 1.5, 'stroke-dasharray': '5 5',
  }));
  for (let y = -280; y <= 440; y += 60) grid.append(svgElement('path', {
    d: `M -325 ${y} H 325`, fill: 'none', stroke: '#d9e0e3', 'stroke-width': 1.5, 'stroke-dasharray': '5 5',
  }));
  stage.append(grid);
  stage.append(svgElement('rect', {
    x: tx - tw / 2, y: ty - th / 2, width: tw, height: th,
    fill: '#fff', stroke: '#b7b7b7', 'stroke-width': 2.5,
  }));
  const [cx, cy] = data.corner;
  stage.append(svgElement('path', {
    d: `M ${cx - 4} ${cy + 2} L ${cx - 1} ${cy + 6} L ${cx + 3} ${cy + 3}`,
    fill: 'none', stroke: '#e34d53', 'stroke-width': 3.5, 'pointer-events': 'none',
  }));
  const order = [...state.pieces];
  if (state.selected !== null) {
    const index = order.findIndex((piece) => piece.id === state.selected);
    if (index >= 0) order.push(...order.splice(index, 1));
  }
  order.forEach((piece) => {
    const selected = piece.id === state.selected;
    const group = svgElement('g', {
      class: `source-piece exact-piece${selected ? ' is-selected' : ''}`,
      'data-piece': piece.id,
    });
    group.append(svgElement('path', {
      d: piecePath(piece), fill: piece.color, stroke: '#92632d',
      'stroke-width': 4, 'stroke-linejoin': 'round',
    }));
    if (selected) {
      const center = polygonCenter(piece.polygon);
      const top = Math.min(...piece.polygon.map(([, y]) => y));
      const handleY = Math.max(-270, top - 24);
      const ui = svgElement('g', { class: 'rotation-ui', 'aria-hidden': 'true' });
      ui.append(svgElement('path', { d: `M ${center.x} ${top} L ${center.x} ${handleY}`, stroke: '#5268b3', 'stroke-width': 2 }));
      ui.append(svgElement('circle', { cx: center.x, cy: handleY, r: 12, fill: '#fff', stroke: '#5268b3', 'stroke-width': 3, 'data-rotate': piece.id }));
      const handleLabel = svgElement('text', { x: center.x, y: handleY + 5, 'text-anchor': 'middle', fill: '#5268b3', 'font-size': 15, 'pointer-events': 'none' });
      handleLabel.textContent = '↻';
      ui.append(handleLabel);
      group.append(ui);
    }
    stage.append(group);
    updatePieceElement(piece.id);
  });
  const hasSelection = state.selected !== null;
  $('#selected-piece-label').textContent = hasSelection ? `선택한 조각 ${state.selected}` : '조각을 선택하세요';
  document.querySelectorAll('.piece-controls button').forEach((button) => { button.disabled = !hasSelection; });
}

function pointInStage(event) {
  const point = stage.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const result = point.matrixTransform(stage.getScreenCTM().inverse());
  return { x: result.x, y: result.y };
}

function pieceCenterOnStage(id) {
  const center = polygonCenter(pieceById(id).polygon);
  const transform = transformFor(id);
  return { x: center.x + transform.x, y: center.y + transform.y };
}

stage.addEventListener('pointerdown', (event) => {
  const group = event.target.closest('[data-piece]');
  if (!group) { state.selected = null; renderStage(); return; }
  const id = Number(group.dataset.piece);
  if (state.selected !== id) { state.selected = id; renderStage(); }
  const start = pointInStage(event);
  const transform = transformFor(id);
  const rotate = Boolean(event.target.closest('[data-rotate]'));
  const center = pieceCenterOnStage(id);
  state.dragging = {
    id, pointerId: event.pointerId, mode: rotate ? 'rotate' : 'move', start,
    startX: transform.x, startY: transform.y, startAngle: transform.angle,
    pointerAngle: Math.atan2(start.y - center.y, start.x - center.x), center,
  };
  stage.setPointerCapture(event.pointerId);
  event.preventDefault();
});

stage.addEventListener('pointermove', (event) => {
  const drag = state.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = pointInStage(event);
  const transform = transformFor(drag.id);
  if (drag.mode === 'rotate') {
    const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
    transform.angle = Math.round((drag.startAngle + (angle - drag.pointerAngle) * 180 / Math.PI) * 10) / 10;
  } else {
    transform.x = drag.startX + point.x - drag.start.x;
    transform.y = drag.startY + point.y - drag.start.y;
  }
  updatePieceElement(drag.id);
  $('#game-status').textContent = drag.mode === 'rotate' ? '조각을 직접 회전하고 있습니다.' : '조각을 이동하고 있습니다.';
  event.preventDefault();
});

function endDrag(event) {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
  state.dragging = null;
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  renderStage();
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

// A Chromebook trackpad's two-finger scroll can nudge the selected piece.
stage.addEventListener('wheel', (event) => {
  if (state.selected === null) return;
  event.preventDefault();
  const transform = transformFor(state.selected);
  const factor = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 6 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 60 : 1;
  if (event.shiftKey) transform.angle += event.deltaY > 0 ? 1 : -1;
  else { transform.x -= event.deltaX * factor * 0.4; transform.y -= event.deltaY * factor * 0.4; }
  updatePieceElement(state.selected);
}, { passive: false });

function rotateSelected(degrees) {
  if (state.selected === null) return;
  transformFor(state.selected).angle += degrees;
  updatePieceElement(state.selected);
}
$('#rotate-left').addEventListener('click', () => rotateSelected(-15));
$('#rotate-left-fine').addEventListener('click', () => rotateSelected(-1));
$('#rotate-right-fine').addEventListener('click', () => rotateSelected(1));
$('#rotate-right').addEventListener('click', () => rotateSelected(15));
window.addEventListener('keydown', (event) => {
  if (screens.game.hidden || state.selected === null || document.querySelector('dialog[open]')) return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  const transform = transformFor(state.selected);
  const step = event.shiftKey ? 10 : 2;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[event.key]) {
    transform.x += moves[event.key][0]; transform.y += moves[event.key][1];
  } else if (event.key === '[') transform.angle -= 1;
  else if (event.key === ']') transform.angle += 1;
  else return;
  event.preventDefault();
  updatePieceElement(state.selected);
});

function askConfirmation(copy, button, action) {
  state.pendingAction = action;
  $('#confirm-copy').textContent = copy;
  $('#confirm-accept').textContent = button;
  $('#confirm-dialog').showModal();
}
$('#confirm-cancel').addEventListener('click', () => { state.pendingAction = null; $('#confirm-dialog').close(); });
$('#confirm-accept').addEventListener('click', () => {
  const action = state.pendingAction;
  state.pendingAction = null;
  $('#confirm-dialog').close();
  action?.();
});
$('#confirm-dialog').addEventListener('cancel', () => { state.pendingAction = null; });

function currentFileName(studentNumber) { return `${studentNumber}_${state.level + 1}.png`; }
function updateFileName() {
  const number = $('#student-number').value.trim();
  $('#submit-file-name').textContent = number ? `파일명: ${currentFileName(number)}` : `파일명: 학번_${state.level + 1}.png`;
}

function puzzlePngDataUrl() {
  const clone = stage.cloneNode(true);
  clone.querySelectorAll('.rotation-ui').forEach((control) => control.remove());
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', '1300');
  clone.setAttribute('height', '1440');
  clone.setAttribute('viewBox', STAGE_VIEWBOX);
  clone.removeAttribute('role');
  clone.removeAttribute('aria-label');
  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = 1300; canvas.height = 1440;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('퍼즐 이미지를 만들지 못했습니다.')); };
    image.src = url;
  });
}

function uploadViaForm(payload, studentNumber, requestId, target) {
  const endpoint = window.SUBMISSION_ENDPOINT;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint || '')) {
    throw new Error('드라이브 제출 연결이 준비되지 않았습니다.');
  }
  const form = document.createElement('form');
  form.method = 'POST'; form.action = endpoint; form.target = target; form.hidden = true;
  const fields = {
    payload, studentNumber, puzzleNumber: String(state.level + 1),
    requestId, origin: location.origin,
  };
  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.name = key; input.value = value;
    form.append(input);
  });
  document.body.append(form);
  form.submit();
  form.remove();
}

function finishUpload() {
  state.upload = null;
  $('#submit-confirm').disabled = false;
  $('#submit-confirm').textContent = '드라이브에 제출';
}

$('#submit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.upload) return;
  const studentNumber = $('#student-number').value.trim();
  if (!/^[0-9]{1,12}$/.test(studentNumber)) {
    $('#submit-error').textContent = '학번은 숫자로 입력해 주세요.';
    return;
  }
  $('#submit-error').textContent = '';
  const popupName = `puzzle-upload-${Date.now()}`;
  const popup = window.open('upload-wait.html', popupName, 'popup,width=560,height=640');
  if (!popup) {
    $('#submit-error').textContent = '제출 창이 차단됐습니다. 이 사이트의 팝업을 허용하고 다시 시도해 주세요.';
    return;
  }
  $('#submit-confirm').disabled = true;
  $('#submit-confirm').textContent = '제출 중…';
  try {
    const payload = await puzzlePngDataUrl();
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      if (state.upload?.requestId !== requestId) return;
      state.upload?.popup.close();
      finishUpload();
      $('#submit-error').textContent = '제출 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }, 45000);
    state.upload = { requestId, timeout, studentNumber, level: state.level, popup };
    uploadViaForm(payload, studentNumber, requestId, popupName);
  } catch (error) {
    if (state.upload) clearTimeout(state.upload.timeout);
    popup.close();
    finishUpload();
    $('#submit-error').textContent = error.message || '제출하지 못했습니다.';
  }
});

window.addEventListener('message', (event) => {
  if (!trustedUploadOrigin(event.origin) || !state.upload) return;
  const message = event.data;
  if (!message || message.type !== 'pythagoras-upload' || message.requestId !== state.upload.requestId) return;
  const { studentNumber, level, timeout, popup } = state.upload;
  clearTimeout(timeout);
  popup.close();
  finishUpload();
  if (!message.ok) {
    $('#submit-error').textContent = message.error || '드라이브에 업로드하지 못했습니다.';
    return;
  }
  $('#submit-dialog').close();
  $('#submitted-copy').textContent = `${studentNumber}_${level + 1}.png 파일을 제출했습니다.`;
  $('#submitted-dialog').showModal();
  $('#game-status').textContent = '퍼즐 이미지 제출이 완료됐습니다.';
});

$('#start-button').addEventListener('click', () => showScreen('select'));
$('#select-home').addEventListener('click', () => showScreen('start'));
document.querySelectorAll('.level-card').forEach((card) => card.addEventListener('click', () => beginLevel(Number(card.dataset.level))));
$('#game-levels').addEventListener('click', () => askConfirmation('퍼즐 목록으로 돌아가면 현재 조각 배치가 초기화됩니다.', '이동', () => showScreen('select')));
$('#game-reset').addEventListener('click', () => askConfirmation('현재 퍼즐의 조각과 시간을 처음부터 다시 시작합니다.', '다시 시작', () => beginLevel(state.level)));
$('#submit-button').addEventListener('click', () => {
  $('#student-number').value = '';
  $('#submit-error').textContent = '';
  updateFileName();
  $('#submit-dialog').showModal();
  $('#student-number').focus();
});
$('#student-number').addEventListener('input', updateFileName);
$('#submit-cancel').addEventListener('click', () => { if (!state.upload) $('#submit-dialog').close(); });
$('#submit-dialog').addEventListener('cancel', (event) => { if (state.upload) event.preventDefault(); });
$('#submitted-close').addEventListener('click', () => $('#submitted-dialog').close());

drawGallery();
updateTimer();
