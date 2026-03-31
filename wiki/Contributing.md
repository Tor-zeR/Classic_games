# Contributing

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — deploys automatically to Azure |
| `dev` | Active development — open PRs against this branch |

**Never push directly to `main`.** A pre-tool hook blocks it. All changes go: `dev` → Pull Request → merge to `main`.

---

## Workflow

```bash
# 1. Make changes locally on dev branch
git add <files>
git commit -m "Description of change"
git push origin dev

# 2. Open a PR
gh pr create --title "..." --body "..."

# 3. Merge via GitHub UI or gh CLI
gh pr merge <number> --merge
```

---

## Coding Conventions

### General
- Vanilla JS only — no frameworks, no bundlers
- All game logic in a single `.js` file per game
- No TypeScript, no JSX, no modules

### CSS
- Use CSS variables from `style.css` for colors (`var(--cyan)`, etc.)
- Per-game accent color set in the game's own CSS
- Mobile styles controlled by `body.is-mobile` (landscape) or `@media (pointer: coarse)` (portrait)

### Audio
- Always call `NeonArcade.setTrack(n)` before `startMusic()`
- Always call `startMusic()` from a user gesture
- Call `stopMusic()` on pause, gameover, and level-clear
- Call `startMusic()` again on resume and next-level
- Call SFX with optional chaining: `NeonArcade.SFX.mySound?.()`

### Mobile
- Use `.catch(() => {})` on `requestFullscreen()` — never `try/catch`
- Swipe threshold on D-pad: `SWIPE_MIN = 18px`
- Set `body.is-mobile` early in JS (before first render)

---

## File Checklist for a New Game

- [ ] `<game>/index.html` — topbar, overlays, touch controls, rotate prompt, disclaimer footer
- [ ] `<game>/<game>.css` — accent color, overlay-sub font size, mobile hints, fullscreen note
- [ ] `<game>/<game>.js` — game logic, audio integration, mobile detection
- [ ] `<game>/og-image.jpg` — 1200×630 OG preview image
- [ ] SEO block in `index.html` — meta, OG, Twitter, VideoGame JSON-LD (use display name), BreadcrumbList
- [ ] Card added to root `index.html`
- [ ] URL added to `sitemap.xml`

---

## Serving Locally

```bash
npx serve .
# Visit http://localhost:3000
```

No build step required.

---

## Wiki

Wiki source files live in the `wiki/` directory of the main repo. Editing any `wiki/*.md` file on `main` automatically syncs to the GitHub wiki via the **Update Wiki** GitHub Actions workflow.
