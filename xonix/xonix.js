/* ============================================================
   XONIX — Neon Arcade
   ============================================================ */
'use strict';

// ── Grid constants ────────────────────────────────────────────
const COLS = 48;
const ROWS = 32;

const EMPTY   = 0;
const CLAIMED = 1;
const TRAIL   = 2;

const TARGET_PCT      = 0.75;
const INIT_LIVES      = 3;
const INVINC_MS       = 2200;

const PATROL_BASE_SPD = 6.0;   // cells/s — white ball on claimed territory
const PATROL_MAX_SPD  = 14.0;  // hard cap
const ENEMY_MAX_MULT  = 4.0;   // enemies cap at 4× their base level speed
const NUDGE_INTERVAL  = 5000;  // ms between stuck-prevention nudges
const DANGER_NEAR     = 7;     // cells: enemy within this → trail shifts red
const FLASH_MS        = 380;   // ms for capture cell flash
const SPEED_FLASH_MS  = 350;   // ms for speed-up visual flash on enemies
const ERODE_RADIUS    = 0.85;  // grid cells — territory eaten per enemy bounce

const HEART_DURATION_MS  = 5000;  // ms each heart bonus stays visible
const HEART_COLLECT_DIST = 1.1;   // cells — distance to collect
const HEART_SPAWN_MIN_MS = 6000;  // earliest spawn after level start / last despawn
const HEART_SPAWN_MAX_MS = 14000; // latest spawn

const SLOW_DURATION_MS  = 5500;  // ms the slow bonus stays on field
const SLOW_COLLECT_DIST = 1.1;   // cells
const SLOW_SPAWN_MIN_MS = 9000;
const SLOW_SPAWN_MAX_MS = 20000;

function playerSpeed(lvl) { return 8 + (lvl - 1) * 0.4; }
function enemySpeed(lvl)  { return 3.2 + (lvl - 1) * 0.55; }
function enemyCount(lvl)  { return Math.min(lvl, 8); }

// ── Canvas ────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
let CELL = 14;

function calcCell() {
  const mobileLandscape = window.innerHeight < 500 && window.innerWidth > window.innerHeight;
  if (mobileLandscape) {
    // Drive CELL by height so the grid fills the screen vertically
    // ~56px for compact topbar + game-area padding
    const availH = window.innerHeight - 56;
    CELL = Math.max(4, Math.min(20, Math.floor(availH / ROWS)));
  } else {
    const maxW = Math.min(window.innerWidth - 16, 960);
    const maxH = Math.max(180, window.innerHeight - 160);
    CELL = Math.max(6, Math.min(20, Math.floor(Math.min(maxW / COLS, maxH / ROWS))));
  }
}
function resizeCanvas() {
  calcCell();
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;
}

// ── Game state ────────────────────────────────────────────────
let grid          = new Uint8Array(ROWS * COLS);
let player        = {};
let enemies       = [];
let patrol        = null;   // the evil white ball

let score         = 0;
let hiScore       = parseInt(localStorage.getItem('xonix_hi') || '0', 10);
let lives         = INIT_LIVES;
let level         = 1;
let fillPct       = 0;
let interiorTotal = 0;
let invincTimer   = 0;

let captureMult   = 1.0;   // ×2 per capture, capped at ENEMY_MAX_MULT
let stuckTimer    = 0;
let flashCells    = new Map();  // index → timestamp, for capture animation
let speedFlash    = 0;          // ms remaining for speed-up flash effect

let heart           = null;   // { gx, gy, timer } — active heart bonus, or null
let heartSpawnsLeft = 0;      // how many hearts still to appear this level (2 per level)
let heartSpawnTimer = 0;      // ms until next heart spawns

let slowBonus      = null;    // { gx, gy, timer } — active slow bonus, or null
let slowSpawnsLeft = 0;       // how many slow bonuses still to appear this level
let slowSpawnTimer = 0;       // ms until next slow bonus spawns

let gameState = 'start';
let lastTs    = 0;

// ── Grid helpers ──────────────────────────────────────────────
function gi(r, c) { return r * COLS + c; }

function initGrid() {
  grid.fill(EMPTY);
  for (let c = 0; c < COLS; c++) {
    grid[gi(0,      c)] = CLAIMED;
    grid[gi(ROWS-1, c)] = CLAIMED;
  }
  for (let r = 1; r < ROWS-1; r++) {
    grid[gi(r, 0)]      = CLAIMED;
    grid[gi(r, COLS-1)] = CLAIMED;
  }
  interiorTotal = (COLS-2) * (ROWS-2);
  fillPct = 0;
}

