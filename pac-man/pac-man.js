'use strict';
// ── Tile types ────────────────────────────────────────────────
const E = 0; // empty passage (no dot)
const W = 1; // wall
const D = 2; // dot  (10 pts)
const P = 3; // power pellet (50 pts)
const G = 4; // ghost-house door (ghosts only)

// ── Grid dimensions ───────────────────────────────────────────
const COLS = 21, ROWS = 23;
const TS   = 28;               // tile size in logical pixels
const LW   = COLS * TS;        // 588
const LH   = ROWS * TS;        // 644

// ── Single maze ───────────────────────────────────────────────
// Symmetric 21×23, ghost house rows 9-12 cols 8-12,
// door = single G tile at (col 10, row 9).
// Power pellets at four corners (row 2 / row 18, col 1 / col 19).
const MAZE_TEMPLATE = [
//   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  [  W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], //  0
  [  W, D, D, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, D, D, W], //  1
  [  W, P, W, W, W, D, W, W, W, D, W, D, W, W, W, D, W, W, W, P, W], //  2
  [  W, D, W, W, W, D, W, W, W, D, W, D, W, W, W, D, W, W, W, D, W], //  3
  [  W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W], //  4
  [  W, D, W, W, W, D, W, D, W, W, W, W, W, D, W, D, W, W, W, D, W], //  5
  [  W, D, D, D, W, D, W, D, D, D, W, D, D, D, W, D, W, D, D, D, W], //  6
  [  W, W, W, D, W, D, W, W, W, D, W, D, W, W, W, D, W, D, W, W, W], //  7
  [  W, W, W, D, W, D, D, D, D, D, D, D, D, D, D, D, W, D, W, W, W], //  8
  [  W, W, W, D, W, W, W, W, W, G, G, W, W, W, W, W, W, D, W, W, W], //  9  ← ghost door cols 9-10
  [  W, W, W, D, W, W, W, W, E, E, E, E, W, W, W, W, W, D, W, W, W], // 10  ← ghost interior
  [  W, W, W, D, W, W, W, W, E, E, E, E, W, W, W, W, W, D, W, W, W], // 11  ← ghost interior
  [  W, W, W, D, W, W, W, W, W, W, W, W, W, W, W, W, W, D, W, W, W], // 12  ← ghost house bottom
  [  W, W, W, D, W, D, D, D, D, D, D, D, D, D, D, D, W, D, W, W, W], // 13
  [  W, W, W, D, W, D, W, W, W, D, W, D, W, W, W, D, W, D, W, W, W], // 14
  [  W, D, D, D, D, D, W, W, W, D, W, D, W, W, W, D, D, D, D, D, W], // 15
  [  W, D, W, W, W, D, W, D, W, D, D, D, W, D, W, D, W, W, W, D, W], // 16
  [  W, D, W, W, W, D, D, D, D, D, D, D, D, D, D, D, D, W, W, D, W], // 17
  [  W, P, W, W, W, D, W, D, W, D, W, D, W, D, W, D, W, W, W, P, W], // 18
  [  W, D, D, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, D, D, W], // 19
  [  W, D, W, D, W, W, W, D, W, W, W, W, W, D, W, W, W, D, W, D, W], // 20
  [  W, D, D, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, D, D, W], // 21
  [  W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], // 22
];

// ── Maze 2 — "Open lanes" ─────────────────────────────────────
// Same ghost-house footprint (rows 9-12, cols 8-12 / door G at col9-10 row9).
// Power pellets at (col1,row3), (col19,row3), (col1,row18), (col19,row18).
// Full-width highways at rows 5 and 16 guarantee maze-wide connectivity.
const MAZE2_TEMPLATE = [
//   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  [  W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], //  0
  [  W, D, D, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, D, D, W], //  1
  [  W, D, W, W, D, W, W, W, D, W, W, W, D, W, W, W, D, W, W, D, W], //  2
  [  W, P, W, W, D, D, D, D, D, D, W, D, D, D, D, D, D, W, W, P, W], //  3
  [  W, D, W, W, D, W, W, W, D, W, W, W, D, W, W, W, D, W, W, D, W], //  4
  [  W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W], //  5  ← full highway
  [  W, W, W, D, W, W, D, W, W, W, W, W, W, W, D, W, W, D, W, W, W], //  6
  [  W, W, W, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, W, W, W], //  7
  [  W, W, W, D, W, D, W, W, W, D, D, D, W, W, W, D, W, D, W, W, W], //  8
  [  W, W, W, D, W, W, W, W, W, G, G, W, W, W, W, W, W, D, W, W, W], //  9  ← ghost door
  [  W, W, W, D, W, W, W, W, E, E, E, E, W, W, W, W, W, D, W, W, W], // 10  ← interior
  [  W, W, W, D, W, W, W, W, E, E, E, E, W, W, W, W, W, D, W, W, W], // 11  ← interior
  [  W, W, W, D, W, W, W, W, W, W, W, W, W, W, W, W, W, D, W, W, W], // 12
  [  W, W, W, D, W, D, W, W, W, D, D, D, W, W, W, D, W, D, W, W, W], // 13
  [  W, W, W, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, W, W, W], // 14
  [  W, W, W, D, W, W, D, W, W, W, W, W, W, W, D, W, W, D, W, W, W], // 15
  [  W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W], // 16  ← full highway
  [  W, D, W, W, D, D, D, D, D, D, D, D, D, D, D, D, D, W, W, D, W], // 17  ← PAC_START col10
  [  W, P, W, W, D, W, W, W, D, W, W, W, D, W, W, W, D, W, W, P, W], // 18
  [  W, D, W, W, D, D, D, D, D, D, W, D, D, D, D, D, D, W, W, D, W], // 19
  [  W, D, D, D, D, W, D, W, W, W, W, W, W, D, W, D, D, D, D, D, W], // 20
  [  W, D, D, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, D, D, W], // 21
  [  W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], // 22
];

