# Architecture

## Tech Stack

- **Vanilla HTML5 / CSS3 / JavaScript** — no framework, no bundler, no package manager
- **Canvas API** — all games render to `<canvas>`
- **Web Audio API** — music scheduler + SFX via `js/common.js`
- **Google Fonts CDN** — "Press Start 2P" pixel font
- **Azure Static Web Apps** (free tier) — hosting
- **GitHub Actions** — CI/CD, auto-deploy on push to `main`

---

## File Layout

```
Classic_games/
├── index.html              ← Landing page
├── about/                  ← Dedicated About / Mission page
├── css/style.css           ← Global theme (CSS variables, CRT scanlines, neon glow, high scores modal)
├── js/common.js            ← Shared audio engine & high scores system (window.NeonArcade)
├── staticwebapp.config.json← Azure SWA config (headers, MIME types, cache)
├── sw.js                   ← PWA Service Worker (offline asset caching)
├── sitemap.xml
├── robots.txt
├── og-image.jpg            ← Landing page OG preview image (1200×630)
├── tetris/
├── pac-man/
├── xonix/
├── space-invaders/
├── snake/
├── berzerk/
├── paratrooper/
├── lode-runner/
└── highway/
```

Each game folder contains `index.html`, a game-specific `.css`, one or more `.js` files, and `og-image.jpg`.

---

## Shared Libraries (`js/common.js`)

Exposes `window.NeonArcade` containing:
- **Audio Sequencer & SFX Engine**: Web Audio music scheduler (CHIP, SYNTH, 8BIT, DUNGEON, PATRIOT, OVERDRIVE) + sound effects.
- **Local High Score System (`NeonArcade.HighScore`)**: Manages Top 5 local leaderboards, 3-letter initials arcade prompt modal, pre-filled retro bot scores, legacy scalar migration, and score board UI.

---

## Game Loop Pattern

All games use `requestAnimationFrame` + delta-time.

**State machine:** `start` → `playing` → `paused` / `gameover` / `levelclear` → restart

Overlays are toggled via a `hidden` CSS class.

---

## CSS Variables

Defined in `css/style.css` and available globally:

| Variable | Color |
|----------|-------|
| `--cyan` | `#00ffff` |
| `--magenta` | `#ff00aa` |
| `--green` | `#00ff55` |
| `--yellow` | `#ffe600` |
| `--orange` | `#ff7700` |
| `--pink` | `#ff44aa` |
| `--blue` | `#0044ff` |
| `--red` | `#ff2244` |
| `--purple` | `#cc00ff` |
| `--white` | `#ffffff` |
| `--bg` | `#0d0d0d` |
| `--font` | `'Press Start 2P'` |

---

## Adding a New Game

1. Create `<game>/index.html` — copy topbar/overlay/touch-controls from an existing game of the same orientation
2. Load `../css/style.css`, `../js/common.js`, then game-specific files
3. Call `NeonArcade.setTrack(n)` in the `load` event handler
4. Call `NeonArcade.startMusic()` on game start, `stopMusic()` on pause/gameover
5. Add rotate-prompt HTML + media query
6. For landscape games: set `body.is-mobile`, implement fullscreen, add D-pad HTML
7. Add a card to `index.html` with the appropriate `card-<name>` class