function clearTrail() {
  for (let i = 0; i < grid.length; i++)
    if (grid[i] === TRAIL) grid[i] = EMPTY;
}

function calcFill() {
  let n = 0;
  for (let r = 1; r < ROWS-1; r++)
    for (let c = 1; c < COLS-1; c++)
      if (grid[gi(r, c)] === CLAIMED) n++;
  fillPct = n / interiorTotal;
}

// ── Capture area ──────────────────────────────────────────────
function captureArea() {
  // 1. Trail → claimed
  let trailCount = 0;
  for (let i = 0; i < grid.length; i++)
    if (grid[i] === TRAIL) { grid[i] = CLAIMED; trailCount++; }
  if (trailCount === 0) return 0;

  // 2. BFS from enemies through EMPTY to find uncapturable region
  const visited = new Uint8Array(ROWS * COLS);
  const queue   = [];
  for (const e of enemies) {
    const ec = Math.max(0, Math.min(COLS-1, Math.floor(e.gx)));
    const er = Math.max(0, Math.min(ROWS-1, Math.floor(e.gy)));
    const i  = gi(er, ec);
    if (grid[i] === EMPTY && !visited[i]) { visited[i] = 1; queue.push(er * COLS + ec); }
  }
  let head = 0;
  while (head < queue.length) {
    const enc = queue[head++];
    const r = Math.floor(enc / COLS), c = enc % COLS;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const ni = gi(nr, nc);
      if (visited[ni] || grid[ni] !== EMPTY) continue;
      visited[ni] = 1;
      queue.push(nr * COLS + nc);
    }
  }

  // 3. Claim unreachable cells + register flash
  const now = performance.now();
  let gained = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = gi(r, c);
      if (grid[i] === EMPTY && !visited[i]) {
        grid[i] = CLAIMED;
        flashCells.set(i, now);
        gained++;
      }
    }
  }
  calcFill();

  // Score with large-capture bonus
  const total  = trailCount + gained;
  const bonus  = gained > 80 ? 3 : gained > 40 ? 2 : gained > 15 ? 1.5 : 1;
  const pts    = Math.ceil(total * 6 * level * bonus);
  score += pts;
  if (score > hiScore) { hiScore = score; localStorage.setItem('xonix_hi', hiScore); }

  // ── Speed ×2 on every capture ──────────────────────────────
  captureMult = Math.min(captureMult * 1.5, ENEMY_MAX_MULT);
  const targetSpd = enemySpeed(level) * captureMult;
  for (const e of enemies) {
    const spd = Math.hypot(e.vx, e.vy);
    if (spd < 0.001) continue;
    e.vx = e.vx / spd * targetSpd;
    e.vy = e.vy / spd * targetSpd;
  }
  if (patrol) {
    const pSpd = Math.hypot(patrol.vx, patrol.vy);
    if (pSpd > 0.001) {
      const newSpd = Math.min(pSpd * 1.5, PATROL_MAX_SPD);
      patrol.vx = patrol.vx / pSpd * newSpd;
      patrol.vy = patrol.vy / pSpd * newSpd;
    }
  }
  speedFlash = SPEED_FLASH_MS;   // trigger speed-up visual
  // ───────────────────────────────────────────────────────────

  xSFX.capture(gained);
  return total;
}

// ── Player ────────────────────────────────────────────────────
function initPlayer() {
  player = {
    x: Math.floor(COLS / 2), y: 0,
    dx: 0, dy: 0,
    drawing: false, stepAcc: 0,
  };
}

function stepPlayer(dt) {
  if (gameState !== 'playing') return;
  if (player.dx === 0 && player.dy === 0) return;

  const stepMs = 1000 / playerSpeed(level);
  player.stepAcc += dt;
  while (player.stepAcc >= stepMs) {
    player.stepAcc -= stepMs;
    const nx = player.x + player.dx, ny = player.y + player.dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      player.dx = 0; player.dy = 0; return;
    }
    const cell = grid[gi(ny, nx)];
    if (cell === TRAIL) { player.dx = 0; player.dy = 0; return; }

    player.x = nx; player.y = ny;
    if (cell === EMPTY) {
      grid[gi(ny, nx)] = TRAIL;
      player.drawing   = true;
    } else if (cell === CLAIMED && player.drawing) {
      player.drawing = false;
      captureArea();
      if (fillPct >= TARGET_PCT) { triggerLevelComplete(); return; }
    }
  }
}

