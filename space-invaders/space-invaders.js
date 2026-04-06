'use strict';

// ── Canvas ────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

// ── Logical dimensions ────────────────────────────────────────
const LW = 600;
const LH = 760;

// ── Colors ───────────────────────────────────────────────────
const C_GREEN   = '#00ff44';
const C_DKGREEN = '#00aa2a';
const C_CYAN    = '#00ffff';
const C_MAGENTA = '#ff00ff';
const C_YELLOW  = '#ffff00';
const C_WHITE   = '#ffffff';
const C_RED     = '#ff3344';
const C_ORANGE  = '#ff8800';

// ── Alien sprite data (11 cols × 8 rows, 2 frames each) ──────
const SPRITES = [
  [ // Type 0 – Squid, frame A
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,0],
    [1,1,0,1,1,1,1,1,0,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [0,0,1,1,0,0,0,1,1,0,0],
    [0,1,1,0,1,1,1,0,1,1,0],
    [1,1,0,0,0,0,0,0,0,1,1],
    [0,1,0,0,0,0,0,0,0,1,0],
  ],
  [ // Type 0 – Squid, frame B
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,0],
    [1,1,0,1,1,1,1,1,0,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [0,0,1,1,0,0,0,1,1,0,0],
    [0,0,1,0,1,1,1,0,1,0,0],
    [0,1,0,0,0,0,0,0,0,1,0],
    [1,0,0,0,0,0,0,0,0,0,1],
  ],
  [ // Type 1 – Crab, frame A
    [0,0,1,0,0,0,0,0,1,0,0],
    [0,0,0,1,0,0,0,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,0,0],
    [0,1,1,0,1,1,1,0,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,0,1,1,1,1,1,1,1,0,1],
    [1,0,1,0,0,0,0,0,1,0,1],
    [0,0,0,1,1,0,1,1,0,0,0],
  ],
  [ // Type 1 – Crab, frame B
    [0,0,1,0,0,0,0,0,1,0,0],
    [1,0,0,1,0,0,0,1,0,0,1],
    [1,0,1,1,1,1,1,1,1,0,1],
    [1,1,1,0,1,1,1,0,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,0,0,0,0,0,1,0,0],
    [0,1,0,0,0,0,0,0,0,1,0],
  ],
  [ // Type 2 – Octopus, frame A
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,1,0,1,1,1,1,1,0,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [0,0,1,1,0,0,0,1,1,0,0],
    [0,1,1,0,0,0,0,0,1,1,0],
    [1,1,0,0,0,0,0,0,0,1,1],
  ],
  [ // Type 2 – Octopus, frame B
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,1,0,1,1,1,1,1,0,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [0,0,1,1,0,0,0,1,1,0,0],
    [1,1,0,0,0,0,0,0,0,1,1],
    [0,1,1,0,0,0,0,0,1,1,0],
  ],
];

// UFO sprite (16 × 7)
const UFO_SP = [
  [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,0,1,1,0,0,1,1,0,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,0,1,0,0,0,0,1,0,1,1,0,0],
  [0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0],
  [0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0],
];

// ── Layout constants (logical pixels) ────────────────────────
const ALIEN_COLS   = 11;
const ALIEN_ROWS   = 5;
const SP_PX        = 3;
const SP_W         = 11 * SP_PX;   // 33
const SP_H         = 8  * SP_PX;   // 24
const STRIDE_X     = 47;
const STRIDE_Y     = 36;
const FORM_W       = (ALIEN_COLS - 1) * STRIDE_X + SP_W;  // 503
const FORM_START_X = Math.round((LW - FORM_W) / 2);       // ~49
const FORM_START_Y = 90;

const PLAYER_W   = 48;
const PLAYER_H   = 22;
const PLAYER_Y   = LH - 75;
const PLAYER_SPD = 220;

const BULLET_W   = 4;
const P_BULL_H   = 18;
const A_BULL_H   = 14;
const P_BULL_SPD = 460;
const A_BULL_SPD = 160;

const SH_COLS   = 13;
const SH_ROWS   = 8;
const SH_CELL   = 5;
const SH_W      = SH_COLS * SH_CELL;  // 65
const SH_H      = SH_ROWS * SH_CELL;  // 40
const SH_Y      = PLAYER_Y - 90;
const SHIELD_XS = [68, 201, 334, 467];

const UFO_W   = 48;
const UFO_H   = 21;
const UFO_Y   = 50;
const UFO_SPD = 90;

const ROW_TYPE  = [0, 1, 1, 2, 2];
const TYPE_PTS  = [30, 20, 10];


const MARCH_FREQS = [400, 500, 600, 500];

// ── Power-up constants ────────────────────────────────────────
const PU_FALL_SPD    = 75;
const PU_W           = 36;
const PU_H           = 16;
const PU_DURATION    = 10;    // seconds
const PU_DROP_CHANCE = 0.15;  // per alien kill
// kind: 'RAPID' | 'SPREAD'
const PU_COLOR = { RAPID: C_CYAN, SPREAD: C_ORANGE };

