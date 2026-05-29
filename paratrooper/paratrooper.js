'use strict';

// ── Canvas ─────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

// ── Logical dimensions ─────────────────────────────────────────
const LW = 600;
const LH = 480;

// ── Base colors (gun/ground only) ──────────────────────────────
const C_BLUE   = '#0088ff';
const C_LBLUE  = '#44aaff';
const C_DKBLUE = '#003880';
const C_YELLOW = '#ffff00';
const C_ORANGE = '#ff8800';

// ── Aircraft color palettes ────────────────────────────────────
// bonus:true marks the green palette — green aircraft may drop power-ups
const PALETTES = [
  { main: '#ff00ff', dk: '#660055', lt: '#ff88ff' },
  { main: '#00ff44', dk: '#004410', lt: '#88ffaa', bonus: true },  // green → can drop bonus
  { main: '#ffcc00', dk: '#554400', lt: '#ffee88' },
  { main: '#ff4422', dk: '#661100', lt: '#ff9977' },
  { main: '#00ffff', dk: '#004444', lt: '#88ffff' },
  { main: '#cc00ff', dk: '#440066', lt: '#ee88ff' },
  { main: '#ff0055', dk: '#660020', lt: '#ff88bb' },
  { main: '#aaff00', dk: '#334400', lt: '#ddff88' },
];
function randomPalette() { return PALETTES[Math.floor(Math.random() * PALETTES.length)]; }

// ── Layout ─────────────────────────────────────────────────────
const GROUND_Y    = 440;
const GUN_X       = LW / 2;
const GUN_PIVOT_Y = GROUND_Y - 14;
const BARREL_LEN  = 30;

// ── Starfield (precomputed) ────────────────────────────────────
const STARS = (() => {
  const out = [];
  for (let i = 0; i < 60; i++) {
    out.push({
      x: Math.floor(Math.abs(Math.sin(i * 127.31 + 0.47)) * LW),
      y: Math.floor(Math.abs(Math.sin(i * 311.73 + 0.29)) * GROUND_Y * 0.88),
    });
  }
  return out;
})();

// ── Gun ────────────────────────────────────────────────────────
let gunAngle = -Math.PI / 2;
const GUN_ROT_SPD = 2.2;

// ── Bullets ────────────────────────────────────────────────────
const BULL_SPD    = 540;
const MAX_BULLETS = 3;
let bullets = [];

// ── Planes ─────────────────────────────────────────────────────
const PLANE_BASE_SPD  = 80;
const PLANE_SPEED_INC = 12;
let planes = [];
let planeTimer    = 1.5;
let planeInterval = 3.5;

// ── Helicopters ────────────────────────────────────────────────
const HELI_BASE_SPD  = 50;
const HELI_SPEED_INC = 8;
let helis = [];
let heliTimer    = 5.0;
let heliInterval = 7.0;

// ── Bonuses ────────────────────────────────────────────────────
const BONUS_DROP_CHANCE = 0.35;   // probability when a green aircraft spawns
const BONUS_FALL_SPD    = 100;    // px/s free-fall
const BONUS_CHUTE_SPD   = 44;     // px/s with chute
const BONUS_CHUTE_DIST  = 55;     // px before chute opens
const BONUS_DURATION    = 12;     // seconds for rapid / spread
let bonuses = [];
let activeRapid  = 0;   // seconds remaining
let activeSpread = 0;

// ── Troopers ───────────────────────────────────────────────────
const FREE_FALL_SPD   = 110;
const CHUTE_FALL_SPD  = 58;
const CHUTE_OPEN_DIST = 55;
const WALK_SPD        = 32;
const CAPTURE_DIST    = 34;
let troopers = [];

// ── Gun HP ─────────────────────────────────────────────────────
const GUN_HP_MAX       = 10;
const GUN_LAND_RADIUS  = 20;   // px — landing within this deals damage from above
let gunHP              = GUN_HP_MAX;
let gunDestroying      = false;
let gunDestroyTimer    = 0;
let gunDestroyNextExp  = 0;
const GUN_DESTROY_DUR  = 2.0;

// ── Explosions ─────────────────────────────────────────────────
let explosions = [];

// ── Game state ─────────────────────────────────────────────────
let gameState  = 'start';
let score      = 0;
let hiScore    = parseInt(localStorage.getItem('pt-hi') || '0', 10);
let wave       = 1;
let totalKills = 0;

const KILLS_PER_WAVE = 12;

// ── Input ──────────────────────────────────────────────────────
const keys = {};
let fireCooldown = 0;
const FIRE_CD = 0.28;

// ── HUD ────────────────────────────────────────────────────────
const scoreEl = document.getElementById('score-display');
const hiEl    = document.getElementById('hi-display');
const waveEl  = document.getElementById('wave-display');
const killEl  = document.getElementById('kill-display');

function updateHUD() {
  scoreEl.textContent = score;
  hiEl.textContent    = hiScore;
  waveEl.textContent  = wave;
  killEl.textContent  = totalKills;
}

