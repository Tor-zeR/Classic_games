'use strict';

// ── Constants ────────────────────────────────────────────────
const COLS        = 48;
const ROWS        = 32;
const BASE_MS     = 200;  // initial tick interval (ms)
const MIN_MS      = 55;   // fastest allowed interval
const SPEED_STEP  = 2;    // ms reduction per food eaten

// ── DOM ──────────────────────────────────────────────────────
const canvas     = document.getElementById('game-canvas');
const ctx        = canvas.getContext('2d');
const scoreEl    = document.getElementById('score-display');
const hiEl       = document.getElementById('hi-display');
const lengthEl   = document.getElementById('length-display');
const levelEl    = document.getElementById('level-display');
const foodsEl    = document.getElementById('foods-display');
const ovStart    = document.getElementById('overlay-start');
const ovPause    = document.getElementById('overlay-pause');
const ovGameover = document.getElementById('overlay-gameover');
const goScore    = document.getElementById('go-score');
const tbFire     = document.getElementById('tb-fire');  // touch btn (may not exist)
const bonusBarEl = document.getElementById('bonus-bar');

// ── Constants (walls) ────────────────────────────────────────
const BONUS_THRESHOLD = 15;   // snake length at which the shoot bonus can appear
const BONUS_DURATION  = 10.0; // seconds the bonus item stays on field
const SHOOT_DURATION  = 5.0;  // seconds the shoot ability lasts after collection
const BULLET_STEP_MS  = 55;   // ms per bullet step (faster than snake)

const SHIELD_BONUS_DURATION = 10.0;  // seconds shield bonus item stays on field
const SPEED_BONUS_DURATION  = 10.0;  // seconds speed bonus item stays on field
const SPEED_BONUS_THRESHOLD = 25;    // foodCount at which speed bonus can appear (level 6)

const WALL_THRESHOLD  = 6;   // snake length at which walls begin
const WALL_START      = 2;   // initial wall count
const WALL_MAX_LEN    = 10;  // max cells per arm (full size)
const WALL_SMALL_MAX  = 4;   // max cells per arm while snake length < 10
const WALL_MIN_LEN    = 2;   // min cells per arm
const HEAD_CLEARANCE  = 4;   // cell radius kept free around snake head
const WALL_PROXIMITY  = 12;  // max cell offset from food when placing walls

const WALL_COLORS = [
  { fill: 'rgb(220,220,220)', glow: 'rgba(220,220,220,0.75)' },  // white
];

// ── State ────────────────────────────────────────────────────
let CELL = 12;  // dynamic, recomputed in resizeCanvas
let state = 'start';  // 'start' | 'playing' | 'paused' | 'gameover'
let snake, posSet, dir, nextDir;
let foods = [], foodSet = new Set();   // active food items on the field
let score, hiScore, foodCount, tickMs;
let _wfx = 0, _wfy = 0;               // reference food position for wall proximity
let bonus = null, bonusTimer = 0, bonusAngle = 0;
let shootTimer = 0, bullets = [], bulletAcc = 0, autoShootAcc = 0;
let shieldTimer = 0, shieldBonus = null, shieldBonusTimer = 0, shieldBonusAngle = 0;
let speedBonus  = null, speedBonusTimer = 0, speedBonusAngle = 0;
const AUTO_SHOOT_INTERVAL = 1 / 3;  // 3 projectiles per second
let walls = [], wallSet = new Set(), wallCount = 0, wallsActive = false;
let lastTime = 0, acc = 0;
let foodPulse = 0;
let eatFlash  = 0;  // brief brightness flash when food is eaten

// ── Resize ───────────────────────────────────────────────────
function resizeCanvas() {
  const mobileLandscape = window.innerHeight < 500 && window.innerWidth > window.innerHeight;
  if (mobileLandscape) {
    const availH = window.innerHeight - 56;
    CELL = Math.max(4, Math.min(20, Math.floor(availH / ROWS)));
  } else {
    const maxW = Math.min(window.innerWidth - 16, 960);
    const maxH = Math.max(180, window.innerHeight - 160);
    CELL = Math.max(6, Math.min(20, Math.floor(Math.min(maxW / COLS, maxH / ROWS))));
  }
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;
}
window.addEventListener('resize', () => { resizeCanvas(); if (state !== 'start') render(0); });
resizeCanvas();

// ── Helpers ──────────────────────────────────────────────────
function posKey(x, y) { return y * COLS + x; }

