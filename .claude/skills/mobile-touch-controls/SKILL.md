---
name: mobile-touch-controls
description: Conventions for mobile/touch controls in Neon Arcade landscape games — `body.is-mobile`, D-pad HTML, swipe gesture, fullscreen request, and overlay-hiding via `:has()`. Use when the user is wiring touch input, adding a D-pad, requesting fullscreen on mobile, or hiding/showing controls based on overlay state.
---

# Mobile / touch controls

## `body.is-mobile` class

Landscape games set `body.is-mobile` in JS early when a touch device is detected. CSS rules can then conditionally apply (show D-pad, adjust layout, hide desktop hints).

Portrait games (`tetris/`, `pac-man/`) do **not** use this class — they use `@media (pointer: coarse)` instead.

## D-pad HTML structure (landscape games)

Goes inside the left side-panel:

```html
<div class="mobile-dpad" id="mobile-dpad">
  <div class="mobile-ctrl-hint">TOUCH &amp; SWIPE</div>
  <div class="dpad-cross" id="dpad-cross">
    <!-- 3×3 grid: empty / up / empty / left / mid / right / empty / down / empty -->
  </div>
</div>
```

Fire button goes in the right panel inside `<div class="mobile-fire-wrap">`.

## Swipe gesture on D-pad

Wire `touchmove` on `#dpad-cross` with a minimum swipe threshold (`SWIPE_MIN = 18px`). Axis with the larger delta wins (4-directional). Berzerk uses 8-directional (diagonal cells included).

## Fullscreen on first user gesture

Landscape games request fullscreen on the first user touch/click. **Always** use `.catch(() => {})` — never `try/catch` — because `requestFullscreen` returns a Promise:

```js
const _doFS = () => {
  if (!document.fullscreenElement)
    document.documentElement.requestFullscreen?.().catch(() => {});
};
document.addEventListener('touchstart', _doFS, { once: true, passive: true });
document.addEventListener('click',      _doFS, { once: true });
```

## Hide controls on the start screen

Use the CSS `:has()` pattern so the D-pad / fire button / canvas glow are hidden while the start overlay is visible:

```css
body.is-mobile:has(#overlay-start:not(.hidden)) .mobile-dpad,
body.is-mobile:has(#overlay-start:not(.hidden)) .mobile-fire-wrap { display: none !important; }
body.is-mobile .canvas-wrapper:has(#overlay-start:not(.hidden)) .canvas-glow { display: none; }
```

## Desktop / mobile hint split

Inside `overlay-start`, render both hint blocks and toggle them via the responsive class:

```html
<div class="overlay-sub desktop-hints">keyboard instructions</div>
<div class="overlay-sub mobile-hints">touch instructions</div>
<div class="fullscreen-note mobile-hints">⛶ GAME RUNS IN FULL SCREEN</div>
```

CSS: `.mobile-hints { display: none; }` by default; toggled via `body.is-mobile` (landscape) or `@media (pointer: coarse)` (portrait).

## Game-specific exception — Lode Runner

Lode Runner has a unique layout: side panels are `position: absolute` with `width: 130px`, and the canvas-wrapper uses `margin: 0 130px` to prevent overlap. The right panel contains dig buttons (`#btn-digl-touch`, `#btn-digr-touch`) instead of a fire button. Mirror this pattern only if a new game has fundamentally different mobile controls.

## Orientation prompts

- Landscape games: show `.rotate-prompt` via `@media (orientation: portrait)` — hides `.page`.
- Portrait games and landing page: show prompt via `@media (orientation: landscape) and (max-height: 640px)`.