// ── Canvas resize ──────────────────────────────────────────────
function resizeCanvas() {
  const isMobile = navigator.maxTouchPoints > 0;
  const sideW    = isMobile ? 80  : 120;  // px reserved per side panel
  const topH     = isMobile ? 44  : 80;   // px reserved for topbar + hints
  const maxW = Math.min(window.innerWidth  - sideW * 2, 820);
  const maxH = Math.max(200, window.innerHeight - topH);
  const s    = Math.min(maxW / LW, maxH / LH);
  canvas.style.width  = Math.floor(LW * s) + 'px';
  canvas.style.height = Math.floor(LH * s) + 'px';
  canvas.width  = LW;
  canvas.height = LH;
}

// ── Overlays ───────────────────────────────────────────────────
function showOverlay(id) {
  ['overlay-start', 'overlay-pause', 'overlay-gameover'].forEach(oid =>
    document.getElementById(oid).classList.toggle('hidden', oid !== id));
}
function hideOverlays() {
  ['overlay-start', 'overlay-pause', 'overlay-gameover'].forEach(oid =>
    document.getElementById(oid).classList.add('hidden'));
}

// ── SFX ────────────────────────────────────────────────────────
function sfxShoot() {
  try {
    const ac = NeonArcade.getAudioCtx(), mb = NeonArcade.getMasterBus();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(mb);
    o.type = 'square';
    o.frequency.setValueAtTime(920, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(160, ac.currentTime + 0.10);
    g.gain.setValueAtTime(0.14, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.11);
    o.start(); o.stop(ac.currentTime + 0.12);
  } catch (_) {}
}

function sfxExplode(big) {
  try {
    const ac  = NeonArcade.getAudioCtx(), mb = NeonArcade.getMasterBus();
    const dur = big ? 0.45 : 0.22;
    const n   = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = big ? 480 : 1100;
    src.connect(f); f.connect(g); g.connect(mb);
    g.gain.setValueAtTime(big ? 0.42 : 0.24, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.start(); src.stop(ac.currentTime + dur + 0.01);
  } catch (_) {}
}

function sfxLand() {
  try {
    const ac = NeonArcade.getAudioCtx(), mb = NeonArcade.getMasterBus();
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(mb);
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(75, ac.currentTime + 0.16);
    g.gain.setValueAtTime(0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    o.start(); o.stop(ac.currentTime + 0.19);
  } catch (_) {}
}

function sfxCapture() {
  try {
    const ac = NeonArcade.getAudioCtx(), mb = NeonArcade.getMasterBus();
    [440, 370, 311, 262, 196].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(mb);
      o.type = 'sawtooth'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.20;
      g.gain.setValueAtTime(0.30, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.start(t); o.stop(t + 0.40);
    });
  } catch (_) {}
}

function sfxBonusPickup(type) {
  try {
    const ac = NeonArcade.getAudioCtx(), mb = NeonArcade.getMasterBus();
    if (type === 'bomb') {
      // Rising sweep + noise
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(mb);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(100, ac.currentTime);
      o.frequency.exponentialRampToValueAtTime(2400, ac.currentTime + 0.45);
      g.gain.setValueAtTime(0.4, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
      o.start(); o.stop(ac.currentTime + 0.5);
    } else {
      // Two-note jingle
      [660, 990].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(mb);
        o.type = 'square'; o.frequency.value = f;
        const t = ac.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.start(t); o.stop(t + 0.17);
      });
    }
  } catch (_) {}
}

function sfxGunHit() {
  try {
    const ac = NeonArcade.getAudioCtx(), mb = NeonArcade.getMasterBus();
    // Metallic clang: short high burst + low thud
    const o1 = ac.createOscillator(), g1 = ac.createGain();
    o1.connect(g1); g1.connect(mb);
    o1.type = 'square'; o1.frequency.setValueAtTime(320, ac.currentTime);
    o1.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.12);
    g1.gain.setValueAtTime(0.22, ac.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.14);
    o1.start(); o1.stop(ac.currentTime + 0.15);
  } catch (_) {}
}

function sfxGunDestroy() {
  try {
    const ac = NeonArcade.getAudioCtx(), mb = NeonArcade.getMasterBus();
    // Long descending noise burst
    const dur = 1.8;
    const n   = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 0.5);
    const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 320;
    src.connect(f); f.connect(g); g.connect(mb);
    g.gain.setValueAtTime(0.55, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.start(); src.stop(ac.currentTime + dur + 0.01);
    // Descending pitch wail
    [440, 330, 220, 110].forEach((f2, i) => {
      const o = ac.createOscillator(), gv = ac.createGain();
      o.connect(gv); gv.connect(mb);
      o.type = 'sawtooth'; o.frequency.value = f2;
      const t = ac.currentTime + i * 0.2;
      gv.gain.setValueAtTime(0.28, t);
      gv.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.36);
    });
  } catch (_) {}
}

// ── Factories ──────────────────────────────────────────────────
function spawnPlane() {
  const fromLeft = Math.random() < 0.5;
  const spd = (PLANE_BASE_SPD + wave * PLANE_SPEED_INC) * (fromLeft ? 1 : -1);
  const col = randomPalette();
  planes.push({
    x: fromLeft ? -68 : LW + 68,
    y: 50 + Math.random() * 210,
    vx: spd, fromLeft,
    dropTimer:  1.2 + Math.random() * 2.2,
    dropped:    false,
    alive:      true,
    color:      col,
    dropsBonus: col.bonus === true && Math.random() < BONUS_DROP_CHANCE,
  });
}

