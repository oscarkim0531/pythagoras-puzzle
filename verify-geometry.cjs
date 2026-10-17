// Run with: node verify-geometry.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'ebs-levels.js'), 'utf8');
const levels = vm.runInNewContext(`${source}\nEBS_LEVELS`);
const distance2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const dot = (a, b, c) => (a[0] - c[0]) * (b[0] - c[0]) + (a[1] - c[1]) * (b[1] - c[1]);
const near = (actual, expected, label, tolerance = 0.001) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} ≠ ${expected}`);
};

assert.equal(levels.length, 9);
for (const [index, level] of levels.entries()) {
  assert.equal(level.number, index + 2);
  const { O, L, R, a, b, c } = level.triangle;
  near(dot(L, R, O), 0, `퍼즐 ${level.number} 직각`);
  near(distance2(O, L), a * a, `퍼즐 ${level.number} 왼쪽 변`, 0.01);
  near(distance2(O, R), b * b, `퍼즐 ${level.number} 오른쪽 변`, 0.01);
  near(distance2(L, R), c * c, `퍼즐 ${level.number} 빗변`);
  near(a * a + b * b, c * c, `퍼즐 ${level.number} 넓이 합`, 0.01);
  near(level.target.size, c, `퍼즐 ${level.number} 아래 정사각형 변`);
  near(level.target.x, L[0], `퍼즐 ${level.number} 아래 정사각형 시작점 x`);
  near(level.target.y, L[1], `퍼즐 ${level.number} 아래 정사각형 시작점 y`);
  for (const [side, square] of level.sources.entries()) {
    const corners = square.corners;
    near(distance2(corners[0], corners[1]), side === 0 ? a * a : b * b,
      `퍼즐 ${level.number} 위 정사각형 변`, 0.01);
    near(distance2(corners[1], corners[2]), distance2(corners[0], corners[1]),
      `퍼즐 ${level.number} 위 정사각형 네 변`, 0.01);
    near(dot(corners[0], corners[2], corners[1]), 0,
      `퍼즐 ${level.number} 위 정사각형 직각`, 0.01);
  }
  assert.ok(level.pieces.length >= 5);
  for (const piece of level.pieces) {
    assert.ok(fs.existsSync(path.join(__dirname, piece.asset)), `이미지 누락: ${piece.asset}`);
    const [m0, m1, m2, m3] = piece.sourceMatrix;
    const determinant = m0 * m3 - m1 * m2;
    assert.ok(determinant > 0, `퍼즐 ${level.number} 조각 ${piece.id}의 경계가 뒤집혔습니다.`);
    const first = m0 * m0 + m1 * m1;
    const second = m2 * m2 + m3 * m3;
    const cross = m0 * m2 + m1 * m3;
    const gap = Math.sqrt((first - second) ** 2 + 4 * cross ** 2);
    const stretch = Math.sqrt((first + second + gap) / (first + second - gap));
    assert.ok(stretch < 1.06, `퍼즐 ${level.number} 조각 ${piece.id}이 과도하게 변형됐습니다.`);
  }
}
console.log('9개 퍼즐: 직각, 세 정사각형의 변, a²+b²=c², 조각 이미지 확인 완료');
