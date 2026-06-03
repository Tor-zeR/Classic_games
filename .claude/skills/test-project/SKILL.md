---
name: test-project
description: Run automated tests against one game or the whole Neon Arcade. Use when the user says "test the project", "test highway", "smoke test", "run tests", "check for regressions", or asks for an automated audit. Drives Playwright MCP + static checks, then reports happy-path + edge-case findings as a punch list of suggested fixes.
---

# Testing Neon Arcade

This is a vanilla HTML/CSS/JS project — there is no Jest, no Vitest, no `package.json`. "Automated tests" here means **Playwright-driven browser checks + static analysis**, run on demand. The output is a punch list, not a green/red dashboard.

## Step 1 — Ask the target

Always start by asking the user via `AskUserQuestion` what to test. Two options:

- **One game** — pick from the list (`tetris`, `pac-man`, `xonix`, `space-invaders`, `snake`, `berzerk`, `paratrooper`, `lode-runner`, `highway`) or the landing page.
- **Whole project** — every game + landing page. Heavier, takes longer, expect a longer report.

If the user already named a target, skip the question.

## Step 2 — Run the test bundle

For each target, run these in order. Stop early only if a static check fails catastrophically (e.g. `node --check` fails on the JS).

### 2a. Static checks (cheap, run first)

- **JS syntax**: `node --check <game>/<game>.js` (and any other .js in the folder).
- **HTML balance**: parse each `index.html` and verify all tags close cleanly.
- **Convention scan** — grep for known regression smells:
  - Missing `:focus-visible` on interactive elements.
  - Missing `aria-label` on icon-only buttons.
  - `@media (hover: hover)` gating on `:hover` styles (so touch devices don't get stuck hover states).
  - `min-height: 100dvh` alongside `100vh` on `.page`.
  - `touch-action: none` on D-pad cells, `touch-action: manipulation` on fire buttons.
  - `parseInt(..., 10)` with explicit radix.
  - `NeonArcade.setTrack(n)` called before `startMusic()` at startup.
  - No inline `style="color:..."` spans — should be named utility classes.

### 2b. Playwright smoke (the heavy bit)

Start a local server (`npx serve .` from the repo root) on `:3000` in the background, then drive each target with the Playwright MCP tools.

For **each game**, run the **happy path** and **edge cases** below. Use `mcp__playwright__browser_navigate`, `browser_click`, `browser_press_key`, `browser_snapshot`, `browser_evaluate`, and `browser_console_messages`. After every interaction, call `browser_console_messages` and flag any `error` / `warning` entries that aren't expected.

### 2c. Mobile pass

For each game, also run with viewport set to `390x844` (iPhone 13). Verify:
- `body.is-mobile` class is set.
- D-pad / fire-button are visible.
- Music button still toggles tracks.
- Orientation prompt appears if the game is landscape-only and viewport is portrait (or vice versa).
- No horizontal scrollbar appears.

## Step 3 — The per-game test matrix

For every game the **happy path** is "play it once cleanly." The **edge cases** are state-machine corners and audio/visibility quirks.

### Universal happy path (every game)

1. Navigate to the game URL.
2. Click `► START GAME` (or equivalent start button).
3. Verify the game loop runs for ≥3 seconds without console errors.
4. Trigger one in-game event (move, shoot, eat — whatever the game's primary verb is).
5. Verify HUD updates (score, lives, level — depends on game).
6. Pause via P key → verify pause overlay → resume → verify game continues.
7. Force a game-over (deliberately fail) → verify game-over overlay → click Play Again → verify restart works.

### Universal edge cases (every game)

- **Audio gesture**: confirm `AudioContext` is in `suspended` state on page load and `running` after the start click.
- **Rapid pause/resume**: hit P repeatedly — should not double-schedule music, no console errors.
- **Visibility change**: `document.dispatchEvent(new Event('visibilitychange'))` after `document.hidden = true` — does the game pause itself? (Most don't; flag if missing on long games.)
- **Resize during gameplay**: resize the viewport mid-game; verify canvas stays sane and HUD doesn't get clipped.
- **Reduced motion**: set `prefers-reduced-motion: reduce` via `browser_evaluate` → reload → check whether background animations comply (project rule).
- **Back navigation**: navigate forward then back; verify audio context disposes cleanly (no zombie oscillators).

### Per-game specifics

| Game | Happy-path verbs | Notable edge cases |
|------|------------------|--------------------|
| **tetris** | Spawn → move L/R → rotate → drop → line clear | Hold-soft-drop, T-spin recognition (if any), rapid rotate at wall, game-over from stack ceiling |
| **pac-man** | Eat dots → encounter ghost → power-pellet → eat ghost | Tunnel wrap, ghost-mode transitions, fruit spawn timing, all-mazes cycle |
| **xonix** | Cut territory → fill area → ball deflection | Cutting back across own trail, near-100% capture, fast-direction reversal mid-cut |
| **space-invaders** | Shoot alien → wave clear → UFO bonus | Bottom-row aliens reach earth, rapid-fire cooldown, simultaneous UFO + last-alien |
| **snake** | Eat food → grow → near-wall turn | Reverse-direction on same frame (should be blocked), self-collision at length 2 |
| **berzerk** | Shoot robot → walk room → encounter Brotto | Standing-still-too-long Brotto spawn, room-exit while dying, robot-vs-robot collision |
| **paratrooper** | Aim turret → shoot plane → paratrooper lands | Paratrooper-stack overflow → game over, helicopter spawn, simultaneous left+right barrage |
| **lode-runner** | Move → climb ladder → dig → collect gold | Falling into self-dug pit, guard re-emergence timing, level completion w/ guard in hole |
| **highway** | Drive → dodge traffic → match limo speed → deliver | Fuel-critical hard rescue spawn, crash freeze + engine restart, NPC speed under variable worldSpd, jitter window at stage 5, oncoming-traffic collision |

### Landing page specifics

- BIOS sequence runs on first visit, skips on subsequent (sessionStorage `bios_done`).
- ESC / SPACE skip the BIOS.
- Music button cycles tracks correctly (each game has its own valid cycle list — landing defaults to `[1..5]`, OVERDRIVE excluded).
- Card click navigates to the game.
- Synthwave canvas background respects reduced-motion.

## Step 4 — Output

Format the report as a **punch list**, not a wall of text. For each finding:

```
- [SEVERITY] [GAME/AREA] short title
  - what broke / what was missing
  - suggested fix (or "needs investigation" if root cause unclear)
```

Severity: `critical` (game unplayable / crashes), `major` (visible regression / a11y violation), `minor` (cosmetic / convention drift).

End with a one-line summary: `N critical, M major, K minor` and the recommended order of attack.

If a finding maps to one of the existing skills (`add-sfx`, `mobile-touch-controls`, etc.), reference it: "see skill `mobile-touch-controls`."

## What this skill does NOT do

- It does not write tests to a file. There's no test runner here. Results live in the conversation as a punch list.
- It does not auto-fix findings. The user reviews the punch list and decides what to act on. Wait for the user to say "fix item N" before editing code.
- It does not run CI. If the user wants CI, that's a separate ask — a GitHub Actions workflow that runs Playwright headless on PR open. Not in scope unless asked.