function spawnHeli() {
  const fromLeft  = Math.random() < 0.5;
  const spd       = (HELI_BASE_SPD + wave * HELI_SPEED_INC) * (fromLeft ? 1 : -1);
  const col       = randomPalette();
  const dropCount = wave >= 4 ? 3 : 2;
  const drops     = [];
  let bonusSlot   = col.bonus === true && Math.random() < BONUS_DROP_CHANCE
    ? Math.floor(Math.random() * dropCount) : -1;
  for (let i = 0; i < dropCount; i++)
    drops.push({ timer: 1.0 + i * 1.6 + Math.random() * 0.8, done: false, isBonus: i === bonusSlot });
  helis.push({
    x: fromLeft ? -60 : LW + 60,
    y: 240 + Math.random() * 120,
    vx: spd, fromLeft,
    drops, alive: true,
    rotorAngle: 0,
    color: col,
  });
}

function spawnTrooper(x, y) {
  troopers.push({
    x, y,
    alive: true,
    state: 'falling',
    startY: y,
    chuteShot: false,
    walkDir: 0,
    animTimer: 0,
  });
}

function spawnBonus(x, y) {
  const types = ['rapid', 'spread', 'bomb'];
  bonuses.push({
    x, y,
    alive: true,
    type:   types[Math.floor(Math.random() * types.length)],
    state:  'falling',
    startY: y,
  });
}

function spawnExplosion(x, y, big) {
  explosions.push({ x, y, t: 0, dur: big ? 0.55 : 0.30, big });
}

// ── Score ──────────────────────────────────────────────────────
function addScore(pts) {
  score += pts;
  if (score > hiScore) { hiScore = score; localStorage.setItem('pt-hi', hiScore); }
}

// ── Atom bomb ─────────────────────────────────────────────────
function atomBomb() {
  planes.forEach(p  => { if (p.alive)  { spawnExplosion(p.x,  p.y,  true);  p.alive  = false; } });
  helis.forEach(h   => { if (h.alive)  { spawnExplosion(h.x,  h.y,  true);  h.alive  = false; } });
  troopers.forEach(t => { if (t.alive) { spawnExplosion(t.x,  t.y,  false); t.alive  = false; } });
  bonuses.forEach(b  => { b.alive = false; });
  bullets.forEach(b  => { b.alive = false; });
  planes = []; helis = []; troopers = []; bullets = []; bonuses = [];
  // Big central flash
  spawnExplosion(LW / 2, LH / 2, true);
  spawnExplosion(LW / 4, LH / 3, true);
  spawnExplosion(3 * LW / 4, LH / 3, true);
  // Force next wave
  wave++;
  planeInterval = Math.max(1.4, 3.5 - (wave - 1) * 0.22);
  heliInterval  = Math.max(2.8, 7.0 - (wave - 1) * 0.35);
  updateHUD();
}

// ── Activate bonus ────────────────────────────────────────────
function activateBonus(type) {
  sfxBonusPickup(type);
  if (type === 'rapid') {
    activeRapid = BONUS_DURATION;
  } else if (type === 'spread') {
    activeSpread = BONUS_DURATION;
  } else if (type === 'bomb') {
    atomBomb();
  }
}

// ── Gun damage ─────────────────────────────────────────────────
function damageGun() {
  if (gunHP <= 0 || gunDestroying) return;
  gunHP--;
  sfxGunHit();
  // Small impact explosion on the turret
  spawnExplosion(GUN_X + (Math.random() - 0.5) * 24, GUN_PIVOT_Y + (Math.random() - 0.5) * 10, false);
  if (gunHP <= 0) {
    gunDestroying   = true;
    gunDestroyTimer = 0;
    gunDestroyNextExp = 0;
    sfxGunDestroy();
  }
}

// ── Fire ───────────────────────────────────────────────────────
function fireBullet() {
  const cd   = activeRapid  > 0 ? FIRE_CD * 0.28 : FIRE_CD;
  const maxB = activeSpread > 0 ? MAX_BULLETS * 3  : MAX_BULLETS;
  if (fireCooldown > 0 || bullets.length >= maxB) return;

  const angles = activeSpread > 0
    ? [gunAngle - 0.28, gunAngle, gunAngle + 0.28]
    : [gunAngle];

  for (const a of angles) {
    bullets.push({
      x:  GUN_X      + Math.cos(a) * 14,
      y:  GUN_PIVOT_Y + Math.sin(a) * 14,
      vx: Math.cos(a) * BULL_SPD,
      vy: Math.sin(a) * BULL_SPD,
      alive: true,
    });
  }
  fireCooldown = cd;
  sfxShoot();
}

// ── Collision helpers ──────────────────────────────────────────
function ptInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}
function ptInCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// ── Game start / over ──────────────────────────────────────────
function triggerGameOver() {
  if (gameState === 'gameover') return;
  gameState = 'gameover';
  NeonArcade.stopMusic();
  sfxCapture();
  document.getElementById('go-score').textContent = 'SCORE  ' + score;
  showOverlay('overlay-gameover');
}