// Count open (non-wall, in-bounds) neighbours — used to ensure food
// always has at least 2 entry paths so it can never be a walled dead-end.
function openNeighborCount(x, y) {
  return [[-1,0],[1,0],[0,-1],[0,1]].filter(([dx,dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !wallSet.has(posKey(nx, ny));
  }).length;
}

// BFS flood-fill from (sx, sy) treating only wallSet as blockers.
// Returns a Set of posKey numbers for all reachable cells.
function reachableFrom(sx, sy) {
  const visited = new Set();
  const start = posKey(sx, sy);
  visited.add(start);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift();
    const x = k % COLS, y = Math.floor(k / COLS);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const nk = posKey(nx, ny);
      if (visited.has(nk) || wallSet.has(nk)) continue;
      visited.add(nk);
      queue.push(nk);
    }
  }
  return visited;
}

// How many food items should be on the field given current snake length.
// Starts at 1, adds one extra for every 5 lengths from length 5 onward.
function targetFoodCount() {
  return snake.length < 5 ? 1 : 1 + Math.floor(snake.length / 5);
}

// Spawn food items until the field has `n` of them.
// Each new item avoids snake body, walls, and existing food.
function spawnFoods(n) {
  for (let i = foods.length; i < n; i++) {
    let x, y, attempts = 0;
    do {
      x = Math.floor(Math.random() * COLS);
      y = Math.floor(Math.random() * ROWS);
      attempts++;
    } while (
      (posSet.has(posKey(x, y)) || wallSet.has(posKey(x, y)) || foodSet.has(posKey(x, y))
       || (bonus       && posKey(x, y) === posKey(bonus.x,       bonus.y))
       || (shieldBonus && posKey(x, y) === posKey(shieldBonus.x, shieldBonus.y))
       || (speedBonus  && posKey(x, y) === posKey(speedBonus.x,  speedBonus.y))
       || openNeighborCount(x, y) < 2)
      && attempts < 400
    );
    if (attempts < 400) {
      foods.push({ x, y });
      foodSet.add(posKey(x, y));
    }
  }
}

// Spawn the shoot-power bonus at a random free cell.
function spawnBonus() {
  let x, y, attempts = 0;
  do {
    x = Math.floor(Math.random() * COLS);
    y = Math.floor(Math.random() * ROWS);
    attempts++;
  } while (
    (posSet.has(posKey(x, y)) || wallSet.has(posKey(x, y)) || foodSet.has(posKey(x, y)))
    && attempts < 400
  );
  if (attempts < 400) {
    bonus      = { x, y };
    bonusTimer = BONUS_DURATION;
  }
}

// Spawn the shield bonus at a random free cell.
function spawnShieldBonus() {
  let x, y, attempts = 0;
  do {
    x = Math.floor(Math.random() * COLS);
    y = Math.floor(Math.random() * ROWS);
    attempts++;
  } while (
    (posSet.has(posKey(x, y)) || wallSet.has(posKey(x, y)) || foodSet.has(posKey(x, y))
     || (bonus && posKey(x, y) === posKey(bonus.x, bonus.y)))
    && attempts < 400
  );
  if (attempts < 400) {
    shieldBonus      = { x, y };
    shieldBonusTimer = SHIELD_BONUS_DURATION;
  }
}

// Spawn the speed-decrease bonus at a random free cell.
function spawnSpeedBonus() {
  let x, y, attempts = 0;
  do {
    x = Math.floor(Math.random() * COLS);
    y = Math.floor(Math.random() * ROWS);
    attempts++;
  } while (
    (posSet.has(posKey(x, y)) || wallSet.has(posKey(x, y)) || foodSet.has(posKey(x, y))
     || (bonus        && posKey(x, y) === posKey(bonus.x,        bonus.y))
     || (shieldBonus  && posKey(x, y) === posKey(shieldBonus.x,  shieldBonus.y)))
    && attempts < 400
  );
  if (attempts < 400) {
    speedBonus      = { x, y };
    speedBonusTimer = SPEED_BONUS_DURATION;
  }
}

// Attempt to deflect the snake when shield is active (hit wall/border).
// Tries left turn (CCW) first, then right turn (CW). Returns true if deflected.
function shieldTurn() {
  const d = dir;
  const head = snake[0];
  const candidates = [
    { x: -d.y, y: d.x },   // CCW (left relative to current heading)
    { x:  d.y, y: -d.x },  // CW  (right)
  ];
  for (const t of candidates) {
    const tx = head.x + t.x;
    const ty = head.y + t.y;
    if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && !wallSet.has(posKey(tx, ty))) {
      dir     = { x: t.x, y: t.y };
      nextDir = { x: t.x, y: t.y };
      return true;
    }
  }
  return false; // completely cornered
}

