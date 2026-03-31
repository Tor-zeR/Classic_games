# Mobile Support

## Detection

**Landscape games** set `body.is-mobile` in JS when a touch device is detected. This class drives all mobile-specific CSS (show D-pad, adjust layout, hide desktop hints).

**Portrait games** (Tetris, Pac-Man) use `@media (pointer: coarse)` instead — no JS class needed.

---

## D-Pad

Landscape games include a D-pad in the left side panel:

```html
<div class="mobile-dpad" id="mobile-dpad">
  <div class="mobile-ctrl-hint">TOUCH &amp; SWIPE</div>
  <div class="dpad-cross" id="dpad-cross">
    <!-- 3×3 grid: empty/up/empty / left/mid/right / empty/down/empty -->
  </div>
</div>
```

The fire / action button goes in the right panel inside `<div class="mobile-fire-wrap">`.

**Swipe gesture on D-pad:** `touchmove` on `#dpad-cross` with a minimum threshold of 18px. The axis with the larger delta wins (4-directional). Berzerk uses 8-directional (diagonal cells included).

---

## Fullscreen

Landscape games request fullscreen on the first user gesture:

```js
const _doFS = () => {
  if (!document.fullscreenElement)
    document.documentElement.requestFullscreen?.().catch(() => {});
};
document.addEventListener('touchstart', _doFS, { once: true, passive: true });
document.addEventListener('click',      _doFS, { once: true });
```

Always use `.catch(() => {})` — never `try/catch` — because `requestFullscreen` returns a Promise.

---

## Hiding Controls on Start Screen

Controls are hidden while the start overlay is visible using the CSS `:has()` pattern:

```css
body.is-mobile:has(#overlay-start:not(.hidden)) .mobile-dpad,
body.is-mobile:has(#overlay-start:not(.hidden)) .mobile-fire-wrap { display: none !important; }
```

---

## Desktop / Mobile Hint Split

Each game's start overlay has two separate hint blocks:

```html
<div class="overlay-sub desktop-hints">keyboard instructions</div>
<div class="overlay-sub mobile-hints">touch instructions</div>
<div class="fullscreen-note mobile-hints">⛶ GAME RUNS IN FULL SCREEN</div>
```

CSS default: `.mobile-hints { display: none; }`. Toggled via `body.is-mobile` (landscape) or `@media (pointer: coarse)` (portrait).

---

## Orientation Prompts

- **Landscape games:** show `.rotate-prompt` via `@media (orientation: portrait)` — hides `.page`
- **Portrait games & landing page:** show prompt via `@media (orientation: landscape) and (max-height: 640px)`

---

## Lode Runner Special Layout

Lode Runner has absolute-positioned side panels (`width: 130px`) and the canvas-wrapper uses `margin: 0 130px`. The right panel contains dig buttons (`#btn-digl-touch`, `#btn-digr-touch`) instead of a fire button.
