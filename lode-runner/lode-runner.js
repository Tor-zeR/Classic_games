'use strict';
// ============================================================
//  LODE RUNNER — Neon Arcade
// ============================================================

// ── Constants ───────────────────────────────────────────────
const COLS = 28, ROWS = 16;
const TILE = 34;
const HUD_H = 0;   // HUD is in DOM side panels, not on canvas
const CW = COLS * TILE;   // 952
const CH = ROWS * TILE;   // 544

const WALK_MS   = 145;
const CLIMB_MS  = 180;
const FALL_MS   = 58;
const GUARD_MS  = 230;
const AI_MS     = 380;   // guard re-evaluates AI every N ms

const HOLE_OPEN_MS = 8000;
const HOLE_FILL_MS = 1300;

const LIVES_START = 5;
const INV_MS      = 2200;
const DIG_ANIM_MS = 350;
const GUARD_GOLD_RADIUS = 8;  // Manhattan distance within which a guard will divert to collect gold

// Exit ladder: when all gold collected, a standalone virtual ladder appears at a per-level column.
// Each entry is a column chosen so rows 0-3 are empty in that level and it sits adjacent to (but
// not connected with) an existing ladder, so the exit looks like a separate floating structure.
//   L1 col 14: adjacent to ladder at 13, player walks from col-13 row-3 rightward onto exit
//   L2 col 14: same
//   L3 col 14: platform at row 2; player walks at row 1 from col-13 to col-14
//   L4 col 11: adjacent to ladder at 10; player walks at row 1 from col-10 to col-11
//   L5 col 15: adjacent to ladder at 14; player walks at row 1 from col-14 to col-15
const EXIT_COLS = [14, 14, 14, 21, 21, 21];
const EXIT_ROWS = 4;  // virtual ladder spans rows 0-3
let exitCol = EXIT_COLS[0];

// ── Tile Types ───────────────────────────────────────────────
const T = { EMPTY: 0, BRICK: 1, SOLID: 2, LADDER: 3, ROPE: 4, GOLD: 5, TRAP: 6 };

// Level data is in lode-runner-levels.js (loaded before this script)

// ── Difficulty scaling ───────────────────────────────────────
// Guards get faster each level: -15ms move time, -25ms AI reaction, floored at minimums
function guardMs() { return Math.max(120, GUARD_MS - levelIndex * 15); }
function aiMs()    { return Math.max(200, AI_MS    - levelIndex * 25); }

// ── Parse helpers ───────────────────────────────────────────
function parseLevel(rows) {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const line = (rows[r] || '').padEnd(COLS, ' ').slice(0, COLS);
    const row = [];
    for (let c = 0; c < COLS; c++) {
      switch (line[c]) {
        case 'b': row.push(T.BRICK);  break;
        case '#': row.push(T.SOLID);  break;
        case 'h': row.push(T.LADDER); break;
        case '-': row.push(T.ROPE);   break;
        case 'g': row.push(T.GOLD);   break;
        case 't': row.push(T.TRAP);   break;
        default:  row.push(T.EMPTY);  break;
      }
    }
    grid.push(row);
  }
  return grid;
}

function findStarts(rows) {
  const players = [], enemies = [];
  for (let r = 0; r < ROWS; r++) {
    const line = (rows[r] || '').padEnd(COLS, ' ').slice(0, COLS);
    for (let c = 0; c < COLS; c++) {
      if (line[c] === 'p') players.push({ col: c, row: r });
      if (line[c] === 'e') enemies.push({ col: c, row: r });
    }
  }
  return { players, enemies };
}

// ── Canvas setup ────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  if (navigator.maxTouchPoints > 0) {
    const SIDE_W = 130;  // each side panel width on mobile (matches CSS absolute panels)
    const TOP_H  = 44;   // topbar height on mobile
    const availW = window.innerWidth  - SIDE_W * 2;
    const availH = window.innerHeight - TOP_H;
    const scale  = Math.min(availW / CW, availH / CH);
    canvas.style.width  = Math.floor(CW * scale) + 'px';
    canvas.style.height = Math.floor(CH * scale) + 'px';
  } else {
    canvas.style.width  = '';
    canvas.style.height = '';
  }
}

canvas.width  = CW;
canvas.height = CH;
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── DOM ─────────────────────────────────────────────────────
const scoreEl  = document.getElementById('score-display');
const hiEl     = document.getElementById('hi-display');
const livesEl  = document.getElementById('lives-display');
const levelEl  = document.getElementById('level-display');
const goldEl   = document.getElementById('gold-display');

// ── Game State ──────────────────────────────────────────────
let state      = 'start';  // start|playing|paused|levelclear|gameover|victory
let levelIndex = 0;
let score      = 0;
let hiScore    = 0;
let lives      = LIVES_START;
let grid       = [];
let holes      = [];     // {col, row, timer, phase:'open'|'filling'}
let goldList   = [];     // {col, row}
let goldTotal  = 0;
let goldCollected = 0;
let exitOpen   = false;
let player     = null;
let guards     = [];
let flashMsg   = null;   // {text, timer, color}
let bonusGivenThisLevel = false;
let lastTime   = 0;

// ── Entity ──────────────────────────────────────────────────
// state: 'idle'|'walk'|'climb'|'fall'|'rope'
// trapped: guard is stuck in open hole
function makeEntity(col, row) {
  return {
    col, row,
    px: col * TILE, py: row * TILE,
    moving: false, moveTimer: 0, moveDur: 0,
    targetCol: col, targetRow: row,
    startPx: col * TILE, startPy: row * TILE,
    facing: 1,
    state: 'idle',
    invTimer: 0,
    hasGold: false,
    trapped: false,
    aiTimer: 0,
    stuckFrames: 0,
    digTimer: 0,
    digDir: 0,
  };
}