// ── Game state ────────────────────────────────────────────────
let gameState = 'start';
let score = 0;
let hiScore = parseInt(localStorage.getItem('si-hi') || '0');
let lives = 3;
let level = 1;

let aliens       = [];
let formX        = FORM_START_X;
let formY        = FORM_START_Y;
let formDir      = 1;
let formDropPending = false;
let alienAnim    = 0;
let stepTimer    = 0;
let marchStep    = 0;

let playerX      = (LW - PLAYER_W) / 2;
let playerBullets = [];   // [{x, y, vx, vy}]
let rapidCooldown = 0;    // shoot cooldown for RAPID power-up

let alienBullets = [];
let alienFireTimer = 0;

let ufo = { active: false, x: 0, dir: 1, timer: 0 };

let shields  = [];
let flashes  = [];        // [{x, y, t}]

let powerups     = [];    // [{x, y, kind}]  — falling capsules
let activePowerup = null; // {kind, timer}   — currently active

let waveColors = ['#00ffff', '#00ff44', '#00aa2a']; // randomised per wave

// ── Input ─────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP') {
    if (gameState === 'playing' || gameState === 'paused') togglePause();
  }
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ── SFX ───────────────────────────────────────────────────────
function sfxShoot() {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    const osc = ctx2.createOscillator(), gain = ctx2.createGain();
    osc.connect(gain); gain.connect(bus);
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.12);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.start(t); osc.stop(t + 0.15);
  } catch(_) {}
}

function sfxExplode() {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    const buf = ctx2.createBuffer(1, ctx2.sampleRate * 0.2, ctx2.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx2.createBufferSource(); src.buffer = buf;
    const filt = ctx2.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 600; filt.Q.value = 0.8;
    const gain = ctx2.createGain();
    src.connect(filt); filt.connect(gain); gain.connect(bus);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.start(t); src.stop(t + 0.2);
  } catch(_) {}
}

function sfxPlayerDeath() {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    [0, 0.15, 0.3, 0.45, 0.6].forEach((dt, i) => {
      const osc = ctx2.createOscillator(), gain = ctx2.createGain();
      osc.connect(gain); gain.connect(bus);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300 - i * 40, t + dt);
      gain.gain.setValueAtTime(0.3, t + dt);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.13);
      osc.start(t + dt); osc.stop(t + dt + 0.15);
    });
  } catch(_) {}
}

function sfxMarch(step) {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    const osc = ctx2.createOscillator(), gain = ctx2.createGain();
    osc.connect(gain); gain.connect(bus);
    osc.type = 'square';
    osc.frequency.setValueAtTime(MARCH_FREQS[step % 4], t);
    gain.gain.setValueAtTime(0.10, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.start(t); osc.stop(t + 0.045);
  } catch(_) {}
}

function sfxUfo() {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    const osc = ctx2.createOscillator(), gain = ctx2.createGain();
    osc.connect(gain); gain.connect(bus);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(280, t + 0.15);
    osc.frequency.linearRampToValueAtTime(220, t + 0.3);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.start(t); osc.stop(t + 0.33);
  } catch(_) {}
}

function sfxPowerupCollect(kind) {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    const freqs = kind === 'RAPID'
      ? [440, 550, 660, 880]
      : [440, 660, 550, 770];
    freqs.forEach((f, i) => {
      const osc = ctx2.createOscillator(), gain = ctx2.createGain();
      osc.connect(gain); gain.connect(bus);
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, t + i * 0.07);
      gain.gain.setValueAtTime(0.2, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.1);
      osc.start(t + i * 0.07); osc.stop(t + i * 0.07 + 0.12);
    });
  } catch(_) {}
}


function sfxWaveClear() {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      const osc = ctx2.createOscillator(), gain = ctx2.createGain();
      osc.connect(gain); gain.connect(bus);
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, t + i * 0.10);
      gain.gain.setValueAtTime(0.18, t + i * 0.10);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.10 + 0.18);
      osc.start(t + i * 0.10); osc.stop(t + i * 0.10 + 0.20);
    });
  } catch(_) {}
}

function sfxGameOver() {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    [440, 370, 311, 277, 220].forEach((f, i) => {
      const osc = ctx2.createOscillator(), gain = ctx2.createGain();
      osc.connect(gain); gain.connect(bus);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t + i * 0.18);
      gain.gain.setValueAtTime(0.22, t + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 0.30);
      osc.start(t + i * 0.18); osc.stop(t + i * 0.18 + 0.32);
    });
  } catch(_) {}
}

function sfxPowerupExpire() {
  try {
    const ctx2 = NeonArcade.getAudioCtx(), bus = NeonArcade.getMasterBus(), t = ctx2.currentTime;
    [880, 660, 440, 330].forEach((f, i) => {
      const osc = ctx2.createOscillator(), gain = ctx2.createGain();
      osc.connect(gain); gain.connect(bus);
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, t + i * 0.06);
      gain.gain.setValueAtTime(0.15, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.08);
      osc.start(t + i * 0.06); osc.stop(t + i * 0.06 + 0.1);
    });
  } catch(_) {}
}

