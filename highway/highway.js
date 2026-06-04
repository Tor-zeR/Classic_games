'use strict';

// ╔══════════════════════════════════════════════════════════════╗
// ║  HIGHWAY DELIVERY — top-down combat-racer courier             ║
// ║  Vertical-scrolling: world scrolls toward the player from the ║
// ║  top, camera fixed, car sits near the bottom-center.          ║
// ║  5 stages — survive a duration, then match speed with the VIP ║
// ║  limo to deliver the parcel. Combat scoring is the same.      ║
// ╚══════════════════════════════════════════════════════════════╝

// ── Canvas ─────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

// ── Logical dimensions (landscape) ─────────────────────────────
const LW = 800;
const LH = 480;

// ── Road geometry ──────────────────────────────────────────────
// Painted edges sit inset from the canvas. Shoulder beyond.
const ROAD_LEFT      = 160;
const ROAD_RIGHT     = LW - 160;
const ROAD_WIDTH     = ROAD_RIGHT - ROAD_LEFT;
const LANE_COUNT     = 4;                       // maximum lane count (full-width 4-lane road)
const LANE_WIDTH     = ROAD_WIDTH / LANE_COUNT; // fixed — lanes never widen, the road just narrows
const ROAD_CX        = (ROAD_LEFT + ROAD_RIGHT) / 2;
const SHOULDER_LEFT  = ROAD_LEFT - 60;
const SHOULDER_RIGHT = ROAD_RIGHT + 60;

// Dynamic road-width state — the road is a vertical stack of "segments" that
// scroll down with the world. Each segment carries its top/bottom edges, so
// taper segments are literal trapezoids the player drives THROUGH — not a
// uniform shrink of both sides.
const TAPER_HEIGHT  = 280;     // px tall — stretched so the diagonal merge is gentler, not abrupt
const STRAIGHT_MIN  = 220;     // px tall, minimum straight segment length
const STRAIGHT_MAX  = 460;     // px tall, maximum straight segment length

const segments = [];           // ordered top→bottom (smallest topY first)
let segPhase        = 'WIDE';  // 'WIDE' | 'TAPER_TO_NARROW' | 'NARROW' | 'TAPER_TO_WIDE'
let segPhaseLeft    = 2;       // straight tiles remaining in the current phase
let segCurLanes     = LANE_COUNT;
let segNextLanes    = LANE_COUNT;
let segCurOffset    = 0;             // pixels offset from ROAD_CX for current NARROW phase
let segNextOffset   = 0;             // pixels offset for the upcoming NARROW phase
// Bidirectional-traffic split (right-drive). For a section with `lanes`
// total lanes, `ownLaneCount` are own-direction (right side) and the rest
// are opposite-direction (left side). Stable across a taper chain so the
// divider line never jumps mid-narrow-section.
let segCurOwnSplit  = LANE_COUNT;    // own-lane count for current NARROW (or wide)
let segNextOwnSplit = LANE_COUNT;    // own-lane count for the upcoming NARROW

// Edges at any Y in world-screen space. Linear-searches `segments` (typically ~10).
let roadLeftActive  = ROAD_LEFT;   // refreshed each frame at the player's Y
let roadRightActive = ROAD_RIGHT;
let roadLanesAtPlayer = LANE_COUNT;

function makeStraightSeg(topY, height, lanes, offsetPx, ownLaneCount) {
  const half = (lanes * LANE_WIDTH) / 2;
  const cx   = ROAD_CX + (offsetPx || 0);
  const leftTop  = cx - half, leftBot  = cx - half;
  const rightTop = cx + half, rightBot = cx + half;
  // Divider sits at the boundary between opposite-direction (left) and
  // own-direction (right) lanes. dividerIdx counts from the LEFT edge.
  const dividerIdx = lanes - ownLaneCount;
  const laneWTop = (rightTop - leftTop) / lanes;
  const laneWBot = (rightBot - leftBot) / lanes;
  return {
    topY, height, lanes, taper: false,
    leftTop, leftBot, rightTop, rightBot,
    ownLaneCount,
    dividerTop: leftTop + laneWTop * dividerIdx,
    dividerBot: leftBot + laneWBot * dividerIdx,
  };
}
function makeTaperSeg(topY, height, fromLanes, toLanes, fromOffsetPx, toOffsetPx,
                      fromOwnLaneCount, toOwnLaneCount) {
  // `fromLanes`/`fromOffsetPx` describe the section BELOW the taper (closer to
  // the player). `toLanes`/`toOffsetPx` describe the section ABOVE (further
  // ahead). The taper's TOP matches the section above; its BOTTOM matches below.
  // Per-side offsets let narrow sections taper off the LEFT or RIGHT of the
  // wide road, not just from the center.
  const halfFrom = (fromLanes * LANE_WIDTH) / 2;
  const halfTo   = (toLanes   * LANE_WIDTH) / 2;
  const cxFrom   = ROAD_CX + (fromOffsetPx || 0);
  const cxTo     = ROAD_CX + (toOffsetPx   || 0);
  const leftTop  = cxTo   - halfTo,    leftBot  = cxFrom - halfFrom;
  const rightTop = cxTo   + halfTo,    rightBot = cxFrom + halfFrom;
  // For divider purposes we record the segment's effective own-lane count as
  // the bottom one (the section below this taper). Spawner/AI queries that
  // hit a taper will use the lerped dividerX directly via dividerXAtY().
  // The top of the taper matches the section above (toOwnLaneCount); the
  // bottom matches the section below (fromOwnLaneCount).
  const dividerTop = leftTop + ((rightTop - leftTop) / toLanes)   * (toLanes   - toOwnLaneCount);
  const dividerBot = leftBot + ((rightBot - leftBot) / fromLanes) * (fromLanes - fromOwnLaneCount);
  return {
    topY, height, lanes: Math.min(fromLanes, toLanes), taper: true,
    leftTop, leftBot, rightTop, rightBot,
    // Use the smaller (narrower) of the two ends as the segment's own-lane
    // count for spawn-range queries inside the taper.
    ownLaneCount: Math.min(fromOwnLaneCount, toOwnLaneCount),
    dividerTop, dividerBot,
  };
}
// Pick a horizontal alignment (in pixels relative to ROAD_CX) for a narrow
// section. Determines from which edge(s) the taper diagonals come in.
function pickNarrowOffset(narrowLanes) {
  const maxShift = (LANE_COUNT - narrowLanes) * LANE_WIDTH / 2;
  if (maxShift === 0) return 0;
  // 4→3 lanes: only left or right alignment — the single dropped lane has to
  // come off one edge or the other (no centered 3-lane fit inside 4).
  if (narrowLanes === LANE_COUNT - 1) {
    return Math.random() < 0.5 ? -maxShift : maxShift;
  }
  // 4→2 lanes: ALWAYS centered — the taper comes in symmetrically from both
  // edges of the 4-lane road. Per project rule.
  return 0;
}
// 4-lane: ownLaneCount=2 (fixed). 2-lane: ownLaneCount=1 (fixed).
// 3-lane: 50/50 between 2-own/1-opp and 1-own/2-opp — randomized once per
// narrow-section creation so a 3-lane chain doesn't change feel mid-section.
function rollOwnLaneCount(lanes) {
  if (lanes === LANE_COUNT) return 2;     // 4-lane → 2 own / 2 opp
  if (lanes === 2)          return 1;     // 2-lane → 1 own / 1 opp
  return Math.random() < 0.5 ? 2 : 1;     // 3-lane → either split
}
function generateSegmentAbove(bottomY) {
  let seg;
  if (segPhase === 'WIDE') {
    const h = STRAIGHT_MIN + Math.random() * (STRAIGHT_MAX - STRAIGHT_MIN);
    seg = makeStraightSeg(bottomY - h, h, LANE_COUNT, 0, segCurOwnSplit);
    if (--segPhaseLeft <= 0) {
      segPhase         = 'TAPER_TO_NARROW';
      segNextLanes     = Math.random() < 0.55 ? 3 : 2;
      segNextOffset    = pickNarrowOffset(segNextLanes);
      segNextOwnSplit  = rollOwnLaneCount(segNextLanes);
    }
  } else if (segPhase === 'TAPER_TO_NARROW') {
    // Top of taper matches the NARROW above (segNextOwnSplit). Bottom matches
    // the WIDE below (segCurOwnSplit, which is LANE_COUNT/2=2 in 4-lane).
    seg = makeTaperSeg(bottomY - TAPER_HEIGHT, TAPER_HEIGHT,
                       LANE_COUNT, segNextLanes, 0, segNextOffset,
                       segCurOwnSplit, segNextOwnSplit);
    segPhase        = 'NARROW';
    segPhaseLeft    = 3 + Math.floor(Math.random() * 3);   // 3–5 narrow tiles — narrow sections last longer
    segCurLanes     = segNextLanes;
    segCurOffset    = segNextOffset;
    segCurOwnSplit  = segNextOwnSplit;
  } else if (segPhase === 'NARROW') {
    const h = STRAIGHT_MIN + Math.random() * (STRAIGHT_MAX - STRAIGHT_MIN);
    seg = makeStraightSeg(bottomY - h, h, segCurLanes, segCurOffset, segCurOwnSplit);
    if (--segPhaseLeft <= 0) segPhase = 'TAPER_TO_WIDE';
  } else { // TAPER_TO_WIDE
    // Top of taper matches WIDE above (2 own in 4-lane). Bottom matches the
    // NARROW below (segCurOwnSplit).
    const wideOwn = rollOwnLaneCount(LANE_COUNT);   // always 2 for LANE_COUNT=4
    seg = makeTaperSeg(bottomY - TAPER_HEIGHT, TAPER_HEIGHT,
                       segCurLanes, LANE_COUNT, segCurOffset, 0,
                       segCurOwnSplit, wideOwn);
    segPhase        = 'WIDE';
    segPhaseLeft    = 6 + Math.floor(Math.random() * 5);   // 6–10 wide tiles between narrows
    segCurLanes     = LANE_COUNT;
    segCurOffset    = 0;
    segCurOwnSplit  = wideOwn;
  }
  return seg;
}
function initRoadSegments() {
  segments.length = 0;
  segPhase = 'WIDE';
  segPhaseLeft    = 6 + Math.floor(Math.random() * 5);   // start with a long wide stretch
  segCurLanes     = LANE_COUNT;
  segNextLanes    = LANE_COUNT;
  segCurOffset    = 0;
  segNextOffset   = 0;
  segCurOwnSplit  = rollOwnLaneCount(LANE_COUNT);   // 4-lane → fixed 2 own / 2 opp
  segNextOwnSplit = LANE_COUNT;
  // Fill from below the screen upward so the visible area is fully covered.
  let bottomY = LH + 200;
  while (bottomY > -300) {
    const seg = generateSegmentAbove(bottomY);
    segments.unshift(seg);
    bottomY = seg.topY;
  }
}
function edgesAtY(y) {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (y >= s.topY && y < s.topY + s.height) {
      const t  = (y - s.topY) / s.height;
      const l  = s.leftTop  + t * (s.leftBot  - s.leftTop);
      const r  = s.rightTop + t * (s.rightBot - s.rightTop);
      return { left: l, right: r, lanes: s.lanes };
    }
  }
  return { left: ROAD_LEFT, right: ROAD_RIGHT, lanes: LANE_COUNT };
}
// Divider X at a given Y. Returns the lerped divider position plus the
// own/opposite lane counts for the segment containing y. Right-drive: own
// lanes sit to the RIGHT of the divider, opposite lanes to the LEFT.
function dividerXAtY(y) {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (y >= s.topY && y < s.topY + s.height) {
      const t  = (y - s.topY) / s.height;
      const x  = s.dividerTop + t * (s.dividerBot - s.dividerTop);
      return { x, ownLaneCount: s.ownLaneCount, oppLaneCount: s.lanes - s.ownLaneCount };
    }
  }
  // Fallback — treat as full 4-lane with 2 own / 2 opp at center.
  return { x: ROAD_CX, ownLaneCount: 2, oppLaneCount: 2 };
}
function isOwnDirectionAtY(x, y) {
  return x > dividerXAtY(y).x;
}
function laneCenterX(lane, atY) {
  const e   = edgesAtY(atY);
  const lw  = (e.right - e.left) / e.lanes;
  return e.left + lw * (lane + 0.5);
}
function activeLanesAt(y) { return edgesAtY(y).lanes; }

// ── Roadside scenery ──────────────────────────────────────────
// Each side maintains its own queue of tiles scrolling down with the world.
// Tile types: 'grass' | 'trees' | 'houses' (pavement is part of houses only).
const PAVEMENT_W   = 22;   // grey sidewalk strip width, only painted under 'houses' tiles
const sceneryLeft  = [];
const sceneryRight = [];

function generateSceneryTile(bottomY, side) {
  // side: 'L' (left strip = [0..ROAD_LEFT]) or 'R' (right strip = [ROAD_RIGHT..LW])
  const r = Math.random();
  let type;
  if      (r < 0.45) type = 'grass';
  else if (r < 0.78) type = 'trees';
  else               type = 'houses';

  // Strip extent in screen-space
  const stripMin = side === 'L' ? 0          : ROAD_RIGHT;
  const stripMax = side === 'L' ? ROAD_LEFT  : LW;
  const stripW   = stripMax - stripMin;

  // Distances from the inner (road-adjacent) edge of the strip
  // pavZone is the grey sidewalk strip on house tiles, immediately next to the road.
  // contentZone is where trees/houses can sit, outside the pavement.
  const pavZoneInner = side === 'L' ? stripMax - PAVEMENT_W : stripMin;
  const pavZoneOuter = side === 'L' ? stripMax              : stripMin + PAVEMENT_W;
  const contentMin   = side === 'L' ? stripMin + 4          : pavZoneOuter + 4;
  const contentMax   = side === 'L' ? pavZoneInner - 4      : stripMax - 4;

  let height = 0;
  const items = [];

  if (type === 'grass') {
    height = 110 + Math.random() * 90;
    // sparse light tufts
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      items.push({
        kind: 'tuft',
        x: stripMin + 4 + Math.random() * (stripW - 8),
        y: 10 + Math.random() * (height - 20),
        r: 3 + Math.random() * 4,
      });
    }
  } else if (type === 'trees') {
    height = 160 + Math.random() * 100;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      items.push({
        kind: 'tree',
        x: stripMin + 8 + Math.random() * (stripW - 16),
        y: 14 + Math.random() * (height - 28),
        r: 9 + Math.random() * 7,
      });
    }
  } else {
    // houses + pavement
    height = 200 + Math.random() * 100;
    const n = 1 + Math.floor(Math.random() * 2);   // 1–2 houses per tile (top-down view, fairly large)
    const placed = [];
    for (let i = 0; i < n; i++) {
      const w = 40 + Math.random() * 22;
      const h = 46 + Math.random() * 26;
      // pick a y that doesn't overlap previously placed houses
      let yPick = 14, tries = 0;
      while (tries++ < 8) {
        yPick = 14 + Math.random() * (height - h - 28);
        let bad = false;
        for (const p of placed) if (Math.abs(p.y + p.h/2 - (yPick + h/2)) < (p.h + h) / 2 + 6) { bad = true; break; }
        if (!bad) break;
      }
      const xMin = contentMin;
      const xMax = Math.max(xMin + w, contentMax - w);
      const x = xMin + Math.random() * Math.max(0, xMax - xMin - w);
      const roofPalette = ['#5a3328', '#4a3a2a', '#3a4a5a', '#5a4a32'];
      placed.push({
        kind: 'house', x, y: yPick, w, h,
        roof: roofPalette[Math.floor(Math.random() * roofPalette.length)],
        body: '#3a3a40',
      });
    }
    for (const p of placed) items.push(p);
  }

  return { topY: bottomY - height, height, type, side, items, pavInner: pavZoneInner, pavOuter: pavZoneOuter };
}

function initScenery() {
  sceneryLeft.length  = 0;
  sceneryRight.length = 0;
  for (const arr of [sceneryLeft, sceneryRight]) {
    const side = arr === sceneryLeft ? 'L' : 'R';
    let bottomY = LH + 200;
    while (bottomY > -300) {
      const tile = generateSceneryTile(bottomY, side);
      arr.unshift(tile);
      bottomY = tile.topY;
    }
  }
}
function updateScenery(dt) {
  for (const arr of [sceneryLeft, sceneryRight]) {
    const side = arr === sceneryLeft ? 'L' : 'R';
    for (let i = 0; i < arr.length; i++) arr[i].topY += worldSpd * dt;
    while (arr.length && arr[arr.length - 1].topY > LH + 200) arr.pop();
    while (arr.length && arr[0].topY > -300) {
      arr.unshift(generateSceneryTile(arr[0].topY, side));
    }
  }
}

function drawTreeSprite(x, y, r) {
  // Top-down tree: dark green outline, mid-green canopy, lighter highlight on top-left, trunk dot center.
  ctx.fillStyle = C_TREE_DK;
  ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C_TREE;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C_TREE_LT;
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C_TREE_TRUNK;
  ctx.fillRect(x - 1, y - 1, 3, 3);
}
function drawHouseSprite(x, y, w, h, roof, body) {
  // Top-down house: dark outline, roof rectangle, ridge line down the middle, small chimney.
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = roof;
  ctx.fillRect(x, y, w, h);
  // Ridge along the long axis (horizontal ridge for top-down view)
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y + Math.floor(h / 2) - 1, w, 2);
  // Roof shadow strip on the lower-right (suggests sunlight from upper-left)
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + Math.floor(w * 0.55), y, Math.ceil(w * 0.45), h);
  // Small chimney
  ctx.fillStyle = '#2a2a2e';
  ctx.fillRect(x + Math.floor(w * 0.66), y + Math.floor(h * 0.18), 4, 5);
  // Body shadow on ground (subtle)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 2, y + h, w, 2);
}
function drawGrassTuft(x, y, r) {
  ctx.fillStyle = C_GRASS_LT;
  ctx.fillRect(x - r/2, y, r, 2);
  ctx.fillRect(x - r/2 + 2, y - 2, r - 4, 2);
}

function drawSceneryStrip(arr) {
  for (let i = 0; i < arr.length; i++) {
    const tile = arr[i];
    if (tile.topY > LH || tile.topY + tile.height < 0) continue;
    const side = tile.side;
    const stripMin = side === 'L' ? 0          : ROAD_RIGHT;
    const stripMax = side === 'L' ? ROAD_LEFT  : LW;

    // Grass base for the entire strip extent
    ctx.fillStyle = C_GRASS;
    ctx.fillRect(stripMin, tile.topY, stripMax - stripMin, tile.height);

    // Pavement (grey) — only on 'houses' tiles, immediately adjacent to the road
    if (tile.type === 'houses') {
      ctx.fillStyle = C_PAVEMENT;
      ctx.fillRect(tile.pavInner, tile.topY, tile.pavOuter - tile.pavInner, tile.height);
      // Inner seam highlight
      ctx.fillStyle = C_PAVEMENT_LN;
      const seamX = side === 'L' ? tile.pavInner + 1 : tile.pavOuter - 2;
      ctx.fillRect(seamX, tile.topY, 1, tile.height);
    }

    // Items (trees, tufts, houses) — positions are absolute X, Y-relative to tile.topY
    for (let j = 0; j < tile.items.length; j++) {
      const it = tile.items[j];
      const wy = tile.topY + it.y;
      if (it.kind === 'tree')      drawTreeSprite(it.x, wy, it.r);
      else if (it.kind === 'tuft') drawGrassTuft(it.x, wy, it.r);
      else if (it.kind === 'house')drawHouseSprite(it.x, wy, it.w, it.h, it.roof, it.body);
    }
  }
}
function drawScenery() {
  drawSceneryStrip(sceneryLeft);
  drawSceneryStrip(sceneryRight);
}