function startGame() {
  gameState     = 'playing';
  score         = 0;
  wave          = 1;
  totalKills    = 0;
  gunAngle      = -Math.PI / 2;
  bullets       = [];
  planes        = [];
  helis         = [];
  troopers      = [];
  bonuses       = [];
  explosions    = [];
  planeTimer    = 1.5;
  planeInterval = 3.5;
  heliTimer     = 5.0;
  heliInterval  = 7.0;
  fireCooldown    = 0;
  activeRapid     = 0;
  activeSpread    = 0;
  gunHP           = GUN_HP_MAX;
  gunDestroying   = false;
  gunDestroyTimer = 0;
  hideOverlays();
  updateHUD();
  NeonArcade.setTrack(5);
  NeonArcade.startMusic();
}

// ── Update ─────────────────────────────────────────────────────
function update(dt) {
  // ── Gun destruction animation (freeze all else) ──
  if (gunDestroying) {
    gunDestroyTimer   += dt;
    gunDestroyNextExp -= dt;
    if (gunDestroyNextExp <= 0) {
      spawnExplosion(
        GUN_X      + (Math.random() - 0.5) * 70,
        GUN_PIVOT_Y + (Math.random() - 0.5) * 30,
        Math.random() > 0.4
      );
      gunDestroyNextExp = 0.10 + Math.random() * 0.15;
    }
    for (const e of explosions) e.t += dt;
    explosions = explosions.filter(e => e.t < e.dur);
    if (gunDestroyTimer >= GUN_DESTROY_DUR) triggerGameOver();
    return;
  }

  fireCooldown  = Math.max(0, fireCooldown  - dt);
  activeRapid   = Math.max(0, activeRapid   - dt);
  activeSpread  = Math.max(0, activeSpread  - dt);

  // Rotate gun
  if (keys['ArrowLeft']  || keys['a'] || keys['A'])
    gunAngle = Math.max(-Math.PI, gunAngle - GUN_ROT_SPD * dt);
  if (keys['ArrowRight'] || keys['d'] || keys['D'])
    gunAngle = Math.min(0, gunAngle + GUN_ROT_SPD * dt);

  if (keys[' '] || keys['Space']) fireBullet();

  // ── Spawn planes ──
  planeTimer -= dt;
  if (planeTimer <= 0) { spawnPlane(); planeTimer = planeInterval * (0.7 + Math.random() * 0.6); }

  // ── Spawn helis ──
  heliTimer -= dt;
  if (heliTimer <= 0) { spawnHeli(); heliTimer = heliInterval * (0.7 + Math.random() * 0.6); }

  // ── Update planes ──
  for (const p of planes) {
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.dropTimer -= dt;
    if (!p.dropped && p.dropTimer <= 0) {
      if (p.dropsBonus) spawnBonus(p.x, p.y + 16);
      else              spawnTrooper(p.x, p.y + 16);
      p.dropped = true;
    }
    if ((p.fromLeft && p.x > LW + 80) || (!p.fromLeft && p.x < -80)) p.alive = false;
  }
  planes = planes.filter(p => p.alive);

  // ── Update helis ──
  for (const h of helis) {
    if (!h.alive) continue;
    h.x += h.vx * dt;
    h.rotorAngle += 16 * dt;
    for (const d of h.drops) {
      if (!d.done) {
        d.timer -= dt;
        if (d.timer <= 0) {
          if (d.isBonus) spawnBonus(h.x, h.y + 14);
          else           spawnTrooper(h.x, h.y + 14);
          d.done = true;
        }
      }
    }
    if ((h.fromLeft && h.x > LW + 80) || (!h.fromLeft && h.x < -80)) h.alive = false;
  }
  helis = helis.filter(h => h.alive);

  // ── Update bonuses ──
  for (const bo of bonuses) {
    if (!bo.alive) continue;
    if (bo.state === 'falling') {
      bo.y += BONUS_FALL_SPD * dt;
      if (bo.y - bo.startY >= BONUS_CHUTE_DIST) bo.state = 'chuting';
      if (bo.y >= GROUND_Y - 10) { bo.alive = false; }  // missed → destroyed
    } else if (bo.state === 'chuting') {
      bo.y += BONUS_CHUTE_SPD * dt;
      if (bo.y >= GROUND_Y - 10) { bo.alive = false; }  // missed → destroyed
    }
  }
  bonuses = bonuses.filter(bo => bo.alive);

  // ── Update troopers ──
  for (const tr of troopers) {
    if (!tr.alive) continue;
    tr.animTimer += dt;
    if (tr.state === 'falling') {
      tr.y += FREE_FALL_SPD * dt;
      if (!tr.chuteShot && tr.y - tr.startY >= CHUTE_OPEN_DIST) tr.state = 'chuting';
      if (tr.y >= GROUND_Y - 10) {
        if (tr.chuteShot) {
          tr.alive = false;
          spawnExplosion(tr.x, tr.y - 4, false);
          sfxExplode(false);
          totalKills++; updateHUD();
        } else if (Math.abs(tr.x - GUN_X) <= GUN_LAND_RADIUS) {
          // Landed directly on turret from above
          tr.alive = false;
          damageGun();
        } else {
          tr.y = GROUND_Y - 10; tr.state = 'walking';
          tr.walkDir = tr.x < GUN_X ? 1 : -1; sfxLand();
        }
      }
    } else if (tr.state === 'chuting') {
      tr.y += CHUTE_FALL_SPD * dt;
      if (tr.y >= GROUND_Y - 10) {
        if (Math.abs(tr.x - GUN_X) <= GUN_LAND_RADIUS) {
          tr.alive = false;
          damageGun();
        } else {
          tr.y = GROUND_Y - 10; tr.state = 'walking';
          tr.walkDir = tr.x < GUN_X ? 1 : -1; sfxLand();
        }
      }
    } else if (tr.state === 'walking') {
      tr.x += tr.walkDir * WALK_SPD * dt;
      if (tr.x < -20 || tr.x > LW + 20) tr.alive = false;
    }
  }
  troopers = troopers.filter(tr => tr.alive);

  // ── Walkers reaching the gun: deal 1 damage each ──
  for (const tr of troopers) {
    if (tr.alive && tr.state === 'walking' && Math.abs(tr.x - GUN_X) <= CAPTURE_DIST) {
      tr.alive = false;
      damageGun();
    }
  }
  troopers = troopers.filter(tr => tr.alive);

  // ── Update bullets ──
  for (const b of bullets) {
    if (!b.alive) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 0 || b.x > LW || b.y < -10 || b.y > LH) b.alive = false;
  }

  // ── Bullet vs plane ──
  for (const b of bullets) {
    if (!b.alive) continue;
    for (const p of planes) {
      if (!p.alive) continue;
      if (ptInRect(b.x, b.y, p.x - 48, p.y - 14, 96, 28)) {
        b.alive = false; p.alive = false;
        spawnExplosion(p.x, p.y, true); sfxExplode(true);
        addScore(150 + wave * 15); totalKills++; updateHUD(); break;
      }
    }
  }

  // ── Bullet vs heli ──
  for (const b of bullets) {
    if (!b.alive) continue;
    for (const h of helis) {
      if (!h.alive) continue;
      if (ptInRect(b.x, b.y, h.x - 26, h.y - 14, 52, 28)) {
        b.alive = false; h.alive = false;
        spawnExplosion(h.x, h.y, true); sfxExplode(true);
        addScore(200 + wave * 20); totalKills++; updateHUD(); break;
      }
    }
  }

  // ── Bullet vs bonus (must shoot to collect) ──
  for (const b of bullets) {
    if (!b.alive) continue;
    for (const bo of bonuses) {
      if (!bo.alive) continue;
      const hitBox   = ptInRect(b.x, b.y, bo.x - 12, bo.y - 18, 24, 22);
      const hitChute = bo.state === 'chuting' && ptInCircle(b.x, b.y, bo.x, bo.y - 34, 18);
      if (hitBox || hitChute) {
        b.alive = false; bo.alive = false;
        activateBonus(bo.type); break;
      }
    }
  }

  // ── Bullet vs trooper ──
  for (const b of bullets) {
    if (!b.alive) continue;
    for (const tr of troopers) {
      if (!tr.alive) continue;
      let hitType = null;
      if (tr.state === 'chuting') {
        if      (ptInCircle(b.x, b.y, tr.x, tr.y - 28, 22))           hitType = 'chute';
        else if (ptInRect(b.x, b.y, tr.x - 7, tr.y - 12, 14, 18))     hitType = 'body';
      } else if (tr.state === 'falling') {
        if (ptInRect(b.x, b.y, tr.x - 7, tr.y - 12, 14, 20)) hitType = 'body';
      } else if (tr.state === 'walking') {
        if (ptInRect(b.x, b.y, tr.x - 7, tr.y - 16, 14, 20)) hitType = 'body';
      }
      if (hitType) {
        b.alive = false;
        if (hitType === 'chute') {
          tr.state = 'falling'; tr.chuteShot = true; tr.startY = tr.y;
          addScore(75); updateHUD();
        } else {
          tr.alive = false;
          spawnExplosion(tr.x, tr.y - 6, false); sfxExplode(false);
          addScore(tr.state === 'walking' ? 100 : 50); totalKills++; updateHUD();
        }
        break;
      }
    }
  }

  bullets = bullets.filter(b => b.alive);

  // ── Wave progression ──
  if (totalKills >= wave * KILLS_PER_WAVE) {
    wave++;
    planeInterval = Math.max(1.4, 3.5 - (wave - 1) * 0.22);
    heliInterval  = Math.max(2.8, 7.0 - (wave - 1) * 0.35);
    updateHUD();
  }

  for (const e of explosions) e.t += dt;
  explosions = explosions.filter(e => e.t < e.dur);
}