// ── Maze 3 — "Chambers" ───────────────────────────────────────
// Vertically symmetric design.  Four tight corner sections in rows 1-4 and
// 18-21, separated by wall pillars.  Col-3 and col-17 spines run unbroken
// from row 6 to row 15, flanking the ghost house.  Full-width highways at
// rows 5 and 16.  Power pellets at (col1,row7), (col19,row7),
// (col1,row14), (col19,row14) — mid-height for maximum drama.
const MAZE3_TEMPLATE = [
//   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
  [  W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], //  0
  [  W, D, D, D, W, D, D, D, D, D, W, D, D, D, D, D, W, D, D, D, W], //  1
  [  W, D, W, D, W, D, W, W, W, D, W, D, W, W, W, D, W, D, W, D, W], //  2
  [  W, D, W, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, W, D, W], //  3
  [  W, D, W, D, W, W, W, W, W, D, W, D, W, W, W, W, W, D, W, D, W], //  4
  [  W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W], //  5  ← full highway
  [  W, D, W, D, W, D, W, W, W, W, W, W, W, W, D, W, W, D, W, D, W], //  6
  [  W, P, W, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, W, P, W], //  7  ← pellets
  [  W, D, W, D, W, D, W, W, W, D, D, D, W, W, W, D, W, D, W, D, W], //  8
  [  W, W, W, D, W, W, W, W, W, G, G, W, W, W, W, W, W, D, W, W, W], //  9  ← ghost door
  [  W, W, W, D, W, W, W, W, E, E, E, E, W, W, W, W, W, D, W, W, W], // 10
  [  W, W, W, D, W, W, W, W, E, E, E, E, W, W, W, W, W, D, W, W, W], // 11
  [  W, W, W, D, W, W, W, W, W, W, W, W, W, W, W, W, W, D, W, W, W], // 12
  [  W, D, W, D, W, D, W, W, W, D, D, D, W, W, W, D, W, D, W, D, W], // 13  ← mirror of 8
  [  W, P, W, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, W, P, W], // 14  ← pellets
  [  W, D, W, D, W, D, W, W, W, W, W, W, W, W, D, W, W, D, W, D, W], // 15  ← mirror of 6
  [  W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W], // 16  ← full highway
  [  W, D, W, D, W, W, W, W, W, D, D, D, W, W, W, W, W, D, W, D, W], // 17  ← PAC_START col10
  [  W, D, W, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, W, D, W], // 18  ← mirror of 3
  [  W, D, W, D, W, D, W, W, W, D, W, D, W, W, W, D, W, D, W, D, W], // 19  ← mirror of 2
  [  W, D, D, D, W, D, D, D, D, D, W, D, D, D, D, D, W, D, D, D, W], // 20  ← mirror of 1
  [  W, D, D, D, D, D, D, D, D, D, W, D, D, D, D, D, D, D, D, D, W], // 21
  [  W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W], // 22
];

const MAZES = [MAZE_TEMPLATE, MAZE2_TEMPLATE, MAZE3_TEMPLATE];

// Ghost house key positions
const GHOST_DOOR   = { col: 10, row: 9  };
const GHOST_SPAWNS = [
  { col: 10, row: 10 }, // Blinky (red)
  { col:  9, row: 11 }, // Pinky
  { col: 10, row: 11 }, // Inky
  { col: 11, row: 11 }, // Clyde
];
const PAC_START = { col: 10, row: 17 };

// ── Canvas / scale ────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
let scale = 1;