// Advance all bullets one step and resolve wall collisions.
function stepBullets() {
  bullets = bullets.filter(b => {
    b.x += b.dx;
    b.y += b.dy;
    if (b.x < 0 || b.x >= COLS || b.y < 0 || b.y >= ROWS) return false;
    const k = posKey(b.x, b.y);
    if (wallSet.has(k)) {
      // Remove only the single tile that was hit
      wallSet.delete(k);
      for (const wall of walls) {
        const ci = wall.cells.findIndex(c => posKey(c.x, c.y) === k);
        if (ci !== -1) {
          wall.cells.splice(ci, 1);
          break;
        }
      }
      // Drop empty wall objects
      walls = walls.filter(w => w.cells.length > 0);
      NeonArcade.SFX.snakeWallHit();
      return false; // bullet consumed on impact
    }
    return true;
  });
}

// ── Wall Generation ───────────────────────────────────────────

// Returns a coordinate biased within WALL_PROXIMITY of the food,
// clamped so a segment of `armLen` cells fits inside the grid.
function _biasedCoord(foodVal, gridMax, armLen) {
  const lo = Math.max(0,            foodVal - WALL_PROXIMITY);
  const hi = Math.min(gridMax - armLen, foodVal + WALL_PROXIMITY);
  if (lo > hi) return -1;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// Try to build a straight (H or V) wall near food; returns cells[] or null.
function _tryStraight(forbidden) {
  const horiz  = Math.random() < 0.5;
  const maxLen = snake.length < 10 ? WALL_SMALL_MAX : WALL_MAX_LEN;
  const len    = WALL_MIN_LEN + Math.floor(Math.random() * (maxLen - WALL_MIN_LEN + 1));

  const sx = horiz ? _biasedCoord(_wfx, COLS, len) : _biasedCoord(_wfx, COLS, 1);
  const sy = horiz ? _biasedCoord(_wfy, ROWS, 1)   : _biasedCoord(_wfy, ROWS, len);
  if (sx < 0 || sy < 0) return null;

  const cells = [];
  for (let i = 0; i < len; i++) {
    const cx = horiz ? sx + i : sx;
    const cy = horiz ? sy     : sy + i;
    const k  = posKey(cx, cy);
    if (forbidden.has(k) || wallSet.has(k)) return null;
    cells.push({ x: cx, y: cy });
  }
  return cells;
}

// Try to build an L-shaped wall (two arms from a shared corner) near food;
// returns cells[] or null.
function _tryL(forbidden) {
  const maxLen = snake.length < 10 ? WALL_SMALL_MAX : WALL_MAX_LEN;
  const hLen   = WALL_MIN_LEN + Math.floor(Math.random() * (maxLen - WALL_MIN_LEN));
  const vLen   = WALL_MIN_LEN + Math.floor(Math.random() * (maxLen - WALL_MIN_LEN));

  // Corner biased towards food
  const cx = _biasedCoord(_wfx, COLS, 1);
  const cy = _biasedCoord(_wfy, ROWS, 1);
  if (cx < 0 || cy < 0) return null;

  // Random arm directions
  const hDir = Math.random() < 0.5 ? 1 : -1;
  const vDir = Math.random() < 0.5 ? 1 : -1;

  const seen  = new Set();
  const cells = [];

  // Horizontal arm (includes corner)
  for (let i = 0; i < hLen; i++) {
    const x = cx + i * hDir, y = cy;
    if (x < 0 || x >= COLS) return null;
    const k = posKey(x, y);
    if (forbidden.has(k) || wallSet.has(k)) return null;
    if (!seen.has(k)) { seen.add(k); cells.push({ x, y }); }
  }
  // Vertical arm (skips corner, already added)
  for (let i = 1; i < vLen; i++) {
    const x = cx, y = cy + i * vDir;
    if (y < 0 || y >= ROWS) return null;
    const k = posKey(x, y);
    if (forbidden.has(k) || wallSet.has(k)) return null;
    if (!seen.has(k)) { seen.add(k); cells.push({ x, y }); }
  }
  return cells.length >= WALL_MIN_LEN ? cells : null;
}

function generateWalls() {
  walls   = [];
  wallSet = new Set();

  // Use centroid of all food items as the proximity reference
  if (foods.length > 0) {
    _wfx = Math.round(foods.reduce((s, f) => s + f.x, 0) / foods.length);
    _wfy = Math.round(foods.reduce((s, f) => s + f.y, 0) / foods.length);
  }

  // Forbidden zone: snake body + all food items + bonus + clearance bubble around head
  const forbidden = new Set(posSet);
  foods.forEach(f => forbidden.add(posKey(f.x, f.y)));
  if (bonus)        forbidden.add(posKey(bonus.x,        bonus.y));
  if (shieldBonus)  forbidden.add(posKey(shieldBonus.x,  shieldBonus.y));
  if (speedBonus)   forbidden.add(posKey(speedBonus.x,   speedBonus.y));
  const hx = snake[0].x, hy = snake[0].y;
  for (let dy = -HEAD_CLEARANCE; dy <= HEAD_CLEARANCE; dy++) {
    for (let dx = -HEAD_CLEARANCE; dx <= HEAD_CLEARANCE; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= HEAD_CLEARANCE) {
        const px = hx + dx, py = hy + dy;
        if (px >= 0 && px < COLS && py >= 0 && py < ROWS)
          forbidden.add(posKey(px, py));
      }
    }
  }

  let placed = 0, tries = 0;
  const maxTries = wallCount * 50;

  while (placed < wallCount && tries < maxTries) {
    tries++;
    const useL  = Math.random() < 0.4;  // 40 % L-shape, 60 % straight
    const cells = useL ? _tryL(forbidden) : _tryStraight(forbidden);
    if (!cells) continue;

    const color = WALL_COLORS[Math.floor(Math.random() * WALL_COLORS.length)];
    walls.push({ cells, color });
    cells.forEach(c => {
      const k = posKey(c.x, c.y);
      wallSet.add(k);
      forbidden.add(k);
    });
    placed++;
  }

  // BFS reachability: ensure every food item can be reached from the snake head.
  // Relocate any trapped food to a random reachable open cell.
  const reachable = reachableFrom(snake[0].x, snake[0].y);
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    if (reachable.has(posKey(f.x, f.y))) continue;
    foodSet.delete(posKey(f.x, f.y));
    const candidates = [];
    for (const k of reachable) {
      if (!posSet.has(k) && !wallSet.has(k) && !foodSet.has(k)) candidates.push(k);
    }
    if (candidates.length > 0) {
      const nk = candidates[Math.floor(Math.random() * candidates.length)];
      foods[i] = { x: nk % COLS, y: Math.floor(nk / COLS) };
      foodSet.add(nk);
    } else {
      foodSet.add(posKey(f.x, f.y)); // no open cell found, restore (edge case)
    }
  }
}