// ── Canvas resize ─────────────────────────────────────────────
function resizeCanvas() {
  const mobile  = navigator.maxTouchPoints > 0;
  const maxW    = mobile ? Math.min(window.innerWidth * 0.42, 560)
                         : Math.min(window.innerWidth - 240, 700);
  const maxH    = mobile ? Math.max(200, window.innerHeight - 68)
                         : Math.max(300, window.innerHeight - 160);
  const aspect  = LW / LH;
  let w = Math.min(maxW, maxH * aspect);
  let h = w / aspect;
  canvas.width  = Math.round(w);
  canvas.height = Math.round(h);
}

// ── Shield builder ────────────────────────────────────────────
function buildShield(sx, sy) {
  const cells = [];
  for (let r = 0; r < SH_ROWS; r++) {
    cells[r] = [];
    for (let c = 0; c < SH_COLS; c++) {
      const inCutout = r >= 5 && c >= 4 && c <= 8;
      const topLeft  = (r === 0 && c <= 1) || (r === 1 && c === 0);
      const topRight = (r === 0 && c >= SH_COLS - 2) || (r === 1 && c === SH_COLS - 1);
      cells[r][c] = !inCutout && !topLeft && !topRight;
    }
  }
  return { x: sx, y: sy, cells };
}

// ── Init ──────────────────────────────────────────────────────
function initGame(keepLevel) {
  if (!keepLevel) level = 1;
  score = 0;
  lives = 3;
  initLevel();
}

// ── Geometric formation builder ───────────────────────────────
// Shapes: random, rectangle, triangle (up), triangle_inv (down), oval, diamond
function buildFormation(rowTypes) {
  const SHAPES = ['random', 'rectangle', 'triangle', 'triangle_inv', 'oval', 'diamond'];
  const shape  = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const cx = Math.floor(ALIEN_COLS / 2);  // 5  (horizontal centre)
  const cy = Math.floor(ALIEN_ROWS / 2);  // 2  (vertical centre)

  // Pre-compute per-shape params once
  let r0, c0, rW, rH, rndRate;
  if (shape === 'rectangle') {
    rW  = 5 + Math.floor(Math.random() * 7);           // 5–11 cols
    rH  = 2 + Math.floor(Math.random() * 4);           // 2–5 rows
    c0  = Math.floor((ALIEN_COLS - rW) / 2);
    r0  = Math.floor((ALIEN_ROWS - rH) / 2);
  } else if (shape === 'random') {
    rndRate = 0.55 + Math.random() * 0.40;             // 55–95 % fill
  }

  function inShape(row, col) {
    switch (shape) {
      case 'random':
        return Math.random() < rndRate;
      case 'rectangle':
        return col >= c0 && col < c0 + rW && row >= r0 && row < r0 + rH;
      case 'triangle':      // pyramid — wide at bottom, tip at top
        return Math.abs(col - cx) <= row * (cx / (ALIEN_ROWS - 1)) + 0.5;
      case 'triangle_inv':  // inverted — wide at top, tip at bottom
        return Math.abs(col - cx) <= (ALIEN_ROWS - 1 - row) * (cx / (ALIEN_ROWS - 1)) + 0.5;
      case 'oval': {        // ellipse fitted to grid (wider than tall)
        const dx = col - cx, dy = row - cy;
        return (dx * dx) / (cx * cx) + (dy * dy) / (cy * cy) <= 1.1;
      }
      case 'diamond': {     // rotated square / rhombus
        return Math.abs(col - cx) / cx + Math.abs(row - cy) / (cy + 0.5) <= 1;
      }
      default: return true;
    }
  }

  const list = [];
  for (let row = 0; row < ALIEN_ROWS; row++)
    for (let col = 0; col < ALIEN_COLS; col++)
      if (inShape(row, col))
        list.push({ row, col, type: rowTypes[row], alive: true,
          x: col * STRIDE_X, y: row * STRIDE_Y });

  // Fallback: fill entire grid if fewer than 20 aliens
  if (list.length < 20) {
    list.length = 0;
    for (let row = 0; row < ALIEN_ROWS; row++)
      for (let col = 0; col < ALIEN_COLS; col++)
        list.push({ row, col, type: rowTypes[row], alive: true,
          x: col * STRIDE_X, y: row * STRIDE_Y });
  }
  return list;
}