function resizeCanvas() {
  const maxW = Math.min(window.innerWidth - 16, 700);
  const maxH = window.innerHeight - 160;
  scale = Math.min(maxW / LW, maxH / LH);
  canvas.width  = Math.floor(LW * scale);
  canvas.height = Math.floor(LH * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

// ── Game state ────────────────────────────────────────────────
let grid      = [];
let dotCount  = 0;
let score     = 0;
let hiScore   = parseInt(localStorage.getItem('pm_hi') || '0', 10);
let lives     = 3;
let level     = 1;
let gameState = 'idle'; // idle | ready | playing | dying | levelup | gameover

let mazeIndex = 0;
let frightenTimer = 0;
let frightenFlash = false;
let eatCombo      = 0;
let animTick      = 0;
let lastTime      = 0;
let rafId         = null;
let scorePopups   = [];  // { x, y, val, life }
let _levelupTimer = 0;   // setTimeout id for level-clear transition (cleared on restart)

// ── Bonus items ───────────────────────────────────────────────
// kind: 'cherry'=1000pts | 'apple'=2000pts | 'grapefruit'=+life | 'bomb'=bullets 10s
let bonusItem  = null;   // { kind, col, row, x, y, life, maxLife }
let bonusTimer = 12;     // seconds until first bonus spawn

// ── Bullet system (bomb power-up) ─────────────────────────────
let bullets        = [];  // { x, y, dx, dy }
let bombActive     = 0;   // seconds remaining
let bulletCooldown = 0;

// ── Pac-Man ───────────────────────────────────────────────────
const pac = {
  x: 0, y: 0, col: 0, row: 0,
  dx: 0, dy: 0,
  faceDx: -1, faceDy: 0, // last moved direction (for mouth rendering)
  nextDx: -1, nextDy: 0,
  mouth: 0.25, mouthDir: 1,
  speed: 5.5,
};

// ── Ghosts ────────────────────────────────────────────────────
const GHOST_COLORS    = ['#ff2244', '#ffb8ff', '#00ffee', '#ffb852'];
const SCATTER_TARGETS = [
  { col: 20, row:  0 },
  { col:  0, row:  0 },
  { col: 20, row: 22 },
  { col:  0, row: 22 },
];

let ghosts     = [];
let ghostSpeed = 5.0;

function makeGhost(idx) {
  const sp = GHOST_SPAWNS[idx];
  return {
    idx,
    x: sp.col * TS + TS / 2,
    y: sp.row * TS + TS / 2,
    col: sp.col, row: sp.row,
    dx: 0, dy: 0,
    mode: 'house',
    houseTimer: idx * 4.5,
    speed: ghostSpeed,
  };
}

// ── Tile helpers ──────────────────────────────────────────────
function tileAt(c, r) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return W;
  return grid[r][c];
}

function walkable(c, r, ghost = false) {
  const t = tileAt(c, r);
  if (t === W) return false;
  if (t === G) return ghost;
  return true;
}

// Ghost house tiles (door = G, and the interior area rows 10-11 cols 8-11)
// are only accessible to ghosts in 'eaten' or 'house' mode.
// Corridors where dots have already been eaten (also tile value E) must
// remain walkable for all ghosts — we distinguish them by position.
function gwalkable(c, r, mode) {
  const t = tileAt(c, r);
  if (t === W) return false;
  if (t === G) return mode === 'eaten' || mode === 'house';
  // Ghost house interior: permanent E tiles at rows 10-11, cols 8-11
  if (r >= 10 && r <= 11 && c >= 8 && c <= 11) return mode === 'eaten' || mode === 'house';
  return true;
}

function tileCenter(c, r) {
  return { x: c * TS + TS / 2, y: r * TS + TS / 2 };
}

function tdist2(ac, ar, bc, br) {
  return (ac - bc) ** 2 + (ar - br) ** 2;
}

// ── Maze init ─────────────────────────────────────────────────
function initMaze() {
  grid = MAZES[mazeIndex].map(r => r.slice());
  dotCount = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === D || grid[r][c] === P) dotCount++;
}

// ── Reset actors ──────────────────────────────────────────────
function resetPac() {
  pac.col = PAC_START.col; pac.row = PAC_START.row;
  const tc = tileCenter(pac.col, pac.row);
  pac.x = tc.x; pac.y = tc.y;
  pac.dx = 0; pac.dy = 0;
  pac.faceDx = -1; pac.faceDy = 0;
  pac.nextDx = -1; pac.nextDy = 0;
  pac.mouth = 0.25; pac.mouthDir = 1;
}

function resetGhosts() {
  ghosts = GHOST_SPAWNS.map((_, i) => makeGhost(i));
}

// ── Mode cycling ──────────────────────────────────────────────
// 3 s initial scatter (ghosts spread out from the house), then chase forever
const MODE_SCHED = [3, 9999];
let modeTimer = 0, modePhase = 0;

function updateModes(dt) {
  if (frightenTimer > 0) {
    frightenTimer -= dt;
    frightenFlash  = frightenTimer < 2.0 && frightenTimer > 0;
    if (frightenTimer <= 0) {
      frightenTimer = 0;
      ghosts.forEach(g => {
        if (g.mode === 'frightened')
          g.mode = modePhase % 2 === 0 ? 'scatter' : 'chase';
      });
    }
    return;
  }
  modeTimer += dt;
  if (modeTimer >= MODE_SCHED[modePhase]) {
    modeTimer = 0;
    modePhase = Math.min(modePhase + 1, MODE_SCHED.length - 1);
    const nm = modePhase % 2 === 0 ? 'scatter' : 'chase';
    ghosts.forEach(g => {
      if (g.mode !== 'house' && g.mode !== 'eaten') {
        g.mode = nm;
        g.dx = -g.dx; g.dy = -g.dy; // reverse on switch
      }
    });
  }
}

function frightenGhosts() {
  frightenTimer = Math.max(3, 8 - (level - 1) * 0.8);
  eatCombo = 0;
  ghosts.forEach(g => {
    if (g.mode !== 'house' && g.mode !== 'eaten') {
      g.mode = 'frightened';
      g.dx = -g.dx; g.dy = -g.dy;
    }
  });
}

// ── Bonus system ──────────────────────────────────────────────
const BONUS_KINDS = ['cherry', 'apple', 'grapefruit', 'bomb'];

function spawnBonus() {
  const candidates = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!walkable(c, r)) continue;
      if (r >= 9 && r <= 12 && c >= 8 && c <= 12) continue; // no ghost house
      if (Math.abs(c - pac.col) <= 2 && Math.abs(r - pac.row) <= 2) continue;
      candidates.push({ col: c, row: r });
    }
  }
  if (!candidates.length) return;
  const pos  = candidates[Math.floor(Math.random() * candidates.length)];
  const kind = BONUS_KINDS[Math.floor(Math.random() * BONUS_KINDS.length)];
  const tc   = tileCenter(pos.col, pos.row);
  bonusItem  = { kind, col: pos.col, row: pos.row, x: tc.x, y: tc.y, life: 10, maxLife: 10 };
}