// ── Colors ─────────────────────────────────────────────────────
const C_ROAD       = '#2a2a2e';     // dark gray asphalt
const C_ROAD_EDGE  = '#c8c8c8';     // light-gray painted curb edges
const C_LANE_LINE  = 'rgba(255,255,255,0.35)';
const C_DIVIDER    = '#ffff00';     // --yellow — double-yellow centerline between opp/own lanes
const C_SHOULDER   = '#1a0028';
const C_GRASS      = '#0a2410';     // dark green grass
const C_GRASS_LT   = '#163518';     // slightly lighter tufts on grass
const C_PAVEMENT   = '#6a6a72';     // grey sidewalk
const C_PAVEMENT_LN= '#8c8c92';     // pavement seam highlight
const C_TREE_DK    = '#0e3010';
const C_TREE       = '#196b1c';
const C_TREE_LT    = '#2da630';
const C_TREE_TRUNK = '#221008';
const C_PLAYER     = '#ff6a00';
const C_PLAYER_LT  = '#ffa050';
const C_PLAYER_DK  = '#aa3800';
const C_ENEMY      = '#ff0044';
const C_ENEMY_LT   = '#ff6688';
const C_ENEMY_DK   = '#660020';
const C_CIV        = '#00ffff';
const C_CIV_LT     = '#88ffff';
const C_CIV_DK     = '#005566';
const C_TRUCK      = '#ffff00';
const C_TRUCK_LT   = '#ffff99';
const C_TRUCK_DK   = '#665500';
// Per-entity tint pools for non-enemy / non-fuel NPC traffic. Picked at spawn
// time. Avoids red (enemy car), green (fuel tanker), magenta (player), and the
// limo's gold so the player can still parse roles at a glance.
const CIV_PALETTES = [
  { base: '#00ffff', lt: '#88ffff', dk: '#005566' }, // cyan (original)
  { base: '#4488ff', lt: '#a8c8ff', dk: '#112266' }, // blue
  { base: '#aa66ff', lt: '#d4b0ff', dk: '#331a55' }, // purple
  { base: '#ffaa44', lt: '#ffd4a0', dk: '#552200' }, // orange
  { base: '#dddddd', lt: '#ffffff', dk: '#444444' }, // white
  { base: '#ff66cc', lt: '#ffb8e0', dk: '#552244' }, // pink
];
const TRUCK_PALETTES = [
  { base: '#ffff00', mid: '#ddaa00', dk: '#665500' }, // yellow (original)
  { base: '#4488ff', mid: '#3366cc', dk: '#112266' }, // blue
  { base: '#ffaa44', mid: '#cc7711', dk: '#552200' }, // orange
  { base: '#dddddd', mid: '#aaaaaa', dk: '#333333' }, // white
  { base: '#aa66ff', mid: '#7744cc', dk: '#331a55' }, // purple
];
const C_FUEL       = '#00ff44';
const C_FUEL_LT    = '#88ffaa';
const C_FUEL_DK    = '#004411';
const C_BULLET     = '#ffff66';
const C_SLICK      = '#222';
const C_SLICK_HL   = 'rgba(120,80,200,0.5)';

// ── Player car ─────────────────────────────────────────────────
const PLAYER_W      = 32;
const PLAYER_H      = 56;
const PLAYER_BASE_Y = LH - 100;          // fixed-camera Y
const PLAYER_STEER_SPD     = 320;        // px/s lateral movement at full press
const PLAYER_GRIP_BASE     = 1.0;        // 1 = full grip, <1 means oil slick
const FUEL_MAX             = 100;
// Speed-dependent fuel drain. Quadratic curve from MIN at WORLD_MIN_SPD up to
// MAX at WORLD_MAX_SPD — slow cruising sips fuel; flat-out burns ~4× faster.
const FUEL_DRAIN_MIN       = 0.8;        // units/sec at WORLD_MIN_SPD
const FUEL_DRAIN_MAX       = 3.5;        // units/sec at WORLD_MAX_SPD
const FUEL_REFILL_RATE     = 30.0;       // units per second while drafting a fuel tanker
const FUEL_CRITICAL        = 15;         // below this, the rescue timer arms
const FUEL_RESCUE_DELAY    = 5.0;        // sec — wait this long with no tanker on road before force-spawning

// ── World scroll (coast model) ─────────────────────────────────
// `worldSpd` is integrative: UP/DOWN accumulate speed change while held,
// otherwise the value coasts (holds its last value with no decay).  There
// is no cruise / return-to-baseline force.  Clamps apply at MIN/MAX.
const WORLD_INITIAL_SPD = 260;   // px/s — worldSpd at the start of stage 1
const WORLD_MIN_SPD     = 120;   // px/s floor — keeps the road scrolling
const WORLD_MAX_SPD     = 620;   // px/s ceiling (also engine-pitch FULL_HZ target)
const WORLD_ACCEL_RATE  = 140;   // px/s² while UP is held
const WORLD_BRAKE_RATE  = 210;   // px/s² while DOWN is held (1.5× accel — brake is punchier)

// ── Bullet pool ────────────────────────────────────────────────
const BULLET_POOL_SIZE = 40;
const BULLET_SPD       = 720;       // world-space px/s (relative to road)
const FIRE_CD          = 0.13;      // seconds between shots
const BULLET_W = 4, BULLET_H = 10;

// Per-stage ammo budget — refilled at the start of every stage. Scales with
// stage duration so each stage gives roughly 25–30 shots per minute of driving.
const STAGE_AMMO = [60, 100, 140, 180, 220];

// Enemy speed-match: how aggressively a matching red car ramps its absolute
// speed up toward the player's worldSpd while on screen (px/s²).
const ENEMY_MATCH_ACCEL = 240;

// ── Enemy harass (back-fire / oil drop) ────────────────────────
const MAX_ENEMY_BULLETS    = 12;
const ENEMY_BULLET_VY_MIN  = 220;    // px/s downward, screen-space
const ENEMY_BULLET_VY_MAX  = 400;
const ENEMY_BULLET_W       = 5;
const ENEMY_BULLET_H       = 10;
const HARASS_INITIAL_MIN   = 0.8;    // delay before first harass after spawn
const HARASS_INITIAL_MAX   = 1.8;

// ── Stage system ───────────────────────────────────────────────
const STAGE_COUNT             = 5;
// Per-stage WORLD-DISTANCE before the limo arrives. Only OVERTAKING distance
// counts — see OVERTAKE_THRESHOLD below. Tuned for a player cruising around
// 400 px/s (≈ 180 px/s of effective overtaking) to clear stage 1 in ~60 s.
const STAGE_LIMO_AT_DIST      = [11000, 13000, 17000, 20000, 23000];
// Minimum worldSpd (px/s) above which the player is considered to be
// overtaking traffic. Tuned to the average NPC speed — civilians 180–280,
// trucks 200–260, enemies 80–200 → 220 sits at the meaningful "passing
// traffic" line. Below this threshold stageDistance does NOT advance, so the
// player can no longer cheese the limo by cruising along with the flow.
const OVERTAKE_THRESHOLD      = 220;
// Per-stage delivery countdown (seconds). Initiates at the half-distance
// threshold (stageDistance >= STAGE_LIMO_AT_DIST/2). Ticks during DRIVING +
// LIMO_INCOMING; freezes on LIMO_PRESENT. Timeout => failStage.
const STAGE_TIME_S            = [45, 50, 60, 70, 80];
const LIMO_GRACE_SEC          = 30;                    // seconds to deliver once the limo arrives (hidden gate)
const TIME_BONUS_ENEMY_KILL   = 1;                     // +1s on enemy car destroyed by player bullets
const TIME_PENALTY_CIV_HIT    = 2;                     // -2s on player crashing into a civilian car
const FUEL_PENALTY_CIV_SHOT   = 15;                    // -15 fuel units when the player shoots a civilian (in addition to the -30 score)
const TIME_WARN_S             = 15;                    // .warn HUD class below this
const TIME_DANGER_S           = 5;                     // .danger HUD class below this
const TIME_HEARTBEAT_S        = 10;                    // heartbeat pulse starts at or below this
const DELIVERY_HOLD_SEC       = 2.0;                   // seconds in zone + speed-match to complete delivery
// Per-stage tolerance window on |worldSpd - limoSpd| — tightens each stage so
// the player must hold a more precise throttle to match the limo's speed.
const DELIVERY_SPEED_TOL_BY_STAGE = [40, 35, 30, 25, 20];   // px/s tolerance
// Per-stage limo absolute speed (world frame).  Player must drive at this
// worldSpd to stay alongside.  Late stages demand faster cruising.
const LIMO_SPEED_BY_STAGE = [320, 340, 360, 380, 400];      // px/s absolute
// Sinusoidal jitter applied to the limo's speed during LIMO_PRESENT so the
// player must actively micro-adjust throttle to stay in the window.
const LIMO_JITTER_AMP      = 0.10;   // ±10% of the per-stage limo speed
const LIMO_JITTER_PERIOD_S = 2.0;    // seconds per full oscillation
const LIMO_INCOMING_BANNER_S  = 2.0;                   // duration of "LIMO INCOMING" before spawn
const DELIVERED_PAUSE_S       = 1.5;                   // "STAGE n COMPLETE" celebration pause
const STAGE_START_BANNER_S    = 1.5;                   // "STAGE n" intro banner at the start of every stage
const HURRY_UP_BANNER_S       = 1.5;                   // "HURRY UP!" pop-up when the delivery countdown initiates
const STAGE_INTERSTITIAL_S    = 2.0;                   // brief blank pause before next stage starts
const STAGE_FAILED_S          = 1.5;                   // "STAGE FAILED" banner before restart
const LIMO_W                  = 38;
const LIMO_H                  = 144;

// Per-stage difficulty table.  Index 0 = stage 1, index 4 = stage 5.
const STAGE_TRAFFIC_INTERVAL  = [1.20, 1.05, 0.90, 0.75, 0.60];
// Opposite-direction traffic is sparser than own-direction. Multiplier of
// 0.30 at stage 1 means opp spawns at ~30% of own's rate (longer interval).
const STAGE_OPP_RATE_MULT     = [0.30, 0.40, 0.50, 0.60, 0.70];
const STAGE_SPAWN_WEIGHTS     = [
  { enemy: 0.35, civ: 0.45, truck: 0.20 },
  { enemy: 0.42, civ: 0.40, truck: 0.18 },
  { enemy: 0.50, civ: 0.34, truck: 0.16 },
  { enemy: 0.58, civ: 0.28, truck: 0.14 },
  { enemy: 0.65, civ: 0.23, truck: 0.12 },
];
// Base seed for the fuel-tanker spawn timer per stage. Denser tankers in late
// stages because cumulative drain pressure grows with stage length.
const STAGE_FUEL_TIMER_BASE = [14, 12, 10, 8, 7];
const STAGE_HARASS_CD = [
  { min: 1.6, max: 3.2 },
  { min: 1.4, max: 2.8 },
  { min: 1.2, max: 2.4 },
  { min: 1.0, max: 2.0 },
  { min: 0.8, max: 1.6 },
];
const STAGE_LIMO_LANE_CD = [
  { min: 5.0, max: 7.0 },
  { min: 4.0, max: 6.0 },
  { min: 3.0, max: 5.0 },
  { min: 2.0, max: 4.0 },
  { min: 1.2, max: 2.4 },
];

// ── Game state ─────────────────────────────────────────────────
let gameState  = 'start';
let score      = 0;
let hiScore    = parseInt(localStorage.getItem('hh_hi') || '0', 10);
let lives      = 3;
let kills      = 0;
let fuel       = FUEL_MAX;

// ── Stage / delivery state ─────────────────────────────────────
let stageIndex             = 0;        // 0..STAGE_COUNT-1
let stageTimer             = 0;        // visible TIME countdown. Ticks during DRIVING + LIMO_INCOMING; FROZEN when stagePhase becomes LIMO_PRESENT. Hitting 0 during DRIVING/LIMO_INCOMING => failStage('TIME UP'). Also drives the delivery time bonus (frozen value at limo arrival).
let stageDistance          = 0;        // world-distance (px) covered since stage start, ∫ worldSpd dt during DRIVING + LIMO_INCOMING. Drives the half-distance timer activation and the limo arrival trigger.
let timerActive            = false;    // false until stageDistance crosses half of STAGE_LIMO_AT_DIST — before then the visible TIME panel shows '--:--' and stageTimer does not tick.
let stagePhase             = 'DRIVING';// 'DRIVING' | 'LIMO_INCOMING' | 'LIMO_PRESENT' | 'DELIVERED' | 'STAGE_INTERSTITIAL' | 'STAGE_FAILED'
let limoEnt                = null;     // points into the traffic[] pool while the limo is alive
let limoBannerTimer        = 0;
let limoGraceTimer         = 0;        // counts down during LIMO_PRESENT
let parcelState            = 'HOLDING';// 'HOLDING' | 'DELIVERED' (HUD indicator)
let deliveryHoldTimer      = 0;        // accumulates while both geomOK and speedOK
let stageFailedTimer       = 0;        // counts down banner duration
let stageFailedReason      = '';       // surface to banner subtext
let stageDeliveredTimer    = 0;        // counts down delivery celebration
let stageInterstitialTimer = 0;        // pause between stages
let stageStartBannerTimer  = 0;        // counts down the "STAGE n" intro banner at stage start
let hurryUpBannerTimer     = 0;        // counts down the "HURRY UP!" pop-up shown when the delivery countdown activates
let stageDeliveredBonus    = 0;        // captured for banner display
let stageDeliveredTimeBonus = 0;       // captured for banner display
let stageStartScore        = 0;        // score snapshot at the start of the current stage — restored on STAGE_FAILED restart
let stageStartKills        = 0;        // kills snapshot at the start of the current stage — restored on STAGE_FAILED restart
let stageStartLives        = 3;        // lives snapshot at the start of the current stage — restored on STAGE_FAILED restart (prevents free-refill exploit)

// ── Cached HUD strings (avoid per-frame writes) ────────────────
let _lastScoreStr   = '';
let _lastHiStr      = '';
let _lastStageStr   = '';
let _lastLivesStr   = '';
let _lastKillStr    = '';
let _lastAmmoStr    = '';
let _lastAmmoCls    = '';
let _lastTimeStr    = '';
let _lastTimeCls    = '';
let _lastFuelPct    = -1;
let _lastFuelCls    = '';
let _lastParcelCls  = '';
let _lastStageBarPct = -1;

// ── Input ──────────────────────────────────────────────────────
const keys = Object.create(null);
let fireCooldown = 0;
let ammo         = 0;
let emptyClickCd = 0;   // throttles the out-of-ammo click sound

// ── World state ────────────────────────────────────────────────
let worldSpd       = WORLD_INITIAL_SPD;  // current scroll speed px/s (coast model — integrative)
let stripeOffset   = 0;                  // for animated dashed center lines
let edgeOffset     = 0;                  // for animated edge stipple
let limoJitterT    = 0;                  // seconds accumulator for limo speed jitter sinewave
let stealingFuel   = false;               // true while the player is drafting a green tanker's rear bumper
let refuelHoseTanker = null;              // the tanker currently being refueled from (for the hose visual)
let parcelHandshakeLimo = null;           // the limo the player is currently alongside (for the side-link visual)
let parcelHandshakeSide = 0;              // -1 = limo on player's left, +1 = limo on player's right
let parcelHandshakeActive = false;        // true when both geometry and speed are matched (delivery in progress)
let playerX        = (ROAD_LEFT + ROAD_RIGHT) / 2;
let playerVx       = 0;                  // smoothed lateral velocity (for slick momentum)
let grip           = PLAYER_GRIP_BASE;
let slickTimer     = 0;                  // seconds remaining of degraded grip
let invulnTimer    = 0;                  // seconds of invulnerability after hit
let crashTimer     = 0;                  // seconds remaining of crash animation
let lowFuelBeepAcc = 0;

// ── Entity pools (pre-allocated, hot path) ─────────────────────
//   Each entity: {alive, kind, x, y, vx, vy, w, h, hp, lane, ...}
const MAX_TRAFFIC = 24;
const MAX_SLICKS  = 12;
const MAX_EXPLO   = 24;

const traffic       = new Array(MAX_TRAFFIC);
const slicks        = new Array(MAX_SLICKS);
const explosions    = new Array(MAX_EXPLO);
const bullets       = new Array(BULLET_POOL_SIZE);
const enemyBullets  = new Array(MAX_ENEMY_BULLETS);

for (let i = 0; i < MAX_TRAFFIC; i++) traffic[i]    = { alive: false };
for (let i = 0; i < MAX_SLICKS;  i++) slicks[i]     = { alive: false };
for (let i = 0; i < MAX_EXPLO;   i++) explosions[i] = { alive: false };
for (let i = 0; i < BULLET_POOL_SIZE;    i++) bullets[i]      = { alive: false };
for (let i = 0; i < MAX_ENEMY_BULLETS;   i++) enemyBullets[i] = { alive: false };

function spawnFromPool(pool) {
  for (let i = 0; i < pool.length; i++) if (!pool[i].alive) return pool[i];
  return null;
}

// ── Spawn timers ───────────────────────────────────────────────
let trafficTimer        = 1.2;
let oppTrafficTimer     = 4.0;       // opposite-direction (head-on) spawn timer
let slickTimerSpawn     = 8.0;
let fuelTimer           = 12.0;
let criticalRescueTimer = 0;         // counts up while fuel < FUEL_CRITICAL and no tanker is on road

// ── DOM refs ───────────────────────────────────────────────────
const scoreEl     = document.getElementById('score-display');
const hiEl        = document.getElementById('hi-display');
const stageEl     = document.getElementById('stage-display');
const killEl      = document.getElementById('kill-display');
const ammoEl      = document.getElementById('ammo-display');
const timeEl      = document.getElementById('time-display');
const livesEl     = document.getElementById('lives-display');
const fuelEl      = document.getElementById('fuel-fill');
const parcelEl    = document.getElementById('parcel-indicator');
const stageBarEl  = document.getElementById('stage-progress-fill');
const victoryScoreEl  = document.getElementById('victory-score');
const gameoverScoreEl = document.getElementById('gameover-score');

