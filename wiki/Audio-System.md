# Audio System

The shared audio engine lives in `js/common.js` and is exposed as `window.NeonArcade`.

---

## Music Tracks

| Track | ID | Name |
|-------|----|------|
| Off | `0` | — |
| CHIP | `1` | Chiptune style |
| SYNTH | `2` | Synthwave style |
| 8BIT | `3` | 8-bit style |
| DUNGEON | `4` | Dungeon / adventure style |
| PATRIOT | `5` | Military march style |

---

## API

### Playback

```js
NeonArcade.setTrack(n)    // set default track (call before startMusic)
NeonArcade.startMusic()   // begin playback (must be called from a user gesture)
NeonArcade.stopMusic()    // stop playback
NeonArcade.cycleTrack()   // advance to next track, returns { track, name }
```

### Web Audio Access

```js
NeonArcade.getAudioCtx()  // returns the AudioContext
NeonArcade.getMasterBus() // returns the master GainNode
```

Use these for game-specific SFX that need direct Web Audio access.

### SFX

All SFX live in the `NeonArcade.SFX` object. Call with optional chaining to guard missing entries:

```js
NeonArcade.SFX.levelUp?.()
NeonArcade.SFX.snakeEat?.()
NeonArcade.SFX.berzerkRobotShoot?.()   // quiet blip when a robot fires
NeonArcade.SFX.berzerkOtto?.()         // alarm warble when Brotto activates
NeonArcade.SFX.berzerkBrotto?.()       // rising wavy wail as Brotto appears
NeonArcade.SFX.berzerkBrottoMove?.()   // rapid wobble pulse while Brotto chases (every 0.55s)
NeonArcade.SFX.berzerkRoomEnter?.()    // 3-note ascending sweep on room entry
NeonArcade.SFX.berzerkPowerUp?.()      // zappy burst when fire-rate boost collected
```

> Internal SFX names do **not** need to match player-facing game names. For example, `berzerkOtto` remains the internal name even though the character is displayed as "Brotto".

---

## Adding SFX

Add new entries to the `SFX` object in `common.js`. Three patterns:

### `scheduleNotes(notes)` — melodic / rhythmic sequences

```js
berzerkRoomEnter() {
  scheduleNotes([
    { freq: 220, start: 0,    dur: 0.07, opts: { type: 'square', vol: 0.18 } },
    { freq: 330, start: 0.08, dur: 0.07, opts: { type: 'square', vol: 0.20 } },
    { freq: 440, start: 0.16, dur: 0.12, opts: { type: 'square', vol: 0.22 } },
  ]);
},
```

### Direct Web Audio — continuous effects (LFO, envelopes)

```js
berzerkBrotto() {
  const ctx = getAudioCtx(), bus = getMasterBus();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  // connect osc → gain → bus, set AudioParams, call osc.start/stop
},
```

### `playTone(freq, dur, opts)` — single quick tone

```js
berzerkRobotShoot() {
  playTone(320, 0.05, { type: 'square', vol: 0.08 });
},
```

---

## Scheduler

The music scheduler uses a **25ms poll / 130ms lookahead** pattern. Track data and `_sched*` functions live inside `common.js` alongside the engine.

Drum primitives: `_kick`, `_snare`, `_hihat`, `_bass`, `_lead`, `_pad`
Tone helpers: `_toneAt`, `playTone`

---

## Game Integration Pattern

```js
// In the load event handler:
NeonArcade.setTrack(1);  // CHIP

// On start button click (user gesture required):
NeonArcade.startMusic();

// On pause:
NeonArcade.stopMusic();

// On resume:
NeonArcade.startMusic();

// On game over / level clear:
NeonArcade.stopMusic();

// Music button wiring:
document.getElementById('music-toggle').addEventListener('click', function () {
  const { name } = NeonArcade.cycleTrack();
  this.textContent = `♪ ${name}`;
});
```

> **Browser autoplay policy:** Music can only start from a user gesture. Never call `startMusic()` on page load.
