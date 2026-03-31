# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

No build step. Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# then visit http://localhost:3000
```

## Deploying

Hosted as an Azure Static Web App (free tier). Merging to `main` auto-deploys via GitHub Actions. For manual deploy:

```bash
cd /tmp && swa deploy \
  --app-location /Users/dzmitryalenikau/Classic_games \
  --deployment-token "$AZURE_SWA_TOKEN" \
  --env production

# URL: https://classicarcade.win
# Resource group: classic-arcade-rg (eastus2)
# Token: stored in GitHub Actions secrets (AZURE_STATIC_WEB_APPS_API_TOKEN)
#         and Azure portal → Static Web App → Manage deployment token
```

Git branches: `main` (production) and `dev` (work in progress). **Never push directly to `main`** — a pre-tool hook blocks it. Always push to `dev` and open a PR. Merging to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`) which auto-deploys to Azure SWA.

## Architecture

Vanilla HTML5/CSS3/JS — no framework, no bundler, no package manager.

### File Layout

```
Classic_games/
├── index.html          ← Landing page (synthwave canvas bg, game cards)
├── css/style.css       ← Global theme: CSS variables, CRT scanlines, neon glow, animations
├── js/common.js        ← Shared audio engine (music scheduler + SFX), exposed as window.NeonArcade
├── tetris/             ← Cyan theme, CHIP music (track 1), portrait orientation
├── pac-man/            ← Yellow theme, 8BIT music (track 3), portrait orientation
├── xonix/              ← Magenta theme, SYNTH music (track 2), landscape orientation
├── space-invaders/     ← Green theme, CHIP music (track 1), landscape orientation
├── snake/              ← Orange theme, CHIP music (track 1), landscape orientation
├── berzerk/            ← Purple/green theme, 8BIT music (track 3), landscape orientation
├── paratrooper/        ← Cyan theme, PATRIOT music, landscape orientation
└── lode-runner/        ← Red theme, DUNGEON music (track 4), landscape orientation
```

Each game folder contains `index.html`, a game-specific `.css`, and one or more `.js` files. Every game page loads `../css/style.css` and `../js/common.js` before its own scripts.

### Audio System (`js/common.js`)

Exposes `window.NeonArcade` with:
- `setTrack(n)` — set default track before calling `startMusic()`. Tracks: `0`=off, `1`=CHIP, `2`=SYNTH, `3`=8BIT, `4`=DUNGEON.
- `startMusic()` / `stopMusic()` / `cycleTrack()` — playback control. `cycleTrack()` returns `{ track, name }` for updating the button label.
- `getAudioCtx()` / `getMasterBus()` — for game-specific SFX that need direct Web Audio access.
- `SFX` object — shared sound effects callable from any game (e.g. `NeonArcade.SFX.levelUp()`).

The scheduler uses a 25ms poll / 130ms lookahead pattern. Music must be started from a user gesture (browser autoplay policy). Games call `startMusic()` on the start button click, `stopMusic()` on game-over/pause/level-clear, and `startMusic()` again on resume/next-level.

Track data and `_sched*` functions live inside `common.js` alongside the scheduler engine. Drum primitives (`_kick`, `_snare`, `_hihat`, `_bass`, `_lead`, `_pad`) and tone helpers (`_toneAt`, `playTone`) are also in `common.js` and are used by both music tracks and SFX.

### Game Loop Pattern

All games use `requestAnimationFrame` + delta-time. State machine: `start` → `playing` → `paused` / `gameover` / `levelclear` → restart. Overlays are toggled via a `hidden` CSS class.

### Aesthetic Conventions