// ── Draw helpers ───────────────────────────────────────────────
function drawBackground() {
  // Solid black sky (CGA style)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, LW, GROUND_Y);

  // White pixel stars — fixed positions
  ctx.fillStyle = '#FFFFFF';
  for (const s of STARS) ctx.fillRect(s.x, s.y, 1, 1);

  // Dark green ground fill
  ctx.fillStyle = '#003300';
  ctx.fillRect(0, GROUND_Y, LW, LH - GROUND_Y);
  // Bright green ground line
  ctx.fillStyle = '#00AA00';
  ctx.fillRect(0, GROUND_Y, LW, 2);
  // Hatching marks
  ctx.fillStyle = '#005500';
  for (let x = 8; x < LW; x += 22) {
    ctx.fillRect(x,      GROUND_Y + 2, 1, 7);
    ctx.fillRect(x - 11, GROUND_Y + 3, 1, 6);
  }
}

function drawGunBase() {
  // Tread base
  ctx.fillStyle = '#004400';
  ctx.fillRect(GUN_X - 28, GROUND_Y, 56, 8);
  ctx.fillStyle = '#00AA00';
  ctx.fillRect(GUN_X - 28, GROUND_Y, 56, 2);
  ctx.fillStyle = '#002200';
  for (let x = GUN_X - 24; x < GUN_X + 28; x += 8)
    ctx.fillRect(x, GROUND_Y + 2, 1, 6);

  // Turret housing
  ctx.fillStyle = '#002244';
  ctx.fillRect(GUN_X - 22, GROUND_Y - 12, 44, 13);
  // Top highlight
  ctx.fillStyle = '#004488';
  ctx.fillRect(GUN_X - 22, GROUND_Y - 12, 44, 2);
}

