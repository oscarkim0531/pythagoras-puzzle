const SVG_NS = 'http://www.w3.org/2000/svg';

// Each rectangle is [column, row, width, height] in a source square.
// The areas are always 3² and 4²; together the pieces cover a 5² target.
const SMALL_CUT = [[0, 0, 3, 1], [0, 1, 3, 1], [0, 2, 2, 1], [2, 2, 1, 1]];
const LARGE_CUTS = [
  [[0, 0, 4, 2], [0, 2, 2, 2], [2, 2, 2, 2]],
  [[0, 0, 2, 4], [2, 0, 2, 2], [2, 2, 2, 2]],
  [[0, 0, 4, 1], [0, 1, 2, 3], [2, 1, 2, 3]],
  [[0, 0, 3, 3], [3, 0, 1, 3], [0, 3, 4, 1]],
  [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 4, 2]],
  [[0, 0, 4, 2], [0, 2, 1, 2], [1, 2, 3, 2]],
  [[0, 0, 1, 4], [1, 0, 3, 1], [1, 1, 3, 3]],
  [[0, 0, 2, 3], [2, 0, 2, 3], [0, 3, 4, 1]],
  [[0, 0, 4, 1], [0, 1, 1, 3], [1, 1, 3, 1], [1, 2, 3, 2]],
];

const PALETTES = [
  ['#f4c76d', '#e98b61', '#78b7e8', '#a0d885', '#b7a0d9', '#eb6e5c', '#9ad0ce', '#e7ad60'],
  ['#e8a660', '#f4d16f', '#72b6e8', '#a9d87b', '#c7a2d6', '#ed745b', '#7ec0c7', '#f2bca3'],
  ['#f2d465', '#89c8ec', '#bca2d9', '#ec9475', '#a3d977', '#e4ad68', '#71b8bf', '#e76f68'],
  ['#ee9c64', '#8ccf80', '#f4d36e', '#eb7157', '#83b7ea', '#c4a2d5', '#d9bb72', '#89c7bb'],
  ['#f6ce68', '#8bc0ec', '#eaaa6b', '#b3dc80', '#e8715a', '#d4a8de', '#83c9ce', '#eec18d'],
  ['#a1d87c', '#78b9e6', '#f2d46d', '#ec8864', '#c6a4db', '#9bcbd0', '#e3ad74', '#e87861'],
  ['#e6a665', '#f2d36f', '#86c9e8', '#9dd984', '#eb785b', '#bea8dd', '#7dbebf', '#e3ba83'],
  ['#8fcf83', '#82b8e8', '#f2d16c', '#e98965', '#bea6db', '#eb715d', '#9fd0cb', '#e3b47b'],
  ['#85bbed', '#a1d77f', '#efa46d', '#f4d16b', '#e8775f', '#c5a7dc', '#7fc9c7', '#eeb783'],
];

const $ = (selector) => document.querySelector(selector);
const screens = { start: $('#start-screen'), select: $('#select-screen'), game: $('#game-screen') };
const stage = $('#puzzle-stage');
const nameDialog = $('#name-dialog');
const confirmDialog = $('#confirm-dialog');
const resultDialog = $('#result-dialog');
const status = $('#game-status');

const state = {
  level: 0,
  name: '',
  pieces: [],
  placements: new Map(),
  dragging: null,
  seconds: 0,
  clock: null,
  paused: false,
  pendingConfirmation: null,
};

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function rectCells([x, y, width, height]) {
  const cells = [];
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) cells.push([column, row]);
  }
  return cells;
}

function turnCells(cells, size, turns) {
  return cells.map(([x, y]) => {
    let rotatedX = x;
    let rotatedY = y;
    for (let turn = 0; turn < turns; turn += 1) [rotatedX, rotatedY] = [size - 1 - rotatedY, rotatedX];
    return [rotatedX, rotatedY];
  });
}

