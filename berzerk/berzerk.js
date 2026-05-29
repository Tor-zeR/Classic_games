'use strict';

// ── Constants ────────────────────────────────────────────────
const COLS = 48, ROWS = 32;
let CELL = 20;

// Exit openings: 3 cells wide / tall, centered on each border side
const EXIT_C1 = 22, EXIT_C2 = 24;   // top / bottom exits: column range (centre of 48)
const EXIT_R1 = 14, EXIT_R2 = 16;   // left / right exits: row range (centre of 32)

const PL_W = 12, PL_H = 16;         // player px size
const RB_W = 12, RB_H = 14;         // robot px size
const BL_W = 6,  BL_H = 6;          // bullet px size

const PL_SPEED    = 92;              // player px/s
const RB_BASE_SPD = 17;              // robot base speed (increases per room)
const BL_SPEED    = 200;             // player bullet speed
const RB_BL_SPEED = 99;              // robot bullet speed
const BROTTO_BASE   = 60;              // Brotto base speed
const BROTTO_DELAY  = 12;              // s before Otto appears
const FIRE_RATE   = 0.22;            // min s between player shots

const SCORE_ROBOT      = 50;
const BONUS_ROBOT      = 10;
const EXTRA_LIVES      = [5000, 10000];
const FIRE_BOOST_RATE  = 0.07;   // boosted fire rate (s between shots)
const FIRE_BOOST_DUR   = 8.0;    // seconds the fire boost lasts
const SHIELD_DUR       = 10.0;   // seconds the shield lasts
const SPEED_BOOST_MULT = 2.0;    // speed multiplier
const SPEED_BOOST_DUR  = 5.0;    // seconds the speed boost lasts
const CHEST_W = 14, CHEST_H = 12;
const SW_W = 18, SW_H = 22;         // master switch size
const TOTAL_ROOMS = 10;              // rooms per cycle

const ROBOT_COLORS = [
  '#44ff77', '#44ddff', '#ffff44', '#ff9944', '#ff4466', '#cc44ff',
];

// ── DOM ──────────────────────────────────────────────────────
const canvas     = document.getElementById('game-canvas');
const ctx        = canvas.getContext('2d');
const scoreEl    = document.getElementById('score-display');
const hiEl       = document.getElementById('hi-display');
const livesEl    = document.getElementById('lives-display');
const roomEl     = document.getElementById('room-display');
const robotsEl   = document.getElementById('robots-display');
const ovStart    = document.getElementById('overlay-start');
const ovPause    = document.getElementById('overlay-pause');
const ovGameover = document.getElementById('overlay-gameover');
const ovVictory  = document.getElementById('overlay-victory');
const goScore    = document.getElementById('go-score');
const victoryScoreEl = document.getElementById('victory-score');

// ── State ────────────────────────────────────────────────────
let TILE = [];        // 2D Uint8Array: 0=floor, 1=wall
let player, robots, playerBullets, robotBullets, explosions, brotto;
let state = 'start';  // 'start'|'entering'|'playing'|'dying'|'paused'|'gameover'
let score, hiScore, lives, roomNum, extraLifeIdx;
let brottoTimer, roomStartRobots, brottoAge;
let deathTimer = 0, enterTimer = 0;
let lastEntryDir = 'center';
let lastTime = 0;
let alertTimer = 0;        // "INTRUDER ALERT" display countdown
let openExits = new Set(); // which exits are unlocked: 'top'|'bottom'|'left'|'right'
let chest = null;          // bonus chest: { x, y, type, pulse }
let masterSwitch = null;   // room-6 switch: { x, y, pulse }
let fireBoostTimer  = 0;   // seconds remaining on fire-rate boost
let shieldTimer     = 0;   // seconds remaining on shield
let speedBoostTimer = 0;   // seconds remaining on speed boost
let speedBonus      = null; // standalone speed pickup: { x, y, pulse, life }
let speedBonusTimer = 0;   // countdown to next speed bonus spawn

// ── Canvas Resize ────────────────────────────────────────────
function resizeCanvas() {
  const isMobile = navigator.maxTouchPoints > 0;
  const sideW    = isMobile ? 80  : 8;   // px reserved per side panel
  const topH     = isMobile ? 44  : 160; // px reserved for topbar
  const maxW = Math.min(window.innerWidth  - sideW * 2, 960);
  const maxH = Math.max(180, window.innerHeight - topH);
  CELL = Math.max(6, Math.min(20, Math.floor(Math.min(maxW / COLS, maxH / ROWS))));
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;
}
window.addEventListener('resize', () => { resizeCanvas(); if (state !== 'start') render(0); });
resizeCanvas();

// ── Map helpers ──────────────────────────────────────────────
function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) {
    // Only allow passage through an exit if that exit is currently open
    if (ty < 0    && tx >= EXIT_C1 && tx <= EXIT_C2 && openExits.has('top'))    return 0;
    if (ty >= ROWS && tx >= EXIT_C1 && tx <= EXIT_C2 && openExits.has('bottom')) return 0;
    if (tx < 0    && ty >= EXIT_R1 && ty <= EXIT_R2 && openExits.has('left'))   return 0;
    if (tx >= COLS && ty >= EXIT_R1 && ty <= EXIT_R2 && openExits.has('right'))  return 0;
    return 1;
  }
  return TILE[ty][tx];
}

