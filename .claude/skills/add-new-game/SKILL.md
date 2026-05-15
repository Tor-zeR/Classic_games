---
name: add-new-game
description: Scaffolding checklist for adding a new game folder to the Neon Arcade project. Use when the user asks to "add a new game", "create a new game", "scaffold a game", or starts building a game in a fresh subdirectory.
---

# Adding a new game

Follow this checklist when creating a new game under the Neon Arcade project.

1. Create `<game>/index.html` — copy the topbar / overlay / touch-controls structure from an existing game of the same orientation type (portrait: `tetris/` or `pac-man/`; landscape: `xonix/`, `snake/`, `berzerk/`, `paratrooper/`, `lode-runner/`).
2. Load `../css/style.css`, then `../js/common.js`, then any game-specific files.
3. In the page load handler, call `NeonArcade.setTrack(n)` before wiring up the music button. Tracks: `0`=off, `1`=CHIP, `2`=SYNTH, `3`=8BIT, `4`=DUNGEON.
4. Call `NeonArcade.startMusic()` on game start (user gesture), `stopMusic()` on pause/gameover/level-clear, `startMusic()` again on resume/next-level.
5. Add the rotate-prompt HTML and the appropriate CSS media query trigger:
   - Landscape games: show `.rotate-prompt` via `@media (orientation: portrait)` and hide `.page`.
   - Portrait games + landing page: show prompt via `@media (orientation: landscape) and (max-height: 640px)`.
6. For landscape games: set `body.is-mobile` in JS when a touch device is detected, implement fullscreen with `.catch(() => {})` (see the mobile-touch-controls skill), add D-pad HTML in the left side-panel, fire button in the right panel.
7. Add a card to the landing page `index.html` with the appropriate `card-<name>` class — define its accent color in the CSS variable block and the per-card rules (`.card-<name>`, hover, `.game-title`, `.play-tag`).
8. Add a disclaimer footer: `<p class="disclaimer">Fan-made tribute · Not affiliated with or endorsed by any original game publisher</p>`.

## Trademark-safe display names

Folder/URL names are unchanged; player-facing titles are renamed.

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

When adding a new game, choose a fresh trademark-safe display name even if the folder reuses a recognisable arcade title.

## Aesthetic conventions

- Font: "Press Start 2P" (Google Fonts CDN, declared in both `style.css` and each game's `index.html`).
- Per-game accent color: use the shared CSS variables — `--cyan`, `--magenta`, `--green`, `--yellow`, `--orange`, `--pink`, `--blue`, `--red`, `--purple`, `--white` — and apply them via the game's own CSS, not by overriding `style.css`.
- CRT effect: scanlines + vignette are already global via `body::before` / `body::after` in `style.css` — don't re-implement.
