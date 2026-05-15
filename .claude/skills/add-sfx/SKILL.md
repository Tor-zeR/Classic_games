---
name: add-sfx
description: Patterns for adding new sound effects in js/common.js using the Neon Arcade audio engine. Use when the user asks to add an SFX, wire a new sound, create a sound effect, or modify the `NeonArcade.SFX` object — also when they reference `scheduleNotes`, `playTone`, or Web Audio in this codebase.
---

# Adding SFX

Add new SFX to the `SFX` object inside `js/common.js`. Three patterns:

## `scheduleNotes(notes)` — melodic / rhythmic sequences

```js
berzerkRoomEnter() {
  scheduleNotes([
    { freq: 220, start: 0,    dur: 0.07, opts: { type: 'square', vol: 0.18 } },
    { freq: 440, start: 0.16, dur: 0.12, opts: { type: 'square', vol: 0.22 } },
  ]);
},
```

## Direct Web Audio — continuous effects (LFO vibrato, envelopes, sweeps)

```js
berzerkBrotto() {
  const ctx = getAudioCtx(), bus = getMasterBus();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  // wire osc → gain → bus, set AudioParams, call osc.start/stop
},
```

## `playTone(freq, dur, opts)` — single quick tones

```js
NeonArcade.SFX.zap = () => playTone(900, 0.05, { type: 'square', vol: 0.2 });
```

## Calling SFX from games

Always guard with optional chaining so a missing entry doesn't throw:

```js
NeonArcade.SFX.mySound?.();
```

## Naming

Internal SFX names do not need to match player-facing game names — e.g. `berzerkOtto` remains the internal name even though the character is called "Brotto" in the UI. Keep names short and prefix with the game folder for clarity (`tetrisLineClear`, `xonixCapture`).

## Audio engine surface (in `common.js`)

- `getAudioCtx()` / `getMasterBus()` — direct Web Audio access for SFX that need raw nodes.
- `_kick`, `_snare`, `_hihat`, `_bass`, `_lead`, `_pad` — drum and tone primitives, reused by both music tracks and SFX.
- `_toneAt` / `playTone` — tone helpers (single notes at a specific time or now).
- `scheduleNotes` — the bulk-schedule helper shown above.

The music scheduler uses a 25ms poll / 130ms lookahead pattern. SFX you schedule via `scheduleNotes` ride the same audio context — they need a user gesture to start the context the first time (handled in `NeonArcade.getAudioCtx()`).