function makePieces(level) {
  const palette = PALETTES[level];
  const smallTurns = level % 4;
  const small = SMALL_CUT.map((cut, index) => ({
    id: `s${index}`,
    board: 'small',
    cells: turnCells(rectCells(cut), 3, smallTurns),
    color: palette[index],
  }));
  const large = LARGE_CUTS[level].map((cut, index) => ({
    id: `l${index}`,
    board: 'large',
    cells: rectCells(cut),
    color: palette[index + 4],
  }));
  return [...small, ...large];
}

function bounds(cells) {
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, width: Math.max(...xs) - minX + 1, height: Math.max(...ys) - minY + 1 };
}

function pathForCells(cells, point) {
  // An edge is omitted when its neighbouring cell belongs to the same piece.
  const occupied = new Set(cells.map(([x, y]) => `${x},${y}`));
  const edges = [];
  for (const [x, y] of cells) {
    if (!occupied.has(`${x},${y - 1}`)) edges.push([[x, y], [x + 1, y]]);
    if (!occupied.has(`${x + 1},${y}`)) edges.push([[x + 1, y], [x + 1, y + 1]]);
    if (!occupied.has(`${x},${y + 1}`)) edges.push([[x + 1, y + 1], [x, y + 1]]);
    if (!occupied.has(`${x - 1},${y}`)) edges.push([[x, y + 1], [x, y]]);
  }
  const byStart = new Map(edges.map(([a, b]) => [a.join(','), b]));
  const paths = [];
  while (byStart.size) {
    const first = byStart.keys().next().value;
    const [startX, startY] = first.split(',').map(Number);
    const start = [startX, startY];
    const points = [start];
    let current = first;
    do {
      const next = byStart.get(current);
      byStart.delete(current);
      points.push(next);
      current = next.join(',');
    } while (current !== first && byStart.has(current));
    paths.push(`M ${points.map(([x, y]) => point(x, y).join(' ')).join(' L ')} Z`);
  }
  return paths.join(' ');
}

function geometry() {
  if (window.matchMedia('(max-width: 700px)').matches) {
    return {
      viewBox: '0 0 500 850',
      small: { origin: [35, 100], u: [45, 0], v: [0, 45], size: 3 },
      large: { origin: [284, 75], u: [45, 0], v: [0, 45], size: 4 },
      target: { x: 137.5, y: 440, cell: 45 },
      mobile: true,
    };
  }
  return {
    viewBox: '0 0 1000 700',
    small: { origin: [375, 375], u: [30, -40], v: [-40, -30], size: 3 },
    large: { origin: [465, 255], u: [40, 30], v: [30, -40], size: 4 },
    target: { x: 375, y: 375, cell: 50 },
    mobile: false,
  };
}

function boardPoint(board, x, y) {
  return [
    board.origin[0] + board.u[0] * x + board.v[0] * y,
    board.origin[1] + board.u[1] * x + board.v[1] * y,
  ];
}

function drawSourceBoard(svg, board, label) {
  const square = svgElement('path', {
    d: `M ${boardPoint(board, 0, 0).join(' ')} L ${boardPoint(board, board.size, 0).join(' ')} L ${boardPoint(board, board.size, board.size).join(' ')} L ${boardPoint(board, 0, board.size).join(' ')} Z`,
    fill: '#f4f0e9', stroke: '#b7b3ad', 'stroke-width': 2,
  });
  svg.append(square);
  const corner = boardPoint(board, board.size / 2, board.size / 2);
  const text = svgElement('text', {
    x: corner[0], y: corner[1] + 7, 'text-anchor': 'middle',
    fill: '#a7a49f', 'font-size': 24, 'font-weight': 700,
  });
  text.textContent = label;
  svg.append(text);
}

function drawTargetGrid(svg, target) {
  const board = svgElement('g', { class: 'target-board' });
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      board.append(svgElement('rect', {
        x: target.x + x * target.cell,
        y: target.y + y * target.cell,
        width: target.cell,
        height: target.cell,
        class: 'target-cell',
      }));
    }
  }
  svg.append(board);
}