function drawGun() {
  if (gunHP <= 0) return;

  const dmg      = 1 - gunHP / GUN_HP_MAX;
  const shakeAmp = gunDestroying ? 5 : (dmg > 0.6 ? (dmg - 0.6) * 7.5 : 0);
  const sx = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp * 2 : 0;
  const sy = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp * 2 : 0;

  const px = GUN_X + sx, py = GUN_PIVOT_Y + sy;
  const ex = px + Math.cos(gunAngle) * BARREL_LEN;
  const ey = py + Math.sin(gunAngle) * BARREL_LEN;

  const barrelCol = dmg > 0.6 ? '#FF5555' : '#55FFFF';
  const barrelLt  = dmg > 0.6 ? '#FF9999' : '#AAFFFF';

  // Barrel — square caps for pixel look
  ctx.save();
  ctx.lineCap = 'square';
  ctx.strokeStyle = barrelCol; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(Math.round(px), Math.round(py)); ctx.lineTo(Math.round(ex), Math.round(ey)); ctx.stroke();
  ctx.strokeStyle = barrelLt;  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(Math.round(px), Math.round(py)); ctx.lineTo(Math.round(ex), Math.round(ey)); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.restore();

  // Turret dome — semicircle open-side down
  ctx.fillStyle = '#001133';
  ctx.beginPath();
  ctx.arc(px, py, 12, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = barrelCol; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 12, Math.PI, 0, false);
  ctx.closePath();
  ctx.stroke();
  // Center pixel
  ctx.fillStyle = barrelCol;
  ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4);
}

function drawGunHP() {
  const SEG_W = 12, SEG_H = 7, GAP = 2;
  const total = (SEG_W + GAP) * GUN_HP_MAX - GAP;
  const x0    = GUN_X - total / 2;
  const y0    = GROUND_Y + 14;

  for (let i = 0; i < GUN_HP_MAX; i++) {
    const filled = i < gunHP;
    let col;
    if      (!filled)     col = '#1A1A1A';
    else if (gunHP > 6)   col = '#00AA00';
    else if (gunHP > 3)   col = '#AAAA00';
    else                  col = '#AA0000';
    ctx.fillStyle = col;
    ctx.fillRect(x0 + i * (SEG_W + GAP), y0, SEG_W, SEG_H);
    if (filled) {
      // Top-edge highlight (flat sheen, no glow)
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x0 + i * (SEG_W + GAP), y0, SEG_W, 2);
    }
  }
}

function drawPlane(p) {
  const c = p.color;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  if (p.vx < 0) ctx.scale(-1, 1);

  // Main body
  ctx.fillStyle = c.main;
  ctx.fillRect(-36, -6, 66, 12);
  // Nose
  ctx.fillStyle = c.lt;
  ctx.fillRect(30, -4, 16, 8);
  // Top wing
  ctx.fillStyle = c.main;
  ctx.fillRect(-36, -18, 22, 12);
  // Tail fin
  ctx.fillStyle = c.lt;
  ctx.fillRect(-36, -6, 4, 14);
  // Cockpit window
  ctx.fillStyle = '#55FFFF';
  ctx.fillRect(4, -5, 14, 7);
  // Under-fuselage pod
  ctx.fillStyle = c.dk;
  ctx.fillRect(-12, 6, 28, 9);

  ctx.restore();
}

function drawHeli(h) {
  const c = h.color;
  ctx.save();
  ctx.translate(Math.round(h.x), Math.round(h.y));
  if (h.vx < 0) ctx.scale(-1, 1);

  // Main rotor
  const rx = Math.round(Math.cos(h.rotorAngle) * 28);
  const ry = Math.round(Math.sin(h.rotorAngle) * 5);
  ctx.strokeStyle = c.lt; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-rx, -12 + ry); ctx.lineTo(rx, -12 - ry);
  ctx.stroke();
  // Rotor hub
  ctx.fillStyle = c.main;
  ctx.fillRect(-2, -15, 5, 6);

  // Fuselage
  ctx.fillStyle = c.main;
  ctx.fillRect(-20, -8, 40, 16);
  // Top highlight
  ctx.fillStyle = c.lt;
  ctx.fillRect(-20, -8, 40, 2);
  // Cockpit window
  ctx.fillStyle = '#55FFFF';
  ctx.fillRect(10, -6, 12, 9);

  // Tail boom
  ctx.fillStyle = c.dk;
  ctx.fillRect(-40, -3, 22, 5);

  // Tail rotor
  const ty = Math.round(Math.cos(h.rotorAngle * 2) * 7);
  ctx.strokeStyle = c.lt; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-40, -3 + ty); ctx.lineTo(-40, -3 - ty);
  ctx.stroke();

  // Landing skids
  ctx.strokeStyle = c.lt; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, 8); ctx.lineTo(18, 8);
  ctx.moveTo(-12, 8); ctx.lineTo(-12, 14);
  ctx.moveTo( 12, 8); ctx.lineTo( 12, 14);
  ctx.stroke();

  ctx.restore();
}

