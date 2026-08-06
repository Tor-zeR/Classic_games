# NEON ARCADE

A collection of 10 classic arcade games reimagined with a synthwave neon aesthetic. Built with vanilla HTML5/CSS3/JS — no frameworks, no build step, no dependencies.

![Landing page with synthwave background, animated stars, and neon game cards]

## Games

| Game | Theme | Orientation | Music |
|------|-------|-------------|-------|
| **TETRIX** | Cyan | Portrait | CHIP |
| **CHOMP** | Yellow | Portrait | 8BIT |
| **ALIEN WAVE** | Green | Landscape | CHIP |
| **NEON SERPENT** | Orange | Landscape | CHIP |
| **TERRITORY** | Magenta | Landscape | SYNTH |
| **ROBO MAZE** | Purple | Landscape | 8BIT |
| **GOLD RUSH** | Red | Landscape | DUNGEON |
| **AIRBORNE** | Cyan | Landscape | PATRIOT |
| **HIGHWAY DELIVERY** | Magenta | Landscape | SYNTH |
| **BLOCK'N'BALL** | Blue | Portrait | CHIP |

### TETRIX
Stack falling tetrominoes and clear lines to score. Speed increases with level.
- **Desktop:** `◄ ►` move · `↑` rotate · `↓` soft drop · `Space` hard drop · `Z` rotate CCW · `P` pause
- **Mobile:** Swipe to move/rotate/drop

### CHOMP
Eat all dots across 4 mazes. Power pellets stun ghosts. Grab ammo crates to unlock shooting.
- **Desktop:** Arrow keys move · `Space` shoot (after ammo) · `P` pause
- **Mobile:** Swipe to move

### ALIEN WAVE
Destroy the alien fleet before they reach Earth. UFOs award bonus points. Survive increasing waves.
- **Desktop:** `← →` move · `Space` fire · `P` pause
- **Mobile:** D-pad + fire button

### NEON SERPENT
Eat food to grow. Random walls appear after length 10. Bonus items at length 15 (auto-shoot or shield). Snowflake power-up slows you down at level 6+.
- **Desktop:** Arrow keys or `WASD` · `P` pause
- **Mobile:** Swipe to move

### TERRITORY
Draw borders to capture territory without being intercepted by bouncing balls. Reach 75% fill to advance.
- **Desktop:** Arrow keys · `P` pause
- **Mobile:** Swipe to move

### ROBO MAZE
Blast robots in maze rooms and escape through doorways. 8-directional movement. Destroy all robots in room 10 to reveal the Master Switch and stop boss Brotto.
- **Desktop:** Arrows / `WASD` move · `Space` / `Z` fire · `P` pause
- **Mobile:** 8-direction D-pad + fire button

### GOLD RUSH
Collect all gold to reveal the escape ladder, then climb to the top. Dig to trap guards or create paths. 5 lives.
- **Desktop:** Arrows / `WASD` move & climb · `Z` dig left · `X` dig right · `P` pause · `R` restart level
- **Mobile:** D-pad + dig buttons

### AIRBORNE
Man a ground turret and shoot down planes and paratroopers. Don't let enemies surround the gun. Survive increasing waves.
- **Desktop:** `◄ ►` rotate · `Space` fire · `P` pause
- **Mobile:** D-pad + fire button

### HIGHWAY DELIVERY
Survive 5 stages of hostile combat traffic, utilize nitro boost and laser weapons, then match speed alongside the VIP limo to make each parcel delivery.
- **Desktop:** `← →` / `A D` steer · `↑` / `W` accelerate/boost · `↓` / `S` brake · `Space` fire laser · `P` pause
- **Mobile:** D-pad steer + boost/brake buttons + fire button

### BLOCK'N'BALL
Break all the bricks using your paddle and ball. Collect falling power-up capsules. Navigate 10 levels with Silver bricks (multi-hit) and indestructible Gold bricks. Enemies appear on levels 7–10.
- **Desktop:** `← →` / `A D` move paddle · `Space` launch ball · `P` pause
- **Mobile:** Slide finger to move paddle · Tap to launch ball

---

## Features

- **Procedural audio** — all music and SFX generated via Web Audio API (no audio files)
- **4 music tracks** — CHIP, SYNTH, 8BIT, DUNGEON — cycle with the ♪ button in any game
- **CRT aesthetic** — scanlines, vignette, neon glow, and flicker animations
- **Mobile support** — touch D-pad, swipe gestures, fullscreen, and orientation prompts
- **High scores** — saved to `localStorage` per game
- **Synthwave landing page** — animated stars, shooting stars, perspective grid, and sunset glow

---

## Play Online

**[classicarcade.win](https://classicarcade.win)** — hosted on Azure Static Web Apps

## Running Locally

No build step required. Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# visit http://localhost:3000
```

---

## Project Structure

```
Classic_games/
├── index.html              # Landing page
├── css/style.css           # Global theme, CRT effects, CSS variables
├── js/common.js            # Shared audio engine (window.NeonArcade)
├── tetris/
├── pac-man/
├── space-invaders/
├── snake/
├── xonix/
├── berzerk/
├── lode-runner/
├── paratrooper/
└── highway/
├── arkanoid/
```

Each game folder contains `index.html`, a game-specific `.css`, and one or more `.js` files. All games share the global stylesheet and audio engine.

---

## Tech Stack

- **HTML5 Canvas** — game rendering
- **CSS3** — neon themes, animations, responsive layout
- **Vanilla JS (ES6+)** — game logic, `requestAnimationFrame` game loops
- **Web Audio API** — procedural music scheduler and SFX
- **Google Fonts** — Press Start 2P