function initLevel() {
  // ── Randomise wave colors (3 distinct colors for the 3 alien types) ──
  const palette = [C_GREEN, C_CYAN, C_MAGENTA, C_YELLOW, C_RED, C_ORANGE];
  const shuffled = palette.slice().sort(() => Math.random() - 0.5);
  waveColors = [shuffled[0], shuffled[1], shuffled[2]];

  // ── Build formation in a random geometric shape ───────────────────────
  const rowTypes = [0, 1, 1, 2, 2].sort(() => Math.random() - 0.5);
  aliens = buildFormation(rowTypes);

  // Random starting X offset (±30 px from center)
  const startX = FORM_START_X + Math.floor(Math.random() * 60) - 30;
  formX = Math.max(4, Math.min(LW - FORM_W - 4, startX));
  formY = FORM_START_Y + Math.min((level - 1) * 12, 60);
  formDir = 1;
  formDropPending = false;
  alienAnim = 0;
  stepTimer = Math.max(0.08, 0.6 - (level - 1) * 0.06);
  marchStep = 0;
  alienBullets = [];
  alienFireTimer = 1.5;
  playerBullets = [];
  rapidCooldown = 0;
  flashes = [];
  powerups = [];
  activePowerup = null;
  playerX = (LW - PLAYER_W) / 2;


  if (level === 1 || shields.every(s => s.cells.flat().every(c => !c))) {
    shields = SHIELD_XS.map(sx => buildShield(sx, SH_Y));
  }

  ufo = { active: false, x: -UFO_W, dir: 1, timer: randomUfoDelay() };
}

function randomUfoDelay() { return 15 + Math.random() * 20; }
function aliveCount() { return aliens.filter(a => a.alive).length; }

function currentStepInterval() {
  const alive = aliveCount();
  const base  = Math.max(0.08, 0.6 - (level - 1) * 0.06);
  return Math.max(0.04, base * (alive / (ALIEN_COLS * ALIEN_ROWS)));
}

// ── Shoot logic (normal / RAPID / SPREAD) ─────────────────────
function tryShoot() {
  const kind = activePowerup?.kind;
  if (kind === 'SPREAD') {
    if (rapidCooldown > 0) return;
    const cx  = playerX + PLAYER_W / 2 - BULLET_W / 2;
    const ang = 0.28;  // spread half-angle in radians (~16°)
    playerBullets.push({ x: cx, y: PLAYER_Y, vx: 0, vy: -P_BULL_SPD });
    playerBullets.push({ x: cx, y: PLAYER_Y,
      vx: -P_BULL_SPD * Math.sin(ang), vy: -P_BULL_SPD * Math.cos(ang) });
    playerBullets.push({ x: cx, y: PLAYER_Y,
      vx:  P_BULL_SPD * Math.sin(ang), vy: -P_BULL_SPD * Math.cos(ang) });
    rapidCooldown = 0.35;
    sfxShoot();
  } else if (kind === 'RAPID') {
    if (rapidCooldown > 0 || playerBullets.length >= 4) return;
    playerBullets.push({ x: playerX + PLAYER_W / 2 - BULLET_W / 2,
      y: PLAYER_Y, vx: 0, vy: -P_BULL_SPD });
    rapidCooldown = 0.12;
    sfxShoot();
  } else {
    // Normal: one bullet at a time
    if (playerBullets.length === 0) {
      playerBullets.push({ x: playerX + PLAYER_W / 2 - BULLET_W / 2,
        y: PLAYER_Y, vx: 0, vy: -P_BULL_SPD });
      sfxShoot();
    }
  }
}

// ── Collision helpers ─────────────────────────────────────────
function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ── Update ────────────────────────────────────────────────────
let lastTs = 0;
let invincTimer = 0;

