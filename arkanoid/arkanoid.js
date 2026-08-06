/* ============================================================
   BLOCK'N'BALL — Arkanoid-style game for Neon Arcade
   ============================================================ */
'use strict';

// ── Canvas & Context ──────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

// ── Game dimensions (logical) ─────────────────────────────────
const CW = 440;
const CH = 620;

let scale = 1;
function resizeCanvas() {
  const maxW = Math.min(window.innerWidth - 32, 600);
  const maxH = window.innerHeight - 150;
  scale = Math.min(maxW / CW, maxH / CH);
  canvas.width  = Math.floor(CW * scale);
  canvas.height = Math.floor(CH * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  render();
}
window.addEventListener('resize', resizeCanvas);

// ── Game state ────────────────────────────────────────────────
let state = 'start'; // 'start' | 'playing' | 'paused' | 'gameover' | 'levelclear'
let score = 0;
let best  = (window.NeonArcade && NeonArcade.HighScore) ? NeonArcade.HighScore.getTopScore('arkanoid') : parseInt(localStorage.getItem('blockball_best') || '0', 10);
let lives = 5;
let level = 1;
let frameId = null;
let lastTime = 0;

// ── DOM refs ──────────────────────────────────────────────────
const overlayStart    = document.getElementById('overlay-start');
const overlayPause    = document.getElementById('overlay-pause');
const overlayGameover = document.getElementById('overlay-gameover');
const overlayLevelclear = document.getElementById('overlay-levelclear');
const scoreDisplay    = document.getElementById('score-display');
const bestDisplay     = document.getElementById('best-display');
const livesDisplay    = document.getElementById('lives-display');
const levelDisplay    = document.getElementById('level-display');
const finalScore      = document.getElementById('final-score');
const newBestMsg      = document.getElementById('new-best-msg');
const bonusDisplay    = document.getElementById('bonus-display');

// ── Platform ──────────────────────────────────────────────────
const PAD_H    = 14;
const PAD_BASE = 96;
const PAD_WIDE = 140;
const PAD_THIN = 60;
let pad = { x: CW / 2 - PAD_BASE / 2, y: CH - 36, w: PAD_BASE, h: PAD_H, mode: 'normal' };

// ── Ball pool ─────────────────────────────────────────────────
const BALL_R = 7.5;
const BALL_BASE_SPEED = 290; // px/s
let balls = [];

function makeBall(x, y, vx, vy) {
  return { x, y, vx, vy, stuck: false, stuckOff: 0 };
}

function resetBall() {
  balls = [makeBall(
    pad.x + pad.w / 2,
    pad.y - BALL_R - 1,
    (Math.random() < 0.5 ? 1 : -1) * BALL_BASE_SPEED * 0.6,
    -BALL_BASE_SPEED
  )];
  balls[0].stuck = true;
  balls[0].stuckOff = 0;
}

// ── Brick definitions ─────────────────────────────────────────
// Row of 10 bricks, 10 cols × 13 rows visible layout
const BRICK_COLS  = 10;
const BRICK_W     = 39;
const BRICK_H     = 16;
const BRICK_PAD   = 3;
const BRICK_LEFT  = (CW - (BRICK_COLS * (BRICK_W + BRICK_PAD) - BRICK_PAD)) / 2;
const BRICK_TOP   = 52;

// Color palette indexed 1-7
const BRICK_COLORS = [
  null,               // 0 = empty
  '#ff3366',          // 1 red     10 pts
  '#ff8800',          // 2 orange  20 pts
  '#ffff00',          // 3 yellow  30 pts
  '#00ff44',          // 4 green   40 pts
  '#00ffff',          // 5 cyan    50 pts
  '#0088ff',          // 6 blue    60 pts
  '#aa00ff',          // 7 purple  70 pts
];
const BRICK_PTS = [0, 10, 20, 30, 40, 50, 60, 70];

// Bonus capsule types that can drop from standard bricks
const BONUS_TYPES = ['E','C','S','B','D','K','P','H','T','F'];
// E=Enlarge, C=Catch, S=Slow, B=ExtraBall, D=Disrupt, K=Break, P=Life, H=Shrink, T=Turbo, F=Fireball

let bricks = [];
let capsules = [];
let enemies = [];

// ── Active bonus tracking ─────────────────────────────────────
let activeBonuses = {}; // { E: timerMs, L: timerMs, ... }

// ── Speed ramp (gradual time-based acceleration) ──────────────
// Resets when: all balls are lost, OR Slow power-up is caught.
const SPEED_RAMP_INTERVAL = 8;    // seconds between each ramp tick
const SPEED_RAMP_FACTOR   = 1.07; // +7% per tick
const SPEED_RAMP_MAX      = 2.2;  // cap at 2.2× base speed
let speedRamp      = 1.0;  // accumulated time-based multiplier
let speedRampTimer = 0;    // time since last ramp tick (seconds)
let ballBonusMult  = 1.0;  // bonus-modified multiplier (Slow: 0.65, Fast: 1.45)

// ── Levels (10 handcrafted, 10×13 grid) ──────────────────────
// Each cell: 0=empty, 1-7=colored, S=silver, G=gold, E=enemy-spawner
// 10 cols × 13 rows
const LEVELS = [
  // Level 1 — Simple rainbow grid
  [
    [0,0,0,0,0,0,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1],
    [2,2,2,2,2,2,2,2,2,2],
    [3,3,3,3,3,3,3,3,3,3],
    [4,4,4,4,4,4,4,4,4,4],
    [5,5,5,5,5,5,5,5,5,5],
    [6,6,6,6,6,6,6,6,6,6],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 2 — Checkerboard + Silver
  [
    [0,0,0,0,0,0,0,0,0,0],
    [1,0,2,0,3,0,4,0,5,0],
    [0,2,0,3,0,4,0,5,0,6],
    [1,0,2,0,3,0,4,0,5,0],
    [0,2,0,3,0,4,0,5,0,6],
    ['S',0,'S',0,'S',0,'S',0,'S',0],
    [0,'S',0,'S',0,'S',0,'S',0,'S'],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 3 — Diamond / Rhombus
  [
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,3,3,0,0,0,0],
    [0,0,0,3,4,4,3,0,0,0],
    [0,0,3,4,5,5,4,3,0,0],
    [0,3,4,5,6,6,5,4,3,0],
    [3,4,5,6,7,7,6,5,4,3],
    [0,3,4,5,6,6,5,4,3,0],
    [0,0,3,4,5,5,4,3,0,0],
    [0,0,0,3,4,4,3,0,0,0],
    [0,0,0,0,3,3,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 4 — Pyramid + Gold edges
  [
    [0,0,0,0,0,0,0,0,0,0],
    ['G',0,0,0,1,1,0,0,0,'G'],
    ['G',0,0,1,2,2,1,0,0,'G'],
    ['G',0,1,2,3,3,2,1,0,'G'],
    ['G',1,2,3,4,4,3,2,1,'G'],
    ['G','S',2,3,4,4,3,2,'S','G'],
    ['G','G','S','S','S','S','S','S','G','G'],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 5 — Cross + rings
  [
    [0,0,0,0,0,0,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,'S',0,0,0,0,0,0,'S',1],
    [1,0,'S',0,0,0,'S',0,0,1],
    [1,0,0,0,3,3,0,0,0,1],
    [1,0,0,3,4,4,3,0,0,1],
    [1,0,0,0,3,3,0,0,0,1],
    [1,0,'S',0,0,0,'S',0,0,1],
    [1,'S',0,0,0,0,0,0,'S',1],
    [1,1,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 6 — Wall with windows (dense)
  [
    [0,0,0,0,0,0,0,0,0,0],
    [6,6,6,6,6,6,6,6,6,6],
    [6,0,0,6,6,6,6,0,0,6],
    [6,0,0,6,6,6,6,0,0,6],
    [6,6,6,6,'S','S',6,6,6,6],
    [6,6,6,6,'S','S',6,6,6,6],
    [6,0,0,6,6,6,6,0,0,6],
    [6,0,0,6,6,6,6,0,0,6],
    [6,6,6,6,6,6,6,6,6,6],
    ['G',0,'G',0,'G',0,'G',0,'G',0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 7 — Castle + first enemies
  [
    ['G','G','G','G','G','G','G','G','G','G'],
    ['G',1,1,1,1,1,1,1,1,'G'],
    ['G',1,0,0,1,1,0,0,1,'G'],
    ['G',1,0,0,1,1,0,0,1,'G'],
    ['G',1,1,1,'S','S',1,1,1,'G'],
    ['G',1,'S','S',2,2,'S','S',1,'G'],
    ['G',1,1,2,2,2,2,1,1,'G'],
    ['G',1,2,2,3,3,2,2,1,'G'],
    ['G',0,'G',0,'G',0,'G',0,'G',0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,'E',0,0,0,0,'E',0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 8 — Diagonals + enemies
  [
    [1,0,0,0,0,0,0,0,0,7],
    [2,1,0,0,0,0,0,0,7,6],
    [3,2,1,0,0,0,0,7,6,5],
    [4,3,2,1,0,0,7,6,5,4],
    ['S',4,3,2,1,7,6,5,4,'S'],
    [4,3,2,1,0,0,7,6,5,4],
    [3,2,1,0,0,0,0,7,6,5],
    [2,1,0,0,0,0,0,0,7,6],
    [1,0,0,0,0,0,0,0,0,7],
    ['G',0,0,0,0,0,0,0,0,'G'],
    [0,'E',0,0,0,0,0,0,'E',0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 9 — Silver/Gold labyrinth + heavy enemies
  [
    ['G','S','G','S','G','S','G','S','G','S'],
    ['S',3,3,3,3,3,3,3,3,'G'],
    ['G',3,'S','S','S','S','S','S',3,'S'],
    ['S',3,'S',4,4,4,4,'S',3,'G'],
    ['G',3,'S',4,'S','S',4,'S',3,'S'],
    ['S',3,'S',4,'S','S',4,'S',3,'G'],
    ['G',3,'S',4,4,4,4,'S',3,'S'],
    ['S',3,'S','S','S','S','S','S',3,'G'],
    ['G',3,3,3,3,3,3,3,3,'S'],
    ['S','G','S','G','S','G','S','G','S','G'],
    [0,'E',0,'E',0,0,'E',0,'E',0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
  // Level 10 — Skull / Final (all types)
  [
    ['G','G','G','G','G','G','G','G','G','G'],
    ['G','S',7,7,'S','S',7,7,'S','G'],
    ['G',7,0,7,7,7,7,0,7,'G'],
    ['G',7,7,7,'S','S',7,7,7,'G'],
    ['G',7,0,'S',7,7,'S',0,7,'G'],
    ['G','S',7,7,7,7,7,7,'S','G'],
    ['G',7,7,7,7,7,7,7,7,'G'],
    ['G','S',7,'S','G','G','S',7,'S','G'],
    ['G',0,'G',0,'G',0,'G',0,'G',0],
    [0,0,0,0,0,0,0,0,0,0],
    ['E',0,'E',0,0,0,0,'E',0,'E'],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
];

// ── Build bricks from level data ──────────────────────────────
function buildBricks(lvl) {
  bricks   = [];
  enemies  = [];
  capsules = [];
  activeBonuses = {};
  speedRamp = 1.0; speedRampTimer = 0; ballBonusMult = 1.0;
  updateBonusHUD();

  const layout = LEVELS[lvl - 1];
  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const cell = layout[r][c];
      if (cell === 0) continue;

      const bx = BRICK_LEFT + c * (BRICK_W + BRICK_PAD);
      const by = BRICK_TOP  + r * (BRICK_H + BRICK_PAD);

      if (cell === 'E') {
        // Enemy spawn point — no brick, just register enemy
        enemies.push(makeEnemy(bx + BRICK_W / 2, by + BRICK_H / 2));
      } else {
        const type = cell === 'G' ? 'gold' : cell === 'S' ? 'silver' : 'normal';
        const hp   = type === 'silver' ? lvl : type === 'gold' ? Infinity : 1;
        const colorIdx = type === 'normal' ? cell : (type === 'silver' ? 'S' : 'G');
        const bonus = (type === 'normal' && Math.random() < 0.22) ? pickBonus() : null;
        bricks.push({ x: bx, y: by, w: BRICK_W, h: BRICK_H, type, hp, maxHp: hp, colorIdx, bonus, alive: true });
      }
    }
  }
}

function pickBonus() {
  // Positive bonuses have higher probability than negative
  const pool = ['E','E','F','F','C','S','S','B','B','D','K','P','H','T'];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Capsule ────────────────────────────────────────────────────
const CAP_W = 24, CAP_H = 12, CAP_SPEED = 110;
const CAP_COLORS = { E:'#00ffff', C:'#ffff00', S:'#00ff44', F:'#ff3300',
                     B:'#ff8800', D:'#aa00ff', K:'#ff00ff', P:'#ffffff',
                     H:'#ff2244', T:'#ff9900' };

function spawnCapsule(x, y, type) {
  capsules.push({ x, y, type, alive: true });
}

// ── Enemy (falling blobs, levels 7-10) ────────────────────────
const ENEMY_R = 10;
const ENEMY_BASE_SPEED = 75;

function makeEnemy(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const spd   = ENEMY_BASE_SPEED + level * 4;
  return {
    x, y,
    vx: Math.cos(angle) * spd,
    vy: Math.abs(Math.sin(angle)) * spd + 25,
    r: ENEMY_R,
    alive: true,
    phase: Math.random() * Math.PI * 2,
  };
}

// ── Bonus helpers ─────────────────────────────────────────────
const BONUS_DURATION = 12000; // ms most bonuses last

function applyBonus(type) {
  NeonArcade.SFX.arkanoidBonus?.();
  switch (type) {
    case 'E': // Enlarge
      clearBonus('H');
      activeBonuses.E = BONUS_DURATION;
      setPadWidth(PAD_WIDE);
      break;
    case 'H': // Shrink
      clearBonus('E');
      activeBonuses.H = BONUS_DURATION;
      setPadWidth(PAD_THIN);
      break;
    case 'C': // Catch
      activeBonuses.C = BONUS_DURATION;
      break;
    case 'S': // Slow — also resets the speed ramp to base
      clearBonus('T');
      activeBonuses.S = BONUS_DURATION;
      speedRamp = 1.0;      // reset accumulated ramp
      speedRampTimer = 0;
      ballBonusMult = 0.65;
      rescaleBalls();
      break;
    case 'T': // Turbo (Fast)
      clearBonus('S');
      activeBonuses.T = BONUS_DURATION;
      ballBonusMult = 1.45;
      rescaleBalls();
      break;
    case 'F': // Fireball
      activeBonuses.F = BONUS_DURATION;
      break;
    case 'B': // Extra Ball — spawn at current effective speed
      if (balls.length < 6) {
        const base = balls[0] || { x: pad.x + pad.w / 2, y: pad.y - BALL_R - 2, vx: 0, vy: 0 };
        const spd = effectiveSpeed();
        balls.push(makeBall(base.x, base.y, -spd * 0.8, -spd));
        balls.push(makeBall(base.x, base.y,  spd * 0.8, -spd));
      }
      break;
    case 'D': // Disrupt (3 balls) — spawn at current effective speed
      const src = balls[0] || { x: CW / 2, y: CH / 2, vx: 0, vy: -BALL_BASE_SPEED };
      while (balls.length < 3) {
        const ang = (balls.length / 3) * Math.PI;
        const spd2 = effectiveSpeed();
        balls.push(makeBall(src.x, src.y,
          Math.cos(ang) * spd2,
          -Math.abs(Math.sin(ang)) * spd2
        ));
      }
      break;
    case 'K': // Break — open exit
      openBreakExit();
      break;
    case 'P': // Extra Life
      lives = Math.min(lives + 1, 9);
      updateHUD();
      break;
  }
  updateBonusHUD();
}

function clearBonus(type) {
  if (!activeBonuses[type]) return;
  delete activeBonuses[type];
  if (type === 'E' || type === 'H') setPadWidth(PAD_BASE);
  // When Slow/Turbo expires, return bonus modifier to neutral (ramp remains intact)
  if (type === 'S' || type === 'T') { ballBonusMult = 1.0; rescaleBalls(); }
}

function setPadWidth(w) {
  pad.x = Math.max(0, Math.min(pad.x + (pad.w - w) / 2, CW - w));
  pad.w = w;
}

// Current effective ball speed (ramp × bonus modifier)
function effectiveSpeed() {
  return BALL_BASE_SPEED * speedRamp * ballBonusMult;
}

function rescaleBalls() {
  const target = effectiveSpeed();
  balls.forEach(b => {
    const spd = Math.hypot(b.vx, b.vy);
    if (spd > 0) { b.vx = b.vx / spd * target; b.vy = b.vy / spd * target; }
  });
}

// ── Break / exit portal ───────────────────────────────────────
let breakExitOpen = false;
const BREAK_EXIT_Y = -BALL_R * 2; // once a ball passes the top it clears the level

function openBreakExit() {
  breakExitOpen = true;
}

// ── Active bonus HUD string ───────────────────────────────────
function updateBonusHUD() {
  const parts = [];
  // Speed ramp indicator (shown when > 1.05)
  if (speedRamp > 1.05) {
    const pct = Math.round((speedRamp - 1) * 100);
    // bar fills left-to-right: ▌ repeats proportional to ramp
    const bars = '▮'.repeat(Math.min(Math.floor((speedRamp - 1) / (SPEED_RAMP_MAX - 1) * 8) + 1, 8));
    parts.push('SPD +' + pct + '% ' + bars);
  }
  for (const [k, ms] of Object.entries(activeBonuses)) {
    const sec = Math.ceil(ms / 1000);
    const names = { E:'WIDE', C:'CATCH', S:'SLOW', T:'TURBO', F:'FIREBALL', H:'THIN', B:'MULTI', D:'TRI', K:'BREAK' };
    if (names[k]) parts.push(names[k] + (ms < BONUS_DURATION ? ':' + sec : ''));
  }
  bonusDisplay.textContent = parts.length ? '⚡ ' + parts.join(' · ') : '';
}

// ── HUD update ────────────────────────────────────────────────
function updateHUD() {
  scoreDisplay.textContent = score;
  bestDisplay.textContent  = best;
  livesDisplay.textContent = '●'.repeat(lives);
  levelDisplay.textContent = level;
}

// ── Collision helpers ─────────────────────────────────────────
function rectBallCollide(rx, ry, rw, rh, bx, by, br) {
  const nearX = Math.max(rx, Math.min(bx, rx + rw));
  const nearY = Math.max(ry, Math.min(by, ry + rh));
  const dx = bx - nearX, dy = by - nearY;
  return dx * dx + dy * dy <= br * br;
}

function resolveBallBrick(ball, brick) {
  // Determine which face was hit by comparing overlap on each axis
  const bCX = brick.x + brick.w / 2;
  const bCY = brick.y + brick.h / 2;
  const dx   = ball.x - bCX;
  const dy   = ball.y - bCY;
  const overX = brick.w / 2 + BALL_R - Math.abs(dx);
  const overY = brick.h / 2 + BALL_R - Math.abs(dy);

  if (overX < overY) {
    ball.vx = Math.sign(dx) * Math.abs(ball.vx);
    ball.x += Math.sign(dx) * overX;
  } else {
    ball.vy = Math.sign(dy) * Math.abs(ball.vy);
    ball.y += Math.sign(dy) * overY;
  }
}

// ── Main game loop ────────────────────────────────────────────
function tick(ts) {
  if (state !== 'playing') return;
  frameId = requestAnimationFrame(tick);

  const dt = Math.min((ts - lastTime) / 1000, 0.033); // cap at 33ms
  lastTime = ts;

  update(dt);
  render();
}

function update(dt) {
  // ── Keyboard paddle movement ─────────────────────────────────
  if (keys['ArrowLeft']  || keys['KeyA']) pad.x = Math.max(0, pad.x - 420 * dt);
  if (keys['ArrowRight'] || keys['KeyD']) pad.x = Math.min(CW - pad.w, pad.x + 420 * dt);

  // ── Tick active bonuses ──────────────────────────────────────
  for (const key of Object.keys(activeBonuses)) {
    activeBonuses[key] -= dt * 1000;
    if (activeBonuses[key] <= 0) clearBonus(key);
  }

  // ── Speed ramp ───────────────────────────────────────────────
  // Only ramps when the bonus modifier is neutral (Slow/Fast handle their own speed)
  if (ballBonusMult === 1.0 && speedRamp < SPEED_RAMP_MAX) {
    speedRampTimer += dt;
    if (speedRampTimer >= SPEED_RAMP_INTERVAL) {
      speedRampTimer = 0;
      speedRamp = Math.min(speedRamp * SPEED_RAMP_FACTOR, SPEED_RAMP_MAX);
      rescaleBalls();
    }
  }

  updateBonusHUD();

  // ── Balls ─────────────────────────────────────────────────────
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (b.stuck) {
      b.x = pad.x + pad.w / 2 + b.stuckOff;
      b.y = pad.y - BALL_R - 1;
      continue;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Wall collisions
    if (b.x - BALL_R < 0)    { b.x = BALL_R;       b.vx =  Math.abs(b.vx); NeonArcade.SFX.arkanoidWall?.(); }
    if (b.x + BALL_R > CW)   { b.x = CW - BALL_R;  b.vx = -Math.abs(b.vx); NeonArcade.SFX.arkanoidWall?.(); }
    if (b.y - BALL_R < 0) {
      if (breakExitOpen) {
        // Ball escapes → level clear
        triggerLevelClear();
        return;
      }
      b.y = BALL_R; b.vy = Math.abs(b.vy);
      NeonArcade.SFX.arkanoidWall?.();
    }

    // Paddle collision
    if (rectBallCollide(pad.x, pad.y, pad.w, pad.h, b.x, b.y, BALL_R) && b.vy > 0) {
      NeonArcade.SFX.arkanoidPaddle?.();
      // Angle depends on hit position relative to pad center
      const rel   = (b.x - (pad.x + pad.w / 2)) / (pad.w / 2); // -1..1
      const angle = rel * (Math.PI * 0.38) + Math.PI * 1.5;     // point upward
      const spd   = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(angle) * spd;
      b.vy = Math.sin(angle) * spd;
      b.y  = pad.y - BALL_R - 1;

      if (activeBonuses.C) {
        b.stuck = true;
        b.stuckOff = b.x - (pad.x + pad.w / 2);
      }
    }

    // Ball lost
    if (b.y - BALL_R > CH) {
      balls.splice(i, 1);
      if (balls.length === 0) {
        loseLife();
        return;
      }
    }

    // Brick collisions
    let hitAny = false;
    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (!rectBallCollide(brick.x, brick.y, brick.w, brick.h, b.x, b.y, BALL_R)) continue;

      if (activeBonuses.F) {
        // ── FIREBALL MODE ──────────────────────────────────────────
        if (brick.type === 'normal') {
          // Destroy immediately and pierce straight through without bouncing
          brick.hp = 0;
          brick.alive = false;
          score += BRICK_PTS[brick.colorIdx] * level;
          if (score > best) { best = score; localStorage.setItem('blockball_best', best); }
          updateHUD();
          NeonArcade.SFX.arkanoidHit?.();
          if (brick.bonus) {
            spawnCapsule(brick.x + brick.w / 2 - CAP_W / 2, brick.y + brick.h / 2 - CAP_H / 2, brick.bonus);
          }
          // Do not bounce, do not break — pierce right through normal bricks!
        } else {
          // Silver or Gold brick: destroy immediately AND bounce off!
          brick.hp = 0;
          brick.alive = false;
          score += (brick.type === 'gold' ? 100 : 50) * level;
          if (score > best) { best = score; localStorage.setItem('blockball_best', best); }
          updateHUD();
          NeonArcade.SFX.arkanoidHit?.();
          if (brick.bonus) {
            spawnCapsule(brick.x + brick.w / 2 - CAP_W / 2, brick.y + brick.h / 2 - CAP_H / 2, brick.bonus);
          }
          resolveBallBrick(b, brick);
          break; // bounce off, stop checking more bricks this tick
        }
      } else {
        // ── STANDARD MODE ──────────────────────────────────────────
        if (!hitAny) {
          resolveBallBrick(b, brick);
          hitAny = true;
        }

        if (brick.type === 'gold') { NeonArcade.SFX.arkanoidWall?.(); continue; }

        brick.hp--;
        NeonArcade.SFX.arkanoidHit?.();

        if (brick.hp <= 0) {
          brick.alive = false;
          if (brick.type === 'silver') {
            score += 50 * level;
          } else {
            score += BRICK_PTS[brick.colorIdx] * level;
          }
          if (score > best) { best = score; localStorage.setItem('blockball_best', best); }
          updateHUD();

          if (brick.bonus) {
            spawnCapsule(brick.x + brick.w / 2 - CAP_W / 2, brick.y + brick.h / 2 - CAP_H / 2, brick.bonus);
          }
        }
      }
    }
  }

  // ── Capsules ──────────────────────────────────────────────────
  for (let i = capsules.length - 1; i >= 0; i--) {
    const c = capsules[i];
    if (!c.alive) { capsules.splice(i, 1); continue; }
    c.y += CAP_SPEED * dt;

    // Catch with paddle
    if (rectBallCollide(pad.x, pad.y, pad.w, pad.h, c.x + CAP_W / 2, c.y + CAP_H / 2, CAP_W / 2)) {
      applyBonus(c.type);
      c.alive = false;
    }
    // Off screen
    if (c.y > CH) c.alive = false;
  }

  // ── Enemies ───────────────────────────────────────────────────
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.alive) { enemies.splice(i, 1); continue; }
    e.phase += dt * 2;
    e.x += e.vx * dt + Math.sin(e.phase) * 0.8;
    e.y += e.vy * dt;

    // Bounce off walls
    if (e.x - e.r < 0)   { e.x = e.r;       e.vx =  Math.abs(e.vx); }
    if (e.x + e.r > CW)  { e.x = CW - e.r;  e.vx = -Math.abs(e.vx); }
    if (e.y - e.r < 0)   { e.y = e.r;        e.vy =  Math.abs(e.vy); }
    if (e.y + e.r > CH + 40) { e.alive = false; continue; }

    // Kill balls on contact
    for (let j = balls.length - 1; j >= 0; j--) {
      const b = balls[j];
      if (!b.stuck && Math.hypot(b.x - e.x, b.y - e.y) < e.r + BALL_R) {
        e.alive = false;
        balls.splice(j, 1);
        NeonArcade.SFX.arkanoidLose?.();
        if (balls.length === 0) { loseLife(); return; }
        break;
      }
    }
  }

  // ── Level clear check ─────────────────────────────────────────
  const remaining = bricks.filter(b => b.alive && b.type !== 'gold');
  if (remaining.length === 0) {
    triggerLevelClear();
  }
}

// ── Lose a life ───────────────────────────────────────────────
function loseLife() {
  NeonArcade.SFX.arkanoidLose?.();
  lives--;
  updateHUD();

  if (lives <= 0) {
    triggerGameOver();
  } else {
    // Reset pad/ball and speed ramp — ball was lost
    activeBonuses = {};
    speedRamp      = 1.0;  // ← reset ramp on life lost
    speedRampTimer = 0;
    ballBonusMult  = 1.0;
    setPadWidth(PAD_BASE);
    updateBonusHUD();
    resetBall();
    NeonArcade.stopMusic?.();
  }
}

// ── Level clear ───────────────────────────────────────────────
function triggerLevelClear() {
  NeonArcade.SFX.arkanoidLevelClear?.();
  NeonArcade.stopMusic?.();
  state = 'levelclear';
  cancelAnimationFrame(frameId);
  document.getElementById('lc-score').textContent = 'SCORE: ' + score;
  if (level >= 10) {
    document.getElementById('lc-title').textContent = 'YOU WIN!';
    document.getElementById('btn-next').textContent = '► PLAY AGAIN';
    document.getElementById('btn-next').dataset.action = 'restart';
  } else {
    document.getElementById('lc-title').textContent = 'LEVEL CLEAR!';
    document.getElementById('btn-next').textContent = '► NEXT LEVEL';
    document.getElementById('btn-next').dataset.action = 'next';
  }
  overlayLevelclear.classList.remove('hidden');
  cancelAnimationFrame(frameId);
}

// ── Game over ─────────────────────────────────────────────────
function triggerGameOver() {
  NeonArcade.SFX.gameOver?.();
  NeonArcade.stopMusic?.();
  state = 'gameover';
  cancelAnimationFrame(frameId);

  finalScore.textContent = 'SCORE: ' + score;
  newBestMsg.classList.toggle('hidden', score < best || score === 0);
  overlayGameover.classList.remove('hidden');

  if (window.NeonArcade && NeonArcade.HighScore) {
    NeonArcade.HighScore.checkAndPrompt('arkanoid', score, () => {
      best = NeonArcade.HighScore.getTopScore('arkanoid');
      updateHUD();
    });
  }
}

// ── Fire laser ────────────────────────────────────────────────
function fireLaser() {
  if (!activeBonuses.L) return;
  NeonArcade.SFX.arkanoidLaser?.();
  lasers.push({ x: pad.x + 4, y: pad.y - LASER_H });
  lasers.push({ x: pad.x + pad.w - 4 - LASER_W, y: pad.y - LASER_H });
}

// ── Render ────────────────────────────────────────────────────
function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, CW, CH);

  // Background grid effect
  ctx.strokeStyle = 'rgba(0,136,255,0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < CW; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
  for (let y = 0; y < CH; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }

  // Bricks
  for (const b of bricks) {
    if (!b.alive) continue;
    drawBrick(b);
  }

  // Capsules
  for (const c of capsules) {
    if (!c.alive) continue;
    const col = CAP_COLORS[c.type] || '#ffffff';
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.fillRect(c.x, c.y, CAP_W, CAP_H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(c.type, c.x + CAP_W / 2, c.y + CAP_H / 2 + 3);
    ctx.restore();
  }

  // Enemies
  for (const e of enemies) {
    if (!e.alive) continue;
    drawEnemy(e);
  }

  // Balls
  for (const b of balls) {
    ctx.save();
    if (activeBonuses.F) {
      // Fiery glowing aura for Fireball mode
      ctx.shadowBlur  = 22;
      ctx.shadowColor = '#ff3300';
      ctx.fillStyle   = '#ff6600';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R * 1.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffff00';
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#ffffff';
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      // Neon core
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#0088ff';
      ctx.fillStyle   = '#0088ff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Paddle
  drawPad();

  // Break exit indicator
  if (breakExitOpen) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff00ff';
    ctx.strokeStyle  = '#ff00ff';
    ctx.lineWidth    = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, 2); ctx.lineTo(CW, 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff00ff';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT OPEN', CW / 2, 18);
    ctx.restore();
  }
}

function drawBrick(b) {
  ctx.save();
  let col, shadowCol;

  if (b.type === 'gold') {
    col = '#ffd700'; shadowCol = '#ffd700';
  } else if (b.type === 'silver') {
    // Darken as HP decreases
    const t = b.hp === Infinity ? 1 : b.hp / b.maxHp;
    const v = Math.floor(160 + 60 * t);
    col = `rgb(${v},${v},${v})`; shadowCol = '#aaaaaa';
  } else {
    col = BRICK_COLORS[b.colorIdx]; shadowCol = col;
  }

  ctx.shadowBlur  = 6;
  ctx.shadowColor = shadowCol;
  ctx.fillStyle   = col;
  ctx.fillRect(b.x, b.y, b.w, b.h);

  // Highlight / edge
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(b.x, b.y, b.w, 2);
  ctx.fillRect(b.x, b.y, 2, b.h);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
  ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h);

  // Silver HP counter
  if (b.type === 'silver' && b.hp < Infinity) {
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(b.hp, b.x + b.w / 2, b.y + b.h / 2 + 3);
  }

  ctx.restore();
}

function drawPad() {
  ctx.save();
  const col = activeBonuses.E ? '#00ffff' : activeBonuses.H ? '#aa00ff' : '#0088ff';
  ctx.shadowBlur = 16; ctx.shadowColor = col;

  // Body
  const grad = ctx.createLinearGradient(pad.x, pad.y, pad.x, pad.y + pad.h);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, col);
  grad.addColorStop(1, '#003366');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(pad.x, pad.y, pad.w, pad.h, 4);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  const pulse = 0.7 + 0.3 * Math.sin(e.phase * 3);
  ctx.save();
  ctx.shadowBlur  = 12 * pulse;
  ctx.shadowColor = '#ff2244';
  ctx.fillStyle   = `rgba(255,${Math.floor(40 + 80 * pulse)},68,${pulse})`;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('☠', e.x, e.y + 4);
  ctx.restore();
}

function launchStuckBalls() {
  if (balls.some(b => b.stuck)) {
    balls.forEach(b => { b.stuck = false; });
    NeonArcade.startMusic?.();
  }
}

// ── Input — Keyboard ──────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'playing') { pauseGame(); return; }
  if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'paused')  { resumeGame(); return; }
  if (e.code === 'Space' && state === 'playing') {
    e.preventDefault();
    launchStuckBalls();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Input — Touch ─────────────────────────────────────────────
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (state !== 'playing') return;
  const rect  = canvas.getBoundingClientRect();
  const scaleX = CW / rect.width;
  const touchX = (e.touches[0].clientX - rect.left) * scaleX;
  pad.x = Math.max(0, Math.min(touchX - pad.w / 2, CW - pad.w));
}, { passive: false });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state !== 'playing') return;
  launchStuckBalls();
  // Move pad to touch position
  const rect  = canvas.getBoundingClientRect();
  const scaleX = CW / rect.width;
  const touchX = (e.touches[0].clientX - rect.left) * scaleX;
  pad.x = Math.max(0, Math.min(touchX - pad.w / 2, CW - pad.w));
}, { passive: false });

// ── Game flow ─────────────────────────────────────────────────
function startGame() {
  score = 0; lives = 5; level = 1;
  pad.w = PAD_BASE;
  pad.x = CW / 2 - pad.w / 2;
  pad.y = CH - 36;
  breakExitOpen = false;
  buildBricks(level);
  resetBall();
  updateHUD();
  NeonArcade.setTrack(1);
  NeonArcade.stopMusic?.();
  state = 'playing';
  lastTime = performance.now();
  frameId = requestAnimationFrame(tick);
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  NeonArcade.stopMusic?.();
  cancelAnimationFrame(frameId);
  overlayPause.classList.remove('hidden');
}

function resumeGame() {
  if (state !== 'paused') return;
  overlayPause.classList.add('hidden');
  if (!balls.some(b => b.stuck)) {
    NeonArcade.startMusic?.();
  }
  state = 'playing';
  lastTime = performance.now();
  frameId = requestAnimationFrame(tick);
}

function nextLevel() {
  overlayLevelclear.classList.add('hidden');
  level++;
  if (level > 10) level = 1;
  breakExitOpen = false;
  pad.w = PAD_BASE;
  pad.x = CW / 2 - pad.w / 2;
  activeBonuses  = {};
  speedRamp      = 1.0;  // fresh ramp for new level
  speedRampTimer = 0;
  ballBonusMult  = 1.0;
  updateBonusHUD();
  buildBricks(level);
  resetBall();
  updateHUD();
  NeonArcade.stopMusic?.();
  state = 'playing';
  lastTime = performance.now();
  frameId = requestAnimationFrame(tick);
}

// ── Button wiring ─────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  overlayStart.classList.add('hidden');
  startGame();
});

document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-pause').addEventListener('click', () => {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  overlayGameover.classList.add('hidden');
  startGame();
});

document.getElementById('btn-next').addEventListener('click', () => {
  const action = document.getElementById('btn-next').dataset.action;
  if (action === 'restart') {
    overlayLevelclear.classList.add('hidden');
    startGame();
  } else {
    nextLevel();
  }
});

// ── Music button ──────────────────────────────────────────────
document.getElementById('music-mute').addEventListener('click', function () {
  const { on } = NeonArcade.toggleMusic();
  this.textContent = on ? 'Music: ON' : 'Music: OFF';
  this.classList.toggle('off', !on);
});

// ── Initial display & boot ───────────────────────────────────
if (window.NeonArcade && NeonArcade.HighScore) {
  best = NeonArcade.HighScore.getTopScore('arkanoid');
}
bestDisplay.textContent = best;
buildBricks(1);
resetBall();
updateHUD();
resizeCanvas();
render();

window.addEventListener('load', () => {
  if (window.NeonArcade && NeonArcade.HighScore) {
    best = NeonArcade.HighScore.getTopScore('arkanoid');
    bestDisplay.textContent = best;
  }
  resizeCanvas();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