function rectHitsWall(x, y, w, h) {
  const x1 = Math.floor(x           / CELL);
  const y1 = Math.floor(y           / CELL);
  const x2 = Math.floor((x + w - 1) / CELL);
  const y2 = Math.floor((y + h - 1) / CELL);
  for (let ty = y1; ty <= y2; ty++)
    for (let tx = x1; tx <= x2; tx++)
      if (tileAt(tx, ty) === 1) return true;
  return false;
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ── Room Generation ──────────────────────────────────────────
function generateRoom() {
  TILE = Array.from({ length: ROWS }, () => new Uint8Array(COLS));

  // Solid border walls
  for (let c = 0; c < COLS; c++) { TILE[0][c] = 1; TILE[ROWS - 1][c] = 1; }
  for (let r = 0; r < ROWS; r++) { TILE[r][0] = 1; TILE[r][COLS - 1] = 1; }

  // Exits start CLOSED (wall) — they open when Brotto appears

  // Random interior wall segments
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  const numSegs = 4 + Math.floor(Math.random() * 5);

  for (let w = 0; w < numSegs; w++) {
    for (let att = 0; att < 60; att++) {
      const horiz = Math.random() < 0.5;
      const len   = 3 + Math.floor(Math.random() * 5);
      const sr    = 2 + Math.floor(Math.random() * (ROWS - 4));
      const sc    = 2 + Math.floor(Math.random() * (COLS - 4));

      let ok = true;
      const cells = [];
      for (let i = 0; i < len && ok; i++) {
        const tr = horiz ? sr : sr + i;
        const tc = horiz ? sc + i : sc;
        if (tr <= 0 || tr >= ROWS - 1 || tc <= 0 || tc >= COLS - 1) { ok = false; break; }
        // Protect center spawn area (7×7)
        if (Math.abs(tr - cy) <= 3 && Math.abs(tc - cx) <= 3) { ok = false; break; }
        // Protect exit corridors + player spawn areas (extra rows/cols for small CELL on mobile)
        if (tc >= EXIT_C1 - 1 && tc <= EXIT_C2 + 1 && tr <= 5)        { ok = false; break; }
        if (tc >= EXIT_C1 - 1 && tc <= EXIT_C2 + 1 && tr >= ROWS - 4) { ok = false; break; }
        if (tr >= EXIT_R1 - 1 && tr <= EXIT_R2 + 1 && tc <= 5)        { ok = false; break; }
        if (tr >= EXIT_R1 - 1 && tr <= EXIT_R2 + 1 && tc >= COLS - 4) { ok = false; break; }
        cells.push({ tr, tc });
      }
      if (ok && cells.length === len) {
        cells.forEach(({ tr, tc }) => { TILE[tr][tc] = 1; });
        break;
      }
    }
  }
}

// ── Entity Spawning ──────────────────────────────────────────
function spawnPlayer(entryDir) {
  const cx = Math.floor(COLS / 2) * CELL + (CELL - PL_W) / 2;
  const cy = Math.floor(ROWS / 2) * CELL + (CELL - PL_H) / 2;
  let x = cx, y = cy;
  if      (entryDir === 'top')    { x = cx; y = 3 * CELL; }
  else if (entryDir === 'bottom') { x = cx; y = (ROWS - 4) * CELL; }
  else if (entryDir === 'left')   { x = 3 * CELL; y = cy; }
  else if (entryDir === 'right')  { x = (COLS - 4) * CELL; y = cy; }

  // Safety nudge: on small screens the player body can be >1 tile and clip a wall.
  // Push inward (toward room center) until clear.
  for (let i = 0; i < ROWS && rectHitsWall(x, y, PL_W, PL_H); i++) {
    if      (entryDir === 'top')    y += CELL;
    else if (entryDir === 'bottom') y -= CELL;
    else if (entryDir === 'left')   x += CELL;
    else if (entryDir === 'right')  x -= CELL;
    else break;
  }

  player = { x, y, vx: 0, vy: 0, aimX: 1, aimY: 0, alive: true, fireTimer: 0, invTimer: 1.5 };
}

function spawnRobots() {
  robots = [];
  const colorIdx = Math.min(ROBOT_COLORS.length - 1, Math.floor(roomNum / 4));
  const count    = Math.min(12, 2 + Math.floor(roomNum * 0.7) + Math.floor(Math.random() * 3));
  const cx = Math.floor(COLS / 2) * CELL;
  const cy = Math.floor(ROWS / 2) * CELL;

  for (let i = 0; i < count; i++) {
    for (let att = 0; att < 120; att++) {
      const tc = 2 + Math.floor(Math.random() * (COLS - 4));
      const tr = 2 + Math.floor(Math.random() * (ROWS - 4));
      const x  = tc * CELL + (CELL - RB_W) / 2;
      const y  = tr * CELL + (CELL - RB_H) / 2;
      if (rectHitsWall(x, y, RB_W, RB_H)) continue;
      if (Math.abs(x - cx) < CELL * 5 && Math.abs(y - cy) < CELL * 5) continue;
      robots.push({
        x, y,
        color: ROBOT_COLORS[colorIdx],
        vx: 0, vy: 0,
        moveTimer: 0.1 + Math.random() * 0.4,
        fireTimer: 0.8 + Math.random() * 2.5,
        alive: true,
      });
      break;
    }
  }
}

// ── Score helpers ────────────────────────────────────────────
function checkBest() {
  if (score > hiScore) {
    hiScore = score;
    localStorage.setItem('berzerk_hi', hiScore);
  }
}

// ── Game Flow ────────────────────────────────────────────────
function newGame() {
  score          = 0;
  lives          = 3;
  roomNum        = 0;
  hiScore        = parseInt(localStorage.getItem('berzerk_hi') || '0', 10);
  extraLifeIdx   = 0;
  fireBoostTimer  = 0;
  shieldTimer     = 0;
  speedBoostTimer = 0;
  speedBonus      = null;
  enterRoom('center');
}

function enterRoom(entryDir) {
  lastEntryDir    = entryDir;
  generateRoom();
  spawnPlayer(entryDir);
  spawnRobots();
  roomStartRobots = robots.length;
  playerBullets   = [];
  robotBullets    = [];
  explosions      = [];
  chest           = null;
  masterSwitch    = null;
  speedBonus      = null;
  speedBonusTimer = 6 + Math.random() * 8;  // first spawn in 6–14 s
  openExits       = new Set();
  brottoTimer       = Math.max(5, BROTTO_DELAY - Math.floor(score / 1200));
  alertTimer      = 0;
  brotto    = { x: -CELL * 3, y: -CELL * 3, active: false, bouncePhase: 0 };
  brottoAge = 0;
  state      = 'entering';
  enterTimer = 1.5;
  lastTime   = 0;
  updateHUD();
  NeonArcade.SFX.berzerkRoomEnter?.();
}

function exitRoom(dir) {
  roomNum++;
  // Bonus for clearing all robots
  if (robots.filter(r => r.alive).length === 0) {
    score += roomStartRobots * BONUS_ROBOT;
    checkBest();
  }
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  enterRoom(opposite[dir]);
}

// ── Input ────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state === 'playing' &&
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && (state === 'playing' || state === 'paused')) {
    togglePause(); e.preventDefault();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

let touchDirs = { up: false, down: false, left: false, right: false };
let touchFire = false;

function isFiring() {
  return keys['Space'] || keys['ControlLeft'] || keys['ControlRight'] || keys['KeyZ'] || touchFire;
}
function getMovDir() {
  let dx = 0, dy = 0;
  if (keys['ArrowLeft']  || keys['KeyA'] || touchDirs.left)  dx -= 1;
  if (keys['ArrowRight'] || keys['KeyD'] || touchDirs.right) dx += 1;
  if (keys['ArrowUp']    || keys['KeyW'] || touchDirs.up)    dy -= 1;
  if (keys['ArrowDown']  || keys['KeyS'] || touchDirs.down)  dy += 1;
  return { dx, dy };
}

// ── Player Update ────────────────────────────────────────────
function updatePlayer(dt) {
  if (!player.alive) return;
  if (player.invTimer > 0) player.invTimer -= dt;

  const { dx, dy } = getMovDir();
  const firing = isFiring();

  // Aim direction always tracks last movement keys
  if (dx !== 0 || dy !== 0) { player.aimX = dx; player.aimY = dy; }

  if (firing) {
    // Stop-to-shoot: movement locked while fire is held
    player.vx = 0;
    player.vy = 0;
    if (player.fireTimer <= 0) {
      const nl = Math.sqrt(player.aimX ** 2 + player.aimY ** 2) || 1;
      playerBullets.push({
        x:  player.x + PL_W / 2 - BL_W / 2,
        y:  player.y + PL_H / 2 - BL_H / 2,
        vx: (player.aimX / nl) * BL_SPEED,
        vy: (player.aimY / nl) * BL_SPEED,
      });
      player.fireTimer = fireBoostTimer > 0 ? FIRE_BOOST_RATE : FIRE_RATE;
      NeonArcade.SFX.berzerkShoot?.();
    }
  } else {
    const len = Math.sqrt(dx * dx + dy * dy);
    const spd = PL_SPEED * (speedBoostTimer > 0 ? SPEED_BOOST_MULT : 1);
    player.vx = len > 0 ? (dx / len) * spd : 0;
    player.vy = len > 0 ? (dy / len) * spd : 0;
  }

  if (player.fireTimer > 0) player.fireTimer -= dt;

  // Move with wall sliding (X then Y)
  const nx = player.x + player.vx * dt;
  if (!rectHitsWall(nx, player.y, PL_W, PL_H)) player.x = nx;
  const ny = player.y + player.vy * dt;
  if (!rectHitsWall(player.x, ny, PL_W, PL_H)) player.y = ny;

  // Exit detection: player center exits the grid through an opening
  const px = player.x + PL_W / 2, py = player.y + PL_H / 2;
  if (py < -CELL * 0.5)          { exitRoom('top');    return; }
  if (py > ROWS * CELL + CELL * 0.5) { exitRoom('bottom'); return; }
  if (px < -CELL * 0.5)          { exitRoom('left');   return; }
  if (px > COLS * CELL + CELL * 0.5) { exitRoom('right');  return; }

  // Robot body collision (after invincibility and when not shielded)
  if (player.invTimer <= 0 && shieldTimer <= 0) {
    for (const rb of robots) {
      if (!rb.alive) continue;
      if (rectsOverlap(player.x, player.y, PL_W, PL_H, rb.x, rb.y, RB_W, RB_H)) {
        killPlayer(); return;
      }
    }
  }

  // Chest pickup
  if (chest && rectsOverlap(player.x, player.y, PL_W, PL_H, chest.x, chest.y, CHEST_W, CHEST_H)) {
    collectChest();
  }

  // Standalone speed bonus pickup
  if (speedBonus && rectsOverlap(player.x, player.y, PL_W, PL_H, speedBonus.x, speedBonus.y, CHEST_W, CHEST_H)) {
    speedBoostTimer = SPEED_BOOST_DUR;
    speedBonus = null;
    NeonArcade.SFX.berzerkPowerUp?.();
  }

  // Master switch — only activates when Brotto is present
  if (masterSwitch && brotto.active &&
      rectsOverlap(player.x, player.y, PL_W, PL_H, masterSwitch.x, masterSwitch.y, SW_W, SW_H)) {
    triggerVictory();
  }
}

// ── Robot Update ─────────────────────────────────────────────
function updateRobots(dt) {
  const spd = RB_BASE_SPD * (1 + roomNum * 0.05);

  for (const rb of robots) {
    if (!rb.alive) continue;

    rb.moveTimer -= dt;
    if (rb.moveTimer <= 0) {
      rb.moveTimer = 0.25 + Math.random() * 0.35;

      const tdx   = (player.x + PL_W / 2) - (rb.x + RB_W / 2);
      const tdy   = (player.y + PL_H / 2) - (rb.y + RB_H / 2);
      const angle  = Math.atan2(tdy, tdx);
      const sector = Math.round(angle / (Math.PI / 4));
      const DIRS   = [
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
        { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
      ];
      const d  = DIRS[((sector % 8) + 8) % 8];
      const nl = Math.sqrt(d.x * d.x + d.y * d.y);
      rb.vx = (d.x / nl) * spd;
      rb.vy = (d.y / nl) * spd;
    }

    // Move; bounce off walls (classic robot stupidity)
    const nx = rb.x + rb.vx * dt;
    if (!rectHitsWall(nx, rb.y, RB_W, RB_H)) rb.x = nx; else rb.vx *= -1;
    const ny = rb.y + rb.vy * dt;
    if (!rectHitsWall(rb.x, ny, RB_W, RB_H)) rb.y = ny; else rb.vy *= -1;

    // Clamp inside canvas
    rb.x = Math.max(CELL, Math.min((COLS - 2) * CELL - RB_W, rb.x));
    rb.y = Math.max(CELL, Math.min((ROWS - 2) * CELL - RB_H, rb.y));

    // Fire at player or a nearby robot (30% chance to target another robot)
    rb.fireTimer -= dt;
    if (rb.fireTimer <= 0) {
      rb.fireTimer = Math.max(0.45, 0.9 + Math.random() * 1.5 - score / 10000);

      // Pick target: 30% chance to aim at a random other alive robot
      let tx, ty;
      const otherRobots = robots.filter(r => r.alive && r !== rb);
      if (otherRobots.length > 0 && Math.random() < 0.30) {
        const target = otherRobots[Math.floor(Math.random() * otherRobots.length)];
        tx = target.x + RB_W / 2;
        ty = target.y + RB_H / 2;
      } else if (player.alive) {
        tx = player.x + PL_W / 2;
        ty = player.y + PL_H / 2;
      } else {
        return;
      }

      const tdx    = tx - (rb.x + RB_W / 2);
      const tdy    = ty - (rb.y + RB_H / 2);
      const angle  = Math.atan2(tdy, tdx);
      const sector = Math.round(angle / (Math.PI / 4));
      const DIRS   = [
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
        { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
      ];
      const d  = DIRS[((sector % 8) + 8) % 8];
      const nl = Math.sqrt(d.x * d.x + d.y * d.y);
      robotBullets.push({
        x:  rb.x + RB_W / 2 - BL_W / 2,
        y:  rb.y + RB_H / 2 - BL_H / 2,
        vx: (d.x / nl) * RB_BL_SPEED,
        vy: (d.y / nl) * RB_BL_SPEED,
        shooterId: rb,
      });
      NeonArcade.SFX.berzerkRobotShoot();
    }
  }
}

// ── Bullet Update ────────────────────────────────────────────
function updateBullets(dt) {
  // --- Player bullets ---
  playerBullets = playerBullets.filter(bl => {
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    if (bl.x < 0 || bl.x > COLS * CELL || bl.y < 0 || bl.y > ROWS * CELL) return false;
    if (rectHitsWall(bl.x, bl.y, BL_W, BL_H)) return false;
    for (const rb of robots) {
      if (!rb.alive) continue;
      if (rectsOverlap(bl.x, bl.y, BL_W, BL_H, rb.x, rb.y, RB_W, RB_H)) {
        killRobot(rb);
        return false;
      }
    }
    // Hit Brotto — slow him for 0.5 s
    if (brotto.active) {
      const otR = CELL * 0.58;
      if (Math.hypot(bl.x + BL_W / 2 - brotto.x, bl.y + BL_H / 2 - brotto.y) < otR) {
        brotto.slowTimer = 1.0;
        NeonArcade.SFX.berzerkRobotDie?.();
        return false;
      }
    }
    return true;
  });

  // --- Robot bullets ---
  robotBullets = robotBullets.filter(bl => {
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    if (bl.x < 0 || bl.x > COLS * CELL || bl.y < 0 || bl.y > ROWS * CELL) return false;
    if (rectHitsWall(bl.x, bl.y, BL_W, BL_H)) return false;
    // Hit player
    if (player.alive && player.invTimer <= 0 && shieldTimer <= 0 &&
        rectsOverlap(bl.x, bl.y, BL_W, BL_H, player.x, player.y, PL_W, PL_H)) {
      killPlayer();
      return false;
    }
    // Hit another robot (robots shoot each other)
    for (const rb of robots) {
      if (!rb.alive) continue;
      if (bl.shooterId === rb) continue;  // don't self-hit
      if (rectsOverlap(bl.x, bl.y, BL_W, BL_H, rb.x, rb.y, RB_W, RB_H)) {
        killRobot(rb);
        return false;
      }
    }
    return true;
  });

  // --- Player and robot bullets cancel each other ---
  outer: for (let i = playerBullets.length - 1; i >= 0; i--) {
    for (let j = robotBullets.length - 1; j >= 0; j--) {
      if (rectsOverlap(
        playerBullets[i].x, playerBullets[i].y, BL_W, BL_H,
        robotBullets[j].x,  robotBullets[j].y,  BL_W, BL_H,
      )) {
        playerBullets.splice(i, 1);
        robotBullets.splice(j, 1);
        continue outer;
      }
    }
  }
}

// ── Brotto Update ──────────────────────────────────────────────
function updateBrotto(dt) {
  if (!brotto.active) {
    brottoTimer -= dt;
    if (brottoTimer <= 0) activateBrotto();
    return;
  }

  brottoAge += dt;  // seconds Brotto has been active this room
  brotto.moveSound = (brotto.moveSound || 0) - dt;
  if (brotto.moveSound <= 0) {
    NeonArcade.SFX.berzerkBrottoMove?.();
    brotto.moveSound = 0.55;
  }

  // Speed: starts at base, grows with score/time, capped at 3× base
  // While slowTimer > 0 Brotto is capped at player speed
  if (brotto.slowTimer > 0) brotto.slowTimer -= dt;
  const rawSpeed = Math.min(BROTTO_BASE * 3, BROTTO_BASE + score / 200 + brottoAge * 4);
  const speed = brotto.slowTimer > 0 ? Math.min(rawSpeed, PL_SPEED / 2) : rawSpeed;

  // Path recalc interval: starts at 0.30s, shrinks to 0.04s over 15 s with Brotto
  const pathInterval = Math.max(0.04, 0.30 - brottoAge * 0.017);

  brotto.bouncePhase += dt * 5;
  const brottoR = Math.max(4, CELL * 0.5);

  // Recompute BFS waypoint when timer expires or waypoint reached
  brotto.pathTimer = (brotto.pathTimer || 0) - dt;
  const atWaypoint = brotto.waypointX === undefined ||
    Math.hypot(brotto.waypointX - brotto.x, brotto.waypointY - brotto.y) < CELL * 0.55;

  if (brotto.pathTimer <= 0 || atWaypoint) {
    brotto.pathTimer = pathInterval;
    const otTx = Math.floor(brotto.x / CELL);
    const otTy = Math.floor(brotto.y / CELL);
    const plTx = Math.floor((player.x + PL_W / 2) / CELL);
    const plTy = Math.floor((player.y + PL_H / 2) / CELL);
    const next = brottoBFS(otTx, otTy, plTx, plTy);
    if (next) {
      brotto.waypointX = next.x * CELL + CELL / 2;
      brotto.waypointY = next.y * CELL + CELL / 2;
    } else {
      // Fallback: head directly (open area or same tile)
      brotto.waypointX = player.x + PL_W / 2;
      brotto.waypointY = player.y + PL_H / 2;
    }
  }

  // Move toward current waypoint with bounce perpendicular to direction
  const tdx  = brotto.waypointX - brotto.x;
  const tdy  = brotto.waypointY - brotto.y;
  const dist = Math.hypot(tdx, tdy) || 1;
  const bounce = Math.sin(brotto.bouncePhase) * speed * 0.22;
  const movX = (tdx / dist) * speed * dt + (-tdy / dist) * bounce * dt;
  const movY = (tdy / dist) * speed * dt + ( tdx / dist) * bounce * dt;

  const nx = brotto.x + movX;
  if (!rectHitsWall(nx - brottoR, brotto.y - brottoR, brottoR * 2, brottoR * 2)) brotto.x = nx;
  const ny = brotto.y + movY;
  if (!rectHitsWall(brotto.x - brottoR, ny - brottoR, brottoR * 2, brottoR * 2)) brotto.y = ny;

  if (player.alive && player.invTimer <= 0 && shieldTimer <= 0) {
    if (Math.hypot(brotto.x - (player.x + PL_W / 2), brotto.y - (player.y + PL_H / 2)) < CELL * 0.7)
      killPlayer();
  }
}

// BFS on tile grid: returns the first step tile toward (toTx, toTy)
function brottoBFS(fromTx, fromTy, toTx, toTy) {
  if (fromTx === toTx && fromTy === toTy) return null;
  const DIRS4  = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const visited = new Set();
  const queue   = [{ tx: fromTx, ty: fromTy, first: null }];
  visited.add(fromTy * (COLS + 2) + fromTx);

  while (queue.length > 0) {
    const { tx, ty, first } = queue.shift();
    for (const d of DIRS4) {
      const nx = tx + d.x, ny = ty + d.y;
      if (ny < -1 || ny > ROWS || nx < -1 || nx > COLS) continue;
      const key = (ny + 1) * (COLS + 2) + (nx + 1);
      if (visited.has(key)) continue;
      if (tileAt(nx, ny) === 1) continue;
      visited.add(key);
      const step = first || { x: nx, y: ny };
      if (nx === toTx && ny === toTy) return step;
      queue.push({ tx: nx, ty: ny, first: step });
    }
  }
  return null;
}

function openExit(dir) {
  openExits.add(dir);
  if (dir === 'top')    for (let c = EXIT_C1; c <= EXIT_C2; c++) TILE[0][c] = 0;
  if (dir === 'bottom') for (let c = EXIT_C1; c <= EXIT_C2; c++) TILE[ROWS - 1][c] = 0;
  if (dir === 'left')   for (let r = EXIT_R1; r <= EXIT_R2; r++) TILE[r][0] = 0;
  if (dir === 'right')  for (let r = EXIT_R1; r <= EXIT_R2; r++) TILE[r][COLS - 1] = 0;
}

function activateBrotto() {
  // Open 1–3 random exits first, then spawn Brotto at one of them
  const allDirs = ['top', 'bottom', 'left', 'right'].sort(() => Math.random() - 0.5);
  const count   = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) openExit(allDirs[i]);

  // Spawn at a random open exit (guaranteed to exist)
  const spawnDir = allDirs[Math.floor(Math.random() * count)];
  const midX = ((EXIT_C1 + EXIT_C2) / 2 + 0.5) * CELL;
  const midY = ((EXIT_R1 + EXIT_R2) / 2 + 0.5) * CELL;
  if      (spawnDir === 'top')    { brotto.x = midX; brotto.y = -CELL; }
  else if (spawnDir === 'bottom') { brotto.x = midX; brotto.y = ROWS * CELL + CELL; }
  else if (spawnDir === 'left')   { brotto.x = -CELL; brotto.y = midY; }
  else                            { brotto.x = COLS * CELL + CELL; brotto.y = midY; }

  brotto.active     = true;
  brotto.pathTimer  = 0;
  brotto.waypointX  = undefined;
  brotto.waypointY  = undefined;
  brotto.slowTimer  = 0;
  brottoAge         = 0;
  alertTimer      = 2.5;

  NeonArcade.SFX.berzerkOtto?.();
  NeonArcade.SFX.berzerkBrotto?.();
}

// ── Bonus Chest ──────────────────────────────────────────────
const CHEST_TYPES = ['extralife', 'firerate', 'score', 'shield', 'speed'];

function spawnChest() {
  const types = CHEST_TYPES;
  const type  = types[Math.floor(Math.random() * types.length)];
  for (let att = 0; att < 200; att++) {
    const tc = 2 + Math.floor(Math.random() * (COLS - 4));
    const tr = 2 + Math.floor(Math.random() * (ROWS - 4));
    const x  = tc * CELL + (CELL - CHEST_W) / 2;
    const y  = tr * CELL + (CELL - CHEST_H) / 2;
    if (rectHitsWall(x, y, CHEST_W, CHEST_H)) continue;
    chest = { x, y, type, pulse: 0 };
    return;
  }
}

function spawnSpeedBonus() {
  for (let att = 0; att < 200; att++) {
    const tc = 2 + Math.floor(Math.random() * (COLS - 4));
    const tr = 2 + Math.floor(Math.random() * (ROWS - 4));
    const x  = tc * CELL + (CELL - CHEST_W) / 2;
    const y  = tr * CELL + (CELL - CHEST_H) / 2;
    if (rectHitsWall(x, y, CHEST_W, CHEST_H)) continue;
    speedBonus = { x, y, pulse: 0, life: 9.0 };
    return;
  }
}

function collectChest() {
  if (!chest) return;
  const type = chest.type;
  chest = null;
  if (type === 'extralife') {
    lives++;
    updateHUD();
    NeonArcade.SFX.berzerkExtraLife?.();
  } else if (type === 'firerate') {
    fireBoostTimer = FIRE_BOOST_DUR;
    NeonArcade.SFX.berzerkPowerUp?.();
  } else if (type === 'shield') {
    shieldTimer = SHIELD_DUR;
    NeonArcade.SFX.berzerkPowerUp?.();
  } else if (type === 'speed') {
    speedBoostTimer = SPEED_BOOST_DUR;
    NeonArcade.SFX.berzerkPowerUp?.();
  } else {
    score += 100;
    checkBest();
    updateHUD();
    NeonArcade.SFX.berzerkExtraLife?.();
  }
}

// ── Master Switch ────────────────────────────────────────────
function spawnMasterSwitch() {
  const cx = Math.floor(COLS / 2) * CELL;
  const cy = Math.floor(ROWS / 2) * CELL;
  for (let att = 0; att < 200; att++) {
    const tc = 3 + Math.floor(Math.random() * (COLS - 6));
    const tr = 3 + Math.floor(Math.random() * (ROWS - 6));
    const x  = tc * CELL + (CELL - SW_W) / 2;
    const y  = tr * CELL + (CELL - SW_H) / 2;
    if (rectHitsWall(x, y, SW_W, SW_H)) continue;
    if (Math.abs(x - cx) < CELL * 4 && Math.abs(y - cy) < CELL * 4) continue;
    masterSwitch = { x, y, pulse: 0 };
    return;
  }
}

function drawSpeedBonus(x, y, pulse, life) {
  const cx   = x + CHEST_W / 2;
  const cy   = y + CHEST_H / 2;
  const r    = Math.max(4, CELL * 0.38);
  const spin = pulse * 3;
  const glow = 0.7 + 0.3 * Math.sin(pulse * 2);
  // Fade out in last 2 s
  ctx.globalAlpha = life < 2 ? Math.max(0.15, life / 2) : 1;

  // Flames
  ctx.shadowColor = 'rgba(255,80,0,0.95)';
  ctx.shadowBlur  = 12 + 8 * Math.sin(pulse);
  for (let f = 0; f < 6; f++) {
    const fa = spin + (f / 6) * Math.PI * 2;
    const fr = r * (0.6 + 0.4 * Math.sin(pulse * 4 + f));
    ctx.fillStyle = f % 2 === 0
      ? `rgba(255,80,0,${0.75 + 0.25 * glow})`
      : `rgba(255,210,0,${0.55 + 0.35 * glow})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(fa) * fr * 1.5, cy + Math.sin(fa) * fr * 1.5, r * 0.30, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rim
  ctx.shadowColor = 'rgba(255,160,0,0.9)';
  ctx.shadowBlur  = 10;
  ctx.strokeStyle = `rgba(255,${Math.floor(150 + 90 * glow)},10,0.92)`;
  ctx.lineWidth   = Math.max(2, r * 0.4);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  // Spokes
  ctx.lineWidth   = Math.max(1, r * 0.18);
  ctx.strokeStyle = `rgba(255,230,80,${0.85 + 0.15 * glow})`;
  for (let s = 0; s < 4; s++) {
    const a = spin + (s / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
    ctx.stroke();
  }
  ctx.shadowBlur  = 0;
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 1;
}

function drawMasterSwitch(x, y, pulse) {
  const glow = 0.75 + 0.25 * Math.sin(pulse);
  const W = SW_W, H = SW_H;

  // Base panel
  ctx.shadowColor = `rgba(255,40,40,${glow})`;
  ctx.shadowBlur  = 12 + 8 * Math.sin(pulse);
  ctx.fillStyle   = '#3a0808';
  ctx.fillRect(x, y + H * 0.3, W, H * 0.7);

  // Panel face
  ctx.fillStyle   = '#5a1010';
  ctx.fillRect(x + 1, y + H * 0.32, W - 2, H * 0.66);

  // Lever post
  ctx.fillStyle = '#888';
  ctx.fillRect(x + W * 0.44, y + H * 0.1, W * 0.12, H * 0.55);

  // Lever knob (glowing red circle)
  ctx.shadowColor = `rgba(255,40,40,0.95)`;
  ctx.shadowBlur  = 14;
  ctx.fillStyle   = `rgba(255,${Math.floor(40 + 60 * glow)},40,${0.85 + 0.15 * glow})`;
  ctx.beginPath();
  ctx.arc(x + W / 2, y + H * 0.13, W * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // "!" label
  ctx.shadowBlur    = 0;
  ctx.fillStyle     = `rgba(255,220,0,${glow})`;
  ctx.font          = `bold ${Math.max(6, CELL * 0.42)}px sans-serif`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillText('!', x + W / 2, y + H * 0.75);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowBlur   = 0;
}

function triggerVictory() {
  brotto.active = false;
  score += 10000;
  checkBest();
  state = 'gameover';  // halts main loop
  victoryScoreEl.textContent = 'SCORE: ' + score;
  ovVictory.classList.remove('hidden');
  NeonArcade.stopMusic();
  NeonArcade.SFX.berzerkExtraLife?.();
}

// ── Kill Helpers ─────────────────────────────────────────────
function killRobot(rb) {
  if (!rb.alive) return;
  rb.alive = false;
  score += SCORE_ROBOT;

  // Extra life check
  while (extraLifeIdx < EXTRA_LIVES.length && score >= EXTRA_LIVES[extraLifeIdx]) {
    lives++;
    extraLifeIdx++;
    NeonArcade.SFX.berzerkExtraLife?.();
  }
  checkBest();

  // Explosion visual
  explosions.push({ x: rb.x + RB_W / 2, y: rb.y + RB_H / 2, r: 0, maxR: CELL * 1.6, life: 0.45 });

  // Chain kill: nearby robots caught in explosion
  for (const other of robots) {
    if (!other.alive) continue;
    const dx = (other.x + RB_W / 2) - (rb.x + RB_W / 2);
    const dy = (other.y + RB_H / 2) - (rb.y + RB_H / 2);
    if (Math.sqrt(dx * dx + dy * dy) < CELL * 1.9) killRobot(other);
  }

  // Shorten Brotto timer when all robots cleared; spawn bonus chest / master switch
  const remaining = robots.filter(r => r.alive).length;
  if (remaining === 0) {
    if (!brotto.active) brottoTimer = Math.min(brottoTimer, 2.5);
    if (isLastRoom()) {
      if (!masterSwitch) spawnMasterSwitch();
    } else {
      if (!chest) spawnChest();
    }
  }

  NeonArcade.SFX.berzerkRobotDie?.();
  updateHUD();
}

function killPlayer() {
  if (!player.alive) return;
  player.alive = false;
  if (brotto.active) brotto.slowTimer = 0;
  explosions.push({
    x: player.x + PL_W / 2, y: player.y + PL_H / 2,
    r: 0, maxR: CELL * 2.2, life: 0.7, isPlayer: true,
  });
  state      = 'dying';
  deathTimer = 1.8;
  NeonArcade.stopMusic();
  NeonArcade.SFX.berzerkDie?.();
}

// ── Explosions ───────────────────────────────────────────────
function updateExplosions(dt) {
  for (const ex of explosions) {
    ex.life -= dt;
    const maxLife = ex.isPlayer ? 0.7 : 0.45;
    ex.r = ex.maxR * (1 - ex.life / maxLife);
  }
  explosions = explosions.filter(e => e.life > 0);
}

// ── HUD ──────────────────────────────────────────────────────
function isLastRoom() { return roomNum % TOTAL_ROOMS === TOTAL_ROOMS - 1; }

const _hudLast = { score: -1, hi: -1, lives: -1, room: -1, robots: -1 };
function updateHUD() {
  if (_hudLast.score !== score)       { scoreEl.textContent  = score;   _hudLast.score = score; }
  if (_hudLast.hi !== hiScore)        { hiEl.textContent     = hiScore; _hudLast.hi    = hiScore; }
  if (_hudLast.lives !== lives)       { livesEl.textContent  = lives;   _hudLast.lives = lives; }
  const room = (roomNum % TOTAL_ROOMS) + 1;
  if (_hudLast.room !== room)         { roomEl.textContent   = room;    _hudLast.room  = room; }
  if (_hudLast.robots !== robots.length) { robotsEl.textContent = robots.length; _hudLast.robots = robots.length; }
}

// ── Overlays ─────────────────────────────────────────────────
function hideOverlays() {
  ovStart.classList.add('hidden');
  ovPause.classList.add('hidden');
  ovGameover.classList.add('hidden');
  ovVictory.classList.add('hidden');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    ovPause.classList.remove('hidden');
    NeonArcade.stopMusic();
  } else if (state === 'paused') {
    state = 'playing';
    ovPause.classList.add('hidden');
    lastTime = 0;
    NeonArcade.startMusic();
    requestAnimationFrame(loop);
  }
}

function triggerGameOver() {
  state = 'gameover';
  checkBest();
  goScore.textContent = 'SCORE: ' + score;
  ovGameover.classList.remove('hidden');
  NeonArcade.SFX.berzerkGameOver?.();
}

// ── Rendering ────────────────────────────────────────────────
function render(dt) {
  const W = canvas.width, H = canvas.height;

  // Background
  ctx.fillStyle = '#0a0010';
  ctx.fillRect(0, 0, W, H);

  // Subtle floor grid
  ctx.strokeStyle = 'rgba(100,0,180,0.10)';
  ctx.lineWidth   = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke();
  }

  // Electrified walls (cyan glow)
  ctx.shadowColor = 'rgba(0,200,255,0.85)';
  ctx.shadowBlur  = 5;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!TILE[r]) continue;
      if (TILE[r][c] === 1) {
        ctx.fillStyle = 'rgb(0,160,200)';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        ctx.fillStyle = 'rgb(140,230,255)';
        ctx.fillRect(c * CELL, r * CELL, CELL, 2);   // top-edge highlight
        ctx.fillRect(c * CELL, r * CELL, 2, CELL);   // left-edge highlight
      }
    }
  }
  ctx.shadowBlur = 0;

  // Exit doors — open: yellow glow strip; closed: red lock stripe
  const doorDefs = [
    { dir: 'top',    x: c => c * CELL, y: () => 0,              w: CELL, h: CELL * 1.5, cols: true  },
    { dir: 'bottom', x: c => c * CELL, y: () => (ROWS-1)*CELL,  w: CELL, h: CELL * 1.5, cols: true  },
    { dir: 'left',   x: () => 0,       y: r => r * CELL,        w: CELL * 1.5, h: CELL, cols: false },
    { dir: 'right',  x: () => (COLS-1)*CELL, y: r => r * CELL,  w: CELL * 1.5, h: CELL, cols: false },
  ];
  for (const dd of doorDefs) {
    const isOpen = openExits.has(dd.dir);
    ctx.fillStyle = isOpen ? 'rgba(255,255,80,0.10)' : 'rgba(255,30,30,0.18)';
    const range = dd.cols ? [EXIT_C1, EXIT_C2] : [EXIT_R1, EXIT_R2];
    for (let i = range[0]; i <= range[1]; i++) {
      const px = dd.cols ? dd.x(i) : dd.x();
      const py = dd.cols ? dd.y()  : dd.y(i);
      ctx.fillRect(px, py, dd.w, dd.h);
    }
    // Lock icon on closed doors
    if (!isOpen) {
      ctx.shadowColor = 'rgba(255,50,50,0.9)';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = 'rgba(255,80,80,0.7)';
      const midC = (EXIT_C1 + EXIT_C2) / 2 + 0.5;
      const midR = (EXIT_R1 + EXIT_R2) / 2 + 0.5;
      const lx = dd.cols ? midC * CELL : (dd.dir === 'left' ? CELL * 0.3 : (COLS - 1) * CELL + CELL * 0.3);
      const ly = dd.cols ? (dd.dir === 'top' ? CELL * 0.3 : (ROWS - 1) * CELL + CELL * 0.3) : midR * CELL;
      const sz = Math.max(4, CELL * 0.35);
      ctx.fillRect(lx - sz * 0.5, ly - sz * 0.3, sz, sz * 0.65);
      ctx.shadowBlur = 0;
    }
  }

  // Explosions
  for (const ex of explosions) {
    const maxLife = ex.isPlayer ? 0.7 : 0.45;
    const alpha   = (ex.life / maxLife) * 0.75;
    ctx.shadowColor = ex.isPlayer ? 'rgba(255,80,0,0.9)' : 'rgba(255,200,0,0.9)';
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = ex.isPlayer
      ? `rgba(255,100,20,${alpha})`
      : `rgba(255,210,30,${alpha})`;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); ctx.fill();
    // Inner ring
    ctx.strokeStyle = ex.isPlayer ? `rgba(255,200,100,${alpha * 0.6})` : `rgba(255,255,150,${alpha * 0.6})`;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.lineWidth   = 1;
  }

  // Robots
  for (const rb of robots) {
    if (rb.alive) drawRobot(rb.x, rb.y, rb.color);
  }

  // Robot bullets (red)
  ctx.shadowColor = 'rgba(255,60,60,0.9)';
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = '#ff5555';
  for (const bl of robotBullets) ctx.fillRect(bl.x, bl.y, BL_W, BL_H);
  ctx.shadowBlur  = 0;

  // Player bullets (yellow-white)
  ctx.shadowColor = 'rgba(255,255,100,0.9)';
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = '#ffffaa';
  for (const bl of playerBullets) ctx.fillRect(bl.x, bl.y, BL_W, BL_H);
  ctx.shadowBlur  = 0;

  // Bonus chest
  if (chest) drawChest(chest.x, chest.y, chest.type, chest.pulse);

  // Master switch (room 10)
  if (masterSwitch) drawMasterSwitch(masterSwitch.x, masterSwitch.y, masterSwitch.pulse);

  // Standalone speed bonus (wheel on fire)
  if (speedBonus) drawSpeedBonus(speedBonus.x, speedBonus.y, speedBonus.pulse, speedBonus.life);

  // Fire-boost HUD bar (top-right of canvas)
  if (fireBoostTimer > 0) {
    const pct  = fireBoostTimer / FIRE_BOOST_DUR;
    const barW = Math.floor(W * 0.22);
    const barH = Math.max(3, CELL * 0.28);
    const barX = W - barW - 8, barY = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.shadowColor = 'rgba(255,180,0,0.9)';
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = `rgba(255,${Math.floor(140 + 115 * pct)},0,0.9)`;
    ctx.fillRect(barX, barY, Math.floor(barW * pct), barH);
    ctx.shadowBlur  = 0;
  }

  // Player
  if (player && player.alive) {
    const blink = player.invTimer > 0 && Math.floor(Date.now() / 75) % 2 === 0;
    if (!blink) drawPlayer(player.x, player.y, player.aimX, player.aimY);
    // Shield bubble
    if (shieldTimer > 0) {
      const pct    = shieldTimer / SHIELD_DUR;
      const pulse  = 0.55 + 0.45 * Math.sin(Date.now() / 120);
      const radius = CELL * (0.85 + 0.12 * pulse);
      const alpha  = 0.25 + 0.20 * pulse;
      ctx.shadowColor = `rgba(100,180,255,0.9)`;
      ctx.shadowBlur  = 14 * pulse;
      ctx.strokeStyle = `rgba(140,210,255,${0.6 + 0.4 * pulse})`;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(player.x + PL_W / 2, player.y + PL_H / 2, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(100,180,255,${alpha})`;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth  = 1;
    }
  }

  // Shield bar (below fire-boost bar, top-right)
  if (shieldTimer > 0) {
    const pct  = shieldTimer / SHIELD_DUR;
    const barW = Math.floor(W * 0.22);
    const barH = Math.max(3, CELL * 0.28);
    const barX = W - barW - 8;
    const barY = fireBoostTimer > 0 ? 8 + barH + 6 : 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.shadowColor = 'rgba(100,180,255,0.9)';
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = `rgba(100,${Math.floor(160 + 95 * pct)},255,0.9)`;
    ctx.fillRect(barX, barY, Math.floor(barW * pct), barH);
    ctx.shadowBlur  = 0;
  }

  // Speed boost bar (below shield bar or fire bar, top-right)
  if (speedBoostTimer > 0) {
    const pct  = speedBoostTimer / SPEED_BOOST_DUR;
    const barW = Math.floor(W * 0.22);
    const barH = Math.max(3, CELL * 0.28);
    const barX = W - barW - 8;
    const slotsFilled = (fireBoostTimer > 0 ? 1 : 0) + (shieldTimer > 0 ? 1 : 0);
    const barY = 8 + slotsFilled * (barH + 6);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.shadowColor = 'rgba(255,160,0,0.9)';
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = `rgba(255,${Math.floor(120 + 135 * pct)},0,0.9)`;
    ctx.fillRect(barX, barY, Math.floor(barW * pct), barH);
    ctx.shadowBlur  = 0;
  }

  // Evil Brotto
  if (brotto && brotto.active) drawBrotto(brotto.x, brotto.y);

  // "INTRUDER ALERT" warning text
  if (alertTimer > 0) {
    alertTimer -= dt;
    if (Math.floor(Date.now() / 160) % 2 === 0) {
      const a = Math.min(1, alertTimer);
      ctx.fillStyle = `rgba(255,60,0,${a * 0.12})`;
      ctx.fillRect(0, 0, W, H);
      const fs = Math.max(8, Math.min(CELL, 16));
      ctx.font      = `${fs}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = `rgba(255,80,0,0.9)`;
      ctx.shadowBlur  = 16;
      ctx.fillStyle   = `rgba(255,100,20,${a})`;
      ctx.fillText('INTRUDER ALERT', W / 2, H / 2);
      ctx.shadowBlur  = 0;
      ctx.textAlign   = 'left';
    }
  }
}

function drawPlayer(x, y, aimX, aimY) {
  ctx.shadowColor = 'rgba(0,255,80,0.9)';
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = '#00ff55';

  // Legs
  ctx.fillRect(x + PL_W * 0.18, y + PL_H * 0.75, PL_W * 0.24, PL_H * 0.25);
  ctx.fillRect(x + PL_W * 0.58, y + PL_H * 0.75, PL_W * 0.24, PL_H * 0.25);
  // Torso
  ctx.fillRect(x + PL_W * 0.28, y + PL_H * 0.38, PL_W * 0.44, PL_H * 0.40);
  // Head
  ctx.beginPath();
  ctx.arc(x + PL_W / 2, y + PL_H * 0.22, PL_W * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Gun arm (pointing in aim direction)
  const nl = Math.sqrt(aimX * aimX + aimY * aimY) || 1;
  ctx.strokeStyle = '#00ff55';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.shadowBlur  = 6;
  ctx.beginPath();
  ctx.moveTo(x + PL_W / 2, y + PL_H * 0.55);
  ctx.lineTo(x + PL_W / 2 + (aimX / nl) * PL_W * 0.55, y + PL_H * 0.55 + (aimY / nl) * PL_W * 0.55);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth  = 1;
  ctx.lineCap    = 'butt';
}

function drawRobot(x, y, color) {
  ctx.shadowColor = color;
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = color;
  // Body
  ctx.fillRect(x + 1, y + RB_H * 0.32, RB_W - 2, RB_H * 0.65);
  // Head
  ctx.fillRect(x + RB_W * 0.18, y, RB_W * 0.64, RB_H * 0.36);
  // Antenna
  ctx.fillRect(x + RB_W * 0.44, y - RB_H * 0.12, RB_W * 0.12, RB_H * 0.14);
  // Eyes (dark)
  ctx.shadowBlur = 0;
  ctx.fillStyle  = 'rgba(0,0,0,0.85)';
  ctx.fillRect(x + RB_W * 0.22, y + RB_H * 0.07, RB_W * 0.20, RB_H * 0.15);
  ctx.fillRect(x + RB_W * 0.58, y + RB_H * 0.07, RB_W * 0.20, RB_H * 0.15);
}

function drawBrotto(cx, cy) {
  const r = CELL * 0.58;
  ctx.shadowColor = 'rgba(255,240,0,0.95)';
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = '#ffee00';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur  = 0;
  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.17, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.17, 0, Math.PI * 2); ctx.fill();
  // Smile
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 2;
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.08, r * 0.42, 0.12, Math.PI - 0.12); ctx.stroke();
  ctx.lineWidth   = 1;
}

function drawChest(x, y, type, pulse) {
  const glow = 0.7 + 0.3 * Math.sin(pulse);
  const W = CHEST_W, H = CHEST_H;

  // Glow color by type
  const colors = {
    extralife: `rgba(255,80,80,${glow})`,
    firerate:  `rgba(255,200,0,${glow})`,
    score:     `rgba(80,200,255,${glow})`,
    shield:    `rgba(100,180,255,${glow})`,
    speed:     `rgba(255,160,0,${glow})`,
  };
  const glows = {
    extralife: 'rgba(255,80,80,0.9)',
    firerate:  'rgba(255,200,0,0.9)',
    score:     'rgba(80,200,255,0.9)',
    shield:    'rgba(100,180,255,0.9)',
    speed:     'rgba(255,140,0,0.9)',
  };

  ctx.shadowColor = glows[type];
  ctx.shadowBlur  = 10 + 6 * Math.sin(pulse);

  // Chest body
  ctx.fillStyle = '#6b3a1f';
  ctx.fillRect(x, y + H * 0.35, W, H * 0.65);

  // Chest lid
  ctx.fillStyle = '#8b4e28';
  ctx.fillRect(x, y, W, H * 0.40);

  // Lid arc (rounded top)
  ctx.fillStyle = '#a05a30';
  ctx.fillRect(x + 1, y + 1, W - 2, H * 0.22);

  // Metal bands
  ctx.fillStyle = '#c8a050';
  ctx.fillRect(x, y + H * 0.33, W, 2);           // band across join
  ctx.fillRect(x + W * 0.42, y, W * 0.16, H);    // vertical center clasp

  // Lock
  ctx.fillStyle = '#e8c060';
  ctx.fillRect(x + W * 0.38, y + H * 0.28, W * 0.24, H * 0.28);

  // Type icon inside lock area
  ctx.shadowBlur  = 0;

  if (type === 'speed') {
    // Speeding wheel on fire — draw programmatically
    const cx = x + W / 2, cy = y + H * 0.75;
    const r  = Math.max(3, CELL * 0.22);
    const spin = pulse * 2.5;   // rotation tied to pulse timer

    // Flames behind wheel
    ctx.shadowColor = 'rgba(255,80,0,0.9)';
    ctx.shadowBlur  = 10 + 6 * Math.sin(pulse);
    for (let f = 0; f < 5; f++) {
      const fa  = spin + (f / 5) * Math.PI * 2;
      const fr  = r * (0.55 + 0.45 * Math.sin(pulse * 3 + f));
      const fx  = cx + Math.cos(fa) * fr * 1.4;
      const fy  = cy + Math.sin(fa) * fr * 1.4;
      ctx.fillStyle = f % 2 === 0 ? `rgba(255,100,0,${0.7 + 0.3 * glow})` : `rgba(255,200,0,${0.5 + 0.4 * glow})`;
      ctx.beginPath();
      ctx.arc(fx, fy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wheel rim
    ctx.shadowColor = `rgba(255,160,0,0.9)`;
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = `rgba(255,${Math.floor(160 + 80 * glow)},20,${0.85 + 0.15 * glow})`;
    ctx.lineWidth   = Math.max(1.5, r * 0.38);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    // Spokes (4, spinning)
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.strokeStyle = `rgba(255,220,80,${0.8 + 0.2 * glow})`;
    for (let s = 0; s < 4; s++) {
      const a = spin + (s / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth  = 1;
  } else {
    ctx.fillStyle   = colors[type];
    ctx.font        = `bold ${Math.max(6, CELL * 0.38)}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    const icons = { extralife: '♥', firerate: '⚡', score: '$', shield: '◎' };
    ctx.fillText(icons[type], x + W / 2, y + H * 0.75);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.shadowBlur = 0;
}

// ── Game Loop ────────────────────────────────────────────────
function loop(ts) {
  if (state === 'start' || state === 'paused' || state === 'gameover') return;

  if (lastTime === 0) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.08);
  lastTime = ts;

  if (state === 'dying') {
    deathTimer -= dt;
    updateExplosions(dt);
    render(dt);
    if (deathTimer <= 0) {
      lives--;
      updateHUD();
      if (lives <= 0) { triggerGameOver(); return; }
      spawnPlayer(lastEntryDir);
      playerBullets = [];
      robotBullets  = [];
      state         = 'entering';
      enterTimer    = 1.5;
      NeonArcade.startMusic();
    }
    requestAnimationFrame(loop);
    return;
  }

  if (state === 'entering') {
    enterTimer -= dt;
    updateExplosions(dt);
    render(dt);
    if (enterTimer <= 0) state = 'playing';
    requestAnimationFrame(loop);
    return;
  }

  // state === 'playing'
  updatePlayer(dt);
  if (state !== 'playing') { requestAnimationFrame(loop); return; }

  if (fireBoostTimer  > 0) fireBoostTimer  -= dt;
  if (shieldTimer     > 0) shieldTimer     -= dt;
  if (speedBoostTimer > 0) speedBoostTimer -= dt;

  // Standalone speed bonus spawn / age
  if (!speedBonus) {
    speedBonusTimer -= dt;
    if (speedBonusTimer <= 0) { spawnSpeedBonus(); speedBonusTimer = 10 + Math.random() * 8; }
  } else {
    speedBonus.pulse += dt * 3;
    speedBonus.life  -= dt;
    if (speedBonus.life <= 0) speedBonus = null;
  }
  if (chest) chest.pulse += dt * 4;
  if (masterSwitch) masterSwitch.pulse += dt * 3;
  updateRobots(dt);
  updateBullets(dt);
  updateBrotto(dt);
  updateExplosions(dt);
  robots = robots.filter(r => r.alive);

  render(dt);
  updateHUD();
  requestAnimationFrame(loop);
}

// ── Canvas swipe (fallback for devices without d-pad visibility) ──
let _swX = 0, _swY = 0;
canvas.addEventListener('touchstart', e => { _swX = e.touches[0].clientX; _swY = e.touches[0].clientY; }, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (state === 'playing') e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  if (state !== 'playing') return;
  const dx = e.changedTouches[0].clientX - _swX;
  const dy = e.changedTouches[0].clientY - _swY;
  if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    player.aimX = dx > 0 ? 1 : -1; player.aimY = 0;
  } else {
    player.aimX = 0; player.aimY = dy > 0 ? 1 : -1;
  }
}, { passive: false });