function update(dt) {
  if (gameState !== 'playing') return;

  // Player movement
  if (keys['ArrowLeft']  || keys['KeyA']) playerX = Math.max(0, playerX - PLAYER_SPD * dt);
  if (keys['ArrowRight'] || keys['KeyD']) playerX = Math.min(LW - PLAYER_W, playerX + PLAYER_SPD * dt);

  // Shoot
  if (keys['Space']) tryShoot();

  // Timers
  if (invincTimer  > 0) invincTimer  -= dt;
  if (rapidCooldown > 0) rapidCooldown -= dt;

  // Active power-up countdown
  if (activePowerup) {
    activePowerup.timer -= dt;
    if (activePowerup.timer <= 0) {
      activePowerup = null;
      sfxPowerupExpire();
    }
  }

  // Player bullets
  for (const b of playerBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  playerBullets = playerBullets.filter(b => b.y + P_BULL_H > 0 && b.x > -10 && b.x < LW + 10);

  // Alien step
  stepTimer -= dt;
  if (stepTimer <= 0) {
    stepTimer = currentStepInterval();
    alienAnim ^= 1;
    sfxMarch(marchStep);
    marchStep = (marchStep + 1) % 4;
    moveAliens();
  }

  // Alien fire
  alienFireTimer -= dt;
  if (alienFireTimer <= 0) {
    alienFireTimer = Math.max(0.5, 1.8 - level * 0.12);
    fireAlienBullet();
  }

  // Alien bullets
  for (const b of alienBullets) b.y += A_BULL_SPD * dt;
  alienBullets = alienBullets.filter(b => b.y < LH);

  // Falling power-ups
  for (const p of powerups) p.y += PU_FALL_SPD * dt;
  powerups = powerups.filter(p => p.y < LH);

  // UFO
  updateUfo(dt);


  // Flashes
  flashes = flashes.filter(f => { f.t -= dt; return f.t > 0; });

  // Collisions
  handleCollisions();

  // Win condition
  if (aliveCount() === 0) {
    gameState = 'levelup';
    level++;
    sfxWaveClear();
    showOverlay('overlay-levelup');
    setTimeout(() => {
      initLevel();
      gameState = 'playing';
      showOverlay(null);
    }, 2200);
  }

  updateHUD();
}

function moveAliens() {
  let minCol = ALIEN_COLS, maxCol = -1;
  for (const a of aliens) {
    if (!a.alive) continue;
    if (a.col < minCol) minCol = a.col;
    if (a.col > maxCol) maxCol = a.col;
  }
  if (minCol > maxCol) return;

  if (formDropPending) {
    formY += 12;
    formDir *= -1;
    formDropPending = false;
  } else {
    formX += formDir * 8;
    const leftEdge  = formX + minCol * STRIDE_X;
    const rightEdge = formX + maxCol * STRIDE_X + SP_W;
    if (rightEdge >= LW - 4 || leftEdge <= 4) formDropPending = true;
  }

  for (const a of aliens) {
    if (!a.alive) continue;
    if (formY + a.y + SP_H >= PLAYER_Y - 4) { triggerGameOver(); return; }
  }
}

function fireAlienBullet() {
  const bottomInCol = {};
  for (const a of aliens) {
    if (!a.alive) continue;
    if (bottomInCol[a.col] === undefined || a.row > bottomInCol[a.col].row)
      bottomInCol[a.col] = a;
  }
  const candidates = Object.values(bottomInCol);
  if (!candidates.length) return;
  const s = candidates[Math.floor(Math.random() * candidates.length)];
  alienBullets.push({ x: formX + s.x + SP_W / 2 - BULLET_W / 2, y: formY + s.y + SP_H });
}

function updateUfo(dt) {
  if (!ufo.active) {
    ufo.timer -= dt;
    if (ufo.timer <= 0) {
      ufo.active = true;
      ufo.dir    = Math.random() < 0.5 ? 1 : -1;
      ufo.x      = ufo.dir === 1 ? -UFO_W : LW + UFO_W;
    }
  } else {
    ufo.x += ufo.dir * UFO_SPD * dt;
    if (ufo.x > LW + UFO_W || ufo.x < -UFO_W * 2) {
      ufo.active = false;
      ufo.timer  = randomUfoDelay();
    }
    if (Math.floor(ufo.x / 20) % 2 === 0 && Math.random() < 0.04) sfxUfo();
  }
}


function spawnPowerup(ax, ay) {
  // No drop if a power-up is already active or already falling
  if (activePowerup || powerups.length > 0) return;
  if (Math.random() >= PU_DROP_CHANCE) return;
  const kind = Math.random() < 0.5 ? 'RAPID' : 'SPREAD';
  powerups.push({ x: ax + SP_W / 2 - PU_W / 2, y: ay + SP_H, kind });
}

function handleCollisions() {
  // Player bullets vs aliens
  for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
    const b = playerBullets[bi];
    let hit = false;
    for (const a of aliens) {
      if (!a.alive) continue;
      const ax = formX + a.x, ay = formY + a.y;
      if (rectHit(b.x, b.y, BULLET_W, P_BULL_H, ax, ay, SP_W, SP_H)) {
        a.alive = false;
        score += TYPE_PTS[a.type];
        flashes.push({ x: ax, y: ay, t: 0.25 });
        sfxExplode();
        spawnPowerup(ax, ay);
        hit = true;
        break;
      }
    }
    if (hit) { playerBullets.splice(bi, 1); continue; }

    // vs UFO
    if (ufo.active && rectHit(b.x, b.y, BULLET_W, P_BULL_H, ufo.x, UFO_Y, UFO_W, UFO_H)) {
      const pts = [50, 100, 150, 200, 300][Math.floor(Math.random() * 5)];
      score += pts;
      flashes.push({ x: ufo.x, y: UFO_Y, t: 0.4 });
      ufo.active = false; ufo.timer = randomUfoDelay();
      sfxExplode();
      playerBullets.splice(bi, 1); continue;
    }

    // vs shields
    let shieldHit = false;
    for (const sh of shields) {
      if (bulletVsShield(b, sh)) { shieldHit = true; break; }
    }
    if (shieldHit) { playerBullets.splice(bi, 1); continue; }
  }

  // Alien bullets vs player
  if (invincTimer <= 0) {
    for (let i = alienBullets.length - 1; i >= 0; i--) {
      const b = alienBullets[i];
      if (rectHit(b.x, b.y, BULLET_W, A_BULL_H, playerX, PLAYER_Y, PLAYER_W, PLAYER_H)) {
        alienBullets.splice(i, 1);
        playerHit();
        break;
      }
    }
  }

  // Alien bullets vs shields
  for (let i = alienBullets.length - 1; i >= 0; i--) {
    let hit = false;
    for (const sh of shields) { if (bulletVsShield(alienBullets[i], sh)) { hit = true; break; } }
    if (hit) alienBullets.splice(i, 1);
  }

  // Aliens eroding shields
  for (const a of aliens) {
    if (!a.alive) continue;
    const ax = formX + a.x, ay = formY + a.y;
    for (const sh of shields) erodeShieldUnder(ax, ay, SP_W, SP_H, sh);
  }

  // Player collecting power-ups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    if (rectHit(p.x, p.y, PU_W, PU_H, playerX, PLAYER_Y, PLAYER_W, PLAYER_H)) {
      activePowerup = { kind: p.kind, timer: PU_DURATION };
      rapidCooldown = 0;
      sfxPowerupCollect(p.kind);
      powerups.splice(i, 1);
    }
  }
}