// ── Territory erosion ─────────────────────────────────────────
// Converts CLAIMED cells within ERODE_RADIUS of (gcx, gcy) back to EMPTY.
// Skips the border frame (r=0/ROWS-1, c=0/COLS-1) as required.
function erodeAt(gcx, gcy) {
  const r0 = Math.max(1,       Math.floor(gcy - ERODE_RADIUS));
  const r1 = Math.min(ROWS-2,  Math.ceil (gcy + ERODE_RADIUS));
  const c0 = Math.max(1,       Math.floor(gcx - ERODE_RADIUS));
  const c1 = Math.min(COLS-2,  Math.ceil (gcx + ERODE_RADIUS));
  let eroded = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (Math.hypot(c + 0.5 - gcx, r + 0.5 - gcy) <= ERODE_RADIUS) {
        const i = gi(r, c);
        if (grid[i] === CLAIMED) { grid[i] = EMPTY; eroded++; }
      }
    }
  }
  if (eroded > 0) fillPct = Math.max(0, fillPct - eroded / interiorTotal);
}

// ── Enemies (bounce in EMPTY territory) ───────────────────────
function spawnEnemies(count, spd) {
  enemies = [];
  for (let i = 0; i < count; i++) {
    let gx, gy, attempts = 0;
    do {
      gx = 1.5 + Math.random() * (COLS - 3);
      gy = 1.5 + Math.random() * (ROWS - 3);
      attempts++;
    } while (grid[gi(Math.floor(gy), Math.floor(gx))] !== EMPTY && attempts < 300);
    const angle = (Math.random() * 0.6 + 0.2) * Math.PI / 2
                + Math.floor(Math.random() * 4) * Math.PI / 2;
    enemies.push({ gx, gy, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd });
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    for (let s = 0; s < 4; s++) {
      const sdt  = dt / 4;

      // ── X axis ──
      const nx   = e.gx + e.vx * sdt;
      const cr   = Math.max(0, Math.min(ROWS-1, Math.floor(e.gy)));
      const ccNx = Math.max(0, Math.min(COLS-1, Math.floor(nx)));
      if (nx <= 0 || nx >= COLS) {
        e.vx = -e.vx;                              // hit hard boundary wall — no erosion
      } else if (grid[gi(cr, ccNx)] === CLAIMED) {
        e.vx = -e.vx;
        erodeAt(ccNx + 0.5, cr + 0.5);            // eat into captured territory
      } else {
        e.gx = nx;
      }

      // ── Y axis ──
      const ny   = e.gy + e.vy * sdt;
      const cc   = Math.max(0, Math.min(COLS-1, Math.floor(e.gx)));
      const crNy = Math.max(0, Math.min(ROWS-1, Math.floor(ny)));
      if (ny <= 0 || ny >= ROWS) {
        e.vy = -e.vy;                              // hit hard boundary wall — no erosion
      } else if (grid[gi(crNy, cc)] === CLAIMED) {
        e.vy = -e.vy;
        erodeAt(cc + 0.5, crNy + 0.5);            // eat into captured territory
      } else {
        e.gy = ny;
      }
    }
  }
}

function nudgeEnemies() {
  for (const e of enemies) {
    const spd = Math.hypot(e.vx, e.vy);
    const a   = Math.atan2(e.vy, e.vx) + (Math.random() - 0.5) * 0.35;
    e.vx = Math.cos(a) * spd; e.vy = Math.sin(a) * spd;
  }
}

// ── Patrol (evil white ball — bounces on CLAIMED territory) ───
function initPatrol() {
  // Spawn somewhere on the top border, diagonal velocity
  const gx    = 1.5 + Math.random() * (COLS - 3);
  const gy    = 0.5;
  const angle = Math.PI / 4 + Math.floor(Math.random() * 4) * Math.PI / 2; // 45° diagonals
  patrol = {
    gx, gy,
    vx: Math.cos(angle) * PATROL_BASE_SPD,
    vy: Math.sin(angle) * PATROL_BASE_SPD,
  };
}