function drawDiagram(svg, layout) {
  if (layout.mobile) {
    const text = svgElement('text', {
      x: 250, y: 370, 'text-anchor': 'middle',
      fill: '#5268b3', 'font-size': 27, 'font-weight': 700,
    });
    text.textContent = 'a² + b² = c²';
    svg.append(text);
    return;
  }
  svg.append(svgElement('path', {
    d: 'M 375 375 L 465 255 L 625 375 Z',
    fill: '#fffcf6', stroke: '#aaa39a', 'stroke-width': 2,
  }));
  svg.append(svgElement('path', {
    d: 'M 459 263 L 467 269 L 473 261',
    fill: 'none', stroke: '#d17e61', 'stroke-width': 3,
  }));
}

function sourcePath(piece, layout) {
  const board = layout[piece.board];
  return pathForCells(piece.cells, (x, y) => boardPoint(board, x, y));
}

function targetPath(piece, placement, target) {
  const cells = rotatedShape(piece.cells, placement.turns).map(([x, y]) => [x + placement.x, y + placement.y]);
  return pathForCells(cells, (x, y) => [target.x + x * target.cell, target.y + y * target.cell]);
}

function renderStage() {
  if (screens.game.hidden) return;
  const layout = geometry();
  stage.setAttribute('viewBox', layout.viewBox);
  stage.replaceChildren();
  drawDiagram(stage, layout);
  drawSourceBoard(stage, layout.small, 'a²');
  drawSourceBoard(stage, layout.large, 'b²');
  drawTargetGrid(stage, layout.target);

  for (const piece of state.pieces) {
    if (state.placements.has(piece.id)) continue;
    const group = svgElement('g', { class: 'source-piece', 'data-piece': piece.id });
    group.append(svgElement('path', { d: sourcePath(piece, layout), fill: piece.color }));
    stage.append(group);
  }

  for (const piece of state.pieces) {
    const placement = state.placements.get(piece.id);
    if (!placement) continue;
    const group = svgElement('g', { class: 'placed-piece', 'data-placed': piece.id });
    group.append(svgElement('path', { d: targetPath(piece, placement, layout.target), fill: piece.color }));
    stage.append(group);
  }

  const preview = svgElement('g', { id: 'drop-preview', 'pointer-events': 'none' });
  stage.append(preview);
}

function rotatedShape(cells, turns) {
  let result = cells.map(([x, y]) => [x, y]);
  for (let turn = 0; turn < turns; turn += 1) result = result.map(([x, y]) => [-y, x]);
  const box = bounds(result);
  return result.map(([x, y]) => [x - box.minX, y - box.minY]);
}

function pointInStage(event) {
  const point = stage.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(stage.getScreenCTM().inverse());
  return { x: transformed.x, y: transformed.y };
}

function occupiedCells() {
  const used = new Set();
  for (const piece of state.pieces) {
    const placed = state.placements.get(piece.id);
    if (!placed) continue;
    for (const [x, y] of rotatedShape(piece.cells, placed.turns)) used.add(`${x + placed.x},${y + placed.y}`);
  }
  return used;
}

function findPlacement(piece, point) {
  const target = geometry().target;
  const used = occupiedCells();
  let closest = null;
  for (let turns = 0; turns < 2; turns += 1) {
    const cells = rotatedShape(piece.cells, turns);
    const box = bounds(cells);
    for (let y = 0; y <= 5 - box.height; y += 1) {
      for (let x = 0; x <= 5 - box.width; x += 1) {
        if (cells.some(([cellX, cellY]) => used.has(`${x + cellX},${y + cellY}`))) continue;
        const centerX = target.x + (x + box.width / 2) * target.cell;
        const centerY = target.y + (y + box.height / 2) * target.cell;
        const distance = Math.hypot(centerX - point.x, centerY - point.y);
        if (!closest || distance < closest.distance) closest = { x, y, turns, distance };
      }
    }
  }
  return closest && closest.distance <= target.cell * 1.55 ? closest : null;
}