function bulletVsShield(bullet, sh) {
  const bx = bullet.x - sh.x, by = bullet.y - sh.y;
  for (let dy = 0; dy < Math.ceil(P_BULL_H / SH_CELL) + 1; dy++) {
    const r = Math.floor((by + dy * SH_CELL) / SH_CELL);
    if (r < 0 || r >= SH_ROWS) continue;
    const c = Math.floor((bx + BULLET_W / 2) / SH_CELL);
    if (c < 0 || c >= SH_COLS) continue;
    if (sh.cells[r][c]) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SH_ROWS && nc >= 0 && nc < SH_COLS) sh.cells[nr][nc] = false;
      }
      return true;
    }
  }
  return false;
}

function erodeShieldUnder(ax, ay, aw, ah, sh) {
  if (!(ax < sh.x + SH_W && ax + aw > sh.x && ay < sh.y + SH_H && ay + ah > sh.y)) return;
  for (let r = SH_ROWS - 2; r < SH_ROWS; r++) {
    for (let c = 0; c < SH_COLS; c++) {
      const px = sh.x + c * SH_CELL;
      if (px >= ax && px < ax + aw) sh.cells[r][c] = false;
    }
  }
}

function playerHit() {
  lives--;
  invincTimer = 2.0;
  activePowerup = null;   // losing a life clears the power-up
  sfxPlayerDeath();
  flashes.push({ x: playerX, y: PLAYER_Y, t: 0.6 });
  if (lives <= 0) setTimeout(triggerGameOver, 700);
  updateHUD();
}

function triggerGameOver() {
  if (gameState === 'gameover') return;
  if (score > hiScore) { hiScore = score; localStorage.setItem('si-hi', hiScore); }
  gameState = 'gameover';
  document.getElementById('go-score').textContent = 'SCORE: ' + score;
  document.getElementById('new-best-msg').style.display = score >= hiScore && score > 0 ? 'block' : 'none';
  showOverlay('overlay-gameover');
  NeonArcade.stopMusic();
  sfxGameOver();
}

function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused'; NeonArcade.stopMusic(); showOverlay('overlay-pause');
  } else if (gameState === 'paused') {
    gameState = 'playing'; NeonArcade.startMusic(); showOverlay(null);
  }
}

function showOverlay(id) {
  ['overlay-start','overlay-pause','overlay-levelup','overlay-gameover'].forEach(oid =>
    document.getElementById(oid).classList.toggle('hidden', oid !== id));
}

function updateHUD() {
  document.getElementById('score-display').textContent = score;
  document.getElementById('hi-display').textContent    = Math.max(score, hiScore);
  document.getElementById('lives-display').textContent = '♥'.repeat(Math.max(0, lives));
  document.getElementById('level-display').textContent = level;
}

// ── Render ────────────────────────────────────────────────────
function drawSprite(spriteIdx, sx, sy, color) {
  const sp = SPRITES[spriteIdx];
  ctx.fillStyle = color;
  for (let r = 0; r < sp.length; r++)
    for (let c = 0; c < sp[r].length; c++)
      if (sp[r][c]) ctx.fillRect(sx + c * SP_PX, sy + r * SP_PX, SP_PX, SP_PX);
}

function drawUfoSprite(sx, sy) {
  ctx.fillStyle = C_MAGENTA;
  for (let r = 0; r < UFO_SP.length; r++)
    for (let c = 0; c < UFO_SP[r].length; c++)
      if (UFO_SP[r][c]) ctx.fillRect(sx + c * SP_PX, sy + r * SP_PX, SP_PX, SP_PX);
}

function drawPlayer() {
  if (invincTimer > 0 && Math.floor(invincTimer * 8) % 2 === 0) return;
  // Tint the cannon if a power-up is active
  const color = activePowerup ? PU_COLOR[activePowerup.kind] : C_CYAN;
  ctx.fillStyle = color;
  ctx.fillRect(playerX + 8, PLAYER_Y, PLAYER_W - 16, PLAYER_H - 5);
  ctx.fillRect(playerX + PLAYER_W / 2 - 3, PLAYER_Y - 7, 6, 8);
  ctx.fillRect(playerX, PLAYER_Y + PLAYER_H - 7, PLAYER_W, 7);
  ctx.shadowColor = color;
  ctx.shadowBlur  = activePowerup ? 18 : 10;
  ctx.fillRect(playerX + 8, PLAYER_Y, PLAYER_W - 16, PLAYER_H - 5);
  ctx.shadowBlur = 0;
}

