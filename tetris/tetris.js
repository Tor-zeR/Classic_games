/* ============================================================
   TETRIS — Neon Arcade
   ============================================================ */
'use strict';

// ── Constants ─────────────────────────────────────────────────
const COLS        = 10;
const ROWS        = 20;
const LINES_LEVEL = 10;   // lines to advance a level

// Drop interval per level (ms). Index = level-1, capped at index 9.
const DROP_SPEEDS = [800, 700, 600, 500, 400, 300, 220, 150, 100, 80];

// Score for 1/2/3/4 lines
const LINE_SCORES = [0, 100, 300, 500, 800];

// ── Piece definitions ─────────────────────────────────────────
// Each piece uses a canonical matrix; rotations are computed.
const PIECES = [
  // I  (4×4 to keep rotation stable)
  { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00ffff', glow: '#00ffff' },
  // O
  { shape: [[1,1],[1,1]],                              color: '#ffff00', glow: '#ffff00' },
  // T
  { shape: [[0,1,0],[1,1,1],[0,0,0]],                  color: '#cc00ff', glow: '#cc00ff' },
  // S
  { shape: [[0,1,1],[1,1,0],[0,0,0]],                  color: '#00ff66', glow: '#00ff66' },
  // Z
  { shape: [[1,1,0],[0,1,1],[0,0,0]],                  color: '#ff0044', glow: '#ff0044' },
  // J
  { shape: [[1,0,0],[1,1,1],[0,0,0]],                  color: '#0088ff', glow: '#0088ff' },
  // L
  { shape: [[0,0,1],[1,1,1],[0,0,0]],                  color: '#ff8800', glow: '#ff8800' },
];

// ── 7-Bag randomizer ──────────────────────────────────────────
let bag = [];
function pickNext() {
  if (bag.length === 0) {
    bag = PIECES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

// ── Rotation helpers ──────────────────────────────────────────
function rotateCW(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const res  = Array.from({ length: cols }, () => []);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      res[c][rows - 1 - r] = matrix[r][c];
  return res;
}

function rotateCCW(matrix) {
  // 3× CW == 1× CCW
  return rotateCW(rotateCW(rotateCW(matrix)));
}

// ── Canvas & context ──────────────────────────────────────────
const canvas     = document.getElementById('game-canvas');
const ctx        = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx    = nextCanvas.getContext('2d');

let BLOCK = 30; // pixels per cell, computed in resize()

function calcBlock() {
  const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth <= 640;
  if (isPortrait) {
    // Width-first: canvas fills 95% of viewport width
    const byWidth  = Math.floor(window.innerWidth * 0.95 / COLS);
    // Height constraint: reserve ~180px for topbar + stats strip + next panel + padding
    const byHeight = Math.floor((window.innerHeight - 180) / ROWS);
    BLOCK = Math.min(byWidth, byHeight);
    BLOCK = Math.max(20, Math.min(52, BLOCK));
  } else {
    const availH = window.innerHeight - 160; // leave room for bars + controls
    const availW = window.innerWidth  * (window.innerWidth < 700 ? 0.54 : 0.42);
    BLOCK = Math.floor(Math.min(availH / ROWS, availW / COLS));
    BLOCK = Math.max(18, Math.min(36, BLOCK));
  }
}

function resizeCanvas() {
  calcBlock();
  canvas.width     = COLS * BLOCK;
  canvas.height    = ROWS * BLOCK;
  nextCanvas.width  = 4 * BLOCK;
  nextCanvas.height = 4 * BLOCK;
}

// ── Game state ────────────────────────────────────────────────
let board      = [];   // ROWS × COLS, null | colorString
let current    = null; // { shape, color, glow, x, y }
let nextPiece  = null;
let score      = 0;
let bestScore  = parseInt(localStorage.getItem('tetris_hi') || '0', 10);
let newBest    = false;
let lines      = 0;
let level      = 1;
let state      = 'start'; // 'start' | 'playing' | 'paused' | 'clearing' | 'gameover'

let dropTimer  = 0;
let lastTs     = 0;
let rafId      = null;

// Line-clear animation
let clearAnim  = { rows: [], frame: 0, maxFrames: 18 };

// ── Board helpers ─────────────────────────────────────────────
function makeBoard() {
  board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

function collides(shape, px, py) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nr = py + r;
      const nc = px + c;
      if (nc < 0 || nc >= COLS) return true;
      if (nr >= ROWS)            return true;
      if (nr >= 0 && board[nr][nc]) return true;
    }
  }
  return false;
}

function lockPiece() {
  const { shape, color, x, y } = current;
  let lockedAboveBoard = false;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nr = y + r;
      const nc = x + c;
      if (nr < 0) { lockedAboveBoard = true; continue; }
      board[nr][nc] = color;
    }
  }
  return lockedAboveBoard;
}