function updatePatrol(dt) {
  if (!patrol) return;
  for (let s = 0; s < 4; s++) {
    const sdt  = dt / 4;

    // X: only move into CLAIMED cells
    const nx   = patrol.gx + patrol.vx * sdt;
    const cr   = Math.max(0, Math.min(ROWS-1, Math.floor(patrol.gy)));
    const ccNx = Math.max(0, Math.min(COLS-1, Math.floor(nx)));
    if (nx <= 0 || nx >= COLS || grid[gi(cr, ccNx)] !== CLAIMED) patrol.vx = -patrol.vx;
    else patrol.gx = nx;

    // Y: only move into CLAIMED cells
    const ny   = patrol.gy + patrol.vy * sdt;
    const cc   = Math.max(0, Math.min(COLS-1, Math.floor(patrol.gx)));
    const crNy = Math.max(0, Math.min(ROWS-1, Math.floor(ny)));
    if (ny <= 0 || ny >= ROWS || grid[gi(crNy, cc)] !== CLAIMED) patrol.vy = -patrol.vy;
    else patrol.gy = ny;
  }
}

// ── Danger level (trail color indicator) ──────────────────────
function getDanger() {
  if (!player.drawing) return 0;
  const px = player.x + 0.5, py = player.y + 0.5;
  let min = Infinity;
  for (const e of enemies) min = Math.min(min, Math.hypot(e.gx - px, e.gy - py));
  return Math.max(0, Math.min(1, (DANGER_NEAR - min) / (DANGER_NEAR - 2)));
}

// ── Collision detection ───────────────────────────────────────
function checkCollisions() {
  if (invincTimer > 0 || gameState !== 'playing') return;
  const px = player.x + 0.5, py = player.y + 0.5;

  // Enemy vs player
  for (const e of enemies) {
    if (Math.hypot(e.gx - px, e.gy - py) < 0.78) { playerDie(); return; }
    // Enemy vs trail
    const ec = Math.floor(e.gx), er = Math.floor(e.gy);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = er+dr, c = ec+dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        if (grid[gi(r, c)] === TRAIL) { playerDie(); return; }
      }
    }
  }

  // Patrol vs player — patrol only on claimed, so it can only hit player on claimed territory
  if (patrol && Math.hypot(patrol.gx - px, patrol.gy - py) < 0.82) {
    playerDie();
  }
}

// ── Game events ───────────────────────────────────────────────
function playerDie() {
  if (invincTimer > 0) return;
  lives--;
  xSFX.death();
  clearTrail();
  player.drawing = false;
  initPlayer();
  if (lives <= 0) triggerGameOver();
  else invincTimer = INVINC_MS;
  updateHUD();
}

function triggerLevelComplete() {
  gameState = 'levelcomplete';
  NeonArcade.stopMusic();
  xSFX.levelComplete();
  document.getElementById('lvl-score').textContent = 'LEVEL ' + level + ' CLEAR!';
  showOverlay('overlay-levelup');
  setTimeout(() => { level++; startLevel(); }, 2200);
}

function triggerGameOver() {
  gameState = 'gameover';
  NeonArcade.stopMusic();
  document.getElementById('go-score').textContent = 'SCORE: ' + score;
  showOverlay('overlay-gameover');
  updateHUD();
}

function startLevel() {
  initGrid();
  initPlayer();
  spawnEnemies(enemyCount(level), enemySpeed(level));
  initPatrol();
  flashCells.clear();
  captureMult = 1.0;
  stuckTimer  = 0;
  speedFlash  = 0;
  invincTimer = INVINC_MS;
  heart           = null;
  heartSpawnsLeft = 2;
  scheduleHeart();
  slowBonus      = null;
  slowSpawnsLeft = 2;
  scheduleSlowBonus();
  gameState   = 'playing';
  showOverlay(null);
  NeonArcade.startMusic();
  updateHUD();
}

function startGame() {
  score = 0; lives = INIT_LIVES; level = 1;
  NeonArcade.getAudioCtx();
  startLevel();
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score-display').textContent = score;
  document.getElementById('hi-display').textContent    = hiScore;
  document.getElementById('level-display').textContent = level;
  document.getElementById('lives-display').textContent = '♥'.repeat(Math.max(0, lives));
  const pct    = Math.floor(fillPct * 100);
  const tgtPct = Math.floor(TARGET_PCT * 100);
  document.getElementById('fill-display').textContent   = pct + '%';
  document.getElementById('target-display').textContent = '/ ' + tgtPct + '%';
  const barPct = Math.min(fillPct / TARGET_PCT * 100, 100);
  document.getElementById('fill-bar-inner').style.width = barPct + '%';
  document.getElementById('fill-bar-marker').style.left = '90%';
}