function updateHUD() {
  const sStr = String(score);
  if (sStr !== _lastScoreStr) { scoreEl.textContent = sStr; _lastScoreStr = sStr; }
  const hStr = String(hiScore);
  if (hStr !== _lastHiStr)    { hiEl.textContent    = hStr; _lastHiStr    = hStr; }
  const stStr = String(stageIndex + 1);
  if (stStr !== _lastStageStr) { stageEl.textContent = stStr; _lastStageStr = stStr; }
  const kStr = String(kills);
  if (kStr !== _lastKillStr)  { killEl.textContent  = kStr; _lastKillStr  = kStr; }
  const aStr = String(ammo);
  if (aStr !== _lastAmmoStr)  { ammoEl.textContent  = aStr; _lastAmmoStr  = aStr; }
  let aCls = '';
  if      (ammo === 0)  aCls = 'danger';
  else if (ammo <= 15)  aCls = 'warn';
  if (aCls !== _lastAmmoCls) {
    ammoEl.classList.remove('warn', 'danger');
    if (aCls) ammoEl.classList.add(aCls);
    _lastAmmoCls = aCls;
  }
  const lStr = String(lives);
  if (lStr !== _lastLivesStr) { livesEl.textContent = lStr; _lastLivesStr = lStr; }

  // TIME panel — shows '--:--' until the timer initiates at the half-distance
  // threshold, then a live MM:SS countdown that ticks during DRIVING and
  // LIMO_INCOMING and freezes when stagePhase becomes LIMO_PRESENT.
  let tStr, tCls;
  if (!timerActive) {
    tStr = '--:--';
    tCls = '';
  } else {
    const tSec = Math.max(0, Math.ceil(stageTimer));
    tStr = String(Math.floor(tSec / 60)).padStart(2, '0') + ':' +
           String(tSec % 60).padStart(2, '0');
    if      (tSec <= TIME_DANGER_S) tCls = 'danger';
    else if (tSec <= TIME_WARN_S)   tCls = 'warn';
    else                            tCls = '';
  }
  if (tStr !== _lastTimeStr) { timeEl.textContent = tStr; _lastTimeStr = tStr; }
  if (tCls !== _lastTimeCls) {
    timeEl.classList.remove('warn', 'danger');
    if (tCls) timeEl.classList.add(tCls);
    _lastTimeCls = tCls;
  }

  const pct = Math.max(0, Math.min(100, Math.round((fuel / FUEL_MAX) * 100)));
  if (pct !== _lastFuelPct) {
    fuelEl.style.width = pct + '%';
    _lastFuelPct = pct;
  }
  let cls = '';
  if      (pct <= 15) cls = 'danger';
  else if (pct <= 35) cls = 'warn';
  if (cls !== _lastFuelCls) {
    fuelEl.classList.remove('warn', 'danger');
    if (cls) fuelEl.classList.add(cls);
    _lastFuelCls = cls;
  }

  // Parcel indicator class
  const parcelCls = parcelState === 'DELIVERED' ? 'parcel-delivered' : 'parcel-holding';
  if (parcelCls !== _lastParcelCls) {
    parcelEl.classList.remove('parcel-holding', 'parcel-delivered');
    parcelEl.classList.add(parcelCls);
    _lastParcelCls = parcelCls;
  }

  // Stage progress bar — distance toward the limo (stageDistance → STAGE_LIMO_AT_DIST).
  let barPct;
  if (stagePhase === 'DRIVING') {
    const limoAt = STAGE_LIMO_AT_DIST[stageIndex] ?? STAGE_LIMO_AT_DIST[STAGE_LIMO_AT_DIST.length - 1];
    barPct = Math.max(0, Math.min(100, Math.round((stageDistance / limoAt) * 100)));
  } else {
    barPct = 100;
  }
  if (barPct !== _lastStageBarPct) {
    stageBarEl.style.width = barPct + '%';
    _lastStageBarPct = barPct;
  }
}

// ── Canvas resize (fit-to-window, preserve aspect) ─────────────
function resizeCanvas() {
  const isMobile = navigator.maxTouchPoints > 0;
  const sideW = isMobile ? 90  : 140;
  const topH  = isMobile ? 56  : 110;
  const maxW  = Math.min(window.innerWidth  - sideW * 2, 1080);
  const maxH  = Math.max(220, window.innerHeight - topH);
  const s     = Math.min(maxW / LW, maxH / LH);
  canvas.style.width  = Math.floor(LW * s) + 'px';
  canvas.style.height = Math.floor(LH * s) + 'px';
  canvas.width  = LW;
  canvas.height = LH;
}

// ── Overlays ───────────────────────────────────────────────────
const OVERLAY_IDS = ['overlay-start', 'overlay-pause', 'overlay-victory', 'overlay-gameover'];
function showOverlay(id) {
  OVERLAY_IDS.forEach(oid =>
    document.getElementById(oid).classList.toggle('hidden', oid !== id));
}
function hideOverlays() {
  OVERLAY_IDS.forEach(oid =>
    document.getElementById(oid).classList.add('hidden'));
}

// ── SFX (game-local; common.js SFX list recommended for shared SFX) ──
function _ac()  { return NeonArcade.getAudioCtx(); }
function _bus() { return NeonArcade.getMasterBus(); }

function sfxShoot() {
  try {
    const ac = _ac(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(_bus());
    o.type = 'square';
    o.frequency.setValueAtTime(820, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.06);
    g.gain.setValueAtTime(0.10, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
    o.start(); o.stop(ac.currentTime + 0.08);
  } catch (_) {}
}

function sfxEmptyClick() {
  try {
    const ac = _ac(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(_bus());
    o.type = 'square';
    o.frequency.setValueAtTime(140, ac.currentTime);
    g.gain.setValueAtTime(0.05, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04);
    o.start(); o.stop(ac.currentTime + 0.05);
  } catch (_) {}
}

function sfxExplode(big) {
  try {
    const ac = _ac();
    const dur = big ? 0.42 : 0.22;
    const n   = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = big ? 500 : 1100;
    src.connect(f); f.connect(g); g.connect(_bus());
    g.gain.setValueAtTime(big ? 0.40 : 0.22, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.start(); src.stop(ac.currentTime + dur + 0.01);
  } catch (_) {}
}

function sfxSkid() {
  try {
    const ac = _ac();
    const n  = Math.floor(ac.sampleRate * 0.35);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 0.6) * 0.5;
    const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 4;
    src.connect(f); f.connect(g); g.connect(_bus());
    g.gain.setValueAtTime(0.18, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
    src.start(); src.stop(ac.currentTime + 0.36);
  } catch (_) {}
}

function sfxPickup() {
  try {
    const ac = _ac();
    [523, 784, 1047].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(_bus());
      o.type = 'square'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.06;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
      o.start(t); o.stop(t + 0.11);
    });
  } catch (_) {}
}

function sfxLowFuelBeep() {
  try {
    const ac = _ac(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(_bus());
    o.type = 'square'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.10);
    o.start(); o.stop(ac.currentTime + 0.11);
  } catch (_) {}
}

function sfxCrash() {
  try {
    const ac = _ac();
    sfxExplode(true);
    [330, 220, 130].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(_bus());
      o.type = 'sawtooth'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
      o.start(t); o.stop(t + 0.21);
    });
  } catch (_) {}
}

function sfxDelivery() {
  // Bright major-key C5–E5–G5 arpeggio. Distinct from sfxPickup's C-G-C.
  try {
    const ac = _ac();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(_bus());
      o.type = 'square'; o.frequency.value = f;
      const t = ac.currentTime + i * 0.06;
      g.gain.setValueAtTime(0.20, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.start(t); o.stop(t + 0.07);
    });
  } catch (_) {}
}

// Countdown audio cues — heartbeat pulse and panic per-second beep. Active
// only while the visible TIME clock is ticking (DRIVING / LIMO_INCOMING) and
// the game is in 'playing' state. Stopped on phase change, pause, fail,
// delivery, or game over by calling stopCountdownSfx().
function sfxHeartbeat(strong) {
  // Two short low thumps ("lub-dub"). `strong` makes them louder & lower for
  // the sub-5s panic phase.
  try {
    const ac = _ac();
    const t0 = ac.currentTime;
    const baseHz = strong ? 70 : 90;
    const gainPk = strong ? 0.22 : 0.14;
    const beats  = [0.00, 0.10];
    beats.forEach((off, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(_bus());
      o.type = 'sine';
      const tb = t0 + off;
      o.frequency.setValueAtTime(baseHz, tb);
      o.frequency.exponentialRampToValueAtTime(baseHz * 0.6, tb + 0.08);
      g.gain.setValueAtTime(0.0, tb);
      g.gain.linearRampToValueAtTime(gainPk * (i === 0 ? 1.0 : 0.75), tb + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, tb + 0.09);
      o.start(tb); o.stop(tb + 0.10);
    });
  } catch (_) {}
}

// "Countdown armed" klaxon — short alternating high/low pulses (wee-oo-wee-oo)
// followed by a held resolving tone. Played once at the half-distance threshold.
// Designed to sound nothing like the heartbeat / panic-beep / limo horn.
function sfxTimerStart() {
  try {
    const ac = _ac();
    const t0 = ac.currentTime;
    // Four alternating square pulses
    const pulses = [
      { f:  980, off: 0.00, dur: 0.07 },
      { f:  620, off: 0.08, dur: 0.07 },
      { f:  980, off: 0.16, dur: 0.07 },
      { f:  620, off: 0.24, dur: 0.07 },
    ];
    pulses.forEach(p => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(_bus());
      o.type = 'square';
      o.frequency.value = p.f;
      const tb = t0 + p.off;
      g.gain.setValueAtTime(0.0, tb);
      g.gain.linearRampToValueAtTime(0.20, tb + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, tb + p.dur);
      o.start(tb); o.stop(tb + p.dur + 0.01);
    });
    // Resolving sawtooth thud that drops in pitch
    {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(_bus());
      o.type = 'sawtooth';
      const tr = t0 + 0.34;
      o.frequency.setValueAtTime(440, tr);
      o.frequency.exponentialRampToValueAtTime(180, tr + 0.22);
      g.gain.setValueAtTime(0.0, tr);
      g.gain.linearRampToValueAtTime(0.24, tr + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, tr + 0.24);
      o.start(tr); o.stop(tr + 0.26);
    }
  } catch (_) {}
}