- **Font**: "Press Start 2P" (Google Fonts CDN, declared in both `style.css` and each game's `index.html`).
- **CSS variables** (defined in `style.css`): `--cyan`, `--magenta`, `--green`, `--yellow`, `--orange`, `--pink`, `--blue`, `--red`, `--purple`, `--white`, `--bg`, `--font`.
- **CRT effect**: scanlines + vignette via `body::before` / `body::after` in `style.css`.
- **Per-game accent color**: set via the game's own CSS using the shared variable.
- **Music button**: every game page has `<button class="music-btn" id="music-toggle">` in the topbar. The JS wires it to `cycleTrack()` and updates the label to `♪ <NAME>`.

### Mobile / Touch Controls

**`body.is-mobile` class** — set by JS early in landscape games when a touch device is detected. Used to conditionally apply CSS rules (show D-pad, adjust layout, hide desktop hints). Portrait games (tetris, pac-man) do not use this class; they use `@media (pointer: coarse)` instead.

**D-pad HTML structure** (landscape games, in left side-panel):
```html
<div class="mobile-dpad" id="mobile-dpad">
  <div class="mobile-ctrl-hint">TOUCH &amp; SWIPE</div>
  <div class="dpad-cross" id="dpad-cross">
    <!-- 3×3 grid: empty / up / empty / left / mid / right / empty / down / empty -->
  </div>
</div>
```
Fire button goes in the right panel inside `<div class="mobile-fire-wrap">`.

**Swipe gesture on D-pad**: `touchmove` on `#dpad-cross` with a minimum swipe threshold (`SWIPE_MIN=18px`). Axis with larger delta wins (4-directional). Berzerk uses 8-directional (diagonal cells included).

**Fullscreen**: landscape games request fullscreen on the first user gesture using:
```js
const _doFS = () => {
  if (!document.fullscreenElement)
    document.documentElement.requestFullscreen?.().catch(() => {});
};
document.addEventListener('touchstart', _doFS, { once: true, passive: true });
document.addEventListener('click',      _doFS, { once: true });
```
Always use `.catch(() => {})` — never `try/catch` — because `requestFullscreen` returns a Promise.

**Hide controls on start screen** (CSS `:has()` pattern):
```css
body.is-mobile:has(#overlay-start:not(.hidden)) .mobile-dpad,
body.is-mobile:has(#overlay-start:not(.hidden)) .mobile-fire-wrap { display: none !important; }
body.is-mobile .canvas-wrapper:has(#overlay-start:not(.hidden)) .canvas-glow { display: none; }
```

**Desktop / mobile hint split** in overlay-start:
```html
<div class="overlay-sub desktop-hints">keyboard instructions</div>
<div class="overlay-sub mobile-hints">touch instructions</div>
<div class="fullscreen-note mobile-hints">⛶ GAME RUNS IN FULL SCREEN</div>
```
CSS: `.mobile-hints { display: none; }` by default; toggled via `body.is-mobile` (landscape) or `@media (pointer: coarse)` (portrait).

**Lode Runner** has a unique layout: side panels are `position: absolute` with `width: 130px`, and the canvas-wrapper uses `margin: 0 130px` to prevent overlap. The right panel contains dig buttons (`#btn-digl-touch`, `#btn-digr-touch`) instead of a fire button.

### Orientation Prompts

- **Landscape games**: show `.rotate-prompt` via `@media (orientation: portrait)` — hides `.page`.
- **Portrait games** (tetris, pac-man) and **landing page**: show prompt via `@media (orientation: landscape) and (max-height: 640px)`.

### Adding a New Game

1. Create `<game>/index.html` — copy topbar/overlay/touch-controls structure from an existing game of the same orientation type.
2. Load `../css/style.css`, `../js/common.js`, then game-specific files.
3. Call `NeonArcade.setTrack(n)` in the `load` event handler before wiring the music button.
4. Call `NeonArcade.startMusic()` on game start (user gesture), `stopMusic()` on pause/gameover.
5. Add the rotate-prompt HTML and appropriate CSS media query trigger.
6. For landscape games: set `body.is-mobile` in JS, implement fullscreen with `.catch(() => {})`, add D-pad HTML and `body.is-mobile` CSS rules.
7. Add a card to the landing page `index.html` with the appropriate `card-<name>` class.
8. Add a disclaimer footer: `<p class="disclaimer">Fan-made tribute · Not affiliated with or endorsed by any original game publisher</p>`.

### Game Names (Trademark-Safe)

Folder/URL names are unchanged; all player-facing titles are renamed:

| Folder | Display Name |
|--------|-------------|
| tetris/ | TETRIX |
| pac-man/ | CHOMP |
| xonix/ | TERRITORY |
| space-invaders/ | ALIEN WAVE |
| snake/ | NEON SERPENT |
| berzerk/ | ROBO MAZE |
| paratrooper/ | AIRBORNE |
| lode-runner/ | GOLD RUSH |

### Adding SFX (`js/common.js`)

Add new SFX to the `SFX` object inside `common.js`. Two patterns:

**`scheduleNotes(notes)`** — for melodic/rhythmic sequences:
```js
berzerkRoomEnter() {
  scheduleNotes([
    { freq: 220, start: 0,    dur: 0.07, opts: { type: 'square', vol: 0.18 } },
    { freq: 440, start: 0.16, dur: 0.12, opts: { type: 'square', vol: 0.22 } },
  ]);
},
```

**Direct Web Audio** — for continuous effects (LFO vibrato, envelopes):
```js
berzerkBrotto() {
  const ctx = getAudioCtx(), bus = getMasterBus();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  // wire osc → gain → bus, set AudioParams, call osc.start/stop
},
```

**`playTone(freq, dur, opts)`** — for single quick tones (`opts`: `type`, `vol`).

Call SFX with optional chaining to guard against missing entries: `NeonArcade.SFX.mySound?.()`.
Internal SFX names do not need to match player-facing game names (e.g. `berzerkOtto` remains the internal name even though the character is called "Brotto" in the UI).