function drawTrooper(tr) {
  const x = Math.round(tr.x), y = Math.round(tr.y);
  ctx.save();

  if (tr.state === 'chuting') {
    const cy = y - 28;
    // Canopy
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, cy, 20, Math.PI, 0, false); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(x, cy, 20, Math.PI, 0, false); ctx.closePath(); ctx.fill();
    // Shroud lines
    ctx.strokeStyle = '#888888'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x-20, cy); ctx.lineTo(x-3, y-3);
    ctx.moveTo(x-8, cy-18); ctx.lineTo(x-3, y-3);
    ctx.moveTo(x+8, cy-18); ctx.lineTo(x+3, y-3);
    ctx.moveTo(x+20, cy); ctx.lineTo(x+3, y-3);
    ctx.stroke();
  }

  // Pixel figure — CGA yellow
  ctx.fillStyle = '#FFFF55';
  ctx.fillRect(x-3, y-14, 6, 5);   // head
  ctx.fillRect(x-2, y-9,  4, 7);   // body
  ctx.fillRect(x-7, y-8,  5, 2);   // left arm
  ctx.fillRect(x+2, y-8,  5, 2);   // right arm
  const swing = tr.state === 'walking' ? Math.round(Math.sin(tr.animTimer * 9) * 3) : 0;
  ctx.fillRect(x-4+swing, y-2, 3, 8);  // left leg
  ctx.fillRect(x+1-swing, y-2, 3, 8);  // right leg
  // Rifle
  if (tr.state !== 'chuting') {
    ctx.fillStyle = '#888888';
    ctx.fillRect(x+2, y-7, 8, 1);
  }

  ctx.restore();
}