function showOverlay(id) {
  ['overlay-start','overlay-pause','overlay-levelup','overlay-gameover'].forEach(oid =>
    document.getElementById(oid).classList.toggle('hidden', oid !== id)
  );
}

// ── Rendering ─────────────────────────────────────────────────
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  // Claimed fill
  ctx.fillStyle = '#1a1a1a';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[gi(r, c)] === CLAIMED)
        ctx.fillRect(c*CELL, r*CELL, CELL, CELL);

  // Grid dots on empty
  ctx.fillStyle = 'rgba(200,200,200,0.09)';
  for (let r = 1; r < ROWS-1; r++)
    for (let c = 1; c < COLS-1; c++)
      if (grid[gi(r, c)] === EMPTY)
        ctx.fillRect(c*CELL + (CELL>>1) - 1, r*CELL + (CELL>>1) - 1, 2, 2);

  // Neon white border at claimed/empty edges
  ctx.save();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 7;
  ctx.beginPath();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[gi(r, c)] !== CLAIMED) continue;
      const x = c*CELL, y = r*CELL;
      if (r === 0      || grid[gi(r-1,c)] === EMPTY) { ctx.moveTo(x,      y);      ctx.lineTo(x+CELL, y);      }
      if (r === ROWS-1 || grid[gi(r+1,c)] === EMPTY) { ctx.moveTo(x,      y+CELL); ctx.lineTo(x+CELL, y+CELL); }
      if (c === 0      || grid[gi(r,c-1)] === EMPTY) { ctx.moveTo(x,      y);      ctx.lineTo(x,      y+CELL); }
      if (c === COLS-1 || grid[gi(r,c+1)] === EMPTY) { ctx.moveTo(x+CELL, y);      ctx.lineTo(x+CELL, y+CELL); }
    }
  }
  ctx.stroke();
  ctx.restore();

  // Capture flash
  const now = performance.now();
  for (const [idx, ts] of flashCells) {
    const age = now - ts;
    if (age > FLASH_MS) { flashCells.delete(idx); continue; }
    const alpha = (1 - age / FLASH_MS) * 0.78;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect((idx % COLS) * CELL, Math.floor(idx / COLS) * CELL, CELL, CELL);
  }

  // Trail — color shifts yellow→red as enemy approaches
  const danger     = getDanger();
  const gCh        = Math.floor(220 * (1 - danger));
  const rCh        = danger > 0.5 ? Math.floor((danger - 0.5) * 100) : 0;
  const trailColor = `rgb(255,${gCh},${rCh})`;
  ctx.save();
  ctx.fillStyle   = trailColor;
  ctx.shadowColor = trailColor;
  ctx.shadowBlur  = 10 + danger * 10;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[gi(r, c)] === TRAIL)
        ctx.fillRect(c*CELL+1, r*CELL+1, CELL-2, CELL-2);
  ctx.restore();

  // Enemies — glow brightens during speed-flash
  const flashOn   = speedFlash > 0;
  const flashAlpha = flashOn ? Math.min(1, speedFlash / SPEED_FLASH_MS) : 0;
  for (const e of enemies) {
    const ex = e.gx * CELL, ey = e.gy * CELL, rr = CELL * 0.4;
    const spd   = Math.hypot(e.vx, e.vy);
    const ratio = Math.min(1, (spd / enemySpeed(level) - 1) / (ENEMY_MAX_MULT - 1));
    ctx.save();
    const col = ratio > 0.5 ? '#ff6600' : '#ff3300';
    ctx.shadowColor = flashOn ? '#ffffff' : col;
    ctx.shadowBlur  = 14 + ratio * 14 + flashAlpha * 20;
    ctx.fillStyle   = flashOn ? `rgba(255,255,255,${0.4 + flashAlpha * 0.6})` : col;
    ctx.beginPath(); ctx.arc(ex, ey, rr, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = ratio > 0.5 ? '#ffee44' : '#ffcc44';
    ctx.beginPath(); ctx.arc(ex - rr*0.22, ey - rr*0.22, rr*0.38, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Patrol (evil white ball)
  if (patrol) {
    const ex = patrol.gx * CELL, ey = patrol.gy * CELL, rr = CELL * 0.44;
    const pulse = 0.5 + 0.5 * Math.sin(now / 200);
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 12 + pulse * 16;
    ctx.fillStyle   = `rgba(220,220,255,${0.85 + pulse * 0.15})`;
    ctx.beginPath(); ctx.arc(ex, ey, rr, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#aaddff';
    ctx.beginPath(); ctx.arc(ex - rr*0.2, ey - rr*0.2, rr*0.4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(80,100,160,0.7)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(ex - rr*0.8, ey); ctx.lineTo(ex + rr*0.8, ey);
    ctx.moveTo(ex, ey - rr*0.8); ctx.lineTo(ex, ey + rr*0.8);
    ctx.stroke();
    ctx.restore();
  }

  // Heart bonus
  if (heart) {
    const hx  = heart.gx * CELL;
    const hy  = heart.gy * CELL;
    const r   = CELL * 0.52;
    const urgency = 1 - heart.timer / HEART_DURATION_MS;
    const pulse   = 0.5 + 0.5 * Math.sin(now / (220 - urgency * 140));
    const alpha   = heart.timer < 1000 ? heart.timer / 1000 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#ff4488';
    ctx.shadowBlur  = 14 + pulse * 18;
    ctx.fillStyle   = `hsl(340, 100%, ${50 + pulse * 15}%)`;
    ctx.save();
    ctx.translate(hx, hy);
    const s = r / 10;
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo( 0, -8, -10, -8, -10, -2);
    ctx.bezierCurveTo(-10, 3,   0,  9,   0, 10);
    ctx.bezierCurveTo(  0, 9,  10,  3,  10, -2);
    ctx.bezierCurveTo( 10, -8,  0, -8,   0, -1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(hx - r * 0.28, hy - r * 0.32, r * 0.18, r * 0.11, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Slow-down bonus (snowflake)
  if (slowBonus) {
    const sx    = slowBonus.gx * CELL;
    const sy    = slowBonus.gy * CELL;
    const r     = CELL * 0.48;
    const urgency = 1 - slowBonus.timer / SLOW_DURATION_MS;
    const pulse   = 0.5 + 0.5 * Math.sin(now / (200 - urgency * 120));
    const alpha   = slowBonus.timer < 1000 ? slowBonus.timer / 1000 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `hsl(190, 100%, ${65 + pulse * 20}%)`;
    ctx.shadowColor = '#00ddff';
    ctx.shadowBlur  = 12 + pulse * 16;
    ctx.lineWidth   = Math.max(1, CELL * 0.12);
    ctx.lineCap     = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ax = sx + Math.cos(a) * r, ay = sy + Math.sin(a) * r;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay); ctx.stroke();
      for (const sign of [-1, 1]) {
        const ba = a + sign * Math.PI / 3;
        const bx = sx + Math.cos(a) * r * 0.5 + Math.cos(ba) * r * 0.28;
        const by = sy + Math.sin(a) * r * 0.5 + Math.sin(ba) * r * 0.28;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * r * 0.5, sy + Math.sin(a) * r * 0.5);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#aaeeff';
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, CELL * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Player
  const blinkHidden = invincTimer > 0 && Math.floor(invincTimer / 150) % 2 === 0;
  if (!blinkHidden) {
    const px = player.x*CELL, py = player.y*CELL, s = CELL;
    ctx.save();
    ctx.fillStyle   = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(px+s/2, py+1); ctx.lineTo(px+s-1, py+s/2);
    ctx.lineTo(px+s/2, py+s-1); ctx.lineTo(px+1, py+s/2);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px+s/2, py+s/2, s*0.14, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── Heart bonus ───────────────────────────────────────────────
function scheduleHeart() {
  heartSpawnTimer = HEART_SPAWN_MIN_MS + Math.random() * (HEART_SPAWN_MAX_MS - HEART_SPAWN_MIN_MS);
}

function trySpawnHeart() {
  // Collect interior CLAIMED cells (away from the border frame)
  const claimed = [];
  for (let r = 2; r < ROWS - 2; r++)
    for (let c = 2; c < COLS - 2; c++)
      if (grid[gi(r, c)] === CLAIMED) claimed.push({ r, c });

  if (claimed.length < 8) { scheduleHeart(); return; } // not enough territory yet

  const cell = claimed[Math.floor(Math.random() * claimed.length)];
  heart = { gx: cell.c + 0.5, gy: cell.r + 0.5, timer: HEART_DURATION_MS };
  heartSpawnsLeft--;
}

function updateHeart(dtMs) {
  if (heartSpawnsLeft <= 0 && heart === null) return;

  if (heart === null) {
    heartSpawnTimer -= dtMs;
    if (heartSpawnTimer <= 0) trySpawnHeart();
    return;
  }

  // Heart is visible — count down
  heart.timer -= dtMs;
  if (heart.timer <= 0) {
    heart = null;
    if (heartSpawnsLeft > 0) scheduleHeart();
    return;
  }

  // Collect if player is close enough
  const px = player.x + 0.5, py = player.y + 0.5;
  if (Math.hypot(heart.gx - px, heart.gy - py) < HEART_COLLECT_DIST) {
    heart = null;
    lives = Math.min(lives + 1, 9);
    updateHUD();
    xSFX.bonusLife();
    if (heartSpawnsLeft > 0) scheduleHeart();
  }
}

// ── Slow-down bonus ───────────────────────────────────────────
function scheduleSlowBonus() {
  slowSpawnTimer = SLOW_SPAWN_MIN_MS + Math.random() * (SLOW_SPAWN_MAX_MS - SLOW_SPAWN_MIN_MS);
}

function trySpawnSlowBonus() {
  const claimed = [];
  for (let r = 2; r < ROWS - 2; r++)
    for (let c = 2; c < COLS - 2; c++)
      if (grid[gi(r, c)] === CLAIMED) claimed.push({ r, c });

  if (claimed.length < 8) { scheduleSlowBonus(); return; }

  const cell = claimed[Math.floor(Math.random() * claimed.length)];
  slowBonus = { gx: cell.c + 0.5, gy: cell.r + 0.5, timer: SLOW_DURATION_MS };
  slowSpawnsLeft--;
}

function applySlowDown() {
  captureMult = Math.max(1.0, captureMult / 1.5);
  const targetSpd = enemySpeed(level) * captureMult;
  for (const e of enemies) {
    const spd = Math.hypot(e.vx, e.vy);
    if (spd < 0.001) continue;
    e.vx = e.vx / spd * targetSpd;
    e.vy = e.vy / spd * targetSpd;
  }
  if (patrol) {
    const pSpd = Math.hypot(patrol.vx, patrol.vy);
    if (pSpd > 0.001) {
      const newSpd = Math.max(PATROL_BASE_SPD, pSpd / 2);
      patrol.vx = patrol.vx / pSpd * newSpd;
      patrol.vy = patrol.vy / pSpd * newSpd;
    }
  }
}

function updateSlowBonus(dtMs) {
  if (slowSpawnsLeft <= 0 && slowBonus === null) return;

  if (slowBonus === null) {
    slowSpawnTimer -= dtMs;
    if (slowSpawnTimer <= 0) trySpawnSlowBonus();
    return;
  }

  slowBonus.timer -= dtMs;
  if (slowBonus.timer <= 0) {
    slowBonus = null;
    if (slowSpawnsLeft > 0) scheduleSlowBonus();
    return;
  }

  const px = player.x + 0.5, py = player.y + 0.5;
  if (Math.hypot(slowBonus.gx - px, slowBonus.gy - py) < SLOW_COLLECT_DIST) {
    slowBonus = null;
    applySlowDown();
    xSFX.slowDown();
    if (slowSpawnsLeft > 0) scheduleSlowBonus();
  }
}

// ── Sound effects ─────────────────────────────────────────────
const xSFX = {
  capture(area) {
    try {
      const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ac.currentTime;
      const notes = area > 60 ? [392,523,659,784,1047] : area > 25 ? [392,523,659,784] : [392,523,659];
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(bus);
        o.type = 'square';
        o.frequency.setValueAtTime(f, t + i*0.07);
        g.gain.setValueAtTime(0.22, t + i*0.07);
        g.gain.exponentialRampToValueAtTime(0.001, t + i*0.07 + 0.16);
        o.start(t + i*0.07); o.stop(t + i*0.07 + 0.18);
      });
    } catch (_) {}
  },
  death() {
    try {
      const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ac.currentTime;
      [440,370,294,220].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(bus);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t + i*0.1);
        g.gain.setValueAtTime(0.3, t + i*0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + i*0.1 + 0.18);
        o.start(t + i*0.1); o.stop(t + i*0.1 + 0.2);
      });
    } catch (_) {}
  },
  bonusLife() {
    try {
      const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ac.currentTime;
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(bus);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.08);
        g.gain.setValueAtTime(0.28, t + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.22);
        o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.25);
      });
    } catch (_) {}
  },
  slowDown() {
    try {
      const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ac.currentTime;
      [880, 698, 554, 440, 349].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(bus);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.09);
        g.gain.setValueAtTime(0.22, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.2);
      });
    } catch (_) {}
  },
  levelComplete() {
    try {
      const ac = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ac.currentTime;
      [523,659,784,1047,784,1047,1319].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(bus);
        o.type = i >= 4 ? 'sawtooth' : 'square';
        o.frequency.setValueAtTime(f, t + i*0.09);
        g.gain.setValueAtTime(0.22, t + i*0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t + i*0.09 + 0.18);
        o.start(t + i*0.09); o.stop(t + i*0.09 + 0.2);
      });
    } catch (_) {}
  },
};

