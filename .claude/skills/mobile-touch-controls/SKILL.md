---
name: mobile-touch-controls
description: Conventions for mobile/touch controls in Neon Arcade landscape games — `body.is-mobile`, virtual joystick, fire button, fullscreen request, and overlay-hiding via `:has()`. Use when the user is wiring touch input, adding a joystick, requesting fullscreen on mobile, or hiding/showing controls based on overlay state.
---

# Mobile / touch controls

## `body.is-mobile` class

Landscape games set `body.is-mobile` in JS early when a touch device is detected. CSS rules can then conditionally apply (show joystick, adjust layout, hide desktop hints).

Portrait games (`tetris/`, `pac-man/`) do **not** use this class — they use `@media (pointer: coarse)` instead.

## Joystick HTML structure (landscape games)

Goes inside the left side-panel:

```html
<div class="mobile-dpad" id="mobile-dpad">
  <div class="mobile-ctrl-hint">DRAG TO MOVE</div>
  <div class="joystick" id="joystick" role="presentation" aria-hidden="true">
    <div class="joystick-knob" id="joystick-knob"></div>
  </div>
</div>
```

The wrapper class is still `.mobile-dpad` for layout continuity. The accent colour is inherited from `currentColor` on `.mobile-dpad` — set it per-game in CSS:

```css
.mobile-dpad { color: var(--green); }
```

Fire button (if any) goes in the right panel inside `<div class="mobile-fire-wrap">`.

## Wiring the joystick

Load `js/virtual-joystick.js` after `js/common.js`, then:

```js
new NeonArcade.VirtualJoystick({
  base: document.getElementById('joystick'),
  knob: document.getElementById('joystick-knob'),
  // optional: maxRadius (default 56), deadzone (default 0.18)
  onChange: ({ x, y, magnitude, angle }) => {
    // x, y ∈ [-1, 1]; +y = down. magnitude=0 means the finger is up
    // or inside the deadzone — clear all direction keys here.
  }
});
```

Each game decides its own snapping from the analog `{x, y}` vector:

- 2-direction (e.g. ALIEN WAVE, AIRBORNE): `keys.ArrowLeft = x < -0.3; keys.ArrowRight = x > 0.3;`
- 4-direction axis-major (e.g. GOLD RUSH): the axis with the larger absolute value wins.
- 8-direction (e.g. ROBO MAZE): set each cardinal key independently when its component exceeds a threshold (~0.38).
- Analog steering (e.g. HIGHWAY DELIVERY): both axes live simultaneously with low thresholds.

## Per-game joystick sizing

Override CSS custom properties on `.joystick` when a game has a narrow side-panel or a small viewport:

```css
.joystick { --joystick-size: 104px; --joystick-knob: 44px; }
@media (max-height: 420px) {
  .joystick { --joystick-size: 92px; --joystick-knob: 40px; }
}
```

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