// ── Game Init ─────────────────────────────────────────────────
function startGame() {
  const sx = Math.floor(COLS / 2);
  const sy = Math.floor(ROWS / 2);
  snake = [
    { x: sx,     y: sy },
    { x: sx - 1, y: sy },
    { x: sx - 2, y: sy },
  ];
  posSet    = new Set(snake.map(p => posKey(p.x, p.y)));
  dir       = { x: 1, y: 0 };
  nextDir   = { x: 1, y: 0 };
  score       = 0;
  foodCount   = 0;
  tickMs      = BASE_MS;
  walls       = [];
  wallSet     = new Set();
  wallCount   = 0;
  wallsActive = false;
  foods       = [];
  foodSet     = new Set();
  bonus       = null;
  bonusTimer  = 0;
  bonusAngle  = 0;
  shootTimer    = 0;
  bullets       = [];
  bulletAcc     = 0;
  autoShootAcc  = 0;
  shieldTimer      = 0;
  shieldBonus      = null;
  shieldBonusTimer = 0;
  shieldBonusAngle = 0;
  speedBonus       = null;
  speedBonusTimer  = 0;
  speedBonusAngle  = 0;
  hiScore     = parseInt(localStorage.getItem('snake_hi') || '0', 10);
  spawnFoods(targetFoodCount());
  updateHUD();
  hideOverlays();
  state    = 'playing';
  lastTime = 0;
  acc      = 0;
  NeonArcade.startMusic();
  requestAnimationFrame(loop);
}

