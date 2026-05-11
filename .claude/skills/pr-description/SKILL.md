---
name: pr-description
description: Conventions for writing PR titles and bodies in the Neon Arcade repo. Use when opening a pull request, drafting `gh pr create`, or rewriting an existing PR title/body.
---

# Writing a PR for Neon Arcade

## Base branch

Always open PRs from `dev` to `main`. A pre-tool hook blocks direct pushes to `main`; `main` is the auto-deploy branch via `.github/workflows/deploy.yml`.

If `dev` is behind `main` (other PRs merged in the meantime), sync first:

```bash
git checkout dev && git merge origin/main --no-edit && git push origin dev
```

## Title

- **Imperative mood**: "Recolor Xonix card to white", not "Recolored…" or "Recoloring…".
- **Under 70 characters.** Push details into the body.
- **No conventional-commit prefix** (`feat:`, `fix:`, etc.) — the repo uses plain sentences. Recent examples:
  - `Recolor Xonix to white theme`
  - `Wrap game-card hover rules in @media (hover: hover)`
  - `Move disclaimer element inside .page div, after footer`
  - `Prevent page scroll during mobile touch swipes on game canvases`
- Name the thing being changed concretely. "Fix a bug" is bad; "Stop page scroll during touch swipes" is good.

## Body template

```markdown
## Summary
- 1–3 bullets. What changed and (when not obvious) why.

## Test plan
- [ ] Bulleted checklist of manual verification steps.
```

Keep both sections, even for tiny diffs.

## Test plan conventions

There are **no automated tests** in this repo — every PR is verified manually in a browser. A good test plan calls out the specific surfaces the change can break:

- **Layout / CSS changes** → open the affected page in landscape + portrait, check overlays in their three states (start, paused, gameover), check hover (desktop) vs. tap (mobile).
- **Game logic changes** → start the game, reach the affected state (level-up, death, capture, etc.), confirm the change fires and HUD updates.
- **Audio changes** → confirm music starts on user gesture, stops on pause/gameover, resumes on resume/next-level; new SFX audible at expected trigger.
- **Mobile-specific changes** → verify on a touch device or with DevTools touch emulation; check fullscreen request, D-pad, swipe gestures.
- **Landing-page changes** → check all 8 game cards still render, hover glow works, layout doesn't break at portrait/landscape phone sizes.

Example test plan (from a recolor PR):

```markdown
## Test plan
- [ ] Open `xonix/index.html` in landscape; verify TERRITORY start title, START GAME button, panel values, and canvas glow render white.
- [ ] Start a game; verify in-canvas border, grid dots, and capture-flash render white/grey.
- [ ] Trigger PAUSE, LEVEL CLEAR, and GAME OVER overlays; verify PAUSED stays yellow, LEVEL CLEAR stays green, GAME OVER renders white.
- [ ] Mobile / portrait: rotate prompt renders white.
```

## `gh pr create` invocation

Always pass the body via heredoc to preserve newlines and avoid shell escaping surprises:

```bash
gh pr create --base main --head dev --title "Title under 70 chars" --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...
EOF
)"
```

After creating, print the PR URL so the user can open it.

## Things to leave out

- **No "Generated with Claude" footer / co-author trailer** — `.claude/settings.local.json` has `attribution.commit` and `attribution.pr` set to empty strings, signalling the maintainer does not want them.
- **No emojis** in title or body unless the user explicitly asks.
- **No screenshots-required boilerplate** — this repo doesn't use them.

## Title-only one-liners

For trivial PRs (typo, comment fix, single-line tweak) you can keep the body to one bullet per section, but never omit the structure entirely. Reviewers should always see a Summary and a Test plan.