function collectBonus() {
  const { kind, x, y } = bonusItem;
  if      (kind === 'cherry')     { score += 1000; scorePopups.push({ x, y, val: '1000', life: 1.5 }); }
  else if (kind === 'apple')      { score += 2000; scorePopups.push({ x, y, val: '2000', life: 1.5 }); }
  else if (kind === 'grapefruit') { lives = Math.min(lives + 1, 9); scorePopups.push({ x, y, val: '+LIFE', life: 1.5 }); updateHUD(); }
  else if (kind === 'bomb')       { bombActive = 10; bulletCooldown = 0; scorePopups.push({ x, y, val: 'BOMB!', life: 1.5 }); }
  sfxBonusCollect();
  bonusItem  = null;
  bonusTimer = 10 + Math.random() * 12;
}

function updateBonus(dt) {
  bonusTimer -= dt;
  if (bonusTimer <= 0 && !bonusItem) spawnBonus();
  if (!bonusItem) return;
  bonusItem.life -= dt;
  if (bonusItem.life <= 0) { bonusItem = null; bonusTimer = 8 + Math.random() * 10; return; }
  if (Math.hypot(pac.x - bonusItem.x, pac.y - bonusItem.y) < TS * 0.65) collectBonus();
}

// ── Bullet system (bomb power-up) ─────────────────────────────
const BULLET_SPD = 14; // tiles per second

function fireBullet() {
  if (bombActive <= 0 || bulletCooldown > 0) return;
  if (pac.faceDx === 0 && pac.faceDy === 0) return;
  bullets.push({ x: pac.x, y: pac.y, dx: pac.faceDx, dy: pac.faceDy });
  bulletCooldown = 0.22;
  sfxBulletFire();
}

function updateBullets(dt) {
  if (bombActive > 0) {
    bombActive -= dt;
    if (bombActive <= 0) { bombActive = 0; bullets = []; sfxBombExpire(); }
    if (bulletCooldown > 0) bulletCooldown -= dt;
    fireBullet(); // auto-shoot while ammo crate is active
  }
  bullets = bullets.filter(b => {
    b.x += b.dx * BULLET_SPD * TS * dt;
    b.y += b.dy * BULLET_SPD * TS * dt;
    const col = Math.floor(b.x / TS), row = Math.floor(b.y / TS);
    if (!walkable(col, row)) return false;
    if (b.x < 0 || b.x > LW || b.y < 0 || b.y > LH) return false;
    for (const g of ghosts) {
      if (g.mode === 'house' || g.mode === 'eaten' || g.mode === 'frightened') continue;
      if (Math.hypot(b.x - g.x, b.y - g.y) < TS * 0.6) {
        g.mode = 'frightened'; g.dx = -g.dx; g.dy = -g.dy;
        if (frightenTimer < 3) frightenTimer = Math.max(3, 8 - (level - 1) * 0.8);
        sfxPellet();
        return false;
      }
    }
    return true;
  });
}

// ── Ghost AI ──────────────────────────────────────────────────
const DIRS4 = [{dc:0,dr:-1},{dc:0,dr:1},{dc:-1,dr:0},{dc:1,dr:0}];

function ghostTarget(g) {
  if (g.mode === 'scatter') return SCATTER_TARGETS[g.idx];
  if (g.mode === 'eaten')   return GHOST_DOOR;
  switch (g.idx) {
    case 0: return { col: pac.col, row: pac.row };
    case 1: return { col: pac.col + pac.faceDx * 4, row: pac.row + pac.faceDy * 4 };
    case 2: {
      const ax = pac.col + pac.faceDx * 2, ay = pac.row + pac.faceDy * 2;
      const b  = ghosts[0];
      return { col: ax + (ax - b.col), row: ay + (ay - b.row) };
    }
    case 3:
      return tdist2(g.col, g.row, pac.col, pac.row) > 64
        ? { col: pac.col, row: pac.row }
        : SCATTER_TARGETS[3];
  }
  return { col: pac.col, row: pac.row };
}

