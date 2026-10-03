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
const screens = { start: $('#start-screen'), teacherLogin: $('#teacher-login-screen'), teacherCode: $('#teacher-code-screen'), teacherDashboard: $('#teacher-dashboard-screen'), studentCode: $('#student-code-screen'), studentName: $('#student-name-screen'), select: $('#select-screen'), game: $('#game-screen') };
const stage = $('#puzzle-stage');
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
  if (level >= 9) return EBS_LEVELS[level - 9].pieces.map((piece) => ({
    id: `ebs-${piece.id}`, tag: piece.tag, polygon: piece.polygon, color: piece.color, exact: true,
  }));
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

function pathForPolygon(vertices, point) {
  return `M ${vertices.map(([x, y]) => point(x, y).join(' ')).join(' L ')} Z`;
}

function polygonCenter(vertices, point) {
  const positions = vertices.map(([x, y]) => point(x, y));
  let twiceArea = 0;
  let centerX = 0;
  let centerY = 0;
  for (let index = 0; index < positions.length; index += 1) {
    const [x1, y1] = positions[index];
    const [x2, y2] = positions[(index + 1) % positions.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    centerX += (x1 + x2) * cross;
    centerY += (y1 + y2) * cross;
  }
  return { x: centerX / (3 * twiceArea), y: centerY / (3 * twiceArea) };
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

function exactData() { return EBS_LEVELS[state.level - 9]; }

function exactSourcePath(piece) {
  // Screenshot segmentation finds the colour inside each original brown edge.
  // Restore that edge width around the same polygon without changing its corners.
  const center = polygonCenter(piece.polygon, (x, y) => [x, y]);
  return pathForPolygon(piece.polygon, (x, y) => [
    center.x + (x - center.x) * 1.09,
    center.y + (y - center.y) * 1.09,
  ]);
}

function exactTargetPath(piece, placement) {
  const checker = exactData().checkers[placement.checker];
  return pathForPolygon(checker.polygon, (x, y) => [x, y]);
}

function renderExactStage() {
  const data = exactData();
  stage.setAttribute('viewBox', '-325 -280 650 720');
  stage.replaceChildren();
  const [tx, ty] = data.target.center;
  const [tw, th] = data.target.size;
  const defs = svgElement('defs');
  const clip = svgElement('clipPath', { id: 'exact-target-clip' });
  clip.append(svgElement('rect', { x: tx - tw / 2, y: ty - th / 2, width: tw, height: th }));
  defs.append(clip);
  stage.append(defs);
  const grid = svgElement('g', { class: 'exact-grid' });
  for (let x = -325; x <= 325; x += 60) grid.append(svgElement('path', { d: `M ${x} -280 V 440` }));
  for (let y = -280; y <= 440; y += 60) grid.append(svgElement('path', { d: `M -325 ${y} H 325` }));
  stage.append(grid);
  stage.append(svgElement('rect', { x: tx - tw / 2, y: ty - th / 2, width: tw, height: th,
    class: 'exact-target' }));
  for (const piece of state.pieces) {
    if (state.placements.has(piece.id)) continue;
    const group = svgElement('g', { class: 'source-piece exact-piece', 'data-piece': piece.id });
    group.append(svgElement('path', { d: exactSourcePath(piece), fill: piece.color }));
    stage.append(group);
  }
  if (state.placements.size === 0) {
    const [cx, cy] = data.corner;
    stage.append(svgElement('path', { d: `M ${cx - 4} ${cy + 2} L ${cx - 1} ${cy + 6} L ${cx + 3} ${cy + 3}`,
      class: 'exact-right-angle' }));
  }
  for (const piece of state.pieces) {
    const placement = state.placements.get(piece.id);
    if (!placement) continue;
    const group = svgElement('g', { class: 'placed-piece exact-piece', 'data-placed': piece.id,
      'clip-path': 'url(#exact-target-clip)' });
    group.append(svgElement('path', { d: exactTargetPath(piece, placement), fill: piece.color }));
    stage.append(group);
  }
  stage.append(svgElement('g', { id: 'drop-preview', 'pointer-events': 'none',
    'clip-path': 'url(#exact-target-clip)' }));
}

function findExactPlacement(piece, point, drag) {
  const data = exactData();
  const center = drag ? { x: drag.center.x + point.x - drag.start.x,
    y: drag.center.y + point.y - drag.start.y } : point;
  const occupied = new Set([...state.placements.values()].map((value) => value.checker));
  let closest = null;
  data.checkers.forEach((checker, index) => {
    if (occupied.has(index) || !checker.allows.some((rule) => rule.piece === piece.tag)) return;
    const distance = Math.hypot(center.x - checker.center[0], center.y - checker.center[1]);
    if (!closest || distance < closest.distance) closest = { checker: index, distance };
  });
  const [tx, ty] = data.target.center;
  const [tw, th] = data.target.size;
  const squareDistance = Math.hypot(Math.max(Math.abs(center.x - tx) - tw / 2, 0),
    Math.max(Math.abs(center.y - ty) - th / 2, 0));
  return closest && (closest.distance < 105 || squareDistance < 30) ? closest : null;
}

function renderStage() {
  if (screens.game.hidden) return;
  if (state.level >= 9) { renderExactStage(); return; }
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
    group.append(svgElement('path', {
      d: sourcePath(piece, layout), fill: piece.color,
      ...(piece.seamless ? { style: `stroke: ${piece.color}` } : {}),
    }));
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
    if (piece.cells) {
      for (const [x, y] of rotatedShape(piece.cells, placed.turns)) used.add(`${x + placed.x},${y + placed.y}`);
    }
  }
  return used;
}

function findPlacement(piece, point, drag = null) {
  if (piece.exact) return findExactPlacement(piece, point, drag);
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
  if (piece.exact) {
    preview.append(svgElement('path', { d: exactTargetPath(piece, placement), fill: piece.color, class: 'preview-polygon' }));
    return;
  }
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
  $('#level-number').textContent = level >= 9
    ? `다각형 퍼즐 ${String(level - 8).padStart(2, '0')}`
    : `기존 퍼즐 ${String(level + 1).padStart(2, '0')}`;
  showScreen('game');
  startClock();
  status.textContent = '퍼즐을 시작했습니다. 색 조각을 아래 정사각형으로 옮겨 주세요.';
}

function finishIfComplete() {
  if (state.placements.size !== state.pieces.length) return;
  if (state.level < 9 && occupiedCells().size !== 25) return;
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
    if (level >= 9) {
      const data = EBS_LEVELS[level - 9];
      const svg = svgElement('svg', { viewBox: '-290 -310 580 380', 'aria-hidden': 'true' });
      for (const piece of data.pieces) svg.append(svgElement('path', {
        d: exactSourcePath(piece), fill: piece.color,
        stroke: '#8f612c', 'stroke-width': 3, 'stroke-linejoin': 'round',
      }));
      card.querySelector('.level-art').append(svg);
      return;
    }
    const svg = svgElement('svg', { viewBox: '0 0 270 135', 'aria-hidden': 'true' });
    const small = { origin: [38, 33], u: [19, 0], v: [0, 19], size: 3 };
    const large = { origin: [145, 14], u: [19, 0], v: [0, 19], size: 4 };
    for (const piece of makePieces(level)) {
      const board = piece.board === 'small' ? small : large;
      svg.append(svgElement('path', {
        d: piece.polygon
          ? pathForPolygon(piece.polygon, (x, y) => boardPoint(board, x, y))
          : pathForCells(piece.cells, (x, y) => boardPoint(board, x, y)),
        fill: piece.color, stroke: piece.seamless ? piece.color : '#fffdf8', 'stroke-width': 2,
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
  const layout = geometry();
  const center = piece.exact ? polygonCenter(piece.polygon, (x, y) => [x, y]) : piece.polygon
    ? polygonCenter(piece.polygon, (x, y) => boardPoint(layout[piece.board], x, y))
    : null;
  state.dragging = { piece, element: source, start: point, center, moved: false, pointerId: event.pointerId };
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
  const placement = findPlacement(drag.piece, point, drag);
  drag.element.classList.toggle('near-target', Boolean(placement && drag.piece.polygon));
  drawPreview(drag.piece, placement);
});

function endDrag(event) {
  const drag = state.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.dragging = null;
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  const placement = drag.moved && event.type !== 'pointercancel' ? findPlacement(drag.piece, pointInStage(event), drag) : null;
  if (placement) {
    state.placements.set(drag.piece.id, placement);
    status.textContent = `조각을 놓았습니다. ${state.placements.size}개 배치했습니다.`;
  } else if (drag.moved) {
    status.textContent = '빈 칸에 맞게 놓아 주세요. 조각이 원래 자리로 돌아갑니다.';
  }
  renderStage();
  if (placement) finishIfComplete();
}

stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

document.querySelectorAll('.level-card').forEach((card) => card.addEventListener('click', () => {
  if (!window.Classroom?.isStudent()) return;
  beginLevel(Number(card.dataset.level));
}));
$('#game-home').addEventListener('click', () => askConfirmation('퍼즐 목록으로 돌아가면 현재 퍼즐 진행 상황이 초기화됩니다.', '이동', () => showScreen('select')));
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
window.PuzzleGame = { showScreen, setStudentName(name) { state.name = name; }, currentScreen() { return Object.entries(screens).find(([, element]) => !element.hidden)?.[0]; } };