function findFullRows() {
  const full = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(c => c !== null)) full.push(r);
  }
  return full;
}

function removeRows(rows) {
  // Delete full rows, prepend empty ones
  const rowSet = new Set(rows);
  const kept   = board.filter((_, i) => !rowSet.has(i));
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
  board = kept;
}

// ── Piece factory ─────────────────────────────────────────────
function spawnPiece(idx) {
  const p = PIECES[idx];
  return {
    shape: p.shape.map(r => [...r]),
    color: p.color,
    glow:  p.glow,
    x:     Math.floor(COLS / 2) - Math.floor(p.shape[0].length / 2),
    y:     -2,
  };
}

function spawnNext() {
  current   = nextPiece || spawnPiece(pickNext());
  nextPiece = spawnPiece(pickNext());
  // Position so the bottom-most row with cells lands at board row 0
  let lastCellRow = 0;
  for (let r = 0; r < current.shape.length; r++)
    if (current.shape[r].some(v => v)) lastCellRow = r;
  current.y = -lastCellRow;
}

// ── Ghost piece ───────────────────────────────────────────────
function ghostY() {
  let gy = current.y;
  while (!collides(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

// ── Wall-kick rotation ────────────────────────────────────────
const KICKS_NORMAL = [0, -1, 1, -2, 2];
const KICKS_I      = [0, -1, 1, -2, 2, 2, -2]; // I needs bigger kicks

function tryRotate(dir) {
  const newShape = dir === 'cw' ? rotateCW(current.shape) : rotateCCW(current.shape);
  // Determine if piece is I (4 wide)
  const isI     = newShape[0].length === 4 || newShape.length === 4;
  const kicks   = isI ? KICKS_I : KICKS_NORMAL;

  for (const kick of kicks) {
    if (!collides(newShape, current.x + kick, current.y)) {
      current.shape = newShape;
      current.x    += kick;
      return true;
    }
  }
  return false;
}

// ── Scoring ───────────────────────────────────────────────────
function addScore(cleared) {
  score += LINE_SCORES[cleared] * level;
  lines += cleared;
  const newLevel = Math.floor(lines / LINES_LEVEL) + 1;
  if (newLevel > level) {
    level = newLevel;
    NeonArcade.SFX.levelUp();
  }
  if (score > bestScore) { bestScore = score; newBest = true; localStorage.setItem('tetris_hi', String(bestScore)); }
  updateHUD();
}

// ── Movement actions ──────────────────────────────────────────
function moveLeft() {
  if (state !== 'playing') return;
  if (!collides(current.shape, current.x - 1, current.y)) {
    current.x--;
    NeonArcade.SFX.move();
  }
}

function moveRight() {
  if (state !== 'playing') return;
  if (!collides(current.shape, current.x + 1, current.y)) {
    current.x++;
    NeonArcade.SFX.move();
  }
}

function softDrop() {
  if (state !== 'playing') return;
  if (!collides(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    dropTimer = 0;
    NeonArcade.SFX.softDrop();
  }
}

function hardDrop() {
  if (state !== 'playing') return;
  const dy = ghostY() - current.y;
  current.y += dy;
  score += dy * 2;
  NeonArcade.SFX.drop();
  step(true); // force lock
}

function rotateAction(dir) {
  if (state !== 'playing') return;
  if (tryRotate(dir)) NeonArcade.SFX.rotate();
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    NeonArcade.stopMusic();
    showOverlay('overlay-pause');
  } else if (state === 'paused') {
    state = 'playing';
    NeonArcade.startMusic();
    showOverlay(null);
    lastTs = performance.now();
  }
}

// ── Game step (gravity) ───────────────────────────────────────
function step(forceLock = false) {
  if (!forceLock && !collides(current.shape, current.x, current.y + 1)) {
    current.y++;
    return;
  }
  // Lock
  const aboveBoard = lockPiece();
  if (aboveBoard) {
    triggerGameOver();
    return;
  }
  const full = findFullRows();
  if (full.length > 0) {
    NeonArcade.SFX.lineClear(full.length);
    // Flash animation
    state          = 'clearing';
    clearAnim.rows = full;
    clearAnim.frame = 0;
  } else {
    NeonArcade.SFX.land();
    spawnNext();
    if (collides(current.shape, current.x, current.y)) {
      triggerGameOver();
    }
  }
}

// ── Game over ─────────────────────────────────────────────────
function triggerGameOver() {
  state = 'gameover';
  NeonArcade.stopMusic();
  NeonArcade.SFX.gameOver();

  document.getElementById('final-score').textContent = 'SCORE: ' + score;
  document.getElementById('new-best-msg').classList.toggle('hidden', !newBest);
  showOverlay('overlay-gameover');
  updateHUD();
}

// ── Start / Restart ───────────────────────────────────────────
function startGame() {
  makeBoard();
  bag        = [];
  score      = 0;
  newBest    = false;
  lines      = 0;
  level      = 1;
  dropTimer  = 0;
  state      = 'playing';
  nextPiece  = null;
  spawnNext();
  showOverlay(null);
  updateHUD();
  NeonArcade.getAudioCtx(); // ensure context created
  NeonArcade.setTrack(1);   // CHIP — game's default track
  NeonArcade.startMusic();
  lastTs = performance.now();
}

// ── HUD update ────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score-display').textContent = score;
  document.getElementById('best-display').textContent  = bestScore;
  document.getElementById('lines-display').textContent = lines;
  document.getElementById('level-display').textContent = level;
}

// ── Overlay helpers ───────────────────────────────────────────
function showOverlay(id) {
  ['overlay-start', 'overlay-pause', 'overlay-gameover'].forEach(oid => {
    document.getElementById(oid).classList.toggle('hidden', oid !== id);
  });
}

// ── Drawing helpers ───────────────────────────────────────────

// Draw a single block at grid position (c, r) on given ctx
function drawBlock(dc, r, c, color, blockSize, alpha = 1) {
  const x = c * blockSize;
  const y = r * blockSize;
  const s = blockSize;

  dc.save();
  dc.globalAlpha = alpha;

  // Body fill
  dc.fillStyle = color;
  dc.shadowColor = color;
  dc.shadowBlur  = 10;
  dc.fillRect(x + 1, y + 1, s - 2, s - 2);

  // Top-left highlight
  dc.shadowBlur  = 0;
  dc.fillStyle   = 'rgba(255,255,255,0.25)';
  dc.fillRect(x + 2, y + 2, s - 4, 3);
  dc.fillRect(x + 2, y + 2, 3, s - 4);

  // Bottom-right shadow
  dc.fillStyle = 'rgba(0,0,0,0.35)';
  dc.fillRect(x + s - 4, y + 3, 3, s - 4);
  dc.fillRect(x + 3, y + s - 4, s - 4, 3);

  dc.restore();
}

// Draw a ghost block (outline only)
function drawGhostBlock(dc, r, c, color, blockSize) {
  const x = c * blockSize;
  const y = r * blockSize;
  const s = blockSize;
  dc.save();
  dc.globalAlpha  = 0.22;
  dc.strokeStyle  = color;
  dc.lineWidth    = 2;
  dc.shadowColor  = color;
  dc.shadowBlur   = 8;
  dc.strokeRect(x + 2, y + 2, s - 4, s - 4);
  dc.restore();
}

// ── Render ────────────────────────────────────────────────────
function render() {
  const W = canvas.width;
  const H = canvas.height;

  // Background
  ctx.fillStyle = '#000007';
  ctx.fillRect(0, 0, W, H);

  // Grid dots
  ctx.fillStyle = 'rgba(0,255,255,0.06)';
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      ctx.fillRect(c * BLOCK - 1, r * BLOCK - 1, 2, 2);
    }
  }

  // ── Placed blocks ──
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        // Flash effect during line-clear animation
        const isClearing = state === 'clearing' && clearAnim.rows.includes(r);
        if (isClearing) {
          const flashOn = Math.floor(clearAnim.frame / 3) % 2 === 0;
          if (flashOn) {
            // Draw white flash
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur  = 20;
            ctx.fillRect(c * BLOCK + 1, r * BLOCK + 1, BLOCK - 2, BLOCK - 2);
            ctx.restore();
          } else {
            drawBlock(ctx, r, c, board[r][c], BLOCK);
          }
        } else {
          drawBlock(ctx, r, c, board[r][c], BLOCK);
        }
      }
    }
  }

  // ── Ghost piece ──
  if (state === 'playing' && current) {
    const gy = ghostY();
    if (gy !== current.y) {
      current.shape.forEach((row, dr) => {
        row.forEach((cell, dc) => {
          if (!cell) return;
          drawGhostBlock(ctx, gy + dr, current.x + dc, current.color, BLOCK);
        });
      });
    }
  }

  // ── Active piece ──
  if (current && (state === 'playing' || state === 'clearing')) {
    current.shape.forEach((row, dr) => {
      row.forEach((cell, dc) => {
        if (!cell) return;
        const pr = current.y + dr;
        if (pr < 0) return; // above visible area
        drawBlock(ctx, pr, current.x + dc, current.color, BLOCK);
      });
    });
  }

  // ── Next piece preview ──
  renderNext();
}