function moveGhost(g, dt) {
  // ── Safety: if ghost escapes the grid, respawn it in the house ──
  if (g.col < 0 || g.col >= COLS || g.row < 0 || g.row >= ROWS ||
      g.x < 0  || g.x > LW      || g.y < 0  || g.y > LH) {
    const sp  = GHOST_SPAWNS[g.idx];
    const tc0 = tileCenter(sp.col, sp.row);
    g.x = tc0.x; g.y = tc0.y;
    g.col = sp.col; g.row = sp.row;
    g.dx = 0; g.dy = 0;
    g.mode = 'house';
    g.houseTimer = 2.0;
    return;
  }

  // ── house bounce ──
  if (g.mode === 'house') {
    g.houseTimer -= dt;
    if (g.houseTimer <= 0) {
      // exit: teleport to door, then move upward into the open corridor
      const dc = tileCenter(GHOST_DOOR.col, GHOST_DOOR.row);
      g.x = dc.x; g.y = dc.y;
      g.col = GHOST_DOOR.col; g.row = GHOST_DOOR.row;
      g.dx = 0; g.dy = -1;
      // Join the current game phase so ghosts don't scatter when the rest are chasing
      g.mode = modePhase % 2 === 0 ? 'scatter' : 'chase';
    } else {
      g.y = (GHOST_SPAWNS[g.idx].row * TS + TS / 2)
            + Math.sin(g.houseTimer * 3) * 4;
    }
    return;
  }

  const spd = g.mode === 'eaten'      ? 9.0
            : g.mode === 'frightened' ? 3.5
            : g.speed;

  // ── Emergency direction fix: if stopped or heading into a wall, pick a new dir ──
  // Use gwalkable so scatter/chase/frightened ghosts cannot enter the ghost house.
  if ((g.dx === 0 && g.dy === 0) || !gwalkable(g.col + g.dx, g.row + g.dy, g.mode)) {
    const revDc0 = -g.dx, revDr0 = -g.dy;
    let found = false;
    for (const { dc, dr } of DIRS4) {
      if (dc === revDc0 && dr === revDr0) continue;
      if (gwalkable(g.col + dc, g.row + dr, g.mode)) { g.dx = dc; g.dy = dr; found = true; break; }
    }
    // Last resort: try reversing
    if (!found && gwalkable(g.col + revDc0, g.row + revDr0, g.mode)) {
      g.dx = revDc0; g.dy = revDr0;
    }
  }

  // If still no valid direction (ghost is completely boxed in) do nothing this frame
  if (!gwalkable(g.col + g.dx, g.row + g.dy, g.mode)) return;

  const tc   = tileCenter(g.col + g.dx, g.row + g.dy);
  const dist = Math.hypot(g.x - tc.x, g.y - tc.y);

  if (dist <= spd * dt * TS) {
    // ── Snap to next tile centre ──
    g.x = tc.x; g.y = tc.y;
    g.col += g.dx; g.row += g.dy;

    // ── Eaten ghost reached the door → respawn inside house ──
    if (g.mode === 'eaten' &&
        g.col === GHOST_DOOR.col && g.row === GHOST_DOOR.row) {
      const sp  = GHOST_SPAWNS[g.idx];
      const tc2 = tileCenter(sp.col, sp.row);
      g.x = tc2.x; g.y = tc2.y;
      g.col = sp.col; g.row = sp.row;
      g.dx = 0; g.dy = 0;
      g.mode = 'house';
      g.houseTimer = 1.5;   // brief respawn pause before exiting again
      return;
    }

    // ── Choose next direction at this tile centre ──
    const revDc = -g.dx, revDr = -g.dy;

    if (g.mode === 'frightened') {
      // Frightened: pick a random valid non-reversing direction
      const valid = DIRS4.filter(({ dc, dr }) =>
        !(dc === revDc && dr === revDr) && gwalkable(g.col + dc, g.row + dr, g.mode));
      if (valid.length > 0) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        g.dx = pick.dc; g.dy = pick.dr;
      } else {
        g.dx = revDc; g.dy = revDr; // dead end — must reverse
      }
    } else {
      // Scatter / chase / eaten: head toward AI target
      const tgt = ghostTarget(g);
      let best = Infinity, bdc = -1, bdr = 0; // safe default (will be overwritten)
      let anyFound = false;
      for (const { dc, dr } of DIRS4) {
        if (dc === revDc && dr === revDr) continue; // no reversing
        if (!gwalkable(g.col + dc, g.row + dr, g.mode)) continue;
        const s = tdist2(g.col + dc, g.row + dr, tgt.col, tgt.row);
        if (s < best) { best = s; bdc = dc; bdr = dr; anyFound = true; }
      }
      if (!anyFound) {
        // Dead end or all turns blocked — must reverse
        bdc = revDc; bdr = revDr;
      }
      g.dx = bdc; g.dy = bdr;
    }
  } else {
    g.x += g.dx * spd * dt * TS;
    g.y += g.dy * spd * dt * TS;
  }
}

// ── Pac-Man movement ──────────────────────────────────────────
function movePac(dt) {
  // Mouth animation always runs
  pac.mouth += pac.mouthDir * dt * 4;
  if (pac.mouth >= 0.35) pac.mouthDir = -1;
  if (pac.mouth <= 0.02) pac.mouthDir =  1;

  // If stopped, try to start in queued direction
  if (pac.dx === 0 && pac.dy === 0) {
    if (walkable(pac.col + pac.nextDx, pac.row + pac.nextDy)) {
      pac.dx = pac.nextDx; pac.dy = pac.nextDy;
    }
    return;
  }

  // Guard: current direction must be walkable before we move
  if (!walkable(pac.col + pac.dx, pac.row + pac.dy)) {
    pac.dx = 0; pac.dy = 0;
    return;
  }

  pac.faceDx = pac.dx; pac.faceDy = pac.dy;

  const spd  = pac.speed * TS;
  const tc   = tileCenter(pac.col + pac.dx, pac.row + pac.dy);
  const dist = Math.hypot(pac.x - tc.x, pac.y - tc.y);

  if (dist <= spd * dt) {
    // Snap to tile centre — only here do we apply direction changes
    pac.x = tc.x; pac.y = tc.y;
    pac.col += pac.dx; pac.row += pac.dy;

    // Eat tile
    const t = grid[pac.row][pac.col];
    if (t === D) { grid[pac.row][pac.col] = E; score += 10; dotCount--; sfxEat(); }
    if (t === P) { grid[pac.row][pac.col] = E; score += 50; dotCount--; frightenGhosts(); sfxPellet(); }

    // Try queued turn first, then keep current direction, else stop
    if (walkable(pac.col + pac.nextDx, pac.row + pac.nextDy)) {
      pac.dx = pac.nextDx; pac.dy = pac.nextDy;
    } else if (!walkable(pac.col + pac.dx, pac.row + pac.dy)) {
      pac.dx = 0; pac.dy = 0;
    }
  } else {
    pac.x += pac.dx * spd * dt;
    pac.y += pac.dy * spd * dt;
  }
}

// ── Collision ─────────────────────────────────────────────────
let deathTimer = 0;