function sfxPanicBeep() {
  // Sharp short square-wave beep at ~1500 Hz — one per integer second under 5s.
  try {
    const ac = _ac(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(_bus());
    o.type = 'square';
    o.frequency.setValueAtTime(1500, ac.currentTime);
    g.gain.setValueAtTime(0.0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    o.start(); o.stop(ac.currentTime + 0.09);
  } catch (_) {}
}

// Heartbeat tempo / panic-beep edge tracker. Heartbeat fires every
// `heartbeatPeriod` seconds while stageTimer <= TIME_HEARTBEAT_S; the period
// halves once stageTimer drops to TIME_DANGER_S. Panic beep fires once per
// integer-second boundary crossed by stageTimer once <= TIME_DANGER_S.
let heartbeatAcc = 0;        // seconds since last heartbeat
let countdownLastIntSec = -1;// last whole-second value of stageTimer we beeped at

function updateCountdownSfx(dt) {
  if (gameState !== 'playing') return;
  // Heartbeat
  if (stageTimer <= TIME_HEARTBEAT_S && stageTimer > 0) {
    heartbeatAcc += dt;
    // 1.0s period normally; 0.5s period at danger threshold (sub-5s).
    const period = (stageTimer <= TIME_DANGER_S) ? 0.5 : 1.0;
    if (heartbeatAcc >= period) {
      heartbeatAcc = 0;
      sfxHeartbeat(stageTimer <= TIME_DANGER_S);
    }
  } else {
    heartbeatAcc = 0;
  }
  // Panic beep on each integer-second crossing under TIME_DANGER_S.
  if (stageTimer <= TIME_DANGER_S && stageTimer > 0) {
    const curInt = Math.ceil(stageTimer);
    if (countdownLastIntSec === -1) {
      // Initialize without firing — wait for an actual edge crossing.
      countdownLastIntSec = curInt;
    } else if (curInt < countdownLastIntSec) {
      countdownLastIntSec = curInt;
      sfxPanicBeep();
    }
  } else {
    countdownLastIntSec = -1;
  }
}

// Silence the countdown audio cues + reset their state. Called on phase
// transition to LIMO_PRESENT (timer freezes), on stage fail / delivery, on
// pause, and on game-over.
function stopCountdownSfx() {
  heartbeatAcc = 0;
  countdownLastIntSec = -1;
}

function sfxLimoHorn() {
  // Low square-wave honk ~120 Hz, 0.4 s with a slow upward then back wobble.
  try {
    const ac = _ac(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(_bus());
    o.type = 'square';
    const t0 = ac.currentTime;
    o.frequency.setValueAtTime(120, t0);
    o.frequency.linearRampToValueAtTime(150, t0 + 0.20);
    o.frequency.linearRampToValueAtTime(120, t0 + 0.40);
    g.gain.setValueAtTime(0.0, t0);
    g.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
    g.gain.setValueAtTime(0.22, t0 + 0.36);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
    o.start(t0); o.stop(t0 + 0.44);
  } catch (_) {}
}

// ── Engine SFX (sustained, speed-pitched drone) ───────────────
// Two-oscillator drone: triangle fundamental + square one-octave-up overtone.
// Pitch tracks worldSpd linearly: IDLE_HZ at scroll speed ≤ SPD_LO,
// FULL_HZ at scroll speed ≥ SPD_HI. Gain states:
//   'off'    → nodes do not exist
//   'idle'   → gain = ENGINE_GAIN_IDLE  (cutscene / sitting still)
//   'drive'  → gain = ENGINE_GAIN_DRIVE (normal play, pitch follows worldSpd)
//
// Public surface:
//   engineStart()          — create nodes, begin at idle pitch
//   engineStop()           — fade out and destroy nodes
//   engineSetState(state)  — 'drive' | 'idle' (no-op if engine is off)
//   engineUpdate(spd)      — called every update() tick with current worldSpd
// ──────────────────────────────────────────────────────────────
const ENGINE_IDLE_HZ    = 60;
const ENGINE_FULL_HZ    = 180;
const ENGINE_SPD_LO     = 120;   // worldSpd at which pitch = IDLE_HZ
const ENGINE_SPD_HI     = 620;   // worldSpd at which pitch = FULL_HZ  (= WORLD_MAX_SPD)
const ENGINE_GAIN_DRIVE = 0.045; // full driving volume
const ENGINE_GAIN_IDLE  = 0.018; // cutscene "sitting still" volume
const ENGINE_RAMP_TC    = 0.05;  // setTargetAtTime time-constant for pitch glide (seconds)
const ENGINE_FADE_OUT_S = 0.18;  // fade-out duration on engineStop()
const ENGINE_LP_HZ      = 500;   // lowpass cutoff — kills harsh upper harmonics

let _engOsc1   = null;   // triangle fundamental
let _engOsc2   = null;   // sine octave-up (smooth body, no harmonics)
let _engGain   = null;   // shared gain node
let _engLP     = null;   // lowpass filter between gain and master bus
let _engState  = 'off';  // 'off' | 'idle' | 'drive'

function _engFreqFromSpd(spd) {
  const t = Math.max(0, Math.min(1,
    (spd - ENGINE_SPD_LO) / (ENGINE_SPD_HI - ENGINE_SPD_LO)));
  return ENGINE_IDLE_HZ + t * (ENGINE_FULL_HZ - ENGINE_IDLE_HZ);
}

function engineStart() {
  if (_engState !== 'off') return;          // already running
  try {
    const ac   = _ac();
    const now  = ac.currentTime;
    const freq = ENGINE_IDLE_HZ;

    _engLP = ac.createBiquadFilter();
    _engLP.type = 'lowpass';
    _engLP.frequency.value = ENGINE_LP_HZ;
    _engLP.Q.value = 0.7;
    _engLP.connect(_bus());

    _engGain = ac.createGain();
    _engGain.connect(_engLP);
    _engGain.gain.setValueAtTime(0.0001, now);
    _engGain.gain.linearRampToValueAtTime(ENGINE_GAIN_IDLE, now + 0.12);

    _engOsc1 = ac.createOscillator();
    _engOsc1.type = 'triangle';
    _engOsc1.frequency.setValueAtTime(freq, now);
    _engOsc1.connect(_engGain);
    _engOsc1.start(now);

    _engOsc2 = ac.createOscillator();
    _engOsc2.type = 'sine';
    _engOsc2.frequency.setValueAtTime(freq * 2, now);
    _engOsc2.connect(_engGain);
    _engOsc2.start(now);

    _engState = 'idle';
  } catch (_) {}
}

function engineStop() {
  if (_engState === 'off') return;
  _engState = 'off';
  try {
    const ac  = _ac();
    const now = ac.currentTime;
    const end = now + ENGINE_FADE_OUT_S;
    _engGain.gain.cancelScheduledValues(now);
    _engGain.gain.setValueAtTime(_engGain.gain.value, now);
    _engGain.gain.exponentialRampToValueAtTime(0.0001, end);
    const osc1 = _engOsc1, osc2 = _engOsc2, gain = _engGain, lp = _engLP;
    osc1.stop(end + 0.01);
    osc2.stop(end + 0.01);
    // Null out references immediately so re-entrant calls don't double-stop.
    _engOsc1 = null; _engOsc2 = null; _engGain = null; _engLP = null;
    // Disconnect after the oscillators finish so GC can collect the nodes.
    setTimeout(() => { try { osc1.disconnect(); osc2.disconnect(); gain.disconnect(); lp.disconnect(); } catch (_) {} },
               (ENGINE_FADE_OUT_S + 0.05) * 1000);
  } catch (_) {}
}

function engineSetState(state) {
  // state: 'drive' | 'idle'
  if (_engState === 'off' || state === _engState) return;
  _engState = state;
  try {
    const ac  = _ac();
    const now = ac.currentTime;
    const targetGain = state === 'drive' ? ENGINE_GAIN_DRIVE : ENGINE_GAIN_IDLE;
    _engGain.gain.cancelScheduledValues(now);
    _engGain.gain.setValueAtTime(_engGain.gain.value, now);
    _engGain.gain.linearRampToValueAtTime(targetGain, now + 0.10);
  } catch (_) {}
}

function engineUpdate(spd) {
  if (_engState === 'off' || !_engOsc1) return;
  try {
    const ac   = _ac();
    const now  = ac.currentTime;
    const freq = _engFreqFromSpd(spd);
    _engOsc1.frequency.setTargetAtTime(freq,     now, ENGINE_RAMP_TC);
    _engOsc2.frequency.setTargetAtTime(freq * 2, now, ENGINE_RAMP_TC);
  } catch (_) {}
}

// ── Spawning ───────────────────────────────────────────────────
// Minimum CENTER-to-center fallback gap when an entity reference is not
// available (e.g. a candidate hasn't been sized yet). Real spacing for any
// known pair is computed dynamically as half(a) + half(b) + MIN_PAIR_GAP so
// trucks naturally demand more clearance than cars.
const MIN_FOLLOW_GAP = 80;
// Minimum nose-to-tail clearance between two same-lane same-direction cars,
// added on top of their combined half-heights. Prevents bumper-to-bumper
// rear-ending and trucks overlapping during lane changes.
const MIN_PAIR_GAP   = 26;

// Effective minimum CENTER-to-center distance between two entities so their
// sprites have at least MIN_PAIR_GAP nose-to-tail clearance.
function pairClearance(a, b) {
  return a.h / 2 + b.h / 2 + MIN_PAIR_GAP;
}

// True if no live traffic in `lane` lies within ±gap of atY (excluding `excludeEnt`).
// If `excludeEnt` has a `.dir`, only same-direction entities count toward the
// occupancy check — opposite-direction entities use disjoint lane ranges per
// segment but transient overlaps can occur during taper migration, and we
// don't want spawn refusal or AI lane-change refusal to fire across directions.
// The effective gap is max(`gap`, dynamic-pair-clearance) so trucks always get
// the room their sprite needs even when callers pass a small literal.
function isLaneClearNear(lane, atY, gap, excludeEnt) {
  const dir = excludeEnt && excludeEnt.dir;
  for (let i = 0; i < MAX_TRAFFIC; i++) {
    const o = traffic[i];
    if (o === excludeEnt || !o.alive) continue;
    if (o.lane !== lane) continue;
    if (dir && o.dir && o.dir !== dir) continue;
    const need = excludeEnt && excludeEnt.h ? Math.max(gap, pairClearance(o, excludeEnt)) : gap;
    if (Math.abs(o.y - atY) < need) return false;
  }
  return true;
}

// Nearest same-lane, same-direction car ahead of `t` on the road.
// "Ahead" semantics differ by direction: for own (moving up in world frame)
// the leader has higher y (closer to player); for opp (moving down in world
// frame relative to scroll plus their own forward) the leader has lower y.
function findNearestAhead(t) {
  let best = null;
  for (let i = 0; i < MAX_TRAFFIC; i++) {
    const o = traffic[i];
    if (o === t || !o.alive) continue;
    if (o.lane !== t.lane) continue;
    if (o.dir !== t.dir) continue;
    if (t.dir === 'opp') {
      // Opp cars travel "downward" in world view (effDown > worldSpd), so the
      // leader is the one farther down — but rear-ending semantics are about
      // who's closing on whom. In our setup all opp cars share +effDown velocity,
      // so the leader (lower y stays lower) is the one with smaller y.
      if (o.y >= t.y) continue;
      if (!best || o.y > best.y) best = o;
    } else {
      if (o.y <= t.y) continue;
      if (!best || o.y < best.y) best = o;
    }
  }
  return best;
}

function spawnTraffic() {
  const ent = spawnFromPool(traffic);
  if (!ent) return;
  // Per-stage weighted kind pick.
  const w = STAGE_SPAWN_WEIGHTS[stageIndex];
  const r = Math.random();
  let kind;
  if      (r < w.enemy)              kind = 'enemy';
  else if (r < w.enemy + w.civ)      kind = 'civ';
  else                               kind = 'truck';

  // Own-direction spawn: pick a lane within the own-lane range at -80.
  const d        = dividerXAtY(-80);
  const lanesUp  = activeLanesAt(-80);
  const firstOwn = lanesUp - d.ownLaneCount;
  const lane     = firstOwn + Math.floor(Math.random() * d.ownLaneCount);
  const cx       = laneCenterX(lane, -80);

  // Absolute world-frame speed (px/s).  Independent of the player's worldSpd —
  // NPCs keep their own pace if the player slows down or accelerates.
  let absSpd;
  if      (kind === 'enemy') absSpd =  80 + Math.random() * 120;   //  80–200
  else if (kind === 'civ')   absSpd = 180 + Math.random() * 100;   // 180–280
  else                       absSpd = 200 + Math.random() *  60;   // 200–260 trucks slowest

  ent.alive  = true;
  ent.kind   = kind;
  ent.dir    = 'own';
  ent.x      = cx;
  ent.y      = -80;
  ent.w      = kind === 'truck' ? 42 : 32;
  ent.h      = kind === 'truck' ? 96 : 56;
  ent.lane   = lane;
  ent.hp     = kind === 'truck' ? 99 : (kind === 'enemy' ? 1 : 1);
  ent.speed  = absSpd;             // absolute px/s in the world frame
  ent.lateralVx = 0;
  ent.aiTimer = 0.4 + Math.random() * 1.0;
  // Enemy rammer: 30% of enemy cars will accelerate to ram
  ent.isRammer = kind === 'enemy' && Math.random() < 0.30;
  // Enemy speed-match: ~45% of enemies will accelerate up toward the player's
  // current worldSpd while on screen, letting them keep pace long enough to
  // shoot, drop oil, or close in for a ram. Random subset for variety.
  ent.matchSpeed = kind === 'enemy' && Math.random() < 0.45;
  // Enemy harass: non-rammer enemies either back-fire projectiles or drop oil
  // when the player is behind them on the road.
  if (kind === 'enemy' && !ent.isRammer) {
    ent.harassMode = Math.random() < 0.5 ? 'shoot' : 'oil';
    ent.harassTimer = HARASS_INITIAL_MIN + Math.random() * (HARASS_INITIAL_MAX - HARASS_INITIAL_MIN);
  } else {
    ent.harassMode = 'none';
    ent.harassTimer = 0;
  }
  ent.deliveryGlow = 0;
  // Random per-spawn tint for civilians and trucks (enemy / fuel / limo keep
  // their fixed roles-as-colors).
  ent.tint = null; ent.tintLt = null; ent.tintMid = null; ent.tintDk = null;
  if (kind === 'civ') {
    const p = CIV_PALETTES[Math.floor(Math.random() * CIV_PALETTES.length)];
    ent.tint = p.base; ent.tintLt = p.lt; ent.tintDk = p.dk;
  } else if (kind === 'truck') {
    const p = TRUCK_PALETTES[Math.floor(Math.random() * TRUCK_PALETTES.length)];
    ent.tint = p.base; ent.tintMid = p.mid; ent.tintDk = p.dk;
  }

  // Refuse to spawn if the lane is already occupied near the spawn point.
  if (!isLaneClearNear(lane, ent.y, 140, ent)) {
    ent.alive = false;
    return;
  }
}

// Spawn an opposite-direction traffic entity (head-on). Only civilians and
// trucks spawn this way — enemies and limos are always own-direction.
function spawnOppTraffic() {
  const ent = spawnFromPool(traffic);
  if (!ent) return;
  // 70/30 civ/truck mix for opp traffic — head-on trucks should be rarer
  // (they're bigger and more dangerous).
  const kind = Math.random() < 0.70 ? 'civ' : 'truck';

  // Opp-direction spawn: pick a lane within the opposite-lane range at -80.
  const d = dividerXAtY(-80);
  if (d.oppLaneCount <= 0) { ent.alive = false; return; }   // no opp lanes available
  const lane = Math.floor(Math.random() * d.oppLaneCount);  // 0..oppLaneCount-1
  const cx   = laneCenterX(lane, -80);

  // Opposite-direction absolute speed (px/s).  Adds to player's worldSpd as
  // the head-on closing rate, but doesn't scale with player throttle.
  const absSpd = 160 + Math.random() * 80;   // 160–240

  ent.alive  = true;
  ent.kind   = kind;
  ent.dir    = 'opp';
  ent.x      = cx;
  ent.y      = -80;
  ent.w      = kind === 'truck' ? 42 : 32;
  ent.h      = kind === 'truck' ? 96 : 56;
  ent.lane   = lane;
  ent.hp     = kind === 'truck' ? 99 : 1;
  ent.speed  = absSpd;
  ent.lateralVx = 0;
  ent.aiTimer = 0.4 + Math.random() * 1.0;
  ent.isRammer = false;
  ent.matchSpeed = false;
  ent.harassMode = 'none';
  ent.harassTimer = 0;
  ent.deliveryGlow = 0;
  // Random per-spawn tint (opp traffic is only 'civ' or 'truck').
  ent.tint = null; ent.tintLt = null; ent.tintMid = null; ent.tintDk = null;
  if (kind === 'civ') {
    const p = CIV_PALETTES[Math.floor(Math.random() * CIV_PALETTES.length)];
    ent.tint = p.base; ent.tintLt = p.lt; ent.tintDk = p.dk;
  } else if (kind === 'truck') {
    const p = TRUCK_PALETTES[Math.floor(Math.random() * TRUCK_PALETTES.length)];
    ent.tint = p.base; ent.tintMid = p.mid; ent.tintDk = p.dk;
  }

  // Refuse to spawn if the lane is already occupied near the spawn point.
  if (!isLaneClearNear(lane, ent.y, 140, ent)) {
    ent.alive = false;
  }
}

// Spawn the VIP limo at the top of the road. Picks an own-direction lane with
// the most breathing room so it can settle in instead of spawning on top of traffic.
function spawnLimo() {
  const ent = spawnFromPool(traffic);
  if (!ent) return null;
  const lanesUp = activeLanesAt(-160);
  // Limo always spawns in own-direction lanes — player can't be expected to
  // chase a head-on VIP into oncoming traffic.
  const dUp = dividerXAtY(-160);
  const firstOwn = lanesUp - dUp.ownLaneCount;
  // Pick a lane that's clear far enough up — fall back to any own lane.
  let lane = -1;
  for (let tries = 0; tries < 8; tries++) {
    const l = firstOwn + Math.floor(Math.random() * dUp.ownLaneCount);
    if (isLaneClearNear(l, -160, 220, ent)) { lane = l; break; }
  }
  if (lane < 0) lane = firstOwn + Math.floor(Math.random() * dUp.ownLaneCount);

  const cd = STAGE_LIMO_LANE_CD[stageIndex];
  ent.alive    = true;
  ent.kind     = 'limo';
  ent.dir      = 'own';
  ent.x        = laneCenterX(lane, -160);
  ent.y        = -160;
  ent.w        = LIMO_W;
  ent.h        = LIMO_H;
  ent.lane     = lane;
  ent.hp       = 99;
  ent.speed    = LIMO_SPEED_BY_STAGE[stageIndex] ?? LIMO_SPEED_BY_STAGE[LIMO_SPEED_BY_STAGE.length - 1];
  ent.lateralVx = 0;
  ent.aiTimer  = cd.min + Math.random() * (cd.max - cd.min);
  ent.isRammer = false;
  ent.harassMode = 'none';
  ent.harassTimer = 0;
  ent.deliveryGlow = 0;
  return ent;
}

function spawnSlick() {
  const ent = spawnFromPool(slicks);
  if (!ent) return;
  // Oil slicks only spawn on own-direction lanes — the player should never
  // be hit by a slick they can't reach without driving into oncoming traffic.
  const e  = edgesAtY(-40);
  const dx = dividerXAtY(-40).x;
  const margin = 20;
  ent.alive = true;
  ent.x = dx + margin + Math.random() * Math.max(20, e.right - dx - 2 * margin);
  ent.y = -40;
  ent.w = 60 + Math.random() * 30;
  ent.h = 28 + Math.random() * 12;
}

function spawnFuelPickup() {
  // Green tanker truck — lives in the traffic pool so player collision works the
  // same as the yellow truck. Refuels the player while driving alongside.
  const ent = spawnFromPool(traffic);
  if (!ent) return;
  // Fuel tankers always travel own-direction (they're a pickup, not a hazard).
  const d        = dividerXAtY(-80);
  const lanesUp  = activeLanesAt(-80);
  const firstOwn = lanesUp - d.ownLaneCount;
  const lane     = firstOwn + Math.floor(Math.random() * d.ownLaneCount);
  ent.alive  = true;
  ent.kind   = 'fuel';
  ent.dir    = 'own';
  ent.x      = laneCenterX(lane, -80);
  ent.y      = -80;
  ent.w      = 42;
  ent.h      = 96;
  ent.lane   = lane;
  ent.hp     = 99;
  ent.speed  = 200 + Math.random() * 60;   // 200–260, same band as yellow trucks
  ent.lateralVx = 0;
  ent.aiTimer = 999;
  ent.isRammer = false;

  // Refuse to spawn if the lane is already occupied near the spawn point.
  if (!isLaneClearNear(lane, ent.y, 140, ent)) {
    ent.alive = false;
  }
}

function spawnEnemyBullet(x, y, vy) {
  for (let i = 0; i < MAX_ENEMY_BULLETS; i++) {
    const b = enemyBullets[i];
    if (b.alive) continue;
    b.alive = true;
    b.x = x; b.y = y;
    b.vy = vy;
    b.w = ENEMY_BULLET_W;
    b.h = ENEMY_BULLET_H;
    return;
  }
}

function spawnOilDrop(x, y) {
  const s = spawnFromPool(slicks);
  if (!s) return;
  s.alive = true;
  s.x = x;
  s.y = y;
  s.w = 40 + Math.random() * 14;
  s.h = 20 + Math.random() * 8;
}

function spawnExplosion(x, y, big) {
  const ent = spawnFromPool(explosions);
  if (!ent) return;
  ent.alive = true;
  ent.x = x; ent.y = y;
  ent.t = 0; ent.dur = big ? 0.55 : 0.28;
  ent.big = !!big;
}

function spawnBullet() {
  const ent = spawnFromPool(bullets);
  if (!ent) return false;
  ent.alive = true;
  ent.x = playerX;
  ent.y = PLAYER_BASE_Y - PLAYER_H / 2 - 4;
  ent.w = BULLET_W; ent.h = BULLET_H;
  return true;
}

// ── Score ──────────────────────────────────────────────────────
function addScore(pts) {
  score += pts;
  if (score > hiScore) {
    hiScore = score;
    try { localStorage.setItem('hh_hi', String(hiScore)); } catch (_) {}
  }
}

// ── Collisions ─────────────────────────────────────────────────
function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(ax - bx) * 2 < (aw + bw) && Math.abs(ay - by) * 2 < (ah + bh);
}

// ── Player damage / death ──────────────────────────────────────
function damagePlayer() {
  if (invulnTimer > 0 || gameState !== 'playing') return;
  lives--;
  updateHUD();
  spawnExplosion(playerX, PLAYER_BASE_Y, true);
  sfxCrash();
  engineStop();
  if (lives <= 0) {
    triggerGameOver();
  } else {
    invulnTimer = 2.0;
    crashTimer  = 0.6;
    playerVx = 0;
    // Knock the player toward the middle of the own-direction lanes (not
    // road center — that would put them on the divider with bidirectional traffic).
    const dxP = dividerXAtY(PLAYER_BASE_Y).x;
    const rxP = edgesAtY(PLAYER_BASE_Y).right;
    playerX   = (rxP > dxP) ? (dxP + rxP) / 2 : (ROAD_LEFT + ROAD_RIGHT) / 2;
  }
}

// Begin the STAGE_FAILED banner. Music stops; the actual reset happens after
// stageFailedTimer expires (see update()).
function failStage(reason) {
  if (stagePhase === 'STAGE_FAILED' || gameState !== 'playing') return;
  stagePhase = 'STAGE_FAILED';
  stageFailedTimer = STAGE_FAILED_S;
  stageFailedReason = reason || 'STAGE FAILED';
  NeonArcade.stopMusic();
  engineStop();
  stopCountdownSfx();
}

// Victory — all 5 stages delivered. Show victory overlay.
function triggerVictory() {
  if (gameState === 'gameover') return;
  gameState = 'gameover';
  NeonArcade.stopMusic();
  engineStop();
  stopCountdownSfx();
  if (victoryScoreEl) victoryScoreEl.textContent = 'FINAL SCORE  ' + score;
  showOverlay('overlay-victory');
}

// Game over — player has run out of lives. Halts the run; the retry button
// starts a fresh run from stage 1 via startGame(). Distinct from STAGE_FAILED,
// which is a per-stage redo that keeps the player in the run.
function triggerGameOver() {
  if (gameState === 'gameover') return;
  gameState = 'gameover';
  NeonArcade.stopMusic();
  engineStop();
  stopCountdownSfx();
  if (gameoverScoreEl) gameoverScoreEl.textContent = 'FINAL SCORE  ' + score;
  showOverlay('overlay-gameover');
}

// ── Game lifecycle ─────────────────────────────────────────────
// Reset every per-stage variable to the start of `stageIndex`. Used for both
// the very first stage (after startGame) AND when restarting after failure.
// Preserves score, hiScore, stageIndex, and parcelState is set HOLDING.
function resetStageEntities() {
  for (let i = 0; i < MAX_TRAFFIC; i++) traffic[i].alive    = false;
  for (let i = 0; i < MAX_SLICKS;  i++) slicks[i].alive     = false;
  for (let i = 0; i < MAX_EXPLO;   i++) explosions[i].alive = false;
  for (let i = 0; i < BULLET_POOL_SIZE;  i++) bullets[i].alive      = false;
  for (let i = 0; i < MAX_ENEMY_BULLETS; i++) enemyBullets[i].alive = false;
}

function beginStage() {
  // Lives are NOT reset here — they're owned by the run lifecycle (startGame
  // assigns 3, restartCurrentStage restores the per-stage snapshot, and
  // advanceToNextStage carries over whatever the player finished the prior
  // stage with). Resetting here would silently refill lives on every restart.
  fuel  = FUEL_MAX;
  parcelState = 'HOLDING';

  stagePhase   = 'DRIVING';
  stageTimer   = STAGE_TIME_S[stageIndex] ?? STAGE_TIME_S[STAGE_TIME_S.length - 1];
  stageDistance = 0;
  timerActive  = false;
  limoEnt      = null;
  limoBannerTimer = 0;
  limoGraceTimer = 0;
  limoJitterT  = 0;
  deliveryHoldTimer = 0;
  stageFailedTimer = 0;
  stageDeliveredTimer = 0;
  stageInterstitialTimer = 0;
  stageStartBannerTimer = STAGE_START_BANNER_S;
  hurryUpBannerTimer    = 0;
  stageDeliveredBonus = 0;
  stageDeliveredTimeBonus = 0;

  // Coast model: reset to the initial speed at every stage start (no per-stage
  // base ramp — stage difficulty is conveyed via the limo's lower speed frac).
  worldSpd = WORLD_INITIAL_SPD;

  initRoadSegments();
  initScenery();
  const eP = edgesAtY(PLAYER_BASE_Y);
  roadLeftActive    = eP.left;
  roadRightActive   = eP.right;
  roadLanesAtPlayer = eP.lanes;
  stripeOffset = 0;
  edgeOffset   = 0;
  // Spawn the player in the middle of the own-direction lanes (right side of
  // the divider). Falls back to road center if the divider somehow lands at
  // or beyond the right edge.
  {
    const dxP = dividerXAtY(PLAYER_BASE_Y).x;
    const rxP = edgesAtY(PLAYER_BASE_Y).right;
    playerX   = (rxP > dxP) ? (dxP + rxP) / 2 : (ROAD_LEFT + ROAD_RIGHT) / 2;
  }
  playerVx     = 0;
  grip         = PLAYER_GRIP_BASE;
  slickTimer   = 0;
  invulnTimer  = 0;
  crashTimer   = 0;
  fireCooldown = 0;
  emptyClickCd = 0;
  ammo         = STAGE_AMMO[stageIndex] ?? STAGE_AMMO[STAGE_AMMO.length - 1];
  lowFuelBeepAcc = 0;

  resetStageEntities();

  trafficTimer    = STAGE_TRAFFIC_INTERVAL[stageIndex];
  oppTrafficTimer = STAGE_TRAFFIC_INTERVAL[stageIndex] / STAGE_OPP_RATE_MULT[stageIndex];
  slickTimerSpawn = 8.0;
  fuelTimer       = STAGE_FUEL_TIMER_BASE[stageIndex];
  criticalRescueTimer = 0;

  // Reset countdown audio cue state — heartbeat and panic-beep both gated by
  // the live stageTimer + stagePhase, but the integer-second-edge tracker for
  // the panic beep must be reset so beeps don't fire on the first frame.
  heartbeatAcc = 0;
  countdownLastIntSec = -1;
}

// Failure recovery — restart the current stage. Score and kills roll back to
// the snapshot captured at the start of this stage so progress from the failed
// attempt does not stick. stageIndex/hiScore are preserved.
function restartCurrentStage() {
  score = stageStartScore;
  kills = stageStartKills;
  lives = stageStartLives;
  beginStage();
  updateHUD();
  NeonArcade.startMusic();
  engineStart();
  engineSetState('drive');
}

// Advance from DELIVERED → next stage.
function advanceToNextStage() {
  stageIndex++;
  if (stageIndex >= STAGE_COUNT) {
    triggerVictory();
    return;
  }
  stageStartScore = score;
  stageStartKills = kills;
  stageStartLives = lives;
  beginStage();
  NeonArcade.startMusic();
  engineStart();
  engineSetState('drive');
}

function startGame() {
  gameState  = 'playing';
  score      = 0;
  kills      = 0;
  lives      = 3;
  stageIndex = 0;
  stageStartScore = 0;
  stageStartKills = 0;
  stageStartLives = lives;
  beginStage();
  hideOverlays();
  updateHUD();
  NeonArcade.setTrack(6);
  NeonArcade.startMusic();
  engineStart();
  engineSetState('drive');
}

// ── Firing ─────────────────────────────────────────────────────
function fire() {
  if (fireCooldown > 0) return;
  if (ammo <= 0) {
    if (emptyClickCd <= 0) {
      sfxEmptyClick();
      emptyClickCd = 0.25;
    }
    return;
  }
  if (spawnBullet()) {
    ammo--;
    fireCooldown = FIRE_CD;
    sfxShoot();
  }
}

// True when the player is right behind a fuel tanker, in the same lane, with
// a trailing gap of 12–30 px. Tight enough to feel like a careful draft, but
// not bumper-touching — getting too close (gap < 12) drops out of the refuel
// zone and the tanker becomes a regular immovable hazard again.
function playerInTankerRearZone(t) {
  if (t.kind !== 'fuel' || !t.alive || t.dir !== 'own') return false;
  // Same-lane lateral alignment: centers must be within roughly a player-width.
  if (Math.abs(playerX - t.x) > (PLAYER_W / 2) + 6) return false;
  const playerTop  = PLAYER_BASE_Y - PLAYER_H / 2;
  const tankerRear = t.y + t.h / 2;
  const gap = playerTop - tankerRear;
  return gap >= 12 && gap <= 30;
}

// ── Update ─────────────────────────────────────────────────────
function update(dt) {
  // Snapshot the previous frame's refuel state — the new value isn't decided
  // until the traffic loop runs later in this tick, so the delivery-timer
  // pause check below uses last frame's value (imperceptible at 60fps).
  const wasStealingFuel = stealingFuel;
  // Reset per-tick status flags
  stealingFuel = false;
  refuelHoseTanker = null;
  parcelHandshakeLimo = null;
  parcelHandshakeSide = 0;
  parcelHandshakeActive = false;

  // ── Stage phase: STAGE_FAILED (post-failure banner, then reset) ──
  if (stagePhase === 'STAGE_FAILED') {
    stageFailedTimer -= dt;
    // Run explosion animations during the banner — feels less abrupt.
    for (let i = 0; i < MAX_EXPLO; i++) {
      const e = explosions[i]; if (!e.alive) continue;
      e.t += dt; if (e.t >= e.dur) e.alive = false;
    }
    if (stageFailedTimer <= 0) restartCurrentStage();
    updateHUD();
    return;
  }

  // ── Stage phase: STAGE_INTERSTITIAL (brief pause, then advance) ──
  if (stagePhase === 'STAGE_INTERSTITIAL') {
    stageInterstitialTimer -= dt;
    if (stageInterstitialTimer <= 0) advanceToNextStage();
    updateHUD();
    return;
  }

  // ── Stage phase: DELIVERED (celebration pause, then interstitial) ──
  if (stagePhase === 'DELIVERED') {
    stageDeliveredTimer -= dt;
    // Keep explosions animating, otherwise world is frozen.
    for (let i = 0; i < MAX_EXPLO; i++) {
      const e = explosions[i]; if (!e.alive) continue;
      e.t += dt; if (e.t >= e.dur) e.alive = false;
    }
    if (stageDeliveredTimer <= 0) {
      stagePhase = 'STAGE_INTERSTITIAL';
      stageInterstitialTimer = STAGE_INTERSTITIAL_S;
    }
    updateHUD();
    return;
  }

  // ── Crash freeze ──
  if (crashTimer > 0) {
    crashTimer -= dt;
    // Continue running explosions, but stop world & spawns briefly
    for (let i = 0; i < MAX_EXPLO; i++) {
      const e = explosions[i]; if (!e.alive) continue;
      e.t += dt; if (e.t >= e.dur) e.alive = false;
    }
    if (crashTimer <= 0) {
      engineStart();
      engineSetState(stagePhase === 'LIMO_INCOMING' ? 'idle' : 'drive');
    }
    return;
  }

  fireCooldown = Math.max(0, fireCooldown - dt);
  emptyClickCd = Math.max(0, emptyClickCd - dt);
  invulnTimer  = Math.max(0, invulnTimer  - dt);
  slickTimer   = Math.max(0, slickTimer   - dt);
  stageStartBannerTimer = Math.max(0, stageStartBannerTimer - dt);
  hurryUpBannerTimer    = Math.max(0, hurryUpBannerTimer - dt);

  // ── Stage timer / limo lifecycle ──
  // The visible TIME panel reflects `stageTimer` directly. It ticks during
  // DRIVING and continues through LIMO_INCOMING (so the player still sees one
  // continuous clock during the "limo approaching" banner). It FREEZES the
  // moment stagePhase transitions to LIMO_PRESENT — from that point the limo
  // grace window (LIMO_GRACE_SEC) takes over the failure gate, but is not
  // shown as a separate number on the HUD.
  if (stagePhase === 'DRIVING') {
    // Overtake-only progress: only the portion of worldSpd ABOVE the average
    // traffic speed counts toward the limo. Cruising at or below the flow of
    // traffic earns zero progress — no loitering, no riding-the-pack cheese.
    stageDistance += Math.max(0, worldSpd - OVERTAKE_THRESHOLD) * dt;
    const limoAt = STAGE_LIMO_AT_DIST[stageIndex] ?? STAGE_LIMO_AT_DIST[STAGE_LIMO_AT_DIST.length - 1];
    // Initiate the delivery countdown once the player has driven past half of
    // the distance to the limo. Before this point, the TIME panel reads '--:--'.
    if (!timerActive && stageDistance >= limoAt * 0.5) {
      timerActive = true;
      sfxTimerStart();
      hurryUpBannerTimer = HURRY_UP_BANNER_S;
    }
    // Drafting the fuel tanker pauses the timer (and silences the heartbeat/
    // panic SFX) until the player leaves the rear-bumper zone.
    if (timerActive) {
      if (!wasStealingFuel) {
        stageTimer -= dt;
        updateCountdownSfx(dt);
      } else {
        stopCountdownSfx();
      }
      if (stageTimer <= 0) {
        stopCountdownSfx();
        failStage('TIME UP');
        updateHUD();
        return;
      }
    }
    // Limo arrival: stageDistance reaches the per-stage threshold.
    if (stageDistance >= limoAt) {
      stagePhase = 'LIMO_INCOMING';
      limoBannerTimer = LIMO_INCOMING_BANNER_S;
      sfxLimoHorn();
      engineSetState('idle');
    }
  } else if (stagePhase === 'LIMO_INCOMING') {
    // Keep the visible clock ticking through the "LIMO INCOMING" banner —
    // single continuous countdown until the limo is on screen. The refuel
    // pause still applies here so drafting a tanker holds the clock steady.
    stageDistance += Math.max(0, worldSpd - OVERTAKE_THRESHOLD) * dt;
    limoBannerTimer -= dt;
    if (timerActive) {
      if (!wasStealingFuel) {
        stageTimer -= dt;
        updateCountdownSfx(dt);
      } else {
        stopCountdownSfx();
      }
      if (stageTimer <= 0) {
        stopCountdownSfx();
        failStage('TIME UP');
        updateHUD();
        return;
      }
    }
    if (limoBannerTimer <= 0) {
      limoEnt = spawnLimo();
      if (limoEnt) {
        stagePhase = 'LIMO_PRESENT';
        limoGraceTimer = LIMO_GRACE_SEC;
        engineSetState('drive');  // resume full engine drone for the limo chase
        // Freeze visible countdown + silence its audio cues — the limo grace
        // window is a hidden failure gate from here on.
        stopCountdownSfx();
      } else {
        // Pool was full — try again next frame.
        limoBannerTimer = 0.1;
      }
    }
  } else if (stagePhase === 'LIMO_PRESENT') {
    // stageTimer is FROZEN now (one visible clock; HUD reflects its frozen
    // value). limoGraceTimer is the hidden gate for missed-limo failure.
    limoGraceTimer -= dt;
    if (limoGraceTimer <= 0) {
      failStage('TIME UP');
      updateHUD();
      return;
    }
    // Jitter the limo's speed ±LIMO_JITTER_AMP of the per-stage baseline so the
    // player must actively micro-adjust throttle.  Mutating limoEnt.speed keeps
    // the visual motion and the delivery-window check perfectly coherent.
    if (limoEnt && limoEnt.alive) {
      limoJitterT += dt;
      const baseSpd = LIMO_SPEED_BY_STAGE[stageIndex] ?? LIMO_SPEED_BY_STAGE[LIMO_SPEED_BY_STAGE.length - 1];
      const phase   = (limoJitterT / LIMO_JITTER_PERIOD_S) * Math.PI * 2;
      limoEnt.speed = baseSpd * (1 + LIMO_JITTER_AMP * Math.sin(phase));
    }
  }

  // ── Input → throttle / brake / steer ──
  const left  = keys['ArrowLeft']  || keys['a'] || keys['A'];
  const right = keys['ArrowRight'] || keys['d'] || keys['D'];
  const up    = keys['ArrowUp']    || keys['w'] || keys['W'];
  const down  = keys['ArrowDown']  || keys['s'] || keys['S'];
  const space = keys[' '];

  if (space) fire();

  // Coast model: UP/DOWN integrate worldSpd at fixed rates; with no input the
  // value coasts (no decay, no cruise pull). Brake is punchier than throttle.
  if (up && !down) {
    worldSpd += WORLD_ACCEL_RATE * dt;
  } else if (down && !up) {
    worldSpd -= WORLD_BRAKE_RATE * dt;
  }
  if (worldSpd < WORLD_MIN_SPD) worldSpd = WORLD_MIN_SPD;
  else if (worldSpd > WORLD_MAX_SPD) worldSpd = WORLD_MAX_SPD;
  engineUpdate(worldSpd);  // pitch-track engine drone to current scroll speed

  // ── Steering (with slick momentum) ──
  grip = slickTimer > 0 ? 0.35 : PLAYER_GRIP_BASE;
  const steerAccel = PLAYER_STEER_SPD * 6;     // px/s² when pressing
  const damping    = grip > 0.6 ? 12 : 2.5;    // how quickly lateral velocity decays

  let ax = 0;
  if (left)  ax -= steerAccel;
  if (right) ax += steerAccel;
  // grip scales control authority on oil slicks
  ax *= grip;

  playerVx += ax * dt;
  playerVx -= playerVx * Math.min(1, damping * dt);
  // Hard cap lateral speed
  const maxLat = PLAYER_STEER_SPD * (0.6 + 0.4 * grip);
  if (playerVx >  maxLat) playerVx =  maxLat;
  if (playerVx < -maxLat) playerVx = -maxLat;

  playerX += playerVx * dt;

  // Clamp within road edges (with thin car-width margin)
  const halfPW = PLAYER_W / 2;
  if (playerX - halfPW < roadLeftActive) {
    playerX = roadLeftActive + halfPW;
    if (playerVx < 0) playerVx = 0;
  }
  if (playerX + halfPW > roadRightActive) {
    playerX = roadRightActive - halfPW;
    if (playerVx > 0) playerVx = 0;
  }

  // ── Road segments scroll downward; recycle off-screen, prepend new on top ──
  for (let i = 0; i < segments.length; i++) segments[i].topY += worldSpd * dt;
  while (segments.length && segments[segments.length - 1].topY > LH + 200) segments.pop();
  while (segments.length && segments[0].topY > -300) {
    segments.unshift(generateSegmentAbove(segments[0].topY));
  }
  // Roadside scenery (grass / trees / houses+pavement) — independent scroll queues
  updateScenery(dt);
  // Refresh "road at player" cached values (used by player clamp + alongside check).
  const ePlayer       = edgesAtY(PLAYER_BASE_Y);
  roadLeftActive      = ePlayer.left;
  roadRightActive     = ePlayer.right;
  roadLanesAtPlayer   = ePlayer.lanes;

  // ── Fuel drain ──
  // Paused during LIMO_INCOMING (the 2 s banner before the limo spawns) so the
  // cutscene doesn't tax the player. DELIVERED / STAGE_INTERSTITIAL /
  // STAGE_FAILED already early-return above. Drain continues during LIMO_PRESENT
  // (the 30 s grace window) so the player still feels time pressure.
  if (stagePhase !== 'LIMO_INCOMING') {
    const speedFrac  = Math.max(0, Math.min(1,
      (worldSpd - WORLD_MIN_SPD) / (WORLD_MAX_SPD - WORLD_MIN_SPD)));
    const drainRate  = FUEL_DRAIN_MIN +
      (FUEL_DRAIN_MAX - FUEL_DRAIN_MIN) * speedFrac * speedFrac;
    fuel -= dt * drainRate;
  }
  if (fuel <= 0) {
    fuel = 0;
    failStage('OUT OF FUEL');
    updateHUD();
    return;
  }
  // Low-fuel beeps
  if (fuel <= 15) {
    lowFuelBeepAcc += dt;
    if (lowFuelBeepAcc >= 0.6) { sfxLowFuelBeep(); lowFuelBeepAcc = 0; }
  } else {
    lowFuelBeepAcc = 0;
  }

  // ── Animated road stripes (visual scroll feedback) ──
  stripeOffset = (stripeOffset + worldSpd * dt) % 60;
  edgeOffset   = (edgeOffset   + worldSpd * dt) % 24;

  // ── Spawn timers ──
  // No traffic spawns during LIMO_INCOMING / LIMO_PRESENT — the player needs a
  // clearer road to maneuver alongside the limo. Opposite-direction traffic is
  // ALSO suppressed during DELIVERED / STAGE_FAILED / STAGE_INTERSTITIAL (handled
  // by their early-return code paths above), and during LIMO_INCOMING / LIMO_PRESENT
  // by the same gate as own-traffic below.
  if (stagePhase === 'DRIVING') {
    trafficTimer -= dt;
    if (trafficTimer <= 0) {
      spawnTraffic();
      const base = STAGE_TRAFFIC_INTERVAL[stageIndex];
      trafficTimer = base * (0.7 + Math.random() * 0.7);
    }

    oppTrafficTimer -= dt;
    if (oppTrafficTimer <= 0) {
      spawnOppTraffic();
      const baseOpp = STAGE_TRAFFIC_INTERVAL[stageIndex] / STAGE_OPP_RATE_MULT[stageIndex];
      oppTrafficTimer = baseOpp * (0.7 + Math.random() * 0.7);
    }

    slickTimerSpawn -= dt;
    if (slickTimerSpawn <= 0) {
      spawnSlick();
      slickTimerSpawn = Math.max(2.5, 8.0 - stageIndex * 0.4) * (0.7 + Math.random() * 0.6);
    }

    fuelTimer -= dt;
    if (fuelTimer <= 0) {
      spawnFuelPickup();
      // Spawn more often when fuel is low
      const urgency = fuel < 30 ? 0.45 : 1.0;
      const base    = STAGE_FUEL_TIMER_BASE[stageIndex];
      fuelTimer     = base * urgency * (0.85 + Math.random() * 0.5);
    }

    // ── Critical-fuel rescue ──
    // When fuel drops below FUEL_CRITICAL and no tanker is currently on the road,
    // force-spawn one after a short delay. Re-arms naturally each time the
    // condition holds, so a missed spawn (lane blocked) is retried.
    if (fuel < FUEL_CRITICAL) {
      let tankerOnRoad = false;
      for (let i = 0; i < MAX_TRAFFIC; i++) {
        if (traffic[i].alive && traffic[i].kind === 'fuel') { tankerOnRoad = true; break; }
      }
      if (!tankerOnRoad) {
        criticalRescueTimer += dt;
        if (criticalRescueTimer >= FUEL_RESCUE_DELAY) {
          spawnFuelPickup();
          criticalRescueTimer = 0;
          fuelTimer = STAGE_FUEL_TIMER_BASE[stageIndex];   // reset normal timer too
        }
      } else {
        criticalRescueTimer = 0;
      }
    } else {
      criticalRescueTimer = 0;
    }
  }

  // ── Update traffic ──
  for (let i = 0; i < MAX_TRAFFIC; i++) {
    const t = traffic[i];
    if (!t.alive) continue;

    // World scroll pulls everything down by worldSpd. Own-direction entities
    // are partially overtaken (slower effective down-speed); opposite-direction
    // entities ADD their own forward motion to the scroll, closing on the player.
    // Absolute-speed model: own-direction entities drift on screen at the
    // difference (worldSpd - npcSpd); opp-direction adds for head-on closing.
    // NPCs keep their own pace if the player slows down or speeds up.
    //
    // Red-car pursuit: matching enemies accelerate up toward the player's
    // worldSpd while on screen, but back off behind any slower same-lane car
    // or truck instead of rear-ending it. Matched reds never push other NPC
    // speeds — they decelerate toward a follow speed below the leader.
    if (t.kind === 'enemy' && t.matchSpeed && t.y > -40 && t.y < LH + 40) {
      let leadSpd = Infinity;
      for (let j = 0; j < MAX_TRAFFIC; j++) {
        const o = traffic[j];
        if (o === t || !o.alive) continue;
        if (o.lane !== t.lane || o.dir !== t.dir) continue;
        if (o.y >= t.y) continue;                       // must be in front (above on screen)
        if (t.y - o.y > MIN_FOLLOW_GAP * 1.8) continue; // out of follow range
        if (o.speed < leadSpd) leadSpd = o.speed;
      }
      const target = isFinite(leadSpd)
        ? Math.min(worldSpd, leadSpd - 12)
        : worldSpd;
      if (t.speed < target) {
        t.speed = Math.min(target, t.speed + ENEMY_MATCH_ACCEL * dt);
      } else if (t.speed > target) {
        t.speed = Math.max(target, t.speed - ENEMY_MATCH_ACCEL * dt);
      }
    } else if (t.kind === 'enemy' && !t.matchSpeed && t.y > -40 && t.y < LH + 40) {
      // Non-pursuing reds: don't actively close in, but never pull AHEAD of
      // the player. If the player decelerates below the red car's cruise
      // speed, the red car decays down to match worldSpd. Without this clamp,
      // any red car coincidentally at the player's speed would silently pull
      // ahead the instant the player taps the brake.
      if (t.speed > worldSpd) {
        t.speed = Math.max(worldSpd, t.speed - ENEMY_MATCH_ACCEL * dt);
      }
    }
    const effDown = (t.dir === 'opp')
      ? worldSpd + t.speed
      : worldSpd - t.speed;
    t.y += effDown * dt;

    // Road edges at this car's current Y — segments may narrow as it scrolls down.
    const eHere     = edgesAtY(t.y);
    const maxLane   = eHere.lanes - 1;
    const laneWHere = (eHere.right - eHere.left) / eHere.lanes;

    // Per-direction legal lane range based on current segment's own/opp split.
    const dHere    = dividerXAtY(t.y);
    const firstOwn = eHere.lanes - dHere.ownLaneCount;
    const minLane  = (t.dir === 'opp') ? 0                  : firstOwn;
    const lastLane = (t.dir === 'opp') ? dHere.oppLaneCount - 1 : eHere.lanes - 1;

    // If the road has narrowed beneath this car or the own/opp split shifted,
    // remap its lane to the nearest legal lane on the correct side.
    if (t.lane < minLane || t.lane > Math.min(lastLane, maxLane)) {
      if (t.kind === 'limo' && t.dir === 'own') {
        // Limo Q-D snap: when own-lanes shrink under it, jump to the rightmost
        // own lane (the player will need to chase — intentional drama).
        t.lane = maxLane;
      } else if (t.dir === 'opp') {
        // Opp off-range → leftmost opp lane.
        t.lane = 0;
      } else {
        // Own off-range → rightmost own lane.
        t.lane = Math.min(maxLane, eHere.lanes - 1);
      }
    }

    // Lane-keep lerp — applied to every traffic kind so trucks and tankers also
    // follow the active road through tapers and into narrow sections. Lane-changer
    // AI only adjusts the target lane index; the lerp itself drives `t.x`.
    if (t.kind === 'limo') {
      // Per-stage limo lane-change cadence. Clamp to own-lane range.
      t.aiTimer -= dt;
      if (t.aiTimer <= 0) {
        const cd = STAGE_LIMO_LANE_CD[stageIndex];
        t.aiTimer = cd.min + Math.random() * (cd.max - cd.min);
        const newLane = Math.max(minLane, Math.min(Math.min(lastLane, maxLane),
          t.lane + (Math.random() < 0.5 ? -1 : 1)));
        if (newLane !== t.lane && isLaneClearNear(newLane, t.y, MIN_FOLLOW_GAP, t)) {
          t.lane = newLane;
        }
      }
    } else if (t.kind !== 'truck' && t.kind !== 'fuel') {
      t.aiTimer -= dt;
      if (t.aiTimer <= 0) {
        t.aiTimer = 1.5 + Math.random() * 2.5;
        if (Math.random() < (t.kind === 'enemy' ? 0.65 : 0.35)) {
          const newLane = Math.max(minLane, Math.min(Math.min(lastLane, maxLane),
            t.lane + (Math.random() < 0.5 ? -1 : 1)));
          if (newLane !== t.lane && isLaneClearNear(newLane, t.y, MIN_FOLLOW_GAP, t)) {
            t.lane = newLane;
          }
        }
      }
    }
    {
      const target = laneCenterX(t.lane, t.y);
      const dx     = target - t.x;
      // Lerp strength: enemies snappy, civilians regular, trucks/tankers/limo smoother.
      const lerp = (t.kind === 'enemy') ? 1.6
                 : (t.kind === 'civ')   ? 0.9
                 : (t.kind === 'limo')  ? 1.0
                                        : 1.1;   // truck + fuel tanker
      t.lateralVx = dx * lerp;
      t.x += t.lateralVx * dt;
    }

    // Rammers: dive toward player X — but only while the adjacent lane is clear,
    // so they don't sideswipe through other traffic. Rammers are always own-direction
    // (enemy spawn), so clamp lane target into the own-lane range.
    if (t.isRammer && t.y > 0 && t.y < PLAYER_BASE_Y - 40) {
      const dx = playerX - t.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), 80 * dt);
      const nextX    = t.x + step;
      const nextLane = Math.max(minLane, Math.min(Math.min(lastLane, maxLane),
        Math.floor((nextX - eHere.left) / laneWHere)));
      if (nextLane === t.lane || isLaneClearNear(nextLane, t.y, MIN_FOLLOW_GAP, t)) {
        t.x = nextX;
        if (nextLane !== t.lane) t.lane = nextLane;
      }
    }

    // Hard clamp to the active road edges at this car's Y. Even if the lerp
    // hasn't caught up to a fast-narrowing taper, the car can never sit outside
    // the painted edges.
    {
      const halfTW = t.w / 2;
      if (t.x - halfTW < eHere.left)  { t.x = eHere.left  + halfTW; t.lateralVx = 0; }
      if (t.x + halfTW > eHere.right) { t.x = eHere.right - halfTW; t.lateralVx = 0; }
    }

    // Follow-gap clamp: prevent rear-ending a same-lane, same-direction car
    // ahead. The required center-to-center distance is dynamic — half-heights
    // plus MIN_PAIR_GAP — so trucks (96 px tall) reserve more space than cars
    // (56 px) and a car following a truck still gets a real nose-to-tail gap.
    // For own traffic the leader is at higher y (closer to player); for opp
    // the leader is at lower y.
    const lead = findNearestAhead(t);
    if (lead) {
      const need = pairClearance(t, lead);
      if (t.dir === 'opp') {
        if (t.y < lead.y + need) t.y = lead.y + need;
      } else {
        if (t.y > lead.y - need) t.y = lead.y - need;
      }
    }

    // Bullets vs traffic
    for (let b = 0; b < BULLET_POOL_SIZE; b++) {
      const bl = bullets[b];
      if (!bl.alive) continue;
      if (rectOverlap(bl.x, bl.y, bl.w, bl.h, t.x, t.y, t.w, t.h)) {
        bl.alive = false;
        if (t.kind === 'enemy') {
          t.alive = false;
          spawnExplosion(t.x, t.y, true);
          sfxExplode(true);
          addScore(100 + stageIndex * 10);
          kills++;
          // +1s time bonus, only after the countdown has initiated (half-
          // distance threshold) and only during the active countdown phases.
          // LIMO_PRESENT is included because stageTimer's frozen value still
          // feeds the delivery time bonus.
          if (timerActive &&
              (stagePhase === 'DRIVING' ||
               stagePhase === 'LIMO_INCOMING' ||
               stagePhase === 'LIMO_PRESENT')) {
            stageTimer += TIME_BONUS_ENEMY_KILL;
          }
          updateHUD();
          break;
        } else if (t.kind === 'truck' || t.kind === 'fuel' || t.kind === 'limo') {
          // Trucks, fuel tankers, and the VIP limo shrug off bullets — small spark only
          spawnExplosion(bl.x, bl.y, false);
          break;
        } else {
          // Civilians take damage too but no points (player should avoid
          // shooting them). Also costs fuel — a meaningful sting beyond the
          // score hit so the player can't gun down civs to clear the road.
          t.alive = false;
          spawnExplosion(t.x, t.y, true);
          sfxExplode(true);
          addScore(-30);
          fuel = Math.max(0, fuel - FUEL_PENALTY_CIV_SHOT);
          updateHUD();
          break;
        }
      }
    }

    if (!t.alive) continue;

    // Collision with player car
    if (invulnTimer <= 0) {
      if (rectOverlap(playerX, PLAYER_BASE_Y, PLAYER_W - 4, PLAYER_H - 6,
                      t.x, t.y, t.w - 4, t.h - 6)) {
        // Enemy collision damages both
        if (t.kind === 'enemy') {
          t.alive = false;
          spawnExplosion(t.x, t.y, true);
          sfxExplode(true);
          kills++;
          addScore(50);
        } else if (t.kind === 'civ') {
          t.alive = false;
          spawnExplosion(t.x, t.y, true);
          sfxExplode(true);
          addScore(-20);
          // -2s time penalty for civilian collision, only after the countdown
          // has initiated (half-distance threshold).
          if (timerActive &&
              (stagePhase === 'DRIVING' ||
               stagePhase === 'LIMO_INCOMING' ||
               stagePhase === 'LIMO_PRESENT')) {
            stageTimer = Math.max(0, stageTimer - TIME_PENALTY_CIV_HIT);
          }
        } else if (t.kind === 'truck' || t.kind === 'fuel' || t.kind === 'limo') {
          // Truck / fuel tanker / VIP limo stays (immovable hazard)
          spawnExplosion(playerX, PLAYER_BASE_Y - 10, false);
        }
        damagePlayer();
        updateHUD();
      }
    }

    // Enemy harass: when the player is behind the enemy on the road (enemy is above on screen),
    // periodically back-fire a projectile with random speed or drop an oil slick.
    if (t.kind === 'enemy' && t.alive && t.harassMode !== 'none' &&
        t.y > 0 && t.y < PLAYER_BASE_Y - 40) {
      t.harassTimer -= dt;
      if (t.harassTimer <= 0) {
        const backY = t.y + t.h / 2 + 4;
        if (t.harassMode === 'shoot') {
          const vy = ENEMY_BULLET_VY_MIN +
                     Math.random() * (ENEMY_BULLET_VY_MAX - ENEMY_BULLET_VY_MIN);
          spawnEnemyBullet(t.x, backY, vy);
          sfxShoot();
        } else {
          spawnOilDrop(t.x, backY + 10);
        }
        const hcd = STAGE_HARASS_CD[stageIndex];
        t.harassTimer = hcd.min + Math.random() * (hcd.max - hcd.min);
      }
    }

    // Fuel tanker: replenish fuel only while drafting the tanker's rear bumper
    // in the same lane (≤12 px gap). Side-by-side no longer refuels.
    if (t.kind === 'fuel' && t.alive && playerInTankerRearZone(t)) {
      fuel = Math.min(FUEL_MAX, fuel + FUEL_REFILL_RATE * dt);
      stealingFuel = true;
      refuelHoseTanker = t;
    }

    if (t.y > LH + 100) {
      // The limo should never just drive off-screen — if it does (player let it
      // pass), the grace timer will catch the failure regardless. But clear the
      // reference so we don't keep glow-lerping a dead entity.
      if (t === limoEnt) limoEnt = null;
      t.alive = false;
    }
  }

  // ── Update slicks ──
  for (let i = 0; i < MAX_SLICKS; i++) {
    const s = slicks[i];
    if (!s.alive) continue;
    s.y += worldSpd * dt;
    if (s.y > LH + 40) { s.alive = false; continue; }
    // Player on slick?
    if (rectOverlap(playerX, PLAYER_BASE_Y, PLAYER_W - 6, PLAYER_H - 10,
                    s.x, s.y, s.w, s.h)) {
      if (slickTimer < 0.6) {
        slickTimer = 0.9;
        sfxSkid();
        // Nudge the player a bit in current lateral direction
        playerVx += (Math.random() - 0.5) * 80;
      }
    }
  }

  // ── Update bullets ──
  for (let i = 0; i < BULLET_POOL_SIZE; i++) {
    const b = bullets[i];
    if (!b.alive) continue;
    b.y -= BULLET_SPD * dt;
    if (b.y < -20) b.alive = false;
  }

  // ── Update enemy bullets ──
  for (let i = 0; i < MAX_ENEMY_BULLETS; i++) {
    const b = enemyBullets[i];
    if (!b.alive) continue;
    b.y += b.vy * dt;
    if (b.y > LH + 20) { b.alive = false; continue; }
    // Vs player
    if (invulnTimer <= 0 &&
        rectOverlap(playerX, PLAYER_BASE_Y, PLAYER_W - 6, PLAYER_H - 8,
                    b.x, b.y, b.w, b.h)) {
      b.alive = false;
      spawnExplosion(b.x, b.y, false);
      damagePlayer();
      updateHUD();
      continue;
    }
    // Vs NPC traffic — bullets are blocked by civilians, trucks, fuel tankers,
    // and the limo. They pass THROUGH other enemy cars (no friendly fire).
    // Civilians die as collateral damage (visible explosion, no score change).
    for (let j = 0; j < MAX_TRAFFIC; j++) {
      const t = traffic[j];
      if (!t.alive || t.kind === 'enemy') continue;
      if (rectOverlap(b.x, b.y, b.w, b.h, t.x, t.y, t.w - 4, t.h - 6)) {
        b.alive = false;
        if (t.kind === 'civ') {
          t.alive = false;
          spawnExplosion(t.x, t.y, true);
          sfxExplode(true);
        } else {
          // truck / fuel / limo — absorbs the bullet, small spark only
          spawnExplosion(b.x, b.y, false);
        }
        break;
      }
    }
  }

  // ── Update explosions ──
  for (let i = 0; i < MAX_EXPLO; i++) {
    const e = explosions[i]; if (!e.alive) continue;
    e.t += dt;
    if (e.t >= e.dur) e.alive = false;
  }

  // ── Delivery handshake (only while limo is on the road) ──
  if (stagePhase === 'LIMO_PRESENT' && limoEnt && limoEnt.alive) {
    const xDist = Math.abs(playerX - limoEnt.x);
    const yDist = Math.abs(PLAYER_BASE_Y - limoEnt.y);
    const sideMin = (PLAYER_W / 2) + (limoEnt.w / 2) - 2;
    const sideMax = (PLAYER_W / 2) + (limoEnt.w / 2) + LANE_WIDTH;
    // Stricter vertical overlap due to the longer 144px limo sprite.
    const vertical = yDist < (PLAYER_H / 2) + (limoEnt.h / 2) - 20;
    const geomOK   = vertical && xDist > sideMin && xDist < sideMax;
    const tol      = DELIVERY_SPEED_TOL_BY_STAGE[stageIndex] ?? DELIVERY_SPEED_TOL_BY_STAGE[DELIVERY_SPEED_TOL_BY_STAGE.length - 1];
    // Compare against the per-stage BASE limo speed, not the jittered live speed.
    // limoEnt.speed sweeps ±LIMO_JITTER_AMP each cycle; at later stages the peak
    // jitter exceeds `tol`, which would reset the delivery hold timer mid-cycle
    // and make delivery impossible even when the player is exactly tracking the
    // limo's nominal cruise. The jitter stays as a subtle visual bob.
    const limoBaseSpd = LIMO_SPEED_BY_STAGE[stageIndex] ?? LIMO_SPEED_BY_STAGE[LIMO_SPEED_BY_STAGE.length - 1];
    const speedOK  = Math.abs(worldSpd - limoBaseSpd) < tol;

    // Smooth glow lerp on the limo for visual feedback.
    const target = geomOK ? 1 : 0;
    limoEnt.deliveryGlow += (target - limoEnt.deliveryGlow) * Math.min(1, dt * 6);

    // Parcel-handshake link: appear as soon as the player is in geometric
    // range, anchored to the side of the player's car that faces the limo.
    if (geomOK) {
      parcelHandshakeLimo = limoEnt;
      parcelHandshakeSide = (limoEnt.x >= playerX) ? 1 : -1;
      parcelHandshakeActive = speedOK;
    }

    if (geomOK && speedOK) {
      deliveryHoldTimer += dt;
      if (deliveryHoldTimer >= DELIVERY_HOLD_SEC) {
        // Deliver! Compute time bonus and award score, then transition.
        const timeBonusUnits = Math.max(0, stageTimer);
        const timeBonus = Math.floor(50 * timeBonusUnits);
        let stageBonus = 1000 + timeBonus;
        if (stageIndex === STAGE_COUNT - 1) stageBonus += 5000;   // final stage extra
        addScore(stageBonus);
        stageDeliveredBonus     = stageBonus;
        stageDeliveredTimeBonus = timeBonus;
        parcelState = 'DELIVERED';
        stagePhase  = 'DELIVERED';
        stageDeliveredTimer = DELIVERED_PAUSE_S;
        deliveryHoldTimer   = 0;
        // Drop the limo from the road so the celebration is uncluttered.
        if (limoEnt) { limoEnt.alive = false; limoEnt = null; }
        sfxDelivery();
        stopCountdownSfx();
        NeonArcade.stopMusic();
        // Mute the engine entirely during the STAGE COMPLETE pop-up and the
        // brief interstitial that follows — the celebration plays clean over
        // the delivery jingle. The next stage's beginStage() restarts it.
        engineStop();
        updateHUD();
        return;
      }
    } else {
      deliveryHoldTimer = 0;
    }
  } else if (limoEnt && !limoEnt.alive) {
    limoEnt = null;
  }

  // Refresh HUD once per tick — cache guards inside updateHUD keep DOM writes cheap.
  // Without this, the fuel bar (which changes continuously) would only repaint on
  // event milestones.
  updateHUD();
}