function drawShields() {
  ctx.fillStyle = C_GREEN;
  for (const sh of shields)
    for (let r = 0; r < SH_ROWS; r++)
      for (let c = 0; c < SH_COLS; c++)
        if (sh.cells[r][c])
          ctx.fillRect(sh.x + c * SH_CELL, sh.y + r * SH_CELL, SH_CELL - 1, SH_CELL - 1);
}

function drawGroundLine() {
  ctx.strokeStyle = C_GREEN;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, PLAYER_Y + PLAYER_H + 4);
  ctx.lineTo(LW, PLAYER_Y + PLAYER_H + 4);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawFlashes() {
  for (const f of flashes) {
    ctx.globalAlpha = Math.min(1, f.t * 4);
    ctx.strokeStyle = C_YELLOW;
    ctx.lineWidth   = 2;
    const cx = f.x + SP_W / 2, cy = f.y + SP_H / 2, r = 10;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
    ctx.moveTo(cx, cy - r);     ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r, cy);     ctx.lineTo(cx + r, cy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPowerups() {
  for (const p of powerups) {
    const col = PU_COLOR[p.kind];
    // Pulsing alpha
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 120);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.strokeRect(p.x, p.y, PU_W, PU_H);
    ctx.fillStyle = col + '33';
    ctx.fillRect(p.x, p.y, PU_W, PU_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = 'bold 8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.kind, p.x + PU_W / 2, p.y + PU_H / 2);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawPowerupHUD() {
  if (!activePowerup) return;
  const col      = PU_COLOR[activePowerup.kind];
  const barW     = 120;
  const barH     = 10;
  const bx       = LW / 2 - barW / 2;
  const by       = PLAYER_Y + PLAYER_H + 12;
  const fillFrac = activePowerup.timer / PU_DURATION;

  // Warn with flicker in last 3 seconds
  if (activePowerup.timer < 3 && Math.floor(activePowerup.timer * 5) % 2 === 0) return;

  // Label
  ctx.fillStyle = col;
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(activePowerup.kind, LW / 2, by - 4);

  // Bar track
  ctx.strokeStyle = col + '55';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, barW, barH);

  // Bar fill
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(bx + 1, by + 1, (barW - 2) * fillFrac, barH - 2);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function render() {
  const cw = canvas.width, ch = canvas.height;
  const scale = cw / LW;

  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, LW, LH);

  if (ufo.active) drawUfoSprite(ufo.x, UFO_Y);


  for (const a of aliens) {
    if (!a.alive) continue;
    const ax = formX + a.x, ay = formY + a.y;
    drawSprite(a.type * 2 + alienAnim, ax, ay, waveColors[a.type]);
  }

  drawShields();
  drawGroundLine();
  drawPlayer();

  // Player bullets — color by active power-up
  const bColor = activePowerup ? PU_COLOR[activePowerup.kind] : C_WHITE;
  ctx.fillStyle = bColor;
  for (const b of playerBullets) ctx.fillRect(b.x, b.y, BULLET_W, P_BULL_H);

  // Alien bullets (zigzag)
  ctx.fillStyle = C_RED;
  for (const b of alienBullets) {
    ctx.fillRect(b.x,     b.y,     BULLET_W,     3);
    ctx.fillRect(b.x - 1, b.y + 3, BULLET_W,     3);
    ctx.fillRect(b.x,     b.y + 6, BULLET_W,     A_BULL_H - 6);
  }

  drawPowerups();
  drawPowerupHUD();
  drawFlashes();

  ctx.restore();
}

// ── Game loop ─────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  update(dt);
  render();
}

// ── UI bindings ───────────────────────────────────────────────
document.getElementById('music-toggle').addEventListener('click', function () {
  const { track, name } = NeonArcade.cycleTrack();
  this.textContent = '♪ ' + name;
});
document.getElementById('music-mute').addEventListener('click', function () {
  const { on } = NeonArcade.toggleMusic();
  this.textContent = on ? 'Music: ON' : 'Music: OFF';
  this.classList.toggle('off', !on);
});
function tryFullscreen() {
  if (navigator.maxTouchPoints > 0)
    document.documentElement.requestFullscreen?.().catch(() => {});
}
if (navigator.maxTouchPoints > 0) {
  const _doFS = () => {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen?.().catch(() => {});
  };
  document.addEventListener('touchstart', _doFS, { once: true, passive: true });
  document.addEventListener('click',      _doFS, { once: true });
}

document.getElementById('btn-start').addEventListener('click', () => {
  tryFullscreen(); initGame(false); gameState = 'playing'; showOverlay(null); NeonArcade.startMusic();
});
document.getElementById('btn-restart').addEventListener('click', () => {
  tryFullscreen(); initGame(false); gameState = 'playing'; showOverlay(null); NeonArcade.startMusic();
});
document.getElementById('btn-resume').addEventListener('click', () => {
  if (gameState === 'paused') togglePause();
});
document.getElementById('btn-pause').addEventListener('click', () => {
  if (gameState === 'playing' || gameState === 'paused') togglePause();
});

// Canvas swipe — minimum 40 px distance, hold to keep moving (spec: Game_Controls_setup.md)
const gameCanvas = document.getElementById('game-canvas');
let _siSwipeOriginX = 0;
gameCanvas.addEventListener('touchstart', e => {
  _siSwipeOriginX = e.touches[0].clientX;
}, { passive: false });
gameCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const dx = e.touches[0].clientX - _siSwipeOriginX;
  if (Math.abs(dx) >= 40) {
    keys['ArrowLeft']  = dx < 0;
    keys['ArrowRight'] = dx > 0;
  }
}, { passive: false });
gameCanvas.addEventListener('touchend', () => {
  keys['ArrowLeft'] = false;
  keys['ArrowRight'] = false;
}, { passive: false });