// ── Tile queries ────────────────────────────────────────────
function tileAt(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return T.SOLID;
  if (exitOpen && c === exitCol && r < EXIT_ROWS) return T.LADDER;
  return grid[r][c];
}

function isHoleAt(c, r) {
  return holes.some(h => h.col === c && h.row === r && h.phase === 'open');
}

function isGoldAt(c, r) {
  return goldList.some(g => g.col === c && g.row === r);
}

// Can an entity physically occupy this cell?
function canEnter(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
  const t = tileAt(c, r);
  if (t === T.SOLID) return false;
  if (t === T.BRICK && !isHoleAt(c, r)) return false;
  if (t === T.BRICK && isHoleAt(c, r) && guards.some(g => g.trapped && g.col === c && g.row === r)) return false;
  if (t === T.TRAP) return false;   // trapdoors: entity falls through on gravity, can't walk INTO them from side
  return true;
}

// Is there a floor supporting entity at (c,r)?
function hasFloor(c, r) {
  if (r + 1 >= ROWS) return true;
  // A trapped guard in the hole below acts as solid ground for everyone above
  if (guards.some(g => g.trapped && g.col === c && g.row === r + 1)) return true;
  const below = tileAt(c, r + 1);
  if (below === T.SOLID)  return true;
  if (below === T.LADDER) return true;
  if (below === T.BRICK  && !isHoleAt(c, r + 1)) return true;
  // TRAP: falls through — does NOT support
  // ROPE: does NOT support from below (must walk onto it horizontally)
  return false;
}

// Standing = on ladder/rope OR has floor below
function isStanding(ent) {
  const t = tileAt(ent.col, ent.row);
  if (t === T.LADDER) return true;
  if (t === T.ROPE)   return true;
  return hasFloor(ent.col, ent.row);
}

// Can entity at (c,r) fall downward? (TRAP lets you fall through)
function canFallThrough(c, r) {
  if (r + 1 >= ROWS) return false;
  const below = tileAt(c, r + 1);
  if (below === T.SOLID) return false;
  if (below === T.BRICK && !isHoleAt(c, r + 1)) return false;
  return true;
}

// ── Load Level ──────────────────────────────────────────────
function loadLevel(idx) {
  const def = LEVELS[idx];
  grid  = parseLevel(def);
  holes = [];
  exitOpen = false;
  exitCol  = EXIT_COLS[idx] ?? EXIT_COLS[0];

  goldList = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === T.GOLD) {
        goldList.push({ col: c, row: r });
        grid[r][c] = T.EMPTY;
      }
    }
  }
  goldTotal     = goldList.length;
  goldCollected = 0;

  const { players, enemies } = findStarts(def);
  const ps = players[0] || { col: 1, row: ROWS - 2 };
  player = makeEntity(ps.col, ps.row);

  guards = enemies.map(e => {
    const g = makeEntity(e.col, e.row);
    g.aiTimer = Math.random() * AI_MS;
    return g;
  });

  flashMsg = null;
  bonusGivenThisLevel = false;
  updateHUD();
}

// ── Input ───────────────────────────────────────────────────
const keys = {};
const justPressed = {};
const touchBtns = {};

window.addEventListener('keydown', e => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;

  if (state === 'playing') {
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); pauseGame(); }
    if (e.code === 'KeyR') { e.preventDefault(); restartLevel(); }
  } else if (state === 'paused') {
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); resumeGame(); }
    if (e.code === 'KeyR') { e.preventDefault(); restartLevel(); }
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function clearJustPressed() {
  for (const k in justPressed) delete justPressed[k];
  for (const k in touchBtns) if (touchBtns[k] === 'used') delete touchBtns[k];
}

function isDown(codes)       { return codes.some(c => keys[c] || touchBtns[c]); }
function wasJustPressed(codes) { return codes.some(c => justPressed[c] || touchBtns[c] === 'fresh'); }