function renderNext() {
  const W = nextCanvas.width;
  const H = nextCanvas.height;
  nextCtx.fillStyle = 'rgba(0,0,0,0)';
  nextCtx.clearRect(0, 0, W, H);

  if (!nextPiece) return;

  const { shape, color } = nextPiece;
  const offsetX = Math.floor((5 - shape[0].length) / 2);
  const offsetY = Math.floor((5 - shape.length) / 2);

  shape.forEach((row, dr) => {
    row.forEach((cell, dc) => {
      if (!cell) return;
      drawBlock(nextCtx, offsetY + dr, offsetX + dc, color, BLOCK);
    });
  });
}

// ── Main loop ─────────────────────────────────────────────────
function loop(ts) {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(ts - lastTs, 100); // cap delta at 100ms
  lastTs   = ts;

  if (state === 'playing') {
    dropTimer += dt;
    const speed = DROP_SPEEDS[Math.min(level - 1, DROP_SPEEDS.length - 1)];
    if (dropTimer >= speed) {
      dropTimer = 0;
      step();
    }
  }

  if (state === 'clearing') {
    clearAnim.frame++;
    if (clearAnim.frame >= clearAnim.maxFrames) {
      addScore(clearAnim.rows.length);
      removeRows(clearAnim.rows);
      clearAnim.rows  = [];
      clearAnim.frame = 0;
      state = 'playing';
      spawnNext();
      if (collides(current.shape, current.x, current.y)) {
        triggerGameOver();
      }
    }
  }

  render();
  updateHUD();
}