window.addEventListener('resize', () => { resizeCanvas(); render(); });

// ── Mobile touch controls ─────────────────────────────────────
(function initMobileControls() {
  if (!navigator.maxTouchPoints) return;  // desktop — do nothing

  document.body.classList.add('is-mobile');

  // Show controls, hide stat panel boxes
  document.getElementById('mobile-dpad').style.display      = 'flex';
  document.getElementById('mobile-fire-wrap').style.display = 'flex';

  // Move LIVES to right panel so it sits under the fire button
  const livesBox  = document.getElementById('lives-display').closest('.panel-box');
  const rightPanel = document.getElementById('right-panel');
  rightPanel.appendChild(livesBox);

  // ── D-pad swipe ──────────────────────────────────────────────
  const dpadCross   = document.getElementById('dpad-cross');
  const elLeft      = document.getElementById('dpad-left');
  const elRight     = document.getElementById('dpad-right');
  const elUp        = document.getElementById('dpad-up');
  const elDown      = document.getElementById('dpad-down');
  const SWIPE_MIN   = 18;  // px before a direction is committed
  let dpadStartX = 0, dpadStartY = 0;

  function clearDpadKeys() {
    keys['ArrowLeft']  = false;
    keys['ArrowRight'] = false;
    [elLeft, elRight, elUp, elDown].forEach(el => el.classList.remove('active'));
  }

  // ── Individual cell tap support ─────────────────────────────
  function bindCell(el, keyName) {
    el.addEventListener('touchstart', e => {
      e.stopPropagation(); // don't trigger dpad-cross swipe handler
      e.preventDefault();
      clearDpadKeys();
      if (keyName) keys[keyName] = true;
      el.classList.add('active');
    }, { passive: false });
    el.addEventListener('touchend', e => {
      e.stopPropagation();
      clearDpadKeys();
    }, { passive: false });
    el.addEventListener('touchcancel', e => {
      e.stopPropagation();
      clearDpadKeys();
    }, { passive: false });
  }
  bindCell(elLeft,  'ArrowLeft');
  bindCell(elRight, 'ArrowRight');
  bindCell(elUp,    null);   // no game action, just highlight
  bindCell(elDown,  null);

  // ── Swipe on the cross centre / empty cells ──────────────────
  dpadCross.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    dpadStartX = t.clientX;
    dpadStartY = t.clientY;
    clearDpadKeys();
  }, { passive: false });

  dpadCross.addEventListener('touchmove', e => {
    e.preventDefault();
    const t  = e.touches[0];
    const dx = t.clientX - dpadStartX;
    const dy = t.clientY - dpadStartY;
    const adx = Math.abs(dx), ady = Math.abs(dy);

    clearDpadKeys();
    if (adx < SWIPE_MIN && ady < SWIPE_MIN) return;

    if (adx >= ady) {
      if (dx < 0) { keys['ArrowLeft']  = true; elLeft.classList.add('active'); }
      else         { keys['ArrowRight'] = true; elRight.classList.add('active'); }
    } else {
      if (dy < 0) elUp.classList.add('active');
      else        elDown.classList.add('active');
    }
  }, { passive: false });

  dpadCross.addEventListener('touchend',    clearDpadKeys, { passive: true });
  dpadCross.addEventListener('touchcancel', clearDpadKeys, { passive: true });

  // ── Fire button ──────────────────────────────────────────────
  const fireBtn = document.getElementById('btn-fire-touch');

  fireBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    fireBtn.classList.add('pressed');
    keys['Space'] = true;
  }, { passive: false });

  fireBtn.addEventListener('touchend', () => {
    fireBtn.classList.remove('pressed');
    keys['Space'] = false;
  }, { passive: true });

  fireBtn.addEventListener('touchcancel', () => {
    fireBtn.classList.remove('pressed');
    keys['Space'] = false;
  }, { passive: true });
})();

// ── Init ──────────────────────────────────────────────────────
resizeCanvas();
updateHUD();
NeonArcade.toggleMusic(); // start with music disabled
document.getElementById('music-mute').textContent = 'Music: OFF';
document.getElementById('music-mute').classList.add('off');
requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
