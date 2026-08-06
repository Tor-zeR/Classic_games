# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For task-specific guidance, see the skills under `.claude/skills/`:
- **add-new-game** — scaffolding a new game folder, trademark-safe naming, aesthetic checklist.
- **add-sfx** — sound-effect patterns in `js/common.js`.
- **mobile-touch-controls** — D-pad, swipe, fullscreen, `body.is-mobile`, orientation prompts.
- **deploy-manual** — manual Azure SWA deploy.
- **pr-description** — composing PR titles and descriptions for this repo.
- **test-project** — Playwright + static-check sweep on one game or the whole project; outputs a punch list of suggested fixes.

## Running the Project

No build step. Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# then visit http://localhost:3000
```

## Branches

`main` is production, `dev` is work in progress. **Never push directly to `main`** — a pre-tool hook in `.claude/settings.local.json` blocks it. Always push to `dev` and open a PR. Merging to `main` triggers `.github/workflows/deploy.yml`, which auto-deploys to Azure SWA at https://classicarcade.win.

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
├── xonix/              ← White theme, SYNTH music (track 2), landscape orientation
├── space-invaders/     ← Green theme, CHIP music (track 1), landscape orientation
├── snake/              ← Orange theme, CHIP music (track 1), landscape orientation
├── berzerk/            ← Purple/green theme, 8BIT music (track 3), landscape orientation
├── paratrooper/        ← Cyan theme, PATRIOT music, landscape orientation
├── lode-runner/        ← Red theme, DUNGEON music (track 4), landscape orientation
├── highway/            ← Magenta theme, SYNTH music (track 2), landscape orientation
└── arkanoid/           ← Blue theme, CHIP music (track 1), portrait orientation
```

Each game folder contains `index.html`, a game-specific `.css`, and one or more `.js` files. Every game page loads `../css/style.css` and `../js/common.js` before its own scripts.

### Audio System (`js/common.js`)

Exposes `window.NeonArcade` with:
- `setTrack(n)` — set default track before calling `startMusic()`. Tracks: `0`=off, `1`=CHIP, `2`=SYNTH, `3`=8BIT, `4`=DUNGEON.
- `startMusic()` / `stopMusic()` / `cycleTrack()` — playback control. `cycleTrack()` returns `{ track, name }` for updating the button label.
- `getAudioCtx()` / `getMasterBus()` — for game-specific SFX that need direct Web Audio access.
- `SFX` object — shared sound effects callable from any game (e.g. `NeonArcade.SFX.levelUp()`).

Music must start from a user gesture (browser autoplay policy). Games call `startMusic()` on the start-button click, `stopMusic()` on game-over/pause/level-clear, and `startMusic()` again on resume/next-level. For scheduler internals, drum primitives, and tone helpers, see the `add-sfx` skill or read `common.js` directly.

### Game Loop Pattern

All games use `requestAnimationFrame` + delta-time. State machine: `start` → `playing` → `paused` / `gameover` / `levelclear` → restart. Overlays are toggled via a `hidden` CSS class.

### Aesthetic Conventions

- **Font**: "Press Start 2P" (Google Fonts CDN, declared in both `style.css` and each game's `index.html`).
- **CSS variables** (defined in `style.css`): `--cyan`, `--magenta`, `--green`, `--yellow`, `--orange`, `--pink`, `--blue`, `--red`, `--purple`, `--white`, `--bg`, `--font`.
- **CRT effect**: scanlines + vignette via `body::before` / `body::after` in `style.css`.
- **Per-game accent color**: set via the game's own CSS using the shared variable.
- **Music button**: every game page has `<button class="music-mute-btn" id="music-mute">` in the topbar. The JS wires it to `toggleMusic()` (Music: ON / Music: OFF).
- **BIOS Loading Screen**: when adding a new game, add its display name to the POST animation sequence under `Loading Game Cartridges:` in `index.html` and update the `N CARTRIDGES READY.` counter.

## Game Names (Trademark-Safe)

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
| highway/ | HIGHWAY DELIVERY |
| arkanoid/ | BLOCK'N'BALL |