// ── Input ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  if (gameState === 'start' || gameState === 'gameover') {
    if (e.key === 'Enter' || e.key === ' ') { startGame(); return; }
  }
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (gameState === 'paused' && e.key === 'Enter') { togglePause(); return; }
  if (gameState !== 'playing') return;
  switch (e.key) {
    case 'ArrowLeft':  player.dx = -1; player.dy =  0; break;
    case 'ArrowRight': player.dx =  1; player.dy =  0; break;
    case 'ArrowUp':    player.dx =  0; player.dy = -1; break;
    case 'ArrowDown':  player.dx =  0; player.dy =  1; break;
  }
});

let touchStart = null;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (gameState === 'playing') e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
  const dist = Math.hypot(dx, dy);
  touchStart = null;
  if (gameState === 'start' || gameState === 'gameover') { startGame(); return; }
  if (dist < 40 || gameState !== 'playing') return;
  if (Math.abs(dx) > Math.abs(dy)) { player.dx = dx > 0 ? 1 : -1; player.dy = 0; }
  else                              { player.dy = dy > 0 ? 1 : -1; player.dx = 0; }
}, { passive: false });

function tryFullscreen() {
  if (navigator.maxTouchPoints > 0)
    document.documentElement.requestFullscreen?.().catch(() => {});
}