function drawPreview(piece, placement) {
  const preview = $('#drop-preview');
  if (!preview) return;
  preview.replaceChildren();
  if (!placement) return;
  const target = geometry().target;
  for (const [x, y] of rotatedShape(piece.cells, placement.turns)) {
    preview.append(svgElement('rect', {
      x: target.x + (placement.x + x) * target.cell,
      y: target.y + (placement.y + y) * target.cell,
      width: target.cell,
      height: target.cell,
      class: 'preview-cell',
    }));
  }
}

function showScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) element.hidden = screenName !== name;
  if (name !== 'game') stopClock();
  if (name === 'game') renderStage();
}

function updateTimer() {
  const minutes = String(Math.floor(state.seconds / 60)).padStart(2, '0');
  const seconds = String(state.seconds % 60).padStart(2, '0');
  $('#timer').textContent = `${minutes}:${seconds}`;
}

function stopClock() {
  if (state.clock) clearInterval(state.clock);
  state.clock = null;
}

function startClock() {
  stopClock();
  state.clock = setInterval(() => {
    if (state.paused || screens.game.hidden) return;
    state.seconds += 1;
    updateTimer();
  }, 1000);
}

function beginLevel(level) {
  state.level = level;
  state.pieces = makePieces(level);
  state.placements.clear();
  state.dragging = null;
  state.seconds = 0;
  state.paused = false;
  updateTimer();
  $('#level-number').textContent = `퍼즐 ${String(level + 1).padStart(2, '0')}`;
  showScreen('game');
  startClock();
  status.textContent = '퍼즐을 시작했습니다. 색 조각을 아래 정사각형으로 옮겨 주세요.';
}

function finishIfComplete() {
  if (state.placements.size !== state.pieces.length) return;
  if (occupiedCells().size !== 25) return;
  stopClock();
  state.paused = true;
  $('#result-copy').textContent = `${state.name}님, ${$('#timer').textContent} 만에 정사각형을 완성했어요.`;
  resultDialog.showModal();
  status.textContent = '퍼즐을 완성했습니다.';
}

function askConfirmation(copy, buttonText, action) {
  state.paused = true;
  state.pendingConfirmation = action;
  $('#confirm-copy').textContent = copy;
  $('#confirm-accept').textContent = buttonText;
  confirmDialog.showModal();
}

function closeConfirmation(accept) {
  const action = state.pendingConfirmation;
  state.pendingConfirmation = null;
  confirmDialog.close();
  state.paused = false;
  if (accept && action) action();
}

function drawGallery() {
  document.querySelectorAll('.level-card').forEach((card) => {
    const level = Number(card.dataset.level);
    const svg = svgElement('svg', { viewBox: '0 0 270 135', 'aria-hidden': 'true' });
    const small = { origin: [38, 33], u: [19, 0], v: [0, 19], size: 3 };
    const large = { origin: [145, 14], u: [19, 0], v: [0, 19], size: 4 };
    for (const piece of makePieces(level)) {
      const board = piece.board === 'small' ? small : large;
      svg.append(svgElement('path', {
        d: pathForCells(piece.cells, (x, y) => boardPoint(board, x, y)),
        fill: piece.color, stroke: '#fffdf8', 'stroke-width': 2,
      }));
    }
    svg.append(svgElement('path', { d: 'M 111 65 L 132 65 M 123 57 L 132 65 L 123 73', fill: 'none', stroke: '#aeb7c6', 'stroke-width': 2 }));
    card.querySelector('.level-art').append(svg);
  });
}