function checkCollisions() {
  for (const g of ghosts) {
    if (Math.hypot(pac.x - g.x, pac.y - g.y) > TS * 0.75) continue;
    if (g.mode === 'frightened') {
      g.mode = 'eaten'; g.dx = 0; g.dy = -1;
      eatCombo++;
      const pts = 200 * (1 << (eatCombo - 1));
      score += pts;
      lives = Math.min(lives + 1, 9);
      scorePopups.push({ x: g.x, y: g.y - TS,     val: pts,    life: 1.4 });
      scorePopups.push({ x: g.x, y: g.y - TS * 2, val: '+LIFE', life: 1.8 });
      updateHUD();
      sfxEatGhost();
    } else if (g.mode !== 'eaten' && g.mode !== 'house') {
      if (gameState === 'playing') { gameState = 'dying'; deathTimer = 1.4; NeonArcade.stopMusic(); sfxDeath(); }
      return;
    }
  }
}

// ── Game flow ─────────────────────────────────────────────────
function startGame() {
  if (_levelupTimer) { clearTimeout(_levelupTimer); _levelupTimer = 0; }
  score      = 0;
  lives      = 3;
  level      = 1;
  pac.speed  = 5.5;
  ghostSpeed = 5.0;
  NeonArcade.startMusic();
  loadLevel();
}

function loadLevel() {
  mazeIndex = (level - 1) % MAZES.length;
  initMaze();
  resetPac();
  resetGhosts();
  frightenTimer = 0;
  frightenFlash = false;
  eatCombo      = 0;
  modeTimer     = 0;
  modePhase     = 0;
  scorePopups   = [];
  bonusItem     = null;
  bonusTimer    = 12;
  bullets       = [];
  bombActive    = 0;
  bulletCooldown = 0;
  gameState     = 'playing';
  hideAllOverlays();
  updateHUD();
  if (rafId) cancelAnimationFrame(rafId);
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
}

// ── Main loop ─────────────────────────────────────────────────
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  animTick += dt;

  if (gameState === 'playing') {
    movePac(dt);
    ghosts.forEach(g => moveGhost(g, dt));
    updateModes(dt);
    updateBonus(dt);
    updateBullets(dt);
    checkCollisions();
    scorePopups = scorePopups.filter(p => { p.life -= dt; return p.life > 0; });

    if (dotCount <= 0) {
      gameState = 'levelup';
      showOverlay('overlay-levelup');
      document.getElementById('lvl-title').textContent = `LEVEL ${level} CLEAR!`;
      _levelupTimer = setTimeout(() => {
        _levelupTimer = 0;
        level++;
        pac.speed  = 5.5 + Math.min(level - 1, 6) * 0.22;
        ghostSpeed = 5.0 + Math.min(level - 1, 6) * 0.22;
        loadLevel();
      }, 2500);
    }

    if (score > hiScore) { hiScore = score; localStorage.setItem('pm_hi', String(hiScore)); }
    updateHUD();
  }

  if (gameState === 'dying') {
    deathTimer -= dt;
    if (deathTimer <= 0) {
      lives--;
      if (lives <= 0) {
        gameState = 'gameover';
        document.getElementById('go-score').textContent = 'SCORE: ' + score;
        showOverlay('overlay-gameover');
        if (window.NeonArcade) {
          NeonArcade.HighScore.checkAndPrompt('pacman', score, () => {
            hiScore = NeonArcade.HighScore.getTopScore('pacman');
            updateHUD();
          });
        }
      } else {
        resetPac();
        resetGhosts();
        frightenTimer = 0;
        gameState = 'playing';
        NeonArcade.startMusic();
        hideAllOverlays();
      }
      updateHUD();
    }
  }

  render();
  rafId = requestAnimationFrame(loop);
}

// ── Render ────────────────────────────────────────────────────
function render() {
  ctx.clearRect(0, 0, LW, LH);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, LW, LH);
  drawMaze();
  drawDots();
  drawBonusItem();
  scorePopups.forEach(drawPopup);
  drawBullets();
  if (gameState === 'dying') drawPacDying(); else drawPac();
  drawGhosts();
  drawBombTimer();
}

// ─ Maze walls ─────────────────────────────────────────────────
function drawMaze() {
  // Fill wall tiles
  ctx.fillStyle = '#06002e';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === W) ctx.fillRect(c * TS, r * TS, TS, TS);

  // Neon border lines on wall edges facing corridors
  ctx.lineWidth   = 2;
  ctx.strokeStyle = '#3333ff';
  ctx.shadowColor = 'rgba(80,80,255,0.7)';
  ctx.shadowBlur  = 7;
  ctx.beginPath();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== W) continue;
      const x = c * TS, y = r * TS;
      if (tileAt(c, r - 1) !== W) { ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + TS - 1, y + 1); }
      if (tileAt(c, r + 1) !== W) { ctx.moveTo(x + 1, y + TS - 1); ctx.lineTo(x + TS - 1, y + TS - 1); }
      if (tileAt(c - 1, r) !== W) { ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 1, y + TS - 1); }
      if (tileAt(c + 1, r) !== W) { ctx.moveTo(x + TS - 1, y + 1); ctx.lineTo(x + TS - 1, y + TS - 1); }
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Ghost house door (pink bar)
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === G) {
        ctx.fillStyle = '#ff88ff';
        ctx.fillRect(c * TS + 3, r * TS + TS / 2 - 2, TS - 6, 4);
      }
}

// ─ Dots & pellets ─────────────────────────────────────────────
function drawDots() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t !== D && t !== P) continue;
      const cx = c * TS + TS / 2, cy = r * TS + TS / 2;
      if (t === D) {
        ctx.fillStyle = '#ffcc66';
        ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
      } else {
        const pulse = 0.6 + 0.4 * Math.sin(animTick * 6);
        ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 12 * pulse;
        ctx.fillStyle   = '#ffff00';
        ctx.beginPath(); ctx.arc(cx, cy, 5.5 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur  = 0;
      }
    }
  }
}