// ── Drawing ────────────────────────────────────────────────────
function drawRoad() {
  // Roadside strips (left and right of ROAD_LEFT/ROAD_RIGHT) are painted by the
  // scenery system — grass, trees, or houses+pavement scroll past in random tiles.
  drawScenery();

  // Road surface — full extent painted as asphalt; closed-off lanes are dimmed
  // per-segment below so a real taper (trapezoid) is drawn, not a uniform shrink.
  ctx.fillStyle = C_ROAD;
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, LH);

  // ── Per-segment painting (dim closed-off trapezoids + magenta edges + lanes) ──
  const dashLen = 28, period = 60;        // 28 dash + 32 gap = 60 period
  for (let i = 0; i < segments.length; i++) {
    const s   = segments[i];
    const y0  = s.topY;
    const y1  = s.topY + s.height;
    if (y1 < 0 || y0 > LH) continue;
    const lT  = s.leftTop, lB  = s.leftBot;
    const rT  = s.rightTop, rB = s.rightBot;

    // Dim overlay over closed-off areas — drawn as trapezoids so taper segments
    // look like a real road narrowing.
    if (lT > ROAD_LEFT || lB > ROAD_LEFT) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.moveTo(ROAD_LEFT, y0);
      ctx.lineTo(lT,        y0);
      ctx.lineTo(lB,        y1);
      ctx.lineTo(ROAD_LEFT, y1);
      ctx.closePath();
      ctx.fill();
    }
    if (rT < ROAD_RIGHT || rB < ROAD_RIGHT) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.moveTo(rT,         y0);
      ctx.lineTo(ROAD_RIGHT, y0);
      ctx.lineTo(ROAD_RIGHT, y1);
      ctx.lineTo(rB,         y1);
      ctx.closePath();
      ctx.fill();
    }

    // Painted magenta edges (3px wide quads, slanted if this is a taper segment)
    ctx.fillStyle = C_ROAD_EDGE;
    ctx.beginPath();
    ctx.moveTo(lT - 3, y0);
    ctx.lineTo(lT,     y0);
    ctx.lineTo(lB,     y1);
    ctx.lineTo(lB - 3, y1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(rT,     y0);
    ctx.lineTo(rT + 3, y0);
    ctx.lineTo(rB + 3, y1);
    ctx.lineTo(rB,     y1);
    ctx.closePath();
    ctx.fill();

    // Lane dashes — only inside straight (non-taper) segments. Skip the
    // boundary index that coincides with the bidirectional divider; we draw
    // a double-yellow line there instead of white dashes.
    if (!s.taper && s.lanes > 1) {
      ctx.fillStyle = C_LANE_LINE;
      const laneW = (rT - lT) / s.lanes;
      const dividerIdx = s.lanes - s.ownLaneCount;
      for (let l = 1; l < s.lanes; l++) {
        if (l === dividerIdx) continue;
        const lx = lT + laneW * l - 1;
        for (let dy = y0; dy < y1; dy += period) {
          const top = Math.max(dy, y0);
          const bot = Math.min(dy + dashLen, y1);
          if (bot > top) ctx.fillRect(lx, top, 2, bot - top);
        }
      }
    }

    // Double-yellow divider — two parallel ~2px quads with a ~3px gap.
    // Slants to match s.dividerTop → s.dividerBot. Skip if there are no opp
    // lanes in this segment (defensive — shouldn't happen by design).
    if (s.ownLaneCount < s.lanes) {
      const dT = s.dividerTop, dB = s.dividerBot;
      ctx.fillStyle = C_DIVIDER;
      // Left stripe of the pair
      ctx.beginPath();
      ctx.moveTo(dT - 3, y0);
      ctx.lineTo(dT - 1, y0);
      ctx.lineTo(dB - 1, y1);
      ctx.lineTo(dB - 3, y1);
      ctx.closePath();
      ctx.fill();
      // Right stripe of the pair (2px gap between)
      ctx.beginPath();
      ctx.moveTo(dT + 1, y0);
      ctx.lineTo(dT + 3, y0);
      ctx.lineTo(dB + 3, y1);
      ctx.lineTo(dB + 1, y1);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Far-distance fog gradient at top to suggest depth
  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, 'rgba(20,0,30,0.85)');
  grad.addColorStop(1, 'rgba(20,0,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LW, 120);
}

function drawCar(x, y, w, h, main, lt, dk, flashHide, facing) {
  if (flashHide) return;
  const down = (facing === 'down');
  // Resolve where each directional feature lives. For facing='up' the front
  // (hood, headlights, windshield) is at the TOP of the sprite (y - h/2),
  // for facing='down' it's at the BOTTOM (y + h/2). Same color palette either way.
  const frontEdgeY = down ? (y + h/2)     : (y - h/2);     // sprite-front Y
  const rearEdgeY  = down ? (y - h/2)     : (y + h/2);     // sprite-rear Y

  // Body — symmetric, direction-agnostic.
  ctx.fillStyle = dk;
  ctx.fillRect(x - w/2 - 1, y - h/2, w + 2, h);
  ctx.fillStyle = main;
  ctx.fillRect(x - w/2, y - h/2 + 2, w, h - 4);

  // Hood / front nose darker strip — sits at the front edge.
  ctx.fillStyle = dk;
  if (down) ctx.fillRect(x - w/2 + 2, y + h/2 - 8, w - 4, 6);
  else      ctx.fillRect(x - w/2 + 2, y - h/2 + 2, w - 4, 6);

  // Windshield (front of cabin, just behind the hood).
  ctx.fillStyle = '#0088ff';
  if (down) ctx.fillRect(x - w/2 + 4, y + h/2 - 10 - h * 0.30, w - 8, h * 0.30);
  else      ctx.fillRect(x - w/2 + 4, y - h/2 + 10, w - 8, h * 0.30);

  // Rear window.
  ctx.fillStyle = '#005588';
  if (down) ctx.fillRect(x - w/2 + 4, y - h/2 + 8, w - 8, 8);
  else      ctx.fillRect(x - w/2 + 4, y + h/2 - 16, w - 8, 8);

  // Roof highlight (centered — direction-agnostic).
  ctx.fillStyle = lt;
  ctx.fillRect(x - w/2 + 6, y - 2, w - 12, 6);

  // Headlights — yellow squares at the front edge of the car.
  ctx.fillStyle = '#ffffaa';
  if (down) {
    ctx.fillRect(x - w/2 + 3, y + h/2 - 4, 6, 3);
    ctx.fillRect(x + w/2 - 9, y + h/2 - 4, 6, 3);
  } else {
    ctx.fillRect(x - w/2 + 3, y - h/2 + 1, 6, 3);
    ctx.fillRect(x + w/2 - 9, y - h/2 + 1, 6, 3);
  }

  // Taillights — red squares at the rear edge of the car.
  ctx.fillStyle = '#ff3344';
  if (down) {
    ctx.fillRect(x - w/2 + 3, y - h/2 + 1, 6, 3);
    ctx.fillRect(x + w/2 - 9, y - h/2 + 1, 6, 3);
  } else {
    ctx.fillRect(x - w/2 + 3, y + h/2 - 4, 6, 3);
    ctx.fillRect(x + w/2 - 9, y + h/2 - 4, 6, 3);
  }

  // Wheels (sides) — symmetric pairs at the corners. Direction-agnostic.
  ctx.fillStyle = '#222';
  ctx.fillRect(x - w/2 - 2, y - h/2 + 8,  4, 12);
  ctx.fillRect(x + w/2 - 2, y - h/2 + 8,  4, 12);
  ctx.fillRect(x - w/2 - 2, y + h/2 - 20, 4, 12);
  ctx.fillRect(x + w/2 - 2, y + h/2 - 20, 4, 12);
}

function drawTruck(x, y, w, h, facing, base, mid, dk) {
  base = base || C_TRUCK;
  mid  = mid  || '#ddaa00';
  dk   = dk   || C_TRUCK_DK;
  // For facing='up' the cab is at the TOP (y - h/2), cargo box at the BOTTOM.
  // For facing='down' the cab is at the BOTTOM and the cargo box at the TOP.
  // Same color palette either way.
  const down = (facing === 'down');
  if (down) {
    // Cab outline + body (bottom 22px)
    ctx.fillStyle = dk;
    ctx.fillRect(x - w/2 - 1, y + h/2 - 22, w + 2, 22);
    ctx.fillStyle = mid;
    ctx.fillRect(x - w/2 + 4, y + h/2 - 20, w - 8, 18);
    // Windshield at the front of the cab (now at the bottom edge of cab)
    ctx.fillStyle = '#0088ff';
    ctx.fillRect(x - w/2 + 6, y + h/2 - 14, w - 12, 8);
    // Headlights at the front (very bottom)
    ctx.fillStyle = '#ffffaa';
    ctx.fillRect(x - w/2 + 4, y + h/2 - 4, 5, 3);
    ctx.fillRect(x + w/2 - 9, y + h/2 - 4, 5, 3);
    // Cargo box outline + body (now at the top)
    ctx.fillStyle = dk;
    ctx.fillRect(x - w/2 - 1, y - h/2, w + 2, h - 22);
    ctx.fillStyle = base;
    ctx.fillRect(x - w/2, y - h/2 + 2, w, h - 26);
    // Box ribs
    ctx.fillStyle = dk;
    for (let yy = y - h/2 + 6; yy < y + h/2 - 26; yy += 10) {
      ctx.fillRect(x - w/2 + 3, yy, w - 6, 1);
    }
    // Taillights at the rear (top edge of sprite)
    ctx.fillStyle = '#ff3344';
    ctx.fillRect(x - w/2 + 4, y - h/2 + 1, 5, 3);
    ctx.fillRect(x + w/2 - 9, y - h/2 + 1, 5, 3);
  } else {
    // Cab outline + body (top 22px)
    ctx.fillStyle = dk;
    ctx.fillRect(x - w/2 - 1, y - h/2, w + 2, 22);
    ctx.fillStyle = mid;
    ctx.fillRect(x - w/2 + 4, y - h/2 + 2, w - 8, 18);
    // Windshield at the front of the cab
    ctx.fillStyle = '#0088ff';
    ctx.fillRect(x - w/2 + 6, y - h/2 + 6, w - 12, 8);
    // Headlights at the front
    ctx.fillStyle = '#ffffaa';
    ctx.fillRect(x - w/2 + 4, y - h/2 + 1, 5, 3);
    ctx.fillRect(x + w/2 - 9, y - h/2 + 1, 5, 3);
    // Cargo box outline + body (rear)
    ctx.fillStyle = dk;
    ctx.fillRect(x - w/2 - 1, y - h/2 + 22, w + 2, h - 22);
    ctx.fillStyle = base;
    ctx.fillRect(x - w/2, y - h/2 + 24, w, h - 26);
    // Box ribs
    ctx.fillStyle = dk;
    for (let yy = y - h/2 + 32; yy < y + h/2 - 4; yy += 10) {
      ctx.fillRect(x - w/2 + 3, yy, w - 6, 1);
    }
    // Taillights at the rear (bottom)
    ctx.fillStyle = '#ff3344';
    ctx.fillRect(x - w/2 + 4, y + h/2 - 4, 5, 3);
    ctx.fillRect(x + w/2 - 9, y + h/2 - 4, 5, 3);
  }
  // Wheels (three axles: front, mid, rear) — symmetric pairs, direction-agnostic.
  ctx.fillStyle = '#111';
  ctx.fillRect(x - w/2 - 2, y - h/2 + 6,  4, 14);
  ctx.fillRect(x + w/2 - 2, y - h/2 + 6,  4, 14);
  ctx.fillRect(x - w/2 - 2, y - 6,         4, 14);
  ctx.fillRect(x + w/2 - 2, y - 6,         4, 14);
  ctx.fillRect(x - w/2 - 2, y + h/2 - 22,  4, 14);
  ctx.fillRect(x + w/2 - 2, y + h/2 - 22,  4, 14);
}

function drawFuelTruck(x, y, w, h) {
  // Top-down articulated tanker: short cab + hitched cylindrical tank trailer.
  // Faces UP. Cab and trailer are visually separated by a hitch gap.
  const CAB_H   = 24;
  const HITCH_H = 4;
  const tTop = y - h/2 + CAB_H + HITCH_H;   // tank starts below the hitch
  const tBot = y + h/2 - 2;

  // ── Cab (front truck) ──
  ctx.fillStyle = C_FUEL_DK;
  ctx.fillRect(x - w/2 - 1, y - h/2, w + 2, CAB_H);
  ctx.fillStyle = '#005522';                              // darker green cab roof
  ctx.fillRect(x - w/2 + 3, y - h/2 + 2, w - 6, CAB_H - 4);
  // Windshield (front of cab)
  ctx.fillStyle = '#0088ff';
  ctx.fillRect(x - w/2 + 6, y - h/2 + 5, w - 12, 8);
  // Cab roof grille / vent
  ctx.fillStyle = '#003311';
  ctx.fillRect(x - w/2 + 8, y - h/2 + 16, w - 16, 4);
  // Headlights
  ctx.fillStyle = '#ffffaa';
  ctx.fillRect(x - w/2 + 4, y - h/2 + 1, 5, 3);
  ctx.fillRect(x + w/2 - 9, y - h/2 + 1, 5, 3);
  // Cab side mirrors
  ctx.fillStyle = '#222';
  ctx.fillRect(x - w/2 - 3, y - h/2 + 8, 3, 4);
  ctx.fillRect(x + w/2,     y - h/2 + 8, 3, 4);
  // Cab front wheels
  ctx.fillStyle = '#111';
  ctx.fillRect(x - w/2 - 2, y - h/2 + 6,  4, 12);
  ctx.fillRect(x + w/2 - 2, y - h/2 + 6,  4, 12);

  // ── Hitch (small dark gap between cab and tank) ──
  ctx.fillStyle = '#1a0a08';
  ctx.fillRect(x - 6, y - h/2 + CAB_H, 12, HITCH_H);

  // ── Cylindrical tank trailer ──
  // Outer outline
  ctx.fillStyle = C_FUEL_DK;
  ctx.fillRect(x - w/2 - 1, tTop, w + 2, tBot - tTop);
  // Inner tank body
  ctx.fillStyle = C_FUEL;
  ctx.fillRect(x - w/2 + 2, tTop + 2, w - 4, tBot - tTop - 4);
  // Cylindrical-look horizontal shading bands (top of cylinder = highlight)
  ctx.fillStyle = C_FUEL_LT;
  ctx.fillRect(x - w/2 + 4, tTop + 4, w - 8, 2);
  ctx.fillRect(x - w/2 + 4, tTop + 8, w - 8, 1);
  // Endcap rim at top of trailer (where the dome end-cap would be)
  ctx.fillStyle = '#003322';
  ctx.fillRect(x - w/2 + 3, tTop + 1, w - 6, 2);
  // Chamber seams across the tank (3 hoops, suggesting baffles)
  ctx.fillStyle = C_FUEL_DK;
  const tankH = tBot - tTop;
  const hoop1 = tTop + tankH * 0.30;
  const hoop2 = tTop + tankH * 0.55;
  const hoop3 = tTop + tankH * 0.80;
  ctx.fillRect(x - w/2 - 1, hoop1, w + 2, 2);
  ctx.fillRect(x - w/2 - 1, hoop2, w + 2, 2);
  ctx.fillRect(x - w/2 - 1, hoop3, w + 2, 2);
  // Top dome-fill highlight near front of tank
  ctx.fillStyle = '#88ffaa';
  ctx.fillRect(x - 2, tTop + 5, 4, 2);
  // "F" label and small fuel-pump icon on the top of the tank
  ctx.fillStyle = '#ffee00';
  const labelY = tTop + tankH * 0.42;
  ctx.fillRect(x - 4, labelY,     7, 1);    // F top bar
  ctx.fillRect(x - 4, labelY,     1, 9);    // F vertical
  ctx.fillRect(x - 4, labelY + 4, 5, 1);    // F middle bar
  // Rear endcap rim
  ctx.fillStyle = '#003322';
  ctx.fillRect(x - w/2 + 3, tBot - 3, w - 6, 2);
  // Taillights at the very rear
  ctx.fillStyle = '#ff3344';
  ctx.fillRect(x - w/2 + 4, y + h/2 - 4, 5, 3);
  ctx.fillRect(x + w/2 - 9, y + h/2 - 4, 5, 3);

  // ── Trailer wheels (two axles toward the rear, double-wheel look) ──
  ctx.fillStyle = '#111';
  // Mid-trailer axle
  ctx.fillRect(x - w/2 - 3, y + 4,  4, 12);
  ctx.fillRect(x - w/2 - 3, y + 16, 4, 6);
  ctx.fillRect(x + w/2 - 1, y + 4,  4, 12);
  ctx.fillRect(x + w/2 - 1, y + 16, 4, 6);
  // Rear axle
  ctx.fillRect(x - w/2 - 3, y + h/2 - 22, 4, 14);
  ctx.fillRect(x + w/2 - 1, y + h/2 - 22, 4, 14);
}

// Bespoke top-down sprite for the player's 1970s Mustang-style fastback.
// Orange body, twin black Le Mans stripes, hood scoop, coke-bottle silhouette,
// quad headlights, sequential taillights. Sized for PLAYER_W=32, PLAYER_H=56.
function drawPlayerMustang(x, y, flashHide) {
  if (flashHide) return;
  const W = PLAYER_W, H = PLAYER_H;
  const left  = x - W / 2;
  const right = x + W / 2;
  const top   = y - H / 2;
  const bot   = y + H / 2;

  // Palette
  const BODY    = C_PLAYER;       // orange
  const BODY_LT = C_PLAYER_LT;    // highlight
  const BODY_DK = C_PLAYER_DK;    // shadow
  const STRIPE     = '#0a0a0a';   // near-black racing stripes
  const WINDSHIELD = '#3aa0ff';   // bright sky-blue front glass
  const REAR_GLASS = '#1a4878';   // darker tinted rear window
  const TAIL    = '#ff2848';      // taillight red
  const HEAD    = '#ffe98a';      // headlight yellow
  const CHROME  = '#cccccc';      // bumpers
  const TIRE    = '#0c0c0c';      // wheel-wells

  // Wheel-well slivers peeking out at four corners — wide-stance silhouette.
  ctx.fillStyle = TIRE;
  ctx.fillRect(left - 1,  top + 6,   2, 7); // front-left
  ctx.fillRect(right - 1, top + 6,   2, 7); // front-right
  ctx.fillRect(left - 1,  bot - 14,  2, 9); // rear-left
  ctx.fillRect(right - 1, bot - 14,  2, 9); // rear-right

  // Outline + main body fill.
  ctx.fillStyle = BODY_DK;
  ctx.fillRect(left, top + 1, W, H - 2);
  ctx.fillStyle = BODY;
  ctx.fillRect(left + 1, top + 2, W - 2, H - 4);

  // Coke-bottle pinch at the cabin (rows 22..40 are 1px narrower per side).
  ctx.fillStyle = BODY_DK;
  ctx.fillRect(left,      top + 22, 1, 18);
  ctx.fillRect(right - 1, top + 22, 1, 18);

  // Front bumper (chrome strip).
  ctx.fillStyle = CHROME;
  ctx.fillRect(left + 2, top, W - 4, 2);

  // Grille slot.
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(left + 6, top + 2, W - 12, 2);

  // Quad headlights — two per corner.
  ctx.fillStyle = HEAD;
  ctx.fillRect(left + 2,  top + 2, 3, 3);
  ctx.fillRect(right - 5, top + 2, 3, 3);
  ctx.fillStyle = '#fff9c0';
  ctx.fillRect(left + 2,  top + 3, 2, 1);
  ctx.fillRect(right - 4, top + 3, 2, 1);

  // Hood highlight (between the soon-to-be stripes and the hood edges).
  ctx.fillStyle = BODY_LT;
  ctx.fillRect(left + 2, top + 6, W - 4, 1);

  // Hood scoop — period-correct shaker-style raised vent in the center.
  ctx.fillStyle = BODY_DK;
  ctx.fillRect(x - 5, top + 9, 10, 11);
  ctx.fillStyle = '#1a0500';
  ctx.fillRect(x - 4, top + 11, 8, 7);

  // Twin Le Mans stripes — hood segment (drawn over scoop, period-correct).
  ctx.fillStyle = STRIPE;
  ctx.fillRect(x - 5, top + 4, 4, 18);
  ctx.fillRect(x + 1, top + 4, 4, 18);

  // Windshield — trapezoidal (raked back), bright sky-blue so it reads clearly
  // against the orange body. Top edge (front of car) narrower than bottom edge
  // for that 70s fastback rake. Glare highlight along the top edge.
  ctx.fillStyle = '#0a1a30';        // dark frame underneath for crisp edges
  ctx.fillRect(left + 3, top + 21, W - 6, 10);
  ctx.fillStyle = WINDSHIELD;
  ctx.fillRect(left + 6, top + 22, W - 12, 2);  // narrow top (front edge)
  ctx.fillRect(left + 5, top + 24, W - 10, 2);  // mid
  ctx.fillRect(left + 4, top + 26, W - 8,  4);  // wide bottom (cabin edge)
  // Glare highlight near the top of the windshield
  ctx.fillStyle = 'rgba(220,235,255,0.65)';
  ctx.fillRect(left + 7, top + 22, W - 14, 1);
  // Subtle wiper hint at the bottom of the windshield
  ctx.fillStyle = 'rgba(20,30,50,0.6)';
  ctx.fillRect(left + 6, top + 29, W - 12, 1);

  // Side mirrors — small bumps at the cabin start.
  ctx.fillStyle = BODY_DK;
  ctx.fillRect(left - 1,  top + 23, 2, 2);
  ctx.fillRect(right - 1, top + 23, 2, 2);

  // Roof (between windshield and rear window).
  ctx.fillStyle = BODY;
  ctx.fillRect(left + 4, top + 30, W - 8, 4);
  // Roof stripes.
  ctx.fillStyle = STRIPE;
  ctx.fillRect(x - 5, top + 30, 4, 4);
  ctx.fillRect(x + 1, top + 30, 4, 4);

  // Rear window — kept darker than the windshield (it's tinted, faces away).
  ctx.fillStyle = REAR_GLASS;
  ctx.fillRect(left + 4, top + 34, W - 8, 6);

  // Trunk highlight stripe across the rear deck.
  ctx.fillStyle = BODY_LT;
  ctx.fillRect(left + 3, top + 41, W - 6, 1);

  // Twin stripes — trunk segment.
  ctx.fillStyle = STRIPE;
  ctx.fillRect(x - 5, top + 40, 4, 12);
  ctx.fillRect(x + 1, top + 40, 4, 12);

  // Sequential taillights — three short red segments each side.
  ctx.fillStyle = TAIL;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(left + 2 + i * 3,  bot - 4, 2, 3);
    ctx.fillRect(right - 8 + i * 3, bot - 4, 2, 3);
  }
  // Center inset (gas-cap / brake bar).
  ctx.fillStyle = '#aa0020';
  ctx.fillRect(x - 2, bot - 4, 4, 2);

  // Rear bumper (chrome).
  ctx.fillStyle = CHROME;
  ctx.fillRect(left + 2, bot - 1, W - 4, 1);
}