// ── Tick Logic ───────────────────────────────────────────────
function tick() {
  dir = { x: nextDir.x, y: nextDir.y };

  const head = snake[0];
  const nx = head.x + dir.x;
  const ny = head.y + dir.y;

  // Boundary collision → game over (shield absorbs one hit then is consumed)
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (shieldTimer > 0 && shieldTurn()) { shieldTimer = 0; return; }
    triggerGameOver();
    return;
  }

  // Wall collision → game over (shield absorbs one hit then is consumed)
  if (wallSet.has(posKey(nx, ny))) {
    if (shieldTimer > 0 && shieldTurn()) { shieldTimer = 0; return; }
    triggerGameOver();
    return;
  }

  // Bonus collection — doesn't grow the snake
  if (bonus && nx === bonus.x && ny === bonus.y) {
    shootTimer   = SHOOT_DURATION;
    bonus        = null;
    bonusTimer   = 0;
    bulletAcc    = 0;
    autoShootAcc = 0;
    NeonArcade.SFX.snakePowerUp();
  }

  if (shieldBonus && nx === shieldBonus.x && ny === shieldBonus.y) {
    shieldTimer      = 1;  // truthy = shield active; consumed on next wall hit
    shieldBonus      = null;
    shieldBonusTimer = 0;
    NeonArcade.SFX.snakePowerUp();
  }

  if (speedBonus && nx === speedBonus.x && ny === speedBonus.y) {
    tickMs          = Math.min(BASE_MS, tickMs * 2);  // halve speed (double interval)
    speedBonus      = null;
    speedBonusTimer = 0;
    NeonArcade.SFX.snakePowerUp();
  }

  const ateKey = posKey(nx, ny);
  const ate    = foodSet.has(ateKey);
  const tail   = snake[snake.length - 1];

  // Temporarily remove tail from occupied set (it will move away this tick)
  // unless the snake is eating (tail stays = growth)
  if (!ate) posSet.delete(posKey(tail.x, tail.y));

  // Self-collision check
  if (posSet.has(posKey(nx, ny))) {
    triggerGameOver();
    return;
  }

  // Move: prepend new head
  snake.unshift({ x: nx, y: ny });
  posSet.add(posKey(nx, ny));

  NeonArcade.SFX.snakeMove();

  if (ate) {
    // Grow: tail stays (posSet still contains old tail position)
    foodSet.delete(ateKey);
    foods.splice(foods.findIndex(f => posKey(f.x, f.y) === ateKey), 1);

    foodCount++;
    score += 10;
    eatFlash = 0.22;
    NeonArcade.SFX.snakeEat();
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem('snake_hi', hiScore);
    }
    tickMs = Math.max(MIN_MS, tickMs - SPEED_STEP);

    // Only replenish food when the entire batch has been eaten
    const batchComplete = foods.length === 0;
    if (batchComplete) {
      spawnFoods(targetFoodCount());
    }

    // Spawn shoot or shield bonus when length reaches threshold
    if (snake.length >= BONUS_THRESHOLD) {
      if (!bonus && !shieldBonus) {
        // Neither bonus on field: randomly pick one (only if matching power isn't active)
        const canShoot  = shootTimer  <= 0;
        const canShield = shieldTimer <= 0;
        if (canShoot && canShield) {
          if (Math.random() < 0.5) spawnBonus(); else spawnShieldBonus();
        } else if (canShoot)  { spawnBonus(); }
        else if (canShield)   { spawnShieldBonus(); }
      } else if (!bonus  && shootTimer  <= 0) { spawnBonus(); }
      else if (!shieldBonus && shieldTimer <= 0) { spawnShieldBonus(); }
    }

    // Spawn speed-decrease bonus at level 6+ (foodCount >= 25)
    if (foodCount >= SPEED_BONUS_THRESHOLD && !speedBonus && Math.random() < 0.35) {
      spawnSpeedBonus();
    }

    // Walls regenerate only when the full food batch has been eaten
    if (batchComplete && snake.length >= WALL_THRESHOLD) {
      if (!wallsActive) {
        wallsActive = true;
        wallCount   = WALL_START;
      } else {
        wallCount++;
      }
      generateWalls();
    }
  } else {
    // Remove tail (already removed from posSet above)
    snake.pop();
  }

  updateHUD();
}

function triggerGameOver() {
  state = 'gameover';
  if (score > hiScore) {
    hiScore = score;
    localStorage.setItem('snake_hi', hiScore);
  }
  goScore.textContent = 'SCORE: ' + score;
  ovGameover.classList.remove('hidden');
  NeonArcade.stopMusic();
  NeonArcade.SFX.snakeDie();
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD() {
  scoreEl.textContent  = score;
  hiEl.textContent     = hiScore;
  lengthEl.textContent = snake.length;
  foodsEl.textContent  = foodCount;
  levelEl.textContent  = Math.floor(foodCount / 5) + 1;
  tbFire?.classList.toggle('active', shootTimer > 0);
}

// ── Overlays ──────────────────────────────────────────────────
function hideOverlays() {
  ovStart.classList.add('hidden');
  ovPause.classList.add('hidden');
  ovGameover.classList.add('hidden');
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
    acc = 0;
    NeonArcade.startMusic();
    requestAnimationFrame(loop);
  }
}