// ── Keyboard input ────────────────────────────────────────────
// Key repeat: handle left/right/down as repeating with initial delay
const keysHeld     = {};
const keyRepeat    = {};
const REPEAT_INIT  = 170; // ms before repeat starts
const REPEAT_RATE  = 50;  // ms between repeats

function handleKey(key) {
  switch (key) {
    case 'ArrowLeft':  moveLeft();              break;
    case 'ArrowRight': moveRight();             break;
    case 'ArrowDown':  softDrop();              break;
    case 'ArrowUp':
    case 'x': case 'X': rotateAction('cw');    break;
    case 'z': case 'Z': rotateAction('ccw');   break;
    case ' ':           hardDrop();             break;
    case 'p': case 'P': togglePause();          break;
    case 'Enter':
      if (state === 'start' || state === 'gameover') startGame();
      else if (state === 'paused') togglePause();
      break;
  }
}

document.addEventListener('keydown', e => {
  const key = e.key;

  if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(key)) {
    e.preventDefault();
  }

  if (keysHeld[key]) return; // already handling repeat
  keysHeld[key]  = true;
  handleKey(key);

  // Set up repeat for movement keys
  if (['ArrowLeft','ArrowRight','ArrowDown'].includes(key)) {
    keyRepeat[key] = setTimeout(function repeat() {
      if (keysHeld[key]) {
        handleKey(key);
        keyRepeat[key] = setTimeout(repeat, REPEAT_RATE);
      }
    }, REPEAT_INIT);
  }
});