function drawBonus(bo) {
  const x = Math.round(bo.x), y = Math.round(bo.y);
  ctx.save();

  if (bo.state === 'chuting') {
    const cy = y - 34;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, cy, 18, Math.PI, 0, false); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(x, cy, 18, Math.PI, 0, false); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#888888'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x-18, cy); ctx.lineTo(x-5, y-2);
    ctx.moveTo(x-6,  cy-17); ctx.lineTo(x-5, y-2);
    ctx.moveTo(x+6,  cy-17); ctx.lineTo(x+5, y-2);
    ctx.moveTo(x+18, cy); ctx.lineTo(x+5, y-2);
    ctx.stroke();
  }

  const S = 18, bx = x - S/2, by = y - S;
  let col;
  if      (bo.type === 'rapid')  col = '#55FFFF';
  else if (bo.type === 'spread') col = '#FF5555';
  else                           col = '#55FF55';

  // Crate
  ctx.fillStyle = '#000000'; ctx.fillRect(bx, by, S, S);
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, S - 1, S - 1);
  // Straps
  ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, by); ctx.lineTo(x, by+S);
  ctx.moveTo(bx, by+S/2); ctx.lineTo(bx+S, by+S/2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Icon
  if (bo.type === 'rapid') {
    ctx.fillStyle = '#55FFFF';
    for (let i = 0; i < 3; i++) ctx.fillRect(x-4, by+3+i*4, 8, 2);
  } else if (bo.type === 'spread') {
    ctx.strokeStyle = '#FF5555'; ctx.lineWidth = 1;
    [-0.4, 0, 0.4].forEach(a => {
      ctx.beginPath(); ctx.moveTo(x, by+S-3); ctx.lineTo(x + Math.sin(a)*7, by+3); ctx.stroke();
    });
  } else {
    ctx.fillStyle = '#55FF55';
    ctx.beginPath(); ctx.arc(x+1, by+S/2+1, 4, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function drawBonusIndicators() {
  let xOff = 8;
  ctx.save();
  ctx.font = '6px "Press Start 2P", monospace';
  ctx.textBaseline = 'bottom';
  if (activeRapid > 0) {
    ctx.fillStyle = '#55FFFF';
    ctx.fillText('RAPID ' + Math.ceil(activeRapid) + 's', xOff, GROUND_Y - 4);
    xOff += 120;
  }
  if (activeSpread > 0) {
    ctx.fillStyle = '#FF5555';
    ctx.fillText('SPREAD ' + Math.ceil(activeSpread) + 's', xOff, GROUND_Y - 4);
  }
  ctx.restore();
}

function drawBullet(b) {
  // 3×3 pixel square, no glow
  ctx.fillStyle = '#FFFF55';
  ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
}

function drawExplosion(e) {
  const tf     = e.t / e.dur;
  const maxR   = e.big ? 46 : 24;
  const radius = maxR * Math.sqrt(tf);
  const count  = e.big ? 20 : 12;
  const colors = ['#FFFFFF', '#FFFF55', '#FFFF55', '#FF5500', '#FF5500', '#FF0000'];

  ctx.save();
  ctx.globalAlpha = 1 - tf;

  // Pixel fragments — fixed angles, distance grows with time
  for (let i = 0; i < count; i++) {
    const angle  = (i / count) * Math.PI * 2;
    // Each fragment travels at slightly different speed so burst looks uneven
    const frac   = 0.5 + (i % 5) * 0.13;
    const dist   = Math.round(radius * frac);
    const px     = Math.round(e.x + Math.cos(angle) * dist);
    const py     = Math.round(e.y + Math.sin(angle) * dist);
    const pSize  = Math.max(2, (e.big ? 5 : 3) - Math.floor(tf * 3));
    const col    = colors[(i + Math.floor(tf * 3)) % colors.length];
    ctx.fillStyle = col;
    ctx.fillRect(px, py, pSize, pSize);

    // Secondary smaller pixel trailing slightly behind
    if (e.big && dist > 6) {
      const dist2 = Math.round(dist * 0.6);
      ctx.fillStyle = colors[(i + 2) % colors.length];
      ctx.fillRect(
        Math.round(e.x + Math.cos(angle) * dist2),
        Math.round(e.y + Math.sin(angle) * dist2),
        2, 2);
    }
  }

  // Center flash — cross of pixels (early phase)
  if (tf < 0.30) {
    const fc = Math.round(7 * (1 - tf / 0.30));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(e.x - fc, e.y - 2,  fc * 2, 4);  // horizontal bar
    ctx.fillRect(e.x - 2,  e.y - fc, 4, fc * 2);  // vertical bar
    ctx.fillRect(e.x - fc / 2, e.y - fc / 2, fc, fc); // center block
  }

  ctx.restore();
}

// ── Draw ───────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, LW, LH);
  drawBackground();
  for (const p  of planes)      drawPlane(p);
  for (const h  of helis)       drawHeli(h);
  for (const bo of bonuses)     drawBonus(bo);
  for (const tr of troopers)    drawTrooper(tr);
  for (const b  of bullets)     drawBullet(b);
  for (const e  of explosions)  drawExplosion(e);
  drawGunBase();
  drawGun();
  drawGunHP();
  if (gameState === 'playing') drawBonusIndicators();
}

// ── Game loop ──────────────────────────────────────────────────
let lastTs = 0;
function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (gameState === 'playing') { update(dt); draw(); }
  else if (gameState === 'paused') draw();
  requestAnimationFrame(loop);
}

// ── Keyboard ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (gameState === 'playing' &&
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
  }
  if (gameState === 'playing' && e.key === ' ') {
    fireBullet(); e.preventDefault();
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (gameState === 'playing') {
      e.preventDefault();
      gameState = 'paused'; NeonArcade.stopMusic(); showOverlay('overlay-pause');
    } else if (gameState === 'paused') {
      e.preventDefault();
      gameState = 'playing'; NeonArcade.startMusic(); hideOverlays();
    }
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// ── Fullscreen (mobile) ────────────────────────────────────────
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

// ── Buttons ────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click',   () => { tryFullscreen(); startGame(); });
document.getElementById('btn-restart').addEventListener('click', () => { tryFullscreen(); startGame(); });
document.getElementById('btn-resume').addEventListener('click', () => {
  if (gameState !== 'paused') return;
  gameState = 'playing'; NeonArcade.startMusic(); hideOverlays();
});
document.getElementById('btn-pause').addEventListener('click', () => {
  if (gameState === 'playing') {
    gameState = 'paused'; NeonArcade.stopMusic(); showOverlay('overlay-pause');
  } else if (gameState === 'paused') {
    gameState = 'playing'; NeonArcade.startMusic(); hideOverlays();
  }
});

// ── Music toggle ───────────────────────────────────────────────
const musicBtn = document.getElementById('music-toggle');
musicBtn.addEventListener('click', () => {
  const { track, name } = NeonArcade.cycleTrack();
  musicBtn.textContent = '♪ ' + name;
});
const musicMuteBtn = document.getElementById('music-mute');
musicMuteBtn.addEventListener('click', () => {
  const { on } = NeonArcade.toggleMusic();
  musicMuteBtn.textContent = on ? 'Music: ON' : 'Music: OFF';
  musicMuteBtn.classList.toggle('off', !on);
});

// ── Mobile touch controls ──────────────────────────────────────
(function () {
  if (!navigator.maxTouchPoints) return;  // desktop — do nothing

  document.body.classList.add('is-mobile');

  document.getElementById('mobile-dpad').style.display      = 'flex';
  document.getElementById('mobile-fire-wrap').style.display = 'flex';

  const dpadCross = document.getElementById('dpad-cross');
  const elLeft    = document.getElementById('dpad-left');
  const elRight   = document.getElementById('dpad-right');
  const elUp      = document.getElementById('dpad-up');
  const elDown    = document.getElementById('dpad-down');
  const SWIPE_MIN = 18;
  let dpadStartX = 0, dpadStartY = 0;

  function clearDpadKeys() {
    keys['ArrowLeft']  = false;
    keys['ArrowRight'] = false;
    [elLeft, elRight, elUp, elDown].forEach(el => el.classList.remove('active'));
  }

  function bindCell(el, keyName) {
    el.addEventListener('touchstart', e => {
      e.stopPropagation();
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
  bindCell(elUp,    null);
  bindCell(elDown,  null);

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
    fireBullet();
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

// ── Init ───────────────────────────────────────────────────────
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
hiEl.textContent = hiScore;
NeonArcade.setTrack(5);
requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