// On mobile: request fullscreen on the very first user touch/click.
// requestFullscreen returns a Promise — must .catch() it to suppress unhandled rejections.
if (navigator.maxTouchPoints > 0) {
  const _doFS = () => {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen?.().catch(() => {});
  };
  document.addEventListener('touchstart', _doFS, { once: true, passive: true });
  document.addEventListener('click',      _doFS, { once: true });
}

document.getElementById('btn-start').addEventListener('click',   () => { tryFullscreen(); startGame(); });
document.getElementById('btn-restart').addEventListener('click', () => { tryFullscreen(); startGame(); });
document.getElementById('btn-resume').addEventListener('click',  () => { if (gameState === 'paused') togglePause(); });
document.getElementById('btn-pause').addEventListener('click', () => {
  if (gameState === 'playing' || gameState === 'paused') togglePause();
});
document.getElementById('music-toggle').addEventListener('click', function () {
  const { track, name } = NeonArcade.cycleTrack();
  this.textContent = '♪ ' + name;
});
document.getElementById('music-mute').addEventListener('click', function () {
  const { on } = NeonArcade.toggleMusic();
  this.textContent = on ? 'Music: ON' : 'Music: OFF';
  this.classList.toggle('off', !on);
});

function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused'; NeonArcade.stopMusic(); showOverlay('overlay-pause');
  } else if (gameState === 'paused') {
    gameState = 'playing'; NeonArcade.startMusic(); showOverlay(null); lastTs = performance.now();
  }
}

// ── Main loop ─────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;

  if (gameState === 'playing') {
    if (invincTimer > 0) invincTimer -= dt * 1000;
    if (speedFlash  > 0) speedFlash  -= dt * 1000;

    stuckTimer += dt * 1000;
    if (stuckTimer >= NUDGE_INTERVAL) { stuckTimer = 0; nudgeEnemies(); }

    stepPlayer(dt * 1000);
    updateEnemies(dt);
    updatePatrol(dt);
    updateHeart(dt * 1000);
    updateSlowBonus(dt * 1000);
    checkCollisions();
    updateHUD();
  }

  render();
}

// ── Init ──────────────────────────────────────────────────────
NeonArcade.setTrack(2);  // Xonix defaults to synth-pop

window.addEventListener('resize', () => { resizeCanvas(); render(); });
resizeCanvas();
initGrid();
render();
updateHUD();
requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