document.addEventListener('keyup', e => {
  const key = e.key;
  keysHeld[key] = false;
  if (keyRepeat[key]) { clearTimeout(keyRepeat[key]); delete keyRepeat[key]; }
});

// ── Touch / Swipe input ───────────────────────────────────────
let touchStart  = null;
let touchMoved  = false;
const SWIPE_MIN = 40;  // minimum px for a swipe
const TAP_MAX   = 14;  // max movement for a tap
const TAP_TIME  = 220; // max ms for a tap

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  touchStart  = { x: t.clientX, y: t.clientY, time: Date.now() };
  touchMoved  = false;
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!touchStart) return;
  const t  = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;

  // Continuous horizontal movement while dragging
  if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
    touchMoved = true;
    if (dx < 0) moveLeft(); else moveRight();
    touchStart.x = t.clientX; // reset so it fires per-cell
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!touchStart) return;
  const t    = e.changedTouches[0];
  const dx   = t.clientX - touchStart.x;
  const dy   = t.clientY - touchStart.y;
  const dist = Math.hypot(dx, dy);
  const dt   = Date.now() - touchStart.time;

  if (!touchMoved) {
    if (dist < TAP_MAX && dt < TAP_TIME) {
      // Tap → rotate
      rotateAction('cw');
    } else if (Math.abs(dy) > SWIPE_MIN && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      // Swipe down
      if (dy > BLOCK * 3) hardDrop();
      else softDrop();
    } else if (Math.abs(dy) > SWIPE_MIN && dy < 0) {
      // Swipe up → rotate
      rotateAction('cw');
    }
  }

  touchStart = null;
}, { passive: false });

// ── UI button bindings ────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', () => {
  if (state === 'paused') togglePause();
});
document.getElementById('btn-pause').addEventListener('click', () => {
  if (state === 'playing' || state === 'paused') togglePause();
});
document.getElementById('btn-restart').addEventListener('click', startGame);

// Music toggle
document.getElementById('music-toggle').addEventListener('click', function () {
  // Cycle:  ♪ CHIP  →  ♪ SYNTH  →  ♪ OFF  →  ♪ CHIP  → …
  const { name } = NeonArcade.cycleTrack();
  this.textContent = '♪ ' + name;
});
document.getElementById('music-mute').addEventListener('click', function () {
  const { on } = NeonArcade.toggleMusic();
  this.textContent = on ? 'Music: ON' : 'Music: OFF';
  this.classList.toggle('off', !on);
});

// ── Resize handling ───────────────────────────────────────────
window.addEventListener('resize', () => {
  resizeCanvas();
  render();
});

// ── Init ──────────────────────────────────────────────────────
resizeCanvas();
makeBoard();       // populate board with empty rows before first render
render();          // draw empty board
updateHUD();
requestAnimationFrame(ts => { lastTs = ts; rafId = requestAnimationFrame(loop); });