stage.addEventListener('pointerdown', (event) => {
  if (state.paused) return;
  const placed = event.target.closest('[data-placed]');
  if (placed) {
    const piece = state.pieces.find((item) => item.id === placed.dataset.placed);
    state.placements.delete(piece.id);
    renderStage();
    status.textContent = '조각을 원래 위치로 돌렸습니다.';
    return;
  }
  const source = event.target.closest('[data-piece]');
  if (!source) return;
  const piece = state.pieces.find((item) => item.id === source.dataset.piece);
  const point = pointInStage(event);
  state.dragging = { piece, element: source, start: point, moved: false, pointerId: event.pointerId };
  source.classList.add('is-dragging');
  stage.setPointerCapture(event.pointerId);
  event.preventDefault();
});

stage.addEventListener('pointermove', (event) => {
  const drag = state.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = pointInStage(event);
  const dx = point.x - drag.start.x;
  const dy = point.y - drag.start.y;
  if (Math.hypot(dx, dy) > 5) drag.moved = true;
  drag.element.setAttribute('transform', `translate(${dx} ${dy})`);
  drawPreview(drag.piece, findPlacement(drag.piece, point));
});

function endDrag(event) {
  const drag = state.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.dragging = null;
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  const placement = drag.moved && event.type !== 'pointercancel' ? findPlacement(drag.piece, pointInStage(event)) : null;
  if (placement) {
    state.placements.set(drag.piece.id, { x: placement.x, y: placement.y, turns: placement.turns });
    status.textContent = `조각을 놓았습니다. ${state.placements.size}개 배치했습니다.`;
  } else if (drag.moved) {
    status.textContent = '빈 칸에 맞게 놓아 주세요. 조각이 원래 자리로 돌아갑니다.';
  }
  renderStage();
  if (placement) finishIfComplete();
}

stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

$('#start-button').addEventListener('click', () => showScreen('select'));
$('#select-home').addEventListener('click', () => showScreen('start'));
document.querySelectorAll('.level-card').forEach((card) => card.addEventListener('click', () => {
  state.level = Number(card.dataset.level);
  $('#player-name').value = state.name;
  nameDialog.showModal();
  $('#player-name').focus();
}));

$('#name-cancel').addEventListener('click', () => nameDialog.close());
$('#name-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#player-name');
  const name = input.value.trim();
  if (!/^[\p{Script=Hangul}A-Za-z0-9]{1,10}$/u.test(name)) {
    input.setCustomValidity('한글, 영어, 숫자로 10자 이내로 입력해 주세요.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  state.name = name;
  nameDialog.close();
  beginLevel(state.level);
});
$('#player-name').addEventListener('input', (event) => event.target.setCustomValidity(''));

$('#game-home').addEventListener('click', () => askConfirmation('첫 화면으로 이동하면 현재 퍼즐 진행 상황이 초기화됩니다.', '이동', () => showScreen('start')));
$('#game-levels').addEventListener('click', () => askConfirmation('퍼즐 목록으로 돌아가면 현재 퍼즐 진행 상황이 초기화됩니다.', '이동', () => showScreen('select')));
$('#game-reset').addEventListener('click', () => askConfirmation('현재 퍼즐의 조각과 시간을 처음부터 다시 시작합니다.', '다시 시작', () => beginLevel(state.level)));
$('#confirm-cancel').addEventListener('click', () => closeConfirmation(false));
$('#confirm-accept').addEventListener('click', () => closeConfirmation(true));
confirmDialog.addEventListener('cancel', () => { state.pendingConfirmation = null; state.paused = false; });

$('#result-levels').addEventListener('click', () => { resultDialog.close(); showScreen('select'); });
$('#result-replay').addEventListener('click', () => { resultDialog.close(); beginLevel(state.level); });
resultDialog.addEventListener('cancel', (event) => event.preventDefault());

let wasMobile = window.matchMedia('(max-width: 700px)').matches;
window.addEventListener('resize', () => {
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  if (isMobile !== wasMobile) {
    wasMobile = isMobile;
    renderStage();
  }
});

drawGallery();
updateTimer();