// ─ Pac-Man ────────────────────────────────────────────────────
function drawPac() {
  const face = Math.atan2(pac.faceDy, pac.faceDx);
  const ang  = pac.mouth * Math.PI;
  ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 14;
  ctx.fillStyle   = '#ffff00';
  ctx.beginPath();
  ctx.moveTo(pac.x, pac.y);
  ctx.arc(pac.x, pac.y, TS * 0.44, face + ang, face - ang);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPacDying() {
  const prog = Math.max(0, 1 - deathTimer / 1.4);
  const ang  = Math.PI * (1 - prog * 0.5);
  ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 14;
  ctx.fillStyle   = '#ffff00';
  ctx.beginPath();
  ctx.moveTo(pac.x, pac.y);
  ctx.arc(pac.x, pac.y, TS * 0.44, -ang, ang);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
}

// ─ Ghosts ─────────────────────────────────────────────────────
function drawGhosts() {
  for (const g of ghosts) {
    if (g.mode === 'house' && g.houseTimer > 0.1) {
      // still in house — draw at bobbing position
    }
    if (g.mode === 'eaten') { drawEyes(g); continue; }

    let color;
    if (g.mode === 'frightened') {
      color = (frightenFlash && Math.sin(animTick * 15) > 0) ? '#fff' : '#0000cc';
    } else {
      color = GHOST_COLORS[g.idx];
    }

    const r  = TS * 0.43;
    const gx = g.x, gy = g.y;

    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(gx, gy - r * 0.1, r, Math.PI, 0); // dome
    const bot = gy + r * 0.88;
    const sw  = (r * 2) / 4;
    ctx.lineTo(gx + r, bot);
    for (let i = 0; i <= 4; i++)
      ctx.lineTo(gx + r - i * sw, i % 2 === 0 ? bot : bot - r * 0.32);
    ctx.lineTo(gx - r, gy - r * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    drawEyes(g, g.mode === 'frightened');
  }
}

function drawEyes(g, frightened = false) {
  if (frightened) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(g.x - 5, g.y - 3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(g.x + 5, g.y - 3, 2.5, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const ox = g.dx * 2.5, oy = g.dy * 2.5;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(g.x - 5, g.y - 4, 4,   0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(g.x + 5, g.y - 4, 4,   0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0088ff';
  ctx.beginPath(); ctx.arc(g.x - 5 + ox, g.y - 4 + oy, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(g.x + 5 + ox, g.y - 4 + oy, 2.2, 0, Math.PI * 2); ctx.fill();
}

// ─ Score popups ───────────────────────────────────────────────
function drawPopup(p) {
  ctx.globalAlpha = Math.min(1, p.life);
  ctx.fillStyle   = '#fff';
  ctx.font        = '7px "Press Start 2P"';
  ctx.textAlign   = 'center';
  ctx.fillText(p.val, p.x, p.y - (1.4 - p.life) * 18);
  ctx.globalAlpha = 1;
}

// ─ Bonus item ─────────────────────────────────────────────────
function drawBonusItem() {
  if (!bonusItem) return;
  const { kind, x, y, life } = bonusItem;
  const alpha = life < 3 ? (0.45 + 0.55 * Math.sin(animTick * 9)) : 1;
  ctx.globalAlpha = alpha;
  const r = TS * 0.38;

  switch (kind) {
    case 'cherry': {
      ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#dd0033';
      ctx.beginPath(); ctx.arc(x - 5, y + 3, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 5, y + 3, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#22aa22'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.quadraticCurveTo(x + 1, y - 11, x + 5, y - 2); ctx.stroke();
      break;
    }
    case 'apple': {
      ctx.shadowColor = '#44ff44'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#22cc22';
      ctx.beginPath(); ctx.arc(x, y + 2, r * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#553300'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.8 + 2); ctx.lineTo(x, y - r * 0.8 - 5); ctx.stroke();
      ctx.fillStyle = '#55ee55';
      ctx.beginPath(); ctx.ellipse(x + 5, y - r * 0.8 - 2, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'grapefruit': {
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff8800';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffcc66'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.88, y + Math.sin(a) * r * 0.88); ctx.stroke();
      }
      break;
    }
    case 'bomb': {
      // Ammo crate
      const cw = r * 1.7, ch = r * 1.4;
      const cx2 = x - cw / 2, cy2 = y - ch / 2;
      ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#5a3a0a';
      ctx.fillRect(cx2, cy2, cw, ch);
      ctx.strokeStyle = '#c8960a'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0;
      ctx.strokeRect(cx2, cy2, cw, ch);
      // horizontal band
      ctx.strokeStyle = '#c8960a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx2, y); ctx.lineTo(cx2 + cw, y); ctx.stroke();
      // X straps
      ctx.strokeStyle = '#c8960a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + cw, cy2 + ch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2 + cw, cy2); ctx.lineTo(cx2, cy2 + ch); ctx.stroke();
      // bullet symbols
      ctx.fillStyle = '#ffee88'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 4;
      ctx.fillRect(x - r * 0.55, cy2 + ch * 0.15, r * 0.25, ch * 0.35);
      ctx.fillRect(x + r * 0.1,  cy2 + ch * 0.15, r * 0.25, ch * 0.35);
      break;
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

// ─ Bullets ────────────────────────────────────────────────────
function drawBullets() {
  if (!bullets.length) return;
  ctx.fillStyle = '#ffff88'; ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 8;
  for (const b of bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ─ Bomb timer bar ─────────────────────────────────────────────
function drawBombTimer() {
  if (bombActive <= 0) return;
  const bw = 88, bh = 6, bx = LW / 2 - bw / 2, by = 5;
  const pct = bombActive / 10;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  ctx.fillStyle = '#222'; ctx.fillRect(bx, by, bw, bh);
  const col = pct > 0.5 ? '#ffff00' : pct > 0.25 ? '#ff8800' : '#ff2200';
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6;
  ctx.fillRect(bx, by, bw * pct, bh);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '5px "Press Start 2P"';
  ctx.textAlign = 'center'; ctx.fillText('AMMO', LW / 2, by + bh + 8);
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD() {
  const dots = '●'.repeat(Math.max(0, lives));
  const maze = `${mazeIndex + 1} / ${MAZES.length}`;
  document.getElementById('score-display').textContent = score;
  document.getElementById('hi-display').textContent    = hiScore;
  document.getElementById('lives-display').textContent = dots;
  document.getElementById('level-display').textContent = level;
  document.getElementById('maze-display').textContent  = maze;
  // portrait strip
  document.getElementById('p-score-display').textContent = score;
  document.getElementById('p-hi-display').textContent    = hiScore;
  document.getElementById('p-lives-display').textContent = dots;
  document.getElementById('p-level-display').textContent = level;
  document.getElementById('p-maze-display').textContent  = maze;
}

// ── Overlays ──────────────────────────────────────────────────
function hideAllOverlays() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
}
function showOverlay(id) {
  hideAllOverlays();
  document.getElementById(id).classList.remove('hidden');
}

// ── Input ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const dirs = {
    ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
    KeyW:    [0,-1], KeyS:      [0,1], KeyA:      [-1,0], KeyD:       [1,0],
  };
  if (dirs[e.code]) {
    [pac.nextDx, pac.nextDy] = dirs[e.code];
    if (gameState === 'playing' || gameState === 'paused') e.preventDefault();
  }
  if (e.code === 'KeyP') {
    if      (gameState === 'playing') { gameState = 'paused'; showOverlay('overlay-pause'); NeonArcade.stopMusic(); }
    else if (gameState === 'paused')  resumeGame();
  }
  if (e.code === 'Space' && gameState === 'playing') { e.preventDefault(); fireBullet(); }
});

function resumeGame() {
  if (gameState !== 'paused') return;
  gameState = 'playing';
  hideAllOverlays();
  lastTime = performance.now();
  NeonArcade.startMusic();
}

document.getElementById('btn-start').addEventListener('click',   startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click',  resumeGame);
document.getElementById('btn-pause').addEventListener('click', () => {
  if      (gameState === 'playing') { gameState = 'paused'; showOverlay('overlay-pause'); NeonArcade.stopMusic(); }
  else if (gameState === 'paused')  resumeGame();
});

// Canvas swipe — minimum 40 px distance (spec: Game_Controls_setup.md)
// passive: false + preventDefault blocks iOS pull-to-refresh / page scroll on canvas.
let _swipeX = 0, _swipeY = 0;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  _swipeX = e.touches[0].clientX;
  _swipeY = e.touches[0].clientY;
}, { passive: false });
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (gameState !== 'playing') return;
  const dx = e.changedTouches[0].clientX - _swipeX;
  const dy = e.changedTouches[0].clientY - _swipeY;
  if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    [pac.nextDx, pac.nextDy] = dx > 0 ? [1, 0] : [-1, 0];
  } else {
    [pac.nextDx, pac.nextDy] = dy > 0 ? [0, 1] : [0, -1];
  }
}, { passive: false });

// ── SFX ───────────────────────────────────────────────────────
let eatFlip = false;
function sfxEat() {
  try {
    const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus();
    const f  = eatFlip ? 220 : 180; eatFlip = !eatFlip;
    const o  = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(bus); o.type = 'square'; o.frequency.value = f;
    const t = ac.currentTime;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    o.start(t); o.stop(t + 0.07);
  } catch (_) {}
}
function sfxPellet() {
  try {
    const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus();
    [440, 554, 659, 880].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(bus); o.type = 'square'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.07;
      g.gain.setValueAtTime(0.11, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.start(t); o.stop(t + 0.11);
    });
  } catch (_) {}
}
function sfxEatGhost() {
  try {
    const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus();
    [700, 500, 350].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(bus); o.type = 'square'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.06;
      g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.start(t); o.stop(t + 0.11);
    });
  } catch (_) {}
}
function sfxDeath() {
  try {
    const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus();
    [494,440,392,349,330,294,262,247,220,196,165,131,110].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(bus); o.type = 'sawtooth'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.start(t); o.stop(t + 0.15);
    });
  } catch (_) {}
}

function sfxBonusCollect() {
  try {
    const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus();
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(bus); o.type = 'square'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.055;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.start(t); o.stop(t + 0.1);
    });
  } catch (_) {}
}
function sfxBulletFire() {
  try {
    const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(bus); o.type = 'sawtooth';
    o.frequency.setValueAtTime(880, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.1, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
    o.start(ac.currentTime); o.stop(ac.currentTime + 0.11);
  } catch (_) {}
}
function sfxBombExpire() {
  try {
    const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus();
    [440, 330, 220, 165].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(bus); o.type = 'sawtooth'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.start(t); o.stop(t + 0.13);
    });
  } catch (_) {}
}

// ── Music ─────────────────────────────────────────────────────
NeonArcade.setTrack(3);
document.getElementById('music-mute').addEventListener('click', function () {
  const { on } = NeonArcade.toggleMusic();
  this.textContent = on ? 'Music: ON' : 'Music: OFF';
  this.classList.toggle('off', !on);
});

// ── Boot ──────────────────────────────────────────────────────
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
initMaze();
updateHUD();
render();
showOverlay('overlay-start');