// ── Rendering ─────────────────────────────────────────────────
function render(dt) {
  foodPulse += dt * 3.5;
  if (eatFlash > 0) eatFlash -= dt;

  const W = canvas.width;
  const H = canvas.height;

  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(255, 100, 0, 0.06)';
  ctx.lineWidth   = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, H);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(W, r * CELL);
    ctx.stroke();
  }

  // Walls — coloured neon barriers (each wall has its own random colour)
  for (const wall of walls) {
    ctx.fillStyle   = wall.color.fill;
    ctx.shadowColor = wall.color.glow;
    ctx.shadowBlur  = 6;
    for (const c of wall.cells) {
      // Merge borders with adjacent cells of the same wall for a solid look
      const left  = wallSet.has(posKey(c.x - 1, c.y));
      const right = wallSet.has(posKey(c.x + 1, c.y));
      const up    = wallSet.has(posKey(c.x, c.y - 1));
      const down  = wallSet.has(posKey(c.x, c.y + 1));
      ctx.fillRect(
        c.x * CELL + (left  ? 0 : 2),
        c.y * CELL + (up    ? 0 : 2),
        CELL - (left ? 0 : 2) - (right ? 0 : 2),
        CELL - (up   ? 0 : 2) - (down  ? 0 : 2)
      );
    }
  }
  ctx.shadowBlur = 0;

  // Food — pulsing green squares with glow (all items pulse together)
  const fp  = 0.5 + 0.5 * Math.sin(foodPulse);
  const fg  = Math.floor(170 + 85 * fp);
  ctx.shadowColor = `rgba(0, ${fg}, 50, 0.9)`;
  ctx.shadowBlur  = 5 + fp * 10;
  ctx.fillStyle   = `rgb(0, ${fg}, 55)`;
  const fm = 3;
  for (const f of foods) {
    ctx.fillRect(f.x * CELL + fm, f.y * CELL + fm, CELL - fm * 2, CELL - fm * 2);
  }
  ctx.shadowBlur = 0;

  // Angle updates for animated bonuses
  shieldBonusAngle += dt * 1.4;
  speedBonusAngle  += dt * 0.8;

  // Bonus item — bullet icon (slow spin)
  if (bonus) {
    bonusAngle += dt * 1.8;
    const bx = bonus.x * CELL + CELL * 0.5;
    const by = bonus.y * CELL + CELL * 0.5;

    const hw  = Math.max(2, CELL * 0.22);  // half-width
    const bh  = Math.max(3, CELL * 0.28);  // body height (below midline)
    const tip = Math.max(2, CELL * 0.26);  // tip height (above midline)

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(bonusAngle);
    ctx.shadowColor = 'rgba(255,220,0,0.95)';
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = '#ffe000';

    // Bullet shape: rounded-tip top, flat bottom
    ctx.beginPath();
    ctx.moveTo(-hw,  bh);                                    // bottom-left
    ctx.lineTo( hw,  bh);                                    // bottom-right
    ctx.lineTo( hw,  0);                                     // right shoulder
    ctx.quadraticCurveTo( hw, -bh - tip,  0, -bh - tip);    // right curve to tip
    ctx.quadraticCurveTo(-hw, -bh - tip, -hw,  0);          // left curve from tip
    ctx.closePath();
    ctx.fill();

    // Casing band
    ctx.fillStyle   = 'rgba(180,140,0,0.7)';
    ctx.shadowBlur  = 0;
    ctx.fillRect(-hw, bh * 0.1, hw * 2, bh * 0.5);

    ctx.restore();
  }

  // Shield bonus — blue bubble
  if (shieldBonus) {
    const bx = shieldBonus.x * CELL + CELL * 0.5;
    const by = shieldBonus.y * CELL + CELL * 0.5;
    const pulse = 0.82 + 0.18 * Math.sin(shieldBonusAngle * 3.5);
    const r = Math.max(3, CELL * 0.38 * pulse);

    ctx.save();
    ctx.translate(bx, by);
    ctx.shadowColor = 'rgba(80,160,255,0.95)';
    ctx.shadowBlur  = 18;
    // Translucent fill
    ctx.fillStyle = 'rgba(60,120,255,0.22)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // Bright rim
    ctx.strokeStyle = 'rgba(160,210,255,0.95)';
    ctx.lineWidth   = Math.max(1.5, CELL * 0.1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    // Specular highlight
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(210,230,255,0.65)';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.32, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Speed bonus — snowflake
  if (speedBonus) {
    const bx = speedBonus.x * CELL + CELL * 0.5;
    const by = speedBonus.y * CELL + CELL * 0.5;
    const arm = Math.max(3, CELL * 0.38);

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(speedBonusAngle);
    ctx.shadowColor = 'rgba(120,200,255,0.95)';
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = '#aaddff';
    ctx.lineWidth   = Math.max(1, CELL * 0.09);
    ctx.lineCap     = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, arm);
      ctx.stroke();
      // Side branches at 50% and 80% of arm
      for (const frac of [0.45, 0.75]) {
        const bLen = arm * 0.28;
        const by2  = arm * frac;
        ctx.beginPath();
        ctx.moveTo(0, by2);
        ctx.lineTo( bLen, by2 + bLen);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, by2);
        ctx.lineTo(-bLen, by2 + bLen);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Bullets — fast bright projectiles
  if (bullets.length > 0) {
    ctx.shadowColor = 'rgba(255,255,180,0.9)';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#fff';
    const bm = Math.max(1.5, CELL * 0.18);
    for (const b of bullets) {
      ctx.fillRect(
        b.x * CELL + CELL * 0.5 - bm,
        b.y * CELL + CELL * 0.5 - bm,
        bm * 2, bm * 2
      );
    }
    ctx.shadowBlur = 0;
  }

  // Bonus status bar (DOM element below field — updated each frame)
  {
    let html = '';
    if (shootTimer > 0)  html += `<span class="bonus-shoot">★ AUTO-SHOOT  ${shootTimer.toFixed(1)}s</span>`;
    if (shieldTimer > 0) html += `<span class="bonus-shield">⬡ SHIELD  ●</span>`;
    bonusBarEl.innerHTML = html;
  }

  // Eat flash — brief full-canvas brightness pulse
  if (eatFlash > 0) {
    const fa = (eatFlash / 0.22) * 0.12;
    ctx.fillStyle = `rgba(255, 200, 100, ${fa})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Snake — draw tail→head so head renders on top
  const len = snake.length;
  for (let i = len - 1; i >= 0; i--) {
    const seg    = snake[i];
    const t      = 1 - i / len;  // 1.0 at head, near 0 at tail
    const isHead = (i === 0);

    // Colour gradient: bright amber at head, dim brown at tail
    const r = Math.floor(140 + 115 * t);
    const g = Math.floor(30  + 80  * t);
    const a = 0.30 + 0.70 * t;

    if (isHead) {
      ctx.shadowColor = shieldTimer > 0 ? 'rgba(100,180,255,0.95)' : 'rgba(255, 140, 0, 0.85)';
      ctx.shadowBlur  = shieldTimer > 0 ? 22 : 16;
    } else {
      ctx.shadowColor = 'rgba(255, 100, 0, 0.25)';
      ctx.shadowBlur  = 3;
    }

    ctx.fillStyle = `rgba(${r}, ${g}, 0, ${a})`;
    const m = isHead ? 1 : 2;
    ctx.fillRect(seg.x * CELL + m, seg.y * CELL + m, CELL - m * 2, CELL - m * 2);
  }
  ctx.shadowBlur = 0;

  // Eyes on head — position depends on direction
  if (len > 0) {
    const h  = snake[0];
    const hx = h.x * CELL;
    const hy = h.y * CELL;
    const dx = dir.x;
    const dy = dir.y;
    let e1x, e1y, e2x, e2y;

    if      (dx ===  1) { e1x = hx + CELL*0.68; e1y = hy + CELL*0.22; e2x = hx + CELL*0.68; e2y = hy + CELL*0.62; }
    else if (dx === -1) { e1x = hx + CELL*0.20; e1y = hy + CELL*0.22; e2x = hx + CELL*0.20; e2y = hy + CELL*0.62; }
    else if (dy === -1) { e1x = hx + CELL*0.22; e1y = hy + CELL*0.20; e2x = hx + CELL*0.62; e2y = hy + CELL*0.20; }
    else                { e1x = hx + CELL*0.22; e1y = hy + CELL*0.68; e2x = hx + CELL*0.62; e2y = hy + CELL*0.68; }

    const er = Math.max(1.5, CELL * 0.11);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(e1x, e1y, er, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e2x, e2y, er, 0, Math.PI * 2); ctx.fill();
  }
}

// ── Game Loop ─────────────────────────────────────────────────
function loop(ts) {
  if (state !== 'playing') return;

  if (lastTime === 0) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;
  acc += dt * 1000;

  while (acc >= tickMs) {
    acc -= tickMs;
    tick();
    if (state !== 'playing') return;
  }

  // Bonus expiry
  if (bonusTimer      > 0) { bonusTimer      -= dt; if (bonusTimer      <= 0) { bonus       = null; bonusTimer      = 0; } }
  if (shieldBonusTimer > 0) { shieldBonusTimer -= dt; if (shieldBonusTimer <= 0) { shieldBonus = null; shieldBonusTimer = 0; } }
  if (speedBonusTimer  > 0) { speedBonusTimer  -= dt; if (speedBonusTimer  <= 0) { speedBonus  = null; speedBonusTimer  = 0; } }

  // Shield is permanent — no countdown; consumed on wall hit

  // Shoot ability countdown + auto-fire
  if (shootTimer > 0) {
    shootTimer -= dt;
    if (shootTimer <= 0) {
      shootTimer = 0; bullets = []; bulletAcc = 0; autoShootAcc = 0;
      tbFire?.classList.remove('active');
    } else {
      autoShootAcc += dt;
      while (autoShootAcc >= AUTO_SHOOT_INTERVAL) {
        autoShootAcc -= AUTO_SHOOT_INTERVAL;
        bullets.push({ x: snake[0].x, y: snake[0].y, dx: dir.x, dy: dir.y });
        NeonArcade.SFX.snakeShoot();
      }
    }
  }

  // Advance bullets on their own fast timer
  if (bullets.length > 0) {
    bulletAcc += dt * 1000;
    while (bulletAcc >= BULLET_STEP_MS && bullets.length > 0) {
      bulletAcc -= BULLET_STEP_MS;
      stepBullets();
    }
  } else {
    bulletAcc = 0;
  }

  render(dt);
  requestAnimationFrame(loop);
}

// ── Keyboard Input ───────────────────────────────────────────
const KEY_DIR = {
  ArrowUp:    { x: 0, y: -1 }, ArrowDown:  { x: 0, y:  1 },
  ArrowLeft:  { x:-1, y:  0 }, ArrowRight: { x: 1, y:  0 },
  w: { x: 0, y: -1 }, s: { x: 0, y:  1 }, a: { x:-1, y:  0 }, d: { x: 1, y:  0 },
  W: { x: 0, y: -1 }, S: { x: 0, y:  1 }, A: { x:-1, y:  0 }, D: { x: 1, y:  0 },
};

document.addEventListener('keydown', e => {
  const d = KEY_DIR[e.key];
  if (d && state === 'playing') {
    // Disallow 180° reversal
    if (!(d.x === -dir.x && d.y === -dir.y)) nextDir = d;
    e.preventDefault();
  }
  if ((e.key === 'p' || e.key === 'P') && (state === 'playing' || state === 'paused')) {
    togglePause();
    e.preventDefault();
  }
  if (e.key === ' ' && state === 'playing' && shootTimer > 0) {
    bullets.push({ x: snake[0].x, y: snake[0].y, dx: dir.x, dy: dir.y });
    NeonArcade.SFX.snakeShoot();
    e.preventDefault();
  }
});

// ── Touch Swipe on Canvas ────────────────────────────────────
let touchX = 0, touchY = 0;
canvas.addEventListener('touchstart', e => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (state === 'playing') e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  if (state !== 'playing') return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return; // minimum swipe distance
  let d;
  if (Math.abs(dx) > Math.abs(dy)) {
    d = dx > 0 ? { x: 1, y: 0 } : { x:-1, y: 0 };
  } else {
    d = dy > 0 ? { x: 0, y: 1 } : { x: 0, y:-1 };
  }
  if (!(d.x === -dir.x && d.y === -dir.y)) nextDir = d;
}, { passive: false });

// ── Button Handlers ───────────────────────────────────────────
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

document.getElementById('btn-start').addEventListener('click',   () => { tryFullscreen(); startGame(); });
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause').addEventListener('click', () => {
  if (state === 'playing' || state === 'paused') togglePause();
});
document.getElementById('btn-restart').addEventListener('click', () => { tryFullscreen(); startGame(); });

// ── Music Toggle ──────────────────────────────────────────────
document.getElementById('music-toggle').addEventListener('click', function () {
  const { name } = NeonArcade.cycleTrack();
  this.textContent = '♪ ' + name;
  if (state === 'playing') NeonArcade.startMusic();
});
document.getElementById('music-mute').addEventListener('click', function () {
  const { on } = NeonArcade.toggleMusic();
  this.textContent = on ? 'Music: ON' : 'Music: OFF';
  this.classList.toggle('off', !on);
});

// ── Boot ──────────────────────────────────────────────────────
NeonArcade.setTrack(1);  // CHIP music
hiScore = parseInt(localStorage.getItem('snake_hi') || '0', 10);
hiEl.textContent = hiScore;