// ── Fullscreen (mobile) ───────────────────────────────────────
function tryFullscreen() {
  if (navigator.maxTouchPoints > 0 && !document.fullscreenElement)
    document.documentElement.requestFullscreen?.().catch(() => {});
}

// ── Buttons ──────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  tryFullscreen();
  hideOverlays();
  newGame();
  NeonArcade.startMusic();
  requestAnimationFrame(loop);
});
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause').addEventListener('click', () => {
  if (state === 'playing' || state === 'paused') togglePause();
});
document.getElementById('btn-restart').addEventListener('click', () => {
  tryFullscreen();
  hideOverlays();
  newGame();
  NeonArcade.startMusic();
  requestAnimationFrame(loop);
});
document.getElementById('btn-victory').addEventListener('click', () => {
  tryFullscreen();
  hideOverlays();
  newGame();
  NeonArcade.startMusic();
  requestAnimationFrame(loop);
});

document.getElementById('music-toggle').addEventListener('click', function () {
  const { track, name } = NeonArcade.cycleTrack();
  this.textContent = '♪ ' + name;
  if (state === 'playing' || state === 'entering') NeonArcade.startMusic();
});
document.getElementById('music-mute').addEventListener('click', function () {
  const { on } = NeonArcade.toggleMusic();
  this.textContent = on ? 'Music: ON' : 'Music: OFF';
  this.classList.toggle('off', !on);
});