// ── Game Flow ───────────────────────────────────────────────
function startGame() {
  levelIndex = 0; score = 0; lives = LIVES_START;
  loadLevel(0);
  state = 'playing';
  hideOverlays();
  window.NeonArcade?.startMusic();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function pauseGame() {
  state = 'paused';
  window.NeonArcade?.stopMusic();
  // Clear held inputs so no movement bleeds into resume
  for (const k in keys) keys[k] = false;
  for (const k in justPressed) delete justPressed[k];
  document.getElementById('overlay-pause')?.classList.remove('hidden');
}

function resumeGame() {
  state = 'playing';
  hideOverlays();
  window.NeonArcade?.startMusic();
  lastTime = performance.now();
}

function restartLevel() {
  loadLevel(levelIndex);
  state = 'playing';
  hideOverlays();
  lastTime = performance.now();
}

function nextLevel() {
  levelIndex++;
  if (levelIndex >= LEVELS.length) {
    state = 'victory';
    document.getElementById('victory-score').textContent = 'SCORE: ' + score;
    document.getElementById('overlay-victory').classList.remove('hidden');
  } else {
    loadLevel(levelIndex);
    state = 'playing';
    hideOverlays();
    window.NeonArcade?.startMusic();
    lastTime = performance.now();
  }
  updateHUD();
}

function loseLife() {
  if (window.NeonArcade) NeonArcade.SFX.gameOver();
  lives--;
  updateHUD();
  if (lives <= 0) {
    state = 'gameover';
    window.NeonArcade?.stopMusic();
    if (score > hiScore) { hiScore = score; localStorage.setItem('lr_hi', hiScore); }
    document.getElementById('go-score').textContent = 'SCORE: ' + score;
    document.getElementById('overlay-gameover').classList.remove('hidden');
    if (window.NeonArcade) {
      NeonArcade.HighScore.checkAndPrompt('lode-runner', score, () => {
        hiScore = NeonArcade.HighScore.getTopScore('lode-runner');
        updateHUD();
      });
    }
    return;
  }
  // Respawn player
  const { players } = findStarts(LEVELS[levelIndex]);
  const ps = players[0] || { col: 1, row: ROWS - 2 };
  player.col = ps.col; player.row = ps.row;
  player.px  = ps.col * TILE; player.py = ps.row * TILE;
  player.moving = false; player.state = 'idle'; player.invTimer = INV_MS;
}

function levelClear() {
  if (window.NeonArcade) NeonArcade.SFX.levelUp();
  window.NeonArcade?.stopMusic();
  score += 1500;
  state = 'levelclear';
  flashMsg = { text: 'LEVEL CLEAR!', timer: 2000, color: '#ffd700' };
  updateHUD();
  setTimeout(() => { if (state === 'levelclear') nextLevel(); }, 2000);
}

function hideOverlays() {
  ['overlay-start','overlay-pause','overlay-gameover','overlay-victory'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function updateHUD() {
  scoreEl.textContent = score;
  hiEl.textContent    = Math.max(score, hiScore);
  let h = '';
  for (let i = 0; i < lives; i++) h += '♥';
  for (let i = lives; i < LIVES_START; i++) h += '♡';
  livesEl.textContent = h;
  levelEl.textContent = levelIndex + 1;
  goldEl.textContent  = goldCollected + '/' + goldTotal;
}

// ── Holes ───────────────────────────────────────────────────
function createHole(c, r) {
  if (holes.some(h => h.col === c && h.row === r)) return;
  holes.push({ col: c, row: r, timer: 0, phase: 'open' });
  if (window.NeonArcade) NeonArcade.SFX.softDrop();
}

function updateHoles(dt) {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    h.timer += dt;

    if (h.phase === 'open' && h.timer >= HOLE_OPEN_MS) {
      h.phase = 'filling'; h.timer = 0;
    } else if (h.phase === 'filling' && h.timer >= HOLE_FILL_MS) {
      // Un-trap any guard in this hole
      const guard = guards.find(g => g.col === h.col && g.row === h.row);
      if (guard) {
        if (guard.trapped) {
          if (window.NeonArcade) NeonArcade.SFX.drop();
          score += 75;
          updateHUD();
        }
        crushGuard(guard);
      }
      // Kill player if caught
      if (player.col === h.col && player.row === h.row) loseLife();
      grid[h.row][h.col] = T.BRICK;
      holes.splice(i, 1);
    }
  }
}

// ── Guard ───────────────────────────────────────────────────
function crushGuard(g) {
  if (g.hasGold) {
    goldList.push({ col: g.col, row: Math.max(0, g.row - 1) });
    g.hasGold = false;
  }
  // Avoid respawning on top of the player (especially dangerous near exit ladder at row 0)
  let respawnCol, attempts = 0;
  do {
    respawnCol = 1 + Math.floor(Math.random() * (COLS - 2));
    attempts++;
  } while (attempts < 10 && player && player.row <= 2 && respawnCol === player.col);
  g.col = respawnCol; g.row = 0;
  g.px  = respawnCol * TILE; g.py = 0;
  g.moving = false; g.state = 'idle'; g.trapped = false;
  g.stuckFrames = 0;
  g.aiTimer = AI_MS;
}

// Is cell (c,r) currently occupied or targeted by another guard (not self)?
function guardOccupies(self, c, r) {
  return guards.some(og => og !== self && !og.trapped &&
    ((og.col === c && og.row === r) || (og.moving && og.targetCol === c && og.targetRow === r)));
}

// BFS: returns next step {col,row} toward target, or null
function bfsStep(gc, gr, pc, pr, self) {
  if (gc === pc && gr === pr) return null;
  const visited = new Set([`${gc},${gr}`]);
  const queue   = [{ col: gc, row: gr, first: null }];

  while (queue.length) {
    const { col, row, first } = queue.shift();
    const dirs = [{ dc:-1,dr:0 }, { dc:1,dr:0 }, { dc:0,dr:-1 }, { dc:0,dr:1 }];

    for (const { dc, dr } of dirs) {
      const nc = col + dc, nr = row + dr;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (!canEnter(nc, nr)) continue;
      if (self && (nc !== pc || nr !== pr) && guardOccupies(self, nc, nr)) continue;

      const curT  = tileAt(col, row);
      const nextT = tileAt(nc, nr);

      // Going up: must already be standing on a ladder (same rule as player)
      if (dr === -1) {
        if (curT !== T.LADDER) continue;
      }
      // Going down intentionally: via ladder; guard may also step onto a ladder from above
      if (dr === 1 && curT !== T.LADDER && nextT !== T.LADDER) continue;
      // Horizontal: can only cross a rope if currently on or entering a rope tile,
      // or if there is floor support at the destination
      if (dc !== 0 && dr === 0) {
        if (curT !== T.ROPE && nextT !== T.ROPE && !hasFloor(nc, nr) && !hasFloor(col, row)) continue;
      }

      visited.add(key);
      const step = first || { col: nc, row: nr };
      if (nc === pc && nr === pr) return step;
      queue.push({ col: nc, row: nr, first: step });
    }
  }
  return null;
}

function updateGuard(g, dt) {
  // Trapped in hole — immobilized
  if (g.trapped) return;

  // Smooth pixel movement
  if (g.moving) {
    g.moveTimer += dt;
    const p = Math.min(1, g.moveTimer / g.moveDur);
    g.px = g.startPx + (g.targetCol * TILE - g.startPx) * p;
    g.py = g.startPy + (g.targetRow * TILE - g.startPy) * p;
    if (p >= 1) {
      g.col = g.targetCol; g.row = g.targetRow;
      g.px  = g.col * TILE; g.py = g.row * TILE;
      g.moving = false; g.state = 'idle';
      // Pick up gold
      const gi = goldList.findIndex(gl => gl.col === g.col && gl.row === g.row);
      if (gi !== -1 && !g.hasGold) { goldList.splice(gi, 1); g.hasGold = true; window.NeonArcade?.SFX.lodeRunnerGuardGold(); }
      // Check if fell into open hole → trapped (only if no other guard already occupies it)
      if (isHoleAt(g.col, g.row) && !guards.some(og => og !== g && og.trapped && og.col === g.col && og.row === g.row)) {
        g.trapped = true; return;
      }
    }
    return;
  }

  // Gravity
  const curT = tileAt(g.col, g.row);
  if (curT !== T.ROPE && !isStanding(g)) {
    if (canFallThrough(g.col, g.row)) {
      startMove(g, g.col, g.row + 1, FALL_MS); g.state = 'fall'; return;
    }
  }

  // AI timer
  g.aiTimer -= dt;
  if (g.aiTimer > 0) return;
  g.aiTimer = aiMs() + Math.random() * 30;

  // Target: nearest gold within radius (secondary) or player (primary)
  let targetCol = player.col, targetRow = player.row;
  if (!g.hasGold && goldList.length > 0) {
    let nearest = null, nearestDist = Infinity;
    for (const gl of goldList) {
      const dist = Math.abs(gl.col - g.col) + Math.abs(gl.row - g.row);
      if (dist < nearestDist && dist <= GUARD_GOLD_RADIUS) {
        nearestDist = dist; nearest = gl;
      }
    }
    if (nearest) { targetCol = nearest.col; targetRow = nearest.row; }
  }

  const step = bfsStep(g.col, g.row, targetCol, targetRow, g);
  if (!step) {
    // Guard is stuck (path blocked) — try a random horizontal step as fallback
    g.stuckFrames++;
    if (g.stuckFrames >= 5) {
      const tryDirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
      for (const dc of tryDirs) {
        const nc = g.col + dc;
        if (canEnter(nc, g.row) && !guardOccupies(g, nc, g.row) && (hasFloor(nc, g.row) || tileAt(g.col, g.row) === T.ROPE)) {
          g.facing = dc;
          startMove(g, nc, g.row, guardMs());
          g.state = tileAt(nc, g.row) === T.ROPE ? 'rope' : 'walk';
          if (g.state === 'walk') window.NeonArcade?.SFX.lodeRunnerGuardStep();
          g.stuckFrames = 0;
          break;
        }
      }
    }
    return;
  }
  g.stuckFrames = 0;

  const dc = step.col - g.col, dr = step.row - g.row;
  const curTile  = tileAt(g.col, g.row);
  const nextTile = tileAt(step.col, step.row);

  let valid = canEnter(step.col, step.row) && !guardOccupies(g, step.col, step.row);
  if (valid && dr === -1) {
    if (curTile !== T.LADDER && nextTile !== T.LADDER) valid = false;
  }
  if (valid && dr === 1) {
    if (curTile !== T.LADDER && nextTile !== T.LADDER) valid = false;
  }

  if (valid) {
    if (dc !== 0) g.facing = dc;
    startMove(g, step.col, step.row, guardMs());
    g.state = dr < 0 ? 'climb' : dr > 0 ? 'fall'
            : (tileAt(step.col, step.row) === T.ROPE ? 'rope' : 'walk');
    if (g.state === 'walk') window.NeonArcade?.SFX.lodeRunnerGuardStep();
  }
}

function tryDigBonus() {
  if (lives >= LIVES_START) return;
  if (bonusGivenThisLevel) return;
  if (Math.random() > 0.08) return;   // ~8% chance per dig
  lives++;
  bonusGivenThisLevel = true;
  updateHUD();
  flashMsg = { text: '+ EXTRA LIFE!', timer: 1800, color: '#ff44aa' };
  window.NeonArcade?.SFX.berzerkExtraLife();
}

// ── Player ──────────────────────────────────────────────────
function updatePlayer(dt) {
  if (player.invTimer > 0) { player.invTimer = Math.max(0, player.invTimer - dt); }
  if (player.digTimer > 0) { player.digTimer = Math.max(0, player.digTimer - dt); }

  if (player.moving) {
    player.moveTimer += dt;
    const p = Math.min(1, player.moveTimer / player.moveDur);
    player.px = player.startPx + (player.targetCol * TILE - player.startPx) * p;
    player.py = player.startPy + (player.targetRow * TILE - player.startPy) * p;
    if (p >= 1) {
      player.col = player.targetCol; player.row = player.targetRow;
      player.px  = player.col * TILE; player.py = player.row * TILE;
      player.moving = false; player.state = 'idle';
      checkGold();
      if (exitOpen && player.col === exitCol && player.row === 0) { levelClear(); return; }
      if (player.invTimer <= 0) checkGuardCollision();
    }
    return;
  }

  const tile    = tileAt(player.col, player.row);
  const onRope   = tile === T.ROPE;
  const onLadder = tile === T.LADDER;
  const onTrap   = tile === T.TRAP;

  // A trapped guard directly below acts as solid ground — player walks over the hole
  const guardBelowTrapped = guards.some(g => g.trapped && g.col === player.col && g.row === player.row + 1);

  // Gravity (falls through TRAP tiles too)
  if (!isStanding(player) && !onRope && !guardBelowTrapped) {
    if (canFallThrough(player.col, player.row) || onTrap) {
      startMove(player, player.col, player.row + 1, FALL_MS);
      player.state = 'fall'; return;
    }
  }

  const left  = isDown(['ArrowLeft',  'KeyA', 'left']);
  const right = isDown(['ArrowRight', 'KeyD', 'right']);
  const up    = isDown(['ArrowUp',    'KeyW', 'up']);
  const down  = isDown(['ArrowDown',  'KeyS', 'down']);
  const digL  = wasJustPressed(['KeyZ', 'digl']);
  const digR  = wasJustPressed(['KeyX', 'digr']);

  // Dig only when standing on solid floor (not on rope or ladder)
  const canDig = !onRope && !onLadder && hasFloor(player.col, player.row);

  if (canDig && digL) {
    const tc = player.col - 1, tr = player.row + 1;
    if (tc >= 0 && tileAt(tc, tr) === T.BRICK && !isHoleAt(tc, tr) && tileAt(tc, tr - 1) !== T.LADDER) {
      createHole(tc, tr);
      player.digTimer = DIG_ANIM_MS; player.digDir = -1;
      window.NeonArcade?.SFX.lodeRunnerDig();
      tryDigBonus();
    }
  }
  if (canDig && digR) {
    const tc = player.col + 1, tr = player.row + 1;
    if (tc < COLS && tileAt(tc, tr) === T.BRICK && !isHoleAt(tc, tr) && tileAt(tc, tr - 1) !== T.LADDER) {
      createHole(tc, tr);
      player.digTimer = DIG_ANIM_MS; player.digDir = 1;
      window.NeonArcade?.SFX.lodeRunnerDig();
      tryDigBonus();
    }
  }

  // Climb up — only when already on a ladder tile
  if (up && onLadder && canEnter(player.col, player.row - 1)) {
    startMove(player, player.col, player.row - 1, CLIMB_MS);
    player.state = 'climb';
    window.NeonArcade?.SFX.lodeRunnerClimb(player.row - 1);
    return;
  }

  // Climb down
  if (down) {
    const below = tileAt(player.col, player.row + 1);
    if ((onLadder || isStanding(player)) && (below === T.LADDER || onLadder) && canEnter(player.col, player.row + 1)) {
      startMove(player, player.col, player.row + 1, CLIMB_MS);
      player.state = 'climb';
      window.NeonArcade?.SFX.lodeRunnerClimb(player.row + 1);
      return;
    }
  }

  // Trapped guard one row below the destination = player can walk over the hole
  const canWalkOver = (c, r) => guards.some(g => g.trapped && g.col === c && g.row === r + 1);

  // Horizontal
  if (left) {
    player.facing = -1;
    const nc = player.col - 1;
    if (nc >= 0 && canEnter(nc, player.row)) {
      const t2 = tileAt(nc, player.row);
      if (onRope || onLadder || guardBelowTrapped || hasFloor(nc, player.row) || t2 === T.ROPE || t2 === T.LADDER || canWalkOver(nc, player.row)) {
        startMove(player, nc, player.row, WALK_MS);
        player.state = (onRope || t2 === T.ROPE) ? 'rope' : 'walk';
        if (player.state === 'walk') window.NeonArcade?.SFX.lodeRunnerStep();
        return;
      }
    }
  }
  if (right) {
    player.facing = 1;
    const nc = player.col + 1;
    if (nc < COLS && canEnter(nc, player.row)) {
      const t2 = tileAt(nc, player.row);
      if (onRope || onLadder || guardBelowTrapped || hasFloor(nc, player.row) || t2 === T.ROPE || t2 === T.LADDER || canWalkOver(nc, player.row)) {
        startMove(player, nc, player.row, WALK_MS);
        player.state = (onRope || t2 === T.ROPE) ? 'rope' : 'walk';
        if (player.state === 'walk') window.NeonArcade?.SFX.lodeRunnerStep();
        return;
      }
    }
  }
}

function startMove(ent, tc, tr, dur) {
  ent.moving = true; ent.moveTimer = 0; ent.moveDur = dur;
  ent.targetCol = tc; ent.targetRow = tr;
  ent.startPx = ent.px; ent.startPy = ent.py;
}

function checkGold() {
  const gi = goldList.findIndex(g => g.col === player.col && g.row === player.row);
  if (gi !== -1) {
    goldList.splice(gi, 1);
    goldCollected++;
    score += 250;
    if (window.NeonArcade) NeonArcade.SFX.lodeRunnerGold();
    updateHUD();
    if (goldCollected >= goldTotal) exitOpen = true;
  }
}

function checkGuardCollision() {
  for (const g of guards) {
    if (!g.trapped && g.col === player.col && g.row === player.row) {
      loseLife(); return;
    }
  }
}

// ── Main Update ─────────────────────────────────────────────
function update(dt) {
  if (state !== 'playing') return;

  updatePlayer(dt);
  if (state !== 'playing') return;

  updateHoles(dt);

  for (const g of guards) updateGuard(g, dt);

  // Collision check after guards move (check regardless of player.moving)
  if (player.invTimer <= 0) checkGuardCollision();

  if (flashMsg) { flashMsg.timer -= dt; if (flashMsg.timer <= 0) flashMsg = null; }

  clearJustPressed();
}

// ── Draw helpers ────────────────────────────────────────────
function drawBrick(x, y) {
  ctx.fillStyle = '#6b2e0a';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#8b3a10';
  ctx.fillRect(x+1, y+1, TILE-2, TILE-2);
  ctx.fillStyle = '#3d1500';
  const mid = y + Math.floor(TILE/2);
  ctx.fillRect(x, mid, TILE, 2);
  const row = Math.floor(y / TILE);
  const stagger = (row % 2 === 0) ? 0 : Math.floor(TILE/2);
  for (let vx = stagger; vx <= TILE; vx += TILE)  ctx.fillRect(x+vx, y, 2, Math.floor(TILE/2));
  for (let vx = (stagger + Math.floor(TILE/2)) % TILE; vx <= TILE; vx += TILE) ctx.fillRect(x+vx, mid+2, 2, Math.floor(TILE/2)-2);
}

function drawSolid(x, y) {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#111';
  const s = 8;
  for (let i = 0; i < TILE; i += s) {
    ctx.fillRect(x+i, y, 1, TILE);
    ctx.fillRect(x, y+i, TILE, 1);
  }
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(x,y,TILE,1); ctx.fillRect(x,y,1,TILE);
  ctx.fillRect(x+TILE-1,y,1,TILE); ctx.fillRect(x,y+TILE-1,TILE,1);
}

function drawLadder(x, y) {
  ctx.fillStyle = '#0a0004';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#884400';
  const lx = x+6, rx = x+TILE-9;
  ctx.fillRect(lx, y, 3, TILE);
  ctx.fillRect(rx, y, 3, TILE);
  ctx.fillStyle = '#cc6600';
  for (let ry = y+3; ry < y+TILE; ry += 8) ctx.fillRect(lx+3, ry, rx-lx-3, 2);
}

function drawRope(x, y) {
  const by = y + Math.floor(TILE/2) - 2;
  ctx.fillStyle = '#885500';
  ctx.fillRect(x, by, TILE, 4);
  ctx.fillStyle = '#ffaa00';
  ctx.fillRect(x, by, TILE, 1);
  ctx.fillStyle = '#cc8800';
  for (let i = 0; i < TILE; i += 6) ctx.fillRect(x+i, by+1, 3, 1);
}

function drawTrap(x, y) {
  // Trapdoor looks like brick but with a subtle darker crack
  drawBrick(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x+4, y + Math.floor(TILE/2)-1, TILE-8, 2);
}

function drawGold(x, y, pulse) {
  const glow = 0.6 + 0.4 * Math.sin(pulse || 0);
  const cx = x + Math.floor(TILE/2), cy = y + Math.floor(TILE/2);
  const r  = 7;
  // Glow
  const grad = ctx.createRadialGradient(cx,cy,1,cx,cy,r+4);
  grad.addColorStop(0, `rgba(255,220,0,${glow*0.7})`);
  grad.addColorStop(1, 'rgba(255,180,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, TILE, TILE);
  // Chest body
  ctx.fillStyle = '#b8860b';
  ctx.fillRect(cx-7, cy-5, 14, 10);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(cx-7, cy-5, 14, 5);
  ctx.fillStyle = '#ffec6e';
  ctx.fillRect(cx-5, cy-3, 6, 2);
  // Lock
  ctx.fillStyle = '#cc9900';
  ctx.fillRect(cx-2, cy-2, 4, 4);
  ctx.fillStyle = '#ffdd00';
  ctx.fillRect(cx-1, cy-1, 2, 2);
}

function drawExitLadder(t) {
  const x  = exitCol * TILE;
  const flicker = 0.6 + 0.4 * Math.sin(t * 6);
  for (let r = 0; r < EXIT_ROWS; r++) {
    const y = r * TILE;
    // Glowing green ladder
    ctx.fillStyle = `rgba(0,255,80,${flicker * 0.18})`;
    ctx.fillRect(x, y, TILE, TILE);
    // Ladder rails
    ctx.fillStyle = `rgba(0,255,80,${flicker * 0.9})`;
    ctx.fillRect(x+6, y, 3, TILE);
    ctx.fillRect(x+TILE-9, y, 3, TILE);
    // Rungs
    ctx.fillStyle = `rgba(180,255,180,${flicker * 0.8})`;
    for (let ry = y+3; ry < y+TILE; ry += 8) ctx.fillRect(x+9, ry, TILE-18, 2);
  }
  // EXIT label at top
  ctx.font = '6px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(100,255,100,${flicker})`;
  ctx.fillText('EXIT', x + TILE/2, EXIT_ROWS * TILE - 4);
}

function drawHole(x, y, progress) {
  // Partially filled hole
  ctx.fillStyle = '#6b2e0a';
  ctx.fillRect(x, y, TILE, TILE);
  const pitH = Math.floor(TILE * 0.75 * (1 - progress));
  if (pitH > 0) {
    const pitW = Math.floor(TILE * 0.7);
    const pitX = x + Math.floor((TILE - pitW) / 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(pitX, y, pitW, pitH);
    ctx.fillStyle = '#3d1500';
    ctx.fillRect(pitX-2, y, 2, pitH);
    ctx.fillRect(pitX+pitW, y, 2, pitH);
  }
}

function drawPlayer(x, y, entState, facing, flicker, walkPhase, stepParity, digTimer, digDir) {
  if (flicker) return;
  const ox = x, oy = y + 1;
  // Body (blue suit)
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(ox+8, oy+9, 14, 9);
  // Head
  ctx.fillStyle = '#ffaa77';
  ctx.fillRect(ox+9, oy+1, 11, 9);
  // Helmet
  ctx.fillStyle = '#1976d2';
  ctx.fillRect(ox+8, oy-1, 13, 4);
  ctx.fillRect(ox+7, oy+2, 2, 3);
  // Eye
  ctx.fillStyle = '#000';
  const eyeX = facing > 0 ? ox+16 : ox+10;
  ctx.fillRect(eyeX, oy+4, 2, 2);
  // Arms
  ctx.fillStyle = '#ffaa77';
  if (entState === 'rope') {
    // Arms stretched wide sideways, gripping rope
    ctx.fillRect(ox-1,  oy+7, 10, 3);
    ctx.fillRect(ox+21, oy+7, 10, 3);
  } else if (entState === 'climb') {
    ctx.fillRect(ox+2, oy+5, 7, 3);
    ctx.fillRect(ox+21, oy+5, 7, 3);
  } else if (digTimer > 0) {
    // Dig animation: active arm swings forward and down
    const phase = 1 - digTimer / DIG_ANIM_MS;
    const swing = Math.round(Math.sin(Math.PI * phase) * 6);
    if (digDir < 0) {
      ctx.fillRect(ox+2 - swing, oy+10 + swing, 7, 4);  // left arm digs
      ctx.fillRect(ox+21, oy+10, 7, 4);
    } else {
      ctx.fillRect(ox+2, oy+10, 7, 4);
      ctx.fillRect(ox+21 + swing, oy+10 + swing, 7, 4); // right arm digs
    }
  } else {
    ctx.fillRect(ox+2, oy+10, 7, 4);
    ctx.fillRect(ox+21, oy+10, 7, 4);
  }
  // Legs — walk animation: legs alternate forward/back each step
  const walking = entState === 'walk' && walkPhase > 0;
  const sw   = walking ? Math.round(Math.sin(Math.PI * walkPhase) * 3) : 0;
  const lift = walking ? Math.round(Math.sin(Math.PI * walkPhase) * 2) : 0;
  const leftX  = walking ? (stepParity === 0 ?  facing * sw : -facing * sw) : 0;
  const rightX = walking ? (stepParity === 0 ? -facing * sw :  facing * sw) : 0;
  const leftLift  = (walking && stepParity === 0) ? lift : 0;
  const rightLift = (walking && stepParity === 1) ? lift : 0;
  ctx.fillStyle = '#0d3b6e';
  ctx.fillRect(ox+9  + leftX,  oy+18 - leftLift,  5, 9);
  ctx.fillRect(ox+16 + rightX, oy+18 - rightLift, 5, 9);
  // Boots
  ctx.fillStyle = '#222';
  ctx.fillRect(ox+8  + leftX,  oy+25 - leftLift,  6, 4);
  ctx.fillRect(ox+15 + rightX, oy+25 - rightLift, 7, 4);
}

function drawGuard(x, y, entState, facing, hasGold, trapped, walkPhase, stepParity) {
  const ox = x, oy = y + 1;
  const alpha = trapped ? 0.6 : 1.0;
  ctx.globalAlpha = alpha;
  // Body (white/gray guard uniform)
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(ox+8, oy+9, 14, 9);
  // Head
  ctx.fillStyle = '#eeeeee';
  ctx.fillRect(ox+9, oy+1, 11, 9);
  // Eyes
  ctx.fillStyle = '#333';
  const eyeX = facing > 0 ? ox+16 : ox+10;
  ctx.fillRect(eyeX, oy+4, 2, 2);
  if (trapped) {
    // X eyes when trapped
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(ox+10, oy+3, 2, 2); ctx.fillRect(ox+11, oy+4, 2, 2);
    ctx.fillRect(ox+16, oy+3, 2, 2); ctx.fillRect(ox+17, oy+4, 2, 2);
  }
  // Arms
  ctx.fillStyle = '#ddd';
  if (entState === 'rope') {
    // Arms stretched wide sideways, gripping rope
    ctx.fillRect(ox-1,  oy+8, 10, 3);
    ctx.fillRect(ox+21, oy+8, 10, 3);
  } else {
    ctx.fillRect(ox+2, oy+11, 7, 4);
    ctx.fillRect(ox+21, oy+11, 7, 4);
  }
  // Legs — walk animation
  const walking = entState === 'walk' && walkPhase > 0;
  const sw   = walking ? Math.round(Math.sin(Math.PI * walkPhase) * 3) : 0;
  const lift = walking ? Math.round(Math.sin(Math.PI * walkPhase) * 2) : 0;
  const leftX  = walking ? (stepParity === 0 ?  facing * sw : -facing * sw) : 0;
  const rightX = walking ? (stepParity === 0 ? -facing * sw :  facing * sw) : 0;
  const leftLift  = (walking && stepParity === 0) ? lift : 0;
  const rightLift = (walking && stepParity === 1) ? lift : 0;
  ctx.fillStyle = '#00796b';
  ctx.fillRect(ox+9  + leftX,  oy+18 - leftLift,  5, 9);
  ctx.fillRect(ox+16 + rightX, oy+18 - rightLift, 5, 9);
  // Gold indicator
  if (hasGold) {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(ox+10, oy-5, 10, 4);
    ctx.fillStyle = '#ffec6e';
    ctx.fillRect(ox+11, oy-4, 4, 2);
  }
  ctx.globalAlpha = 1.0;
}

let _exitT = 0;

function render(dt) {
  if (exitOpen) _exitT += dt / 1000;

  ctx.fillStyle = '#0a0004';
  ctx.fillRect(0, 0, CW, CH);

  // Tiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      switch (grid[r][c]) {
        case T.BRICK:  drawBrick(x, y);  break;
        case T.SOLID:  drawSolid(x, y);  break;
        case T.LADDER: drawLadder(x, y); break;
        case T.ROPE:   drawRope(x, y);   break;
        case T.TRAP:   drawTrap(x, y);   break;
      }
    }
  }

  // Holes
  for (const h of holes) {
    const progress = h.phase === 'filling' ? Math.min(1, h.timer / HOLE_FILL_MS) : 0;
    drawHole(h.col * TILE, h.row * TILE, progress);
    // Warn flash when near closing
    if (h.phase === 'open' && h.timer > HOLE_OPEN_MS * 0.7) {
      const warn = 0.4 * Math.abs(Math.sin(h.timer / 150));
      ctx.fillStyle = `rgba(255,100,0,${warn})`;
      ctx.fillRect(h.col * TILE, h.row * TILE, TILE, TILE);
    }
  }

  // Gold (with slow pulse animation)
  const t = performance.now() / 1000;
  for (const g of goldList) drawGold(g.col * TILE, g.row * TILE, t * 2 + g.col * 0.7);

  // Exit ladder
  if (exitOpen) drawExitLadder(_exitT);

  // Guards
  for (const g of guards) {
    const gWalkPhase = (g.moving && g.state === 'walk') ? Math.min(1, g.moveTimer / g.moveDur) : 0;
    drawGuard(Math.round(g.px), Math.round(g.py), g.state, g.facing, g.hasGold, g.trapped, gWalkPhase, g.targetCol % 2);
  }

  // Player (invincibility flicker)
  const invFlicker = player.invTimer > 0 && Math.floor(player.invTimer / 100) % 2 === 0;
  const pWalkPhase = (player.moving && player.state === 'walk') ? Math.min(1, player.moveTimer / player.moveDur) : 0;
  drawPlayer(Math.round(player.px), Math.round(player.py), player.state, player.facing, invFlicker, pWalkPhase, player.targetCol % 2, player.digTimer, player.digDir);

  // Flash message
  if (flashMsg) {
    const a = Math.min(1, flashMsg.timer / 400);
    ctx.globalAlpha = a;
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = flashMsg.color || '#ffd700';
    ctx.fillText(flashMsg.text, CW/2, CH/2);
    ctx.globalAlpha = 1;
  }

  // Invincibility countdown indicator
  if (player && player.invTimer > 0) {
    const secs = Math.ceil(player.invTimer / 1000);
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 120);
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(255,220,50,${pulse})`;
    ctx.fillText('INV ' + secs + 's', 4, 14);
  }
}

// ── Game Loop ────────────────────────────────────────────────
function gameLoop(now) {
  const dt = Math.min(now - lastTime, 50);
  lastTime = now;
  update(dt);
  render(dt);
  requestAnimationFrame(gameLoop);
}

// ── Button wiring ────────────────────────────────────────────
document.getElementById('btn-start')?.addEventListener('click', startGame);
document.getElementById('btn-resume')?.addEventListener('click', resumeGame);
document.getElementById('btn-pause')?.addEventListener('click', () => {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});
document.getElementById('btn-restart-level')?.addEventListener('click', restartLevel);
document.getElementById('btn-restart')?.addEventListener('click', () => {
  levelIndex = 0; score = 0; lives = LIVES_START;
  loadLevel(0); state = 'playing'; hideOverlays();
  window.NeonArcade?.startMusic();
  lastTime = performance.now();
  updateHUD();
});
document.getElementById('btn-victory')?.addEventListener('click', () => {
  levelIndex = 0; score = 0; lives = LIVES_START;
  loadLevel(0); state = 'playing'; hideOverlays();
  lastTime = performance.now();
  updateHUD();
});

// ── Music ────────────────────────────────────────────────────
window.addEventListener('load', () => {
  hiScore = parseInt(localStorage.getItem('lr_hi') || '0', 10);
  hiEl.textContent = hiScore;
  if (window.NeonArcade) {
    NeonArcade.setTrack(4);
    const muteBtn = document.getElementById('music-mute');
    muteBtn?.addEventListener('click', () => {
      const { on } = NeonArcade.toggleMusic();
      muteBtn.textContent = on ? 'Music: ON' : 'Music: OFF';
      muteBtn.classList.toggle('off', !on);
    });
  }
});

// ── Mobile touch controls ────────────────────────────────────
if (navigator.maxTouchPoints > 0) {
  document.body.classList.add('is-mobile');

  // Virtual joystick — 4-way axis-major (other axis cleared)
  new NeonArcade.VirtualJoystick({
    base: document.getElementById('joystick'),
    knob: document.getElementById('joystick-knob'),
    maxRadius: 44,
    onChange: ({ x, y, magnitude }) => {
      delete touchBtns.left;  delete touchBtns.right;
      delete touchBtns.up;    delete touchBtns.down;
      if (magnitude === 0) return;
      if (Math.abs(x) >= Math.abs(y)) {
        if (x < -0.3) touchBtns.left  = true;
        if (x >  0.3) touchBtns.right = true;
      } else {
        if (y < -0.3) touchBtns.up   = true;
        if (y >  0.3) touchBtns.down = true;
      }
    }
  });

  // Dig buttons — one-shot per tap via justPressed (cleared each frame)
  const digIds = { 'btn-digl-touch': 'digl', 'btn-digr-touch': 'digr' };
  Object.entries(digIds).forEach(([id, code]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      justPressed[code] = true;
      el.classList.add('pressed');
    }, { passive: false });
    el.addEventListener('touchend', e => {
      e.preventDefault();
      el.classList.remove('pressed');
    }, { passive: false });
    el.addEventListener('touchcancel', e => {
      e.preventDefault();
      el.classList.remove('pressed');
    }, { passive: false });
  });

  // Fullscreen on first touch
  const _doFS = () => {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen?.().catch(() => {});
  };
  document.addEventListener('touchstart', _doFS, { once: true, passive: true });
  document.addEventListener('click',      _doFS, { once: true });
}

// ── Boot ─────────────────────────────────────────────────────
loadLevel(0);
render(0);