function drawPlayer() {
  if (lives <= 0) return;
  const flash = invulnTimer > 0 && Math.floor(invulnTimer * 12) % 2 === 0;
  drawPlayerMustang(playerX, PLAYER_BASE_Y, flash);
  // Underglow (player only)
  if (!flash) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = C_PLAYER;
    ctx.fillRect(playerX - PLAYER_W/2 - 4, PLAYER_BASE_Y + PLAYER_H/2 - 2,
                 PLAYER_W + 8, 4);
    ctx.restore();
  }
}

function drawSlick(s) {
  ctx.save();
  ctx.fillStyle = C_SLICK;
  // Soft elliptical blob
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C_SLICK_HL;
  ctx.beginPath();
  ctx.ellipse(s.x - 4, s.y - 2, (s.w / 2) * 0.6, (s.h / 2) * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBullet(b) {
  // Hot yellow tracer with white core
  ctx.fillStyle = C_BULLET;
  ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(b.x - 1, b.y - b.h / 2 + 2, 2, b.h - 4);
}

function drawEnemyBullet(b) {
  // Red tracer with orange core, distinct from the player's yellow bullets.
  ctx.fillStyle = '#ff2244';
  ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  ctx.fillStyle = '#ffaa00';
  ctx.fillRect(b.x - 1, b.y - b.h / 2 + 2, 2, b.h - 4);
}

function drawExplosion(e) {
  const tf     = e.t / e.dur;
  const maxR   = e.big ? 36 : 18;
  const radius = maxR * Math.sqrt(tf);
  const count  = e.big ? 16 : 10;
  const colors = ['#ffffff', '#ffff66', '#ffaa00', '#ff4422', '#aa0033'];

  ctx.save();
  ctx.globalAlpha = 1 - tf;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const frac  = 0.5 + (i % 5) * 0.12;
    const dist  = radius * frac;
    const px    = Math.round(e.x + Math.cos(angle) * dist);
    const py    = Math.round(e.y + Math.sin(angle) * dist);
    const pSize = Math.max(2, (e.big ? 5 : 3) - Math.floor(tf * 3));
    ctx.fillStyle = colors[(i + Math.floor(tf * 3)) % colors.length];
    ctx.fillRect(px, py, pSize, pSize);
  }
  if (tf < 0.3) {
    const fc = Math.round(6 * (1 - tf / 0.3));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(e.x - fc, e.y - 2, fc * 2, 4);
    ctx.fillRect(e.x - 2,  e.y - fc, 4, fc * 2);
  }
  ctx.restore();
}

function drawLimo(t) {
  const x = t.x, y = t.y, w = t.w, h = t.h;
  // Outer outline
  ctx.fillStyle = '#000';
  ctx.fillRect(x - w/2 - 1, y - h/2 - 1, w + 2, h + 2);
  // Base body
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x - w/2, y - h/2, w, h);
  // Inner highlight band along the long axis
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(x - w/2 + 4, y - h/2 + 4, w - 8, h - 8);

  // Gold trim lines (inset 3px from each long side)
  ctx.fillStyle = '#d4a83a';
  ctx.fillRect(x - w/2 + 3, y - h/2 + 6, 1, h - 12);
  ctx.fillRect(x + w/2 - 4, y - h/2 + 6, 1, h - 12);

  // 3 dark-tinted windows (~32x22 each) spaced along the body
  const winW = 32, winH = 22;
  const winX = x - winW/2;
  ctx.fillStyle = '#1a2434';
  // front passenger window
  ctx.fillRect(winX, y - h/2 + 18, winW, winH);
  // middle window
  ctx.fillRect(winX, y - 11,       winW, winH);
  // rear VIP window (with delivery-zone glow overlay)
  const rearY = y + h/2 - 18 - winH;
  ctx.fillRect(winX, rearY, winW, winH);

  // VIP antenna dot — 2x2 magenta-pink pixel near the front
  ctx.fillStyle = '#ff66ff';
  ctx.fillRect(x - 1, y - h/2 + 5, 2, 2);

  // Taillights — subdued dark red so they don't read as a regular hazard
  ctx.fillStyle = '#660018';
  ctx.fillRect(x - w/2 + 4, y + h/2 - 4, 6, 3);
  ctx.fillRect(x + w/2 - 10, y + h/2 - 4, 6, 3);

  // 4 wheel pairs along the length (black tires, chrome rim hl)
  const wheelYs = [y - h/2 + 12, y - h/2 + h * 0.38, y - h/2 + h * 0.62, y + h/2 - 22];
  for (const wy of wheelYs) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x - w/2 - 2, wy, 4, 12);
    ctx.fillRect(x + w/2 - 2, wy, 4, 12);
    ctx.fillStyle = '#888';
    ctx.fillRect(x - w/2 - 1, wy + 4, 2, 1);
    ctx.fillRect(x + w/2 - 1, wy + 4, 2, 1);
  }

  // Delivery-zone glow on the rear window + under-glow rect
  const glow = t.deliveryGlow || 0;
  if (glow > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(0,255,255,${0.2 + 0.6 * glow})`;
    ctx.fillRect(winX, rearY, winW, winH);
    ctx.globalAlpha = 0.35 * glow;
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(x - w/2 - 4, y + h/2 - 6, w + 8, 6);
    ctx.restore();
  }
}

function drawTrafficEntity(t) {
  const facing = (t.dir === 'opp') ? 'down' : 'up';
  if      (t.kind === 'enemy') drawCar(t.x, t.y, t.w, t.h, C_ENEMY, C_ENEMY_LT, C_ENEMY_DK, false, facing);
  else if (t.kind === 'civ')   drawCar(t.x, t.y, t.w, t.h,
                                       t.tint   || C_CIV,
                                       t.tintLt || C_CIV_LT,
                                       t.tintDk || C_CIV_DK,
                                       false, facing);
  else if (t.kind === 'truck') drawTruck(t.x, t.y, t.w, t.h, facing,
                                         t.tint, t.tintMid, t.tintDk);
  else if (t.kind === 'fuel')  drawFuelTruck(t.x, t.y, t.w, t.h);
  else if (t.kind === 'limo')  drawLimo(t);
}

// Visual link between the tanker's rear bumper and the player's front bumper
// while refueling: yellow fuel hose + a few flickering green sparks.
function drawFuelHose(t) {
  const tx          = t.x;
  const tankerRear  = t.y + t.h / 2;
  const playerFront = PLAYER_BASE_Y - PLAYER_H / 2;
  const span        = playerFront - tankerRear;
  if (span <= 0) return;                 // overlapping — no visible hose
  ctx.save();
  // Hose body
  ctx.shadowColor = '#ffee00';
  ctx.shadowBlur  = 6;
  ctx.fillStyle   = '#ffee00';
  ctx.fillRect(tx - 1, tankerRear, 2, span);
  // End couplings (tanker side + player side)
  ctx.fillRect(tx - 3, tankerRear - 1, 6, 2);
  ctx.fillRect(tx - 3, playerFront - 1, 6, 2);
  // Sparks along the hose
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur  = 5;
  ctx.fillStyle   = '#aaffcc';
  for (let i = 0; i < 4; i++) {
    const sy = tankerRear + Math.random() * span;
    const sx = tx - 3 + Math.random() * 6;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.restore();
}

// Side-anchored handover link between the player's car and the limo while the
// player is alongside in the delivery zone. Magenta when in geometric range
// only, brighter cyan-tinged when speed-matching too (delivery in progress).
function drawParcelHandshake(limo, side, active) {
  const py    = PLAYER_BASE_Y;
  const halfP = PLAYER_W / 2;
  const halfL = limo.w / 2;
  let x1, x2;
  if (side > 0) {
    x1 = playerX + halfP;
    x2 = limo.x  - halfL;
  } else {
    x1 = limo.x  + halfL;
    x2 = playerX - halfP;
  }
  const span = x2 - x1;
  if (span <= 0) return;

  ctx.save();
  const bandColor   = active ? '#00ffff' : '#ff44ff';
  const sparkColor  = active ? '#aaffff' : '#ffccff';
  const sparkGlow   = active ? '#88ddff' : '#ffaaff';

  // Band: horizontal strip between bumpers
  ctx.shadowColor = bandColor;
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = bandColor;
  ctx.fillRect(x1, py - 1, span, 2);
  // End couplings
  ctx.fillRect(x1,         py - 3, 2, 6);
  ctx.fillRect(x2 - 2,     py - 3, 2, 6);

  // Sparks scattered along the link
  ctx.shadowColor = sparkGlow;
  ctx.shadowBlur  = 5;
  ctx.fillStyle   = sparkColor;
  for (let i = 0; i < 4; i++) {
    const sx = x1 + Math.random() * span;
    const sy = py - 2 + Math.random() * 5;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.restore();
}

function drawStealingFuelStatus() {
  // Centered toward the bottom of the play field, pulsing green.
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 140);
  ctx.save();
  ctx.font = '12px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const txt = '★ STEALING FUEL ★';
  const yPos = LH - 28;
  // Soft backdrop
  const w = ctx.measureText(txt).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(LW / 2 - w / 2, yPos - 12, w, 24);
  // Text
  ctx.fillStyle = `rgba(0,255,68,${pulse})`;
  ctx.shadowColor = '#00ff44';
  ctx.shadowBlur  = 12;
  ctx.fillText(txt, LW / 2, yPos);
  ctx.restore();
}

// Centered, full-width text banner with a dark backdrop for legibility.
// `color` is the primary (title) color, `subtext` renders below in cyan/white.
function drawCanvasBanner(title, color, subtext) {
  ctx.save();
  // Backdrop strip across the screen
  const stripH = subtext ? 110 : 80;
  const stripY = (LH - stripH) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, stripY, LW, stripH);
  ctx.fillStyle = 'rgba(255,0,255,0.25)';
  ctx.fillRect(0, stripY, LW, 2);
  ctx.fillRect(0, stripY + stripH - 2, LW, 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '20px "Press Start 2P", monospace';
  ctx.shadowColor = color;
  ctx.shadowBlur  = 14;
  ctx.fillStyle   = color;
  ctx.fillText(title, LW / 2, LH / 2 - (subtext ? 14 : 0));

  if (subtext) {
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(subtext, LW / 2, LH / 2 + 22);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, LW, LH);
  drawRoad();
  for (let i = 0; i < MAX_SLICKS; i++)  if (slicks[i].alive)  drawSlick(slicks[i]);
  for (let i = 0; i < MAX_TRAFFIC; i++) if (traffic[i].alive) drawTrafficEntity(traffic[i]);
  for (let i = 0; i < BULLET_POOL_SIZE;  i++) if (bullets[i].alive)      drawBullet(bullets[i]);
  for (let i = 0; i < MAX_ENEMY_BULLETS; i++) if (enemyBullets[i].alive) drawEnemyBullet(enemyBullets[i]);
  drawPlayer();
  if (refuelHoseTanker && refuelHoseTanker.alive) drawFuelHose(refuelHoseTanker);
  if (parcelHandshakeLimo && parcelHandshakeLimo.alive) {
    drawParcelHandshake(parcelHandshakeLimo, parcelHandshakeSide, parcelHandshakeActive);
  }
  for (let i = 0; i < MAX_EXPLO; i++) if (explosions[i].alive) drawExplosion(explosions[i]);
  if (stealingFuel && gameState === 'playing') drawStealingFuelStatus();

  // ── Phase banners ──
  if (stagePhase === 'LIMO_INCOMING') {
    drawCanvasBanner('LIMO INCOMING', '#ff00ff', 'MATCH SPEED TO DELIVER');
  } else if (stagePhase === 'DELIVERED') {
    const title = 'STAGE ' + (stageIndex + 1) + ' COMPLETE  +' + stageDeliveredBonus;
    const sub   = 'TIME BONUS  +' + stageDeliveredTimeBonus;
    drawCanvasBanner(title, '#ff00ff', sub);
  } else if (stagePhase === 'STAGE_FAILED') {
    drawCanvasBanner('STAGE FAILED — RESTARTING', '#ff3366', stageFailedReason);
  } else if (stagePhase === 'DRIVING' && hurryUpBannerTimer > 0) {
    drawCanvasBanner('HURRY UP!', '#ff6600', 'DELIVERY TIMER STARTED');
  } else if (stagePhase === 'DRIVING' && stageStartBannerTimer > 0) {
    drawCanvasBanner('STAGE ' + (stageIndex + 1), '#ff00ff', null);
  }
}

// ── Game loop ──────────────────────────────────────────────────
let lastTs = 0;
function loop(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
  lastTs = ts;
  if (gameState === 'playing') { update(dt); draw(); }
  else if (gameState === 'paused' || gameState === 'gameover') draw();
  requestAnimationFrame(loop);
}

// ── Keyboard ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (gameState === 'playing') {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' ||
        k === 'ArrowUp'   || k === 'ArrowDown'  ||
        k === ' ' || k === 'Spacebar' ||
        k === 'p' || k === 'P') {
      e.preventDefault();
    }
    if (k === ' ' || k === 'Spacebar') fire();
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (gameState === 'playing') {
      gameState = 'paused';
      NeonArcade.stopMusic();
      engineStop();
      stopCountdownSfx();
      showOverlay('overlay-pause');
    } else if (gameState === 'paused') {
      gameState = 'playing';
      NeonArcade.startMusic();
      engineStart();
      engineSetState('drive');
      hideOverlays();
    }
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// ── Fullscreen (mobile) ────────────────────────────────────────
function tryFullscreen() {
  if (navigator.maxTouchPoints > 0 && !document.fullscreenElement)
    document.documentElement.requestFullscreen?.().catch(() => {});
}

// ── Button wiring ──────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click',           () => { tryFullscreen(); startGame(); });
document.getElementById('btn-play-again').addEventListener('click',      () => { tryFullscreen(); startGame(); });
document.getElementById('btn-gameover-restart').addEventListener('click', () => { tryFullscreen(); startGame(); });
document.getElementById('btn-resume').addEventListener('click', () => {
  if (gameState !== 'paused') return;
  gameState = 'playing'; NeonArcade.startMusic(); engineStart(); engineSetState('drive'); hideOverlays();
});
document.getElementById('btn-pause').addEventListener('click', () => {
  if (gameState === 'playing') {
    gameState = 'paused'; NeonArcade.stopMusic(); engineStop(); stopCountdownSfx(); showOverlay('overlay-pause');
  } else if (gameState === 'paused') {
    gameState = 'playing'; NeonArcade.startMusic(); engineStart(); engineSetState('drive'); hideOverlays();
  }
});

// ── Music toggle ───────────────────────────────────────────────
const musicBtn = document.getElementById('music-toggle');
musicBtn.addEventListener('click', () => {
  const { track, name } = NeonArcade.cycleTrack();
  musicBtn.textContent = '♪ ' + name;
  musicBtn.classList.toggle('muted', track === 0);
});
const musicMuteBtn = document.getElementById('music-mute');
musicMuteBtn.addEventListener('click', () => {
  const { on } = NeonArcade.toggleMusic();
  musicMuteBtn.textContent = on ? 'Music: ON' : 'Music: OFF';
  musicMuteBtn.classList.toggle('off', !on);
});

// ── Mobile touch controls ──────────────────────────────────────
(function () {
  if (!navigator.maxTouchPoints) return;

  document.body.classList.add('is-mobile');
  document.getElementById('mobile-dpad').style.display      = 'flex';
  document.getElementById('mobile-fire-wrap').style.display = 'flex';

  // Virtual joystick — both axes live simultaneously (steering + throttle).
  // Low threshold so subtle leans register, matching the old SWIPE_MIN=14 feel.
  new NeonArcade.VirtualJoystick({
    base: document.getElementById('joystick'),
    knob: document.getElementById('joystick-knob'),
    deadzone: 0.12,
    onChange: ({ x, y, magnitude }) => {
      if (magnitude === 0) {
        keys['ArrowLeft'] = keys['ArrowRight'] = false;
        keys['ArrowUp']   = keys['ArrowDown']  = false;
        return;
      }
      keys['ArrowLeft']  = x < -0.18;
      keys['ArrowRight'] = x >  0.18;
      keys['ArrowUp']    = y < -0.25;
      keys['ArrowDown']  = y >  0.25;
    }
  });

  // ── Fire button (hold to fire continuously via fireCooldown gating) ──
  const fireBtn = document.getElementById('btn-fire-touch');

  fireBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    fireBtn.classList.add('pressed');
    keys[' '] = true;
    fire();
  }, { passive: false });
  fireBtn.addEventListener('touchend', () => {
    fireBtn.classList.remove('pressed');
    keys[' '] = false;
  }, { passive: true });
  fireBtn.addEventListener('touchcancel', () => {
    fireBtn.classList.remove('pressed');
    keys[' '] = false;
  }, { passive: true });
})();

// ── Init ───────────────────────────────────────────────────────
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
updateHUD();
NeonArcade.setCycleTracks([1, 2, 3, 4, 5, 6]);   // include OVERDRIVE in the cycle for this game
NeonArcade.setTrack(6);   // OVERDRIVE
requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