// ── Mobile touch controls ─────────────────────────────────────
(function () {
  if (!navigator.maxTouchPoints) return;

  document.body.classList.add('is-mobile');

  document.getElementById('mobile-dpad').style.display      = 'flex';
  document.getElementById('mobile-fire-wrap').style.display = 'flex';

  const dpadCross = document.getElementById('dpad-cross');
  const elLeft    = document.getElementById('dpad-left');
  const elRight   = document.getElementById('dpad-right');
  const elUp      = document.getElementById('dpad-up');
  const elDown    = document.getElementById('dpad-down');
  const elUL      = document.getElementById('dpad-ul');
  const elUR      = document.getElementById('dpad-ur');
  const elDL      = document.getElementById('dpad-dl');
  const elDR      = document.getElementById('dpad-dr');
  const allCells  = [elLeft, elRight, elUp, elDown, elUL, elUR, elDL, elDR];
  const SWIPE_MIN = 18;
  let dpadStartX = 0, dpadStartY = 0;

  function clearDpadDirs() {
    touchDirs.left = touchDirs.right = touchDirs.up = touchDirs.down = false;
    allCells.forEach(el => el.classList.remove('active'));
  }

  function bindCell(el, dirs) {
    el.addEventListener('touchstart', e => {
      e.stopPropagation();
      e.preventDefault();
      clearDpadDirs();
      dirs.forEach(d => { touchDirs[d] = true; });
      el.classList.add('active');
    }, { passive: false });
    el.addEventListener('touchend', e => {
      e.stopPropagation();
      clearDpadDirs();
    }, { passive: false });
    el.addEventListener('touchcancel', e => {
      e.stopPropagation();
      clearDpadDirs();
    }, { passive: false });
  }
  bindCell(elLeft,  ['left']);
  bindCell(elRight, ['right']);
  bindCell(elUp,    ['up']);
  bindCell(elDown,  ['down']);
  bindCell(elUL,    ['up',   'left']);
  bindCell(elUR,    ['up',   'right']);
  bindCell(elDL,    ['down', 'left']);
  bindCell(elDR,    ['down', 'right']);

  dpadCross.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    dpadStartX = t.clientX;
    dpadStartY = t.clientY;
    clearDpadDirs();
  }, { passive: false });

  dpadCross.addEventListener('touchmove', e => {
    e.preventDefault();
    const t    = e.touches[0];
    const dx   = t.clientX - dpadStartX;
    const dy   = t.clientY - dpadStartY;
    const adx  = Math.abs(dx), ady = Math.abs(dy);
    clearDpadDirs();
    if (adx < SWIPE_MIN && ady < SWIPE_MIN) return;
    // Diagonal when both axes are active and within 2:1 ratio of each other
    const isDiag = adx > SWIPE_MIN && ady > SWIPE_MIN && adx < ady * 2 && ady < adx * 2;
    if (isDiag) {
      if (dx < 0) touchDirs.left  = true; else touchDirs.right = true;
      if (dy < 0) touchDirs.up    = true; else touchDirs.down  = true;
      const diagEl = dy < 0 ? (dx < 0 ? elUL : elUR) : (dx < 0 ? elDL : elDR);
      diagEl.classList.add('active');
    } else if (adx >= ady) {
      if (dx < 0) { touchDirs.left  = true; elLeft.classList.add('active'); }
      else         { touchDirs.right = true; elRight.classList.add('active'); }
    } else {
      if (dy < 0) { touchDirs.up   = true; elUp.classList.add('active'); }
      else         { touchDirs.down = true; elDown.classList.add('active'); }
    }
  }, { passive: false });

  dpadCross.addEventListener('touchend',    clearDpadDirs, { passive: true });
  dpadCross.addEventListener('touchcancel', clearDpadDirs, { passive: true });

  // ── Fire button ──────────────────────────────────────────────
  const fireBtn = document.getElementById('btn-fire-touch');

  fireBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    fireBtn.classList.add('pressed');
    touchFire = true;
  }, { passive: false });

  fireBtn.addEventListener('touchend', () => {
    fireBtn.classList.remove('pressed');
    touchFire = false;
  }, { passive: true });

  fireBtn.addEventListener('touchcancel', () => {
    fireBtn.classList.remove('pressed');
    touchFire = false;
  }, { passive: true });
})();

// ── Boot ─────────────────────────────────────────────────────
NeonArcade.setTrack(3);   // 8-bit arcade track
hiScore = parseInt(localStorage.getItem('berzerk_hi') || '0', 10);
hiEl.textContent = hiScore;
