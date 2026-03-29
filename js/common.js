/* ============================================================
   Neon Arcade — Common Audio & Utilities
   ============================================================ */
'use strict';

// ── Audio Context ─────────────────────────────────────────────
let _audioCtx      = null;
let _noiseBuffer   = null;  // pre-baked white noise for drums
let _masterBus     = null;  // DynamicsCompressor → destination (all audio routes here)
let _leadDelayNode = null;  // persistent delay node for lead echo

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Pre-generate 2s of white noise for drum synthesis
    _noiseBuffer = _audioCtx.createBuffer(1, _audioCtx.sampleRate * 2, _audioCtx.sampleRate);
    const d = _noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // ── Master bus: compressor → destination ──────────────────
    // Prevents clipping when multiple voices hit simultaneously,
    // and adds punch/loudness without distortion.
    const comp = _audioCtx.createDynamicsCompressor();
    comp.threshold.value = -18;   // dB — start compressing here
    comp.knee.value      =  8;    // dB — soft-knee transition
    comp.ratio.value     =  4;    // 4:1 compression
    comp.attack.value    =  0.003;
    comp.release.value   =  0.15;
    comp.connect(_audioCtx.destination);
    _masterBus = comp;

    // ── Lead delay: dotted-8th echo at 128 BPM ───────────────
    // 3 × 16th-note steps ≈ 0.352 s — classic synth-pop Space Echo feel.
    _leadDelayNode = _audioCtx.createDelay(1.0);
    _leadDelayNode.delayTime.value = SP_STEP * 3;

    const _fb  = _audioCtx.createGain();   // feedback loop
    _fb.gain.value = 0.36;
    _leadDelayNode.connect(_fb);
    _fb.connect(_leadDelayNode);

    const _delayOut = _audioCtx.createGain();  // wet output level
    _delayOut.gain.value = 0.28;
    _leadDelayNode.connect(_delayOut);
    _delayOut.connect(_masterBus);
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function getMasterBus() {
  getAudioCtx();   // ensure initialised
  return _masterBus;
}

// ── Primitive tone (scheduled at ctx.currentTime, for SFX) ───
function playTone(freq, dur, { type = 'square', vol = 0.25, attack = 0.005 } = {}) {
  try {
    const ctx = getAudioCtx();
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(_masterBus);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.01);
  } catch (_) {}
}

// Scheduled version used by the music sequencer
function _toneAt(when, freq, dur, { type = 'square', vol = 0.15, attack = 0.005 } = {}) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(_masterBus);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.start(when); osc.stop(when + dur + 0.01);
  } catch (_) {}
}

// ── SFX helper ────────────────────────────────────────────────
function scheduleNotes(notes) {
  notes.forEach(n => setTimeout(() => playTone(n.freq, n.dur, n.opts || {}), n.start * 1000));
}

// ── SFX ───────────────────────────────────────────────────────
const SFX = {
  move()     { playTone(220, 0.06, { type: 'square', vol: 0.15 }); },
  rotate()   {
    playTone(330, 0.07, { vol: 0.18 });
    setTimeout(() => playTone(440, 0.05, { vol: 0.12 }), 40);
  },
  drop()     { playTone(110, 0.12, { type: 'sawtooth', vol: 0.3 }); },
  softDrop() { playTone(165, 0.05, { vol: 0.1 }); },
  land()     {
    playTone(180, 0.06, { type: 'sawtooth', vol: 0.22 });
    setTimeout(() => playTone(120, 0.08, { type: 'sawtooth', vol: 0.14 }), 30);
  },

  lineClear(lines) {
    if (lines === 1) {
      scheduleNotes([{ freq:523,start:0,dur:0.15 }, { freq:659,start:0.08,dur:0.15 }]);
    } else if (lines === 2) {
      scheduleNotes([{ freq:523,start:0,dur:0.12 }, { freq:659,start:0.07,dur:0.12 }, { freq:784,start:0.14,dur:0.15 }]);
    } else if (lines === 3) {
      scheduleNotes([{ freq:523,start:0,dur:0.10 }, { freq:659,start:0.06,dur:0.10 }, { freq:784,start:0.12,dur:0.10 }, { freq:1047,start:0.18,dur:0.18 }]);
    } else {
      scheduleNotes([
        { freq:523,start:0,dur:0.10 }, { freq:659,start:0.05,dur:0.10 },
        { freq:784,start:0.10,dur:0.10 }, { freq:1047,start:0.15,dur:0.10 },
        { freq:1319,start:0.20,dur:0.10 },
        { freq:1568,start:0.25,dur:0.25,opts:{ vol:0.35, type:'sawtooth' } },
      ]);
    }
  },

  levelUp() {
    scheduleNotes([
      { freq:392,start:0,dur:0.08 }, { freq:523,start:0.09,dur:0.08 },
      { freq:659,start:0.18,dur:0.08 }, { freq:784,start:0.27,dur:0.08 },
      { freq:1047,start:0.36,dur:0.20,opts:{ vol:0.35 } },
    ]);
  },

  gameOver() {
    scheduleNotes([
      { freq:494,start:0,   dur:0.20,opts:{ type:'sawtooth' } },
      { freq:440,start:0.22,dur:0.20,opts:{ type:'sawtooth' } },
      { freq:392,start:0.44,dur:0.20,opts:{ type:'sawtooth' } },
      { freq:349,start:0.66,dur:0.20,opts:{ type:'sawtooth' } },
      { freq:294,start:0.88,dur:0.35,opts:{ type:'sawtooth', vol:0.35 } },
    ]);
  },

  // ── Snake shoot SFX ──────────────────────────────────────────
  // Power-up collected: bright ascending shimmer
  snakePowerUp() {
    scheduleNotes([
      { freq: 440,  start: 0,    dur: 0.05, opts: { type: 'square', vol: 0.18 } },
      { freq: 660,  start: 0.05, dur: 0.05, opts: { type: 'square', vol: 0.22 } },
      { freq: 880,  start: 0.10, dur: 0.05, opts: { type: 'square', vol: 0.26 } },
      { freq: 1320, start: 0.15, dur: 0.12, opts: { type: 'square', vol: 0.30 } },
      { freq: 1760, start: 0.27, dur: 0.18, opts: { type: 'square', vol: 0.22 } },
    ]);
  },

  // Bullet fired: sharp high-pitched zap
  snakeShoot() {
    playTone(1200, 0.055, { type: 'square', vol: 0.20 });
    setTimeout(() => playTone(900, 0.04, { type: 'square', vol: 0.12 }), 30);
  },

  // Wall hit by bullet: crunchy low thud
  snakeWallHit() {
    playTone(120, 0.10, { type: 'sawtooth', vol: 0.32 });
    setTimeout(() => playTone(80, 0.12, { type: 'sawtooth', vol: 0.22 }), 25);
  },

  // ── Snake SFX ────────────────────────────────────────────────
  // Subtle tick each time the snake moves one cell
  snakeMove() {
    playTone(300, 0.022, { type: 'square', vol: 0.055 });
  },

  // Ascending 3-note chirp when food is eaten
  snakeEat() {
    scheduleNotes([
      { freq: 523,  start: 0,    dur: 0.055, opts: { type: 'square', vol: 0.20 } },
      { freq: 784,  start: 0.06, dur: 0.055, opts: { type: 'square', vol: 0.24 } },
      { freq: 1047, start: 0.12, dur: 0.09,  opts: { type: 'square', vol: 0.28 } },
    ]);
  },

  // Descending sawtooth crash when the snake dies
  snakeDie() {
    scheduleNotes([
      { freq: 494, start: 0,    dur: 0.14, opts: { type: 'sawtooth', vol: 0.32 } },
      { freq: 370, start: 0.16, dur: 0.14, opts: { type: 'sawtooth', vol: 0.30 } },
      { freq: 277, start: 0.32, dur: 0.16, opts: { type: 'sawtooth', vol: 0.28 } },
      { freq: 185, start: 0.50, dur: 0.35, opts: { type: 'sawtooth', vol: 0.35 } },
    ]);
  },

  // ── Berzerk SFX ──────────────────────────────────────────────
  // Sharp electronic laser zap
  berzerkShoot() {
    playTone(1400, 0.06, { type: 'square', vol: 0.22 });
    setTimeout(() => playTone(800, 0.04, { type: 'square', vol: 0.12 }), 30);
  },

  // Robot explosion: low thud + noise burst
  berzerkRobotDie() {
    playTone(90, 0.18, { type: 'sawtooth', vol: 0.35 });
    setTimeout(() => playTone(55, 0.20, { type: 'sawtooth', vol: 0.28 }), 40);
  },

  // Player death: dramatic descending alarm
  berzerkDie() {
    scheduleNotes([
      { freq: 660, start: 0,    dur: 0.10, opts: { type: 'sawtooth', vol: 0.30 } },
      { freq: 550, start: 0.11, dur: 0.10, opts: { type: 'sawtooth', vol: 0.30 } },
      { freq: 440, start: 0.22, dur: 0.10, opts: { type: 'sawtooth', vol: 0.30 } },
      { freq: 330, start: 0.33, dur: 0.12, opts: { type: 'sawtooth', vol: 0.32 } },
      { freq: 220, start: 0.46, dur: 0.18, opts: { type: 'sawtooth', vol: 0.34 } },
      { freq: 110, start: 0.65, dur: 0.35, opts: { type: 'sawtooth', vol: 0.36 } },
    ]);
  },

  // Evil Otto activation: pulsing alarm warble
  berzerkOtto() {
    scheduleNotes([
      { freq: 440, start: 0,    dur: 0.12, opts: { type: 'square', vol: 0.28 } },
      { freq: 330, start: 0.13, dur: 0.12, opts: { type: 'square', vol: 0.28 } },
      { freq: 440, start: 0.26, dur: 0.12, opts: { type: 'square', vol: 0.28 } },
      { freq: 330, start: 0.39, dur: 0.12, opts: { type: 'square', vol: 0.28 } },
    ]);
  },

  // Fire-rate boost collected: zappy electric burst
  berzerkPowerUp() {
    scheduleNotes([
      { freq: 880,  start: 0,    dur: 0.06, opts: { type: 'square', vol: 0.20 } },
      { freq: 1100, start: 0.07, dur: 0.06, opts: { type: 'square', vol: 0.22 } },
      { freq: 1320, start: 0.14, dur: 0.06, opts: { type: 'square', vol: 0.24 } },
      { freq: 1760, start: 0.21, dur: 0.14, opts: { type: 'square', vol: 0.26 } },
    ]);
  },

  // Extra life awarded: short ascending chime
  berzerkExtraLife() {
    scheduleNotes([
      { freq: 523, start: 0,    dur: 0.08, opts: { type: 'square', vol: 0.22 } },
      { freq: 659, start: 0.09, dur: 0.08, opts: { type: 'square', vol: 0.24 } },
      { freq: 784, start: 0.18, dur: 0.08, opts: { type: 'square', vol: 0.26 } },
      { freq: 1047,start: 0.27, dur: 0.18, opts: { type: 'square', vol: 0.28 } },
    ]);
  },

  // Game over for Berzerk (reuse berzerkDie with extra low rumble)
  berzerkGameOver() {
    scheduleNotes([
      { freq: 330, start: 0,    dur: 0.14, opts: { type: 'sawtooth', vol: 0.32 } },
      { freq: 247, start: 0.16, dur: 0.14, opts: { type: 'sawtooth', vol: 0.32 } },
      { freq: 185, start: 0.32, dur: 0.16, opts: { type: 'sawtooth', vol: 0.34 } },
      { freq: 123, start: 0.50, dur: 0.22, opts: { type: 'sawtooth', vol: 0.36 } },
      { freq:  82, start: 0.74, dur: 0.55, opts: { type: 'sawtooth', vol: 0.38 } },
    ]);
  },

  // ── Lode Runner SFX ──────────────────────────────────────────
  // Gold pickup: bright two-tone coin chime
  lodeRunnerGold() {
    playTone(1047, 0.07, { type: 'square', vol: 0.18 });
    setTimeout(() => playTone(1319, 0.10, { type: 'square', vol: 0.22 }), 55);
  },

  // Player footstep: soft short click (square, 180 Hz, 40 ms)
  lodeRunnerStep() {
    playTone(180, 0.04, { type: 'square', vol: 0.07 });
  },

  // Player ladder rung: triangle tap, alternating pitch for left/right rung feel
  lodeRunnerClimb(rung) {
    const freq = (rung % 2 === 0) ? 260 : 220;
    playTone(freq, 0.055, { type: 'triangle', vol: 0.09 });
  },

  // Guard footstep: heavier, slightly lower click (triangle, 110 Hz, 30 ms)
  lodeRunnerGuardStep() {
    playTone(110, 0.03, { type: 'triangle', vol: 0.045 });
  },

  // Guard snatches gold: low hollow thud — distinct from player's bright pickup
  lodeRunnerGuardGold() {
    playTone(180, 0.06, { type: 'triangle', vol: 0.10 });
    setTimeout(() => playTone(120, 0.08, { type: 'triangle', vol: 0.07 }), 40);
  },

  // Brick dig: bandpass noise burst + low sawtooth thud
  lodeRunnerDig() {
    try {
      const ctx = getAudioCtx();
      if (_noiseBuffer) {
        const src  = ctx.createBufferSource();
        src.buffer = _noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = 600; filt.Q.value = 3;
        const gain = ctx.createGain();
        src.connect(filt); filt.connect(gain); gain.connect(_masterBus);
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        src.start(t); src.stop(t + 0.10);
      }
    } catch (_) {}
    playTone(120, 0.10, { type: 'sawtooth', vol: 0.18 });
  },
};

// ── Drum synthesis (scheduled) ────────────────────────────────

function _kick(when, vol = 0.65) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(_masterBus);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, when);
    osc.frequency.exponentialRampToValueAtTime(28, when + 0.09);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.38);
    osc.start(when); osc.stop(when + 0.42);
  } catch (_) {}
}

function _snare(when, vol = 0.4) {
  try {
    const ctx = getAudioCtx();
    // noise burst
    if (_noiseBuffer) {
      const src  = ctx.createBufferSource();
      src.buffer = _noiseBuffer;
      const filt = ctx.createBiquadFilter();
      filt.type  = 'highpass'; filt.frequency.value = 1600;
      const gain = ctx.createGain();
      src.connect(filt); filt.connect(gain); gain.connect(_masterBus);
      gain.gain.setValueAtTime(vol, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      src.start(when); src.stop(when + 0.16);
    }
    // body tone
    const osc = ctx.createOscillator(), gain2 = ctx.createGain();
    osc.connect(gain2); gain2.connect(_masterBus);
    osc.type = 'triangle'; osc.frequency.setValueAtTime(190, when);
    gain2.gain.setValueAtTime(vol * 0.55, when);
    gain2.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
    osc.start(when); osc.stop(when + 0.11);
  } catch (_) {}
}

function _hihat(when, open = false, vol = 0.14) {
  try {
    const ctx = getAudioCtx();
    if (!_noiseBuffer) return;
    const dur  = open ? 0.22 : 0.042;
    const src  = ctx.createBufferSource();
    src.buffer = _noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type  = 'highpass'; filt.frequency.value = 9000;
    const gain = ctx.createGain();
    src.connect(filt); filt.connect(gain); gain.connect(_masterBus);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.start(when); src.stop(when + dur + 0.01);
  } catch (_) {}
}

function _bass(when, freq, dur, vol = 0.28) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.connect(filt); filt.connect(gain); gain.connect(_masterBus);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);
    filt.type = 'lowpass'; filt.frequency.setValueAtTime(650, when); filt.Q.value = 2.5;
    filt.frequency.exponentialRampToValueAtTime(180, when + dur * 0.5);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.start(when); osc.stop(when + dur + 0.01);
  } catch (_) {}
}

function _lead(when, freq, dur, vol = 0.14) {
  try {
    const ctx  = getAudioCtx();
    // Two detuned saws for that lush synth-pop sound
    const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.connect(gain); osc2.connect(gain);
    gain.connect(_masterBus);      // dry signal
    gain.connect(_leadDelayNode);  // also feed delay — echo repeats go to master via _delayOut
    osc1.type = 'sawtooth'; osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq,         when);
    osc2.frequency.setValueAtTime(freq * 1.007, when); // +~12 cents detune
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.018);
    gain.gain.setValueAtTime(vol * 0.75, when + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc1.start(when); osc2.start(when);
    osc1.stop(when + dur + 0.01); osc2.stop(when + dur + 0.01);
  } catch (_) {}
}

// ── Track 1 — Chiptune (structured) ──────────────────────────
// Am → F → C → G, 160 BPM, 8th-note steps.
// Structure: MT MT CH MT MT CH CH2 CH  (8 × 32 = 256 steps, ~48 s loop)
const CHIP_STEP     = 60 / 160 / 2;   // 0.1875 s per 8th note
const CHIP_SEC_LEN  = 32;             // 4 bars × 8 steps
const CHIP_SECTIONS = [0, 0, 1, 0, 0, 1, 2, 1]; // 0=MT  1=CH  2=CH2
const CHIP_FULL_LEN = CHIP_SECTIONS.length * CHIP_SEC_LEN; // 256

// ── Main Theme — ascending arpeggios, mid-range ───────────────
// Am → F → C → G   (A3=220 C4=262 E4=330 A4=440 / F3=175 C3=131 G3=196 G4=392)
const CHIP_MT_ARP = [
  // Bar 1  Am
  220, 262, 330, 440, 330, 440, 262, 330,
  // Bar 2  F
  175, 220, 262, 349, 262, 349, 220, 262,
  // Bar 3  C
  131, 262, 330, 392, 330, 392, 262, 330,
  // Bar 4  G
  196, 247, 294, 392, 294, 392, 247, 294,
];


// ── Chorus — upper octave, bigger leaps, brighter energy ──────
// Am high: A4=440 C5=523 E5=659 A5=880 / F4=349 C5=523 F5=698
// G4=392 B4=494 D5=587 G5=784
const CHIP_CH_ARP = [
  // Bar 1  Am  — leap to A5
  440, 523, 659, 880, 659, 880, 523, 659,
  // Bar 2  F   — F4→C5→F5
  349, 440, 523, 698, 523, 698, 440, 523,
  // Bar 3  C   — bright C run
  262, 523, 659, 784, 659, 784, 523, 659,
  // Bar 4  G   — triumphant run to G5
  392, 494, 587, 784, 587, 784, 587, 880,
];

// ── Main Theme — drums ────────────────────────────────────────
const CHIP_MT_KICK = [
  1,0,0,0, 1,0,0,0,  1,0,0,0, 1,0,0,0,
  1,0,0,0, 1,0,0,0,  1,0,0,0, 1,0,0,0,
];
const CHIP_MT_SNARE = [
  0,0,1,0, 0,0,1,0,  0,0,1,0, 0,0,1,0,
  0,0,1,0, 0,0,1,0,  0,0,1,0, 0,0,1,0,
];
const CHIP_MT_HIHAT = [
  1,0,1,0, 1,0,1,0,  1,0,1,0, 1,0,1,0,
  1,0,1,0, 1,0,1,0,  1,0,1,0, 1,0,1,0,
];

// ── Chorus — drums (double hi-hats, extra kicks) ──────────────
const CHIP_CH_KICK = [
  1,0,0,0, 1,0,1,0,  1,0,0,0, 1,0,0,0,
  1,0,0,0, 1,0,1,0,  1,0,1,0, 1,0,0,0,
];
const CHIP_CH_SNARE = [
  0,0,1,0, 0,0,1,0,  0,0,1,0, 0,0,1,0,
  0,0,1,0, 0,0,1,0,  0,0,1,1, 0,0,1,1,
];
const CHIP_CH_HIHAT = [
  1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1,
  1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1,
];

// ── Chorus 2 — peak climax: cascading runs through C6, driving bass ──
// C6=1047  A5=880  G5=784  F5=698  E5=659  C5=523
const CHIP_CH2_ARP = [
  // Bar 1  Am  — cascade from A5 down then leap to C6
  880, 659, 523, 880, 659, 880,1047, 880,
  // Bar 2  F   — F5 peak, shimmer down
  698, 523, 440, 698, 523, 698, 880,1047,
  // Bar 3  C   — tension: step up to C6 and hold peak
  784, 659, 784, 880,1047, 880, 784, 659,
  // Bar 4  G   — triumphant finish, runs up to C6
  784, 880, 784, 659, 784, 880,1047, 880,
];

// ── Chorus — bass (root-fifth walking line, one octave below arp) ─────
// Am=110  E2=82  F2=87  C2=65  G2=98  D2=73
const CHIP_CH_BASS = [
  // Bar 1  Am  — root, fifth, root, octave walk
  110,  0, 82,  0, 110,  0, 165,  0,
  // Bar 2  F   — root, fifth, approach C
   87,  0, 65,  0,  87,  0, 131,  0,
  // Bar 3  C   — root, fifth, walk up
   65,  0, 98,  0,  65,  0, 131,  0,
  // Bar 4  G   — root, fifth, back to Am
   98,  0, 65,  0,  98,  0, 110,  0,
];

// ── Chorus 2 — bass (same chords as CH but busier rhythm, extra fill notes) ──
const CHIP_CH2_BASS = [
  // Bar 1  Am  — root, fifth, push up
  110,  0, 110,  0, 165,  0, 147,  0,
  // Bar 2  F   — root, fifth, approach
   87,  0,  87,  0, 131,  0, 110,  0,
  // Bar 3  C   — root, fifth, drive
   65,  0,  98,  0, 131,  0,  98,  0,
  // Bar 4  G   — root, fifth, back to Am
   98,  0,  98,  0, 147,  0, 110,  0,
];

// ── Chorus 2 — drums (maximum energy: kick on every beat, snare fills) ─
const CHIP_CH2_KICK = [
  1,0,1,0, 1,0,1,0,  1,0,1,0, 1,0,1,0,
  1,0,1,0, 1,0,1,0,  1,1,0,1, 1,0,1,0,
];
const CHIP_CH2_SNARE = [
  0,0,1,0, 0,0,1,0,  0,0,1,0, 0,0,1,1,
  0,0,1,0, 0,0,1,1,  0,0,1,1, 1,0,1,1,
];
const CHIP_CH2_HIHAT = [
  1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1,
  1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1,
];

function _schedChip(stepIdx, when) {
  const fullIdx = stepIdx % CHIP_FULL_LEN;
  const section = Math.floor(fullIdx / CHIP_SEC_LEN);
  const i       = fullIdx % CHIP_SEC_LEN;
  const secType = CHIP_SECTIONS[section]; // 0=MT  1=CH  2=CH2

  const ARP   = secType === 2 ? CHIP_CH2_ARP   : secType === 1 ? CHIP_CH_ARP   : CHIP_MT_ARP;
  const KICK  = secType === 2 ? CHIP_CH2_KICK  : secType === 1 ? CHIP_CH_KICK  : CHIP_MT_KICK;
  const SNARE = secType === 2 ? CHIP_CH2_SNARE : secType === 1 ? CHIP_CH_SNARE : CHIP_MT_SNARE;
  const HIHAT = secType === 2 ? CHIP_CH2_HIHAT : secType === 1 ? CHIP_CH_HIHAT : CHIP_MT_HIHAT;

  // Arpeggio — stronger accent on CH2
  const arpVol = (i % 2 === 0) ? (secType === 2 ? 0.11 : 0.09) : (secType === 2 ? 0.08 : 0.06);
  _toneAt(when, ARP[i], CHIP_STEP * 0.68, { type: 'square', vol: arpVol, attack: 0.002 });

  // Bass — CH and CH2
  if (secType === 1 && CHIP_CH_BASS[i]) {
    _toneAt(when, CHIP_CH_BASS[i],  CHIP_STEP * 0.85, { type: 'square', vol: 0.13, attack: 0.004 });
  }
  if (secType === 2 && CHIP_CH2_BASS[i]) {
    _toneAt(when, CHIP_CH2_BASS[i], CHIP_STEP * 0.80, { type: 'square', vol: 0.16, attack: 0.004 });
  }

  // Drums
  if (KICK[i])  _kick (when, secType === 2 ? 0.48 : 0.38);
  if (SNARE[i]) _snare(when, secType === 2 ? 0.32 : secType === 1 ? 0.26 : 0.20);
  if (HIHAT[i]) _hihat(when, false, secType === 2 ? 0.10 : secType === 1 ? 0.08 : 0.06);
}

// ── Track 2 — Synth-Pop ───────────────────────────────────────
// 4/4, 128 BPM, 16th-note steps.
// Structure: MT MT CH MT CH CH  (6 sections × 64 steps = 384 total)
//            then loops back to beginning.
// Chord progression: Am → F → C → G (classic i–VI–III–VII)
const SP_STEP     = 60 / 128 / 4;   // ~0.117 s per 16th note
const SP_SEC_LEN  = 64;             // steps per section (4 bars)
const SP_SECTIONS = [0, 0, 1, 0, 1, 1]; // 0 = main theme, 1 = chorus
const SP_FULL_LEN = SP_SECTIONS.length * SP_SEC_LEN; // 384

// ── Main Theme ────────────────────────────────────────────────
// Drum patterns  (1 = hit, 0 = rest)
const SP_MT_KICK = [
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,   // bar 1
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,   // bar 2
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,   // bar 3
  1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,0,0,   // bar 4 (fill)
];
const SP_MT_SNARE = [
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1,   // extra hit on bar 4
];
const SP_MT_HIHAT = [
  0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1,   // 8th-note hihats
  0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1,
  0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1,
  0,1,0,1, 0,1,0,1, 0,1,1,1, 0,1,0,1,   // open hats in fill
];

// Bass — roots & 5ths, A2=110  E2=82.4  F2=87.3  C2=65.4  G2=98  D2=73.4
const SP_MT_BASS = [
  // Bar 1  Am
  110,  0,  0,  0,   0,  0,110,  0,  82.4,0,  0,  0,  110,  0,  0,  0,
  // Bar 2  F
  87.3, 0,  0,  0,   0,  0,87.3, 0,  65.4,0,  0,  0,  87.3, 0,  0,  0,
  // Bar 3  C
  65.4, 0,  0,  0,   0,  0,65.4, 0,  98,  0,  0,  0,  65.4, 0,  0,  0,
  // Bar 4  G
  98,   0,  0,  0,   0,  0,98,   0,  73.4,0,  0,  0,  98,   0,  0,  0,
];

// Lead melody — catchy ascending hook in Am
// E5=659  G5=784  A5=880  D5=587  C5=523  F5=698  A4=440
const SP_MT_LEAD = [
  // Bar 1  Am  — ascending hook
  659,  0,  0,  0,   880,  0,784,  0,   659,  0,  0,  0,   587,  0,523,  0,
  // Bar 2  F   — sustained, resolved down
  698,  0,  0,  0,   659,  0,  0,  0,   523,  0,  0,  0,     0,  0,  0,  0,
  // Bar 3  C   — climb then step
  659,  0,  0,  0,   784,  0,659,  0,   523,  0,587,  0,   659,  0,  0,  0,
  // Bar 4  G   — resolve down to A
  784,  0,698,  0,   659,  0,587,  0,     0,  0,440,  0,     0,  0,  0,  0,
];

// Chord voicings — Am → F → C → G (one octave below lead)
const SP_CHORDS = [
  [220.0, 261.6, 329.6],  // Am : A3  C4  E4
  [174.6, 220.0, 261.6],  // F  : F3  A3  C4
  [130.8, 164.8, 196.0],  // C  : C3  E3  G3
  [196.0, 246.9, 293.7],  // G  : G3  B3  D4
];

// ── Chorus ────────────────────────────────────────────────────
// Higher energy: leaps to C6, busier drums, brighter pad voicings.
// C6=1047  A5=880  G5=784  F5=698  E5=659  D5=587  C5=523  A4=440
const SP_CH_KICK = [
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,   // bar 1
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,   // bar 2
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,   // bar 3
  1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,0,0,   // bar 4 (fill)
];
const SP_CH_SNARE = [
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,1,1,   // bigger fill
];
const SP_CH_HIHAT = [
  1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0,   // 16th-note hihats (doubled density)
  1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0,
  1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0,
  1,0,1,0, 1,0,1,0, 1,1,1,1, 1,0,1,1,   // 16th fury in bar 4
];

// Bass — same roots, added rhythmic fills in bars 1 and 4
const SP_CH_BASS = [
  // Bar 1  Am — extra hit on beat 2
  110,  0,110,  0,   0,  0,110,  0,  82.4,0,  0,  0,  110,  0,  0,  0,
  // Bar 2  F
  87.3, 0,  0,  0,   0,  0,87.3, 0,  65.4,0,  0,  0,  87.3, 0,  0,  0,
  // Bar 3  C
  65.4, 0,  0,  0,   0,  0,65.4, 0,  98,  0,  0,  0,  65.4, 0,  0,  0,
  // Bar 4  G — walk up at end
  98,   0,  0,  0,   0,  0,98,   0,  73.4,0,  0,  0,  98,   0,73.4, 0,
];

// Lead melody — leap to C6, triumphant descend in bar 4
const SP_CH_LEAD = [
  // Bar 1  Am  — big opening leap
  880,  0,  0,  0,  1047,  0,880,  0,   784,  0,  0,  0,   659,  0,523,  0,
  // Bar 2  F   — sustained high, resolve
  698,  0,880,  0,   784,  0,698,  0,   659,  0,  0,  0,     0,  0,  0,  0,
  // Bar 3  C   — energetic run
  659,  0,784,  0,   880,  0,784,  0,   659,  0,784,  0,   880,  0,  0,  0,
  // Bar 4  G   — triumphant descend
  784,  0,698,  0,   784,  0,880,  0,   784,  0,659,  0,   523,  0,440,  0,
];

// Pad — one octave higher for brightness in chorus
const SP_CH_CHORDS = [
  [440.0, 523.3, 659.3],  // Am high: A4  C5  E5
  [349.2, 440.0, 523.3],  // F  high: F4  A4  C5
  [261.6, 329.6, 392.0],  // C  high: C4  E4  G4
  [392.0, 493.9, 587.3],  // G  high: G4  B4  D5
];

// Pad voice — warm, slow-attack, lowpass-filtered sawtooth cluster.
// 3 detuned oscillators per chord note; filter sweeps open then closes (pad "breathe").
function _pad(when, chord, dur, vol = 0.052) {
  try {
    const ctx = getAudioCtx();
    chord.forEach(freq => {
      [-0.005, 0, 0.005].forEach(detune => {
        const osc  = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.connect(filt); filt.connect(gain); gain.connect(_masterBus);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * (1 + detune), when);

        // Filter sweep: closed → open → close (pad breathe)
        filt.type = 'lowpass'; filt.Q.value = 1.8;
        filt.frequency.setValueAtTime(400, when);
        filt.frequency.linearRampToValueAtTime(2400, when + dur * 0.35);
        filt.frequency.exponentialRampToValueAtTime(500, when + dur);

        // Slow attack, sustain, fast release
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(vol / chord.length, when + 0.22);
        gain.gain.setValueAtTime(vol / chord.length * 0.8, when + dur - 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, when + dur);

        osc.start(when); osc.stop(when + dur + 0.01);
      });
    });
  } catch (_) {}
}

function _schedSynthPop(stepIdx, when) {
  const fullIdx  = stepIdx % SP_FULL_LEN;
  const section  = Math.floor(fullIdx / SP_SEC_LEN);
  const i        = fullIdx % SP_SEC_LEN;
  const isChorus = SP_SECTIONS[section] === 1;

  const KICK   = isChorus ? SP_CH_KICK   : SP_MT_KICK;
  const SNARE  = isChorus ? SP_CH_SNARE  : SP_MT_SNARE;
  const HIHAT  = isChorus ? SP_CH_HIHAT  : SP_MT_HIHAT;
  const BASS   = isChorus ? SP_CH_BASS   : SP_MT_BASS;
  const LEAD   = isChorus ? SP_CH_LEAD   : SP_MT_LEAD;
  const CHORDS = isChorus ? SP_CH_CHORDS : SP_CHORDS;

  const bDur = SP_STEP * 3.5; // duration for bass/lead (~dotted 8th)

  if (KICK[i])  _kick (when);
  if (SNARE[i]) _snare(when);
  if (HIHAT[i]) _hihat(when, /* open= */ i === 62);
  if (BASS[i])  _bass (when, BASS[i], bDur);
  if (LEAD[i])  _lead (when, LEAD[i], bDur * 0.9);

  // Chord pad — fires on beat 1 of each bar (every 16 steps).
  // Duration covers the full bar minus a tiny gap before the next chord.
  if (i % 16 === 0) _pad(when, CHORDS[Math.floor(i / 16) % 4], SP_STEP * 15.5);
}

// ── Track 3 — 8-bit Arcade ────────────────────────────────────
// A minor pentatonic, 160 BPM, 16th-note steps.
// Structure: MT MT CH MT CH CH  (6 sections × 32 steps = 192 total)
//            then loops back to beginning.
const BIT_STEP     = 60 / 160 / 4;   // ~0.094 s per 16th note
const BIT_SEC_LEN  = 32;             // steps per section (2 bars)
const BIT_SECTIONS = [0, 0, 1, 0, 1, 1]; // 0 = main theme, 1 = chorus
const BIT_FULL_LEN = BIT_SECTIONS.length * BIT_SEC_LEN; // 192

// ── Main Theme ────────────────────────────────────────────────
// Descend from A5, climb back — classic 8-bit arch shape.
// A5=880  G5=784  E5=659  D5=587  C5=523
const BIT_MT_LEAD = [
  // Bar 1 — descend
  880,   0,   0,   0,   784,   0, 659,   0,     0,   0, 587,   0,   659,   0,   0,   0,
  // Bar 2 — climb back
  523,   0, 587,   0,   659,   0, 784,   0,   880,   0,   0,   0,   784,   0, 659,   0,
];
// Counter-pulse — off-beat 3rds/5ths below the lead
// A4=440  G4=392  E4=330  D4=294  C4=262
const BIT_MT_PULSE = [
    0,   0, 440,   0,     0,   0, 392,   0,     0,   0, 294,   0,     0,   0, 330,   0,
    0,   0, 262,   0,     0,   0, 330,   0,     0,   0, 440,   0,     0,   0, 392,   0,
];
// Bass — roots A2/E2/F2/G2
// A2=110  E2=82.4  F2=87.3  G2=98
const BIT_MT_BASS = [
  110,   0,   0,   0,  82.4,   0,   0,   0,  82.4,   0,   0,   0,   110,   0,   0,   0,
  110,   0,   0,   0,    87,   0,   0,   0,    98,   0,   0,   0,   110,   0,   0,   0,
];
// Percussion — kick on 1&3, snare on 2&4, 8th-note hi-hats
const BIT_MT_KICK  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
const BIT_MT_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
const BIT_MT_HAT   = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0];

// ── Chorus ────────────────────────────────────────────────────
// Higher energy: leaps up to C6, busier rhythm, denser percussion.
// C6=1047  A5=880  G5=784  E5=659  D5=587
const BIT_CH_LEAD = [
  // Bar 1 — big upward leap, then settle
  880,   0, 1047,   0,   880,   0, 784,   0,   659,   0, 784,   0,   880,   0,   0,   0,
  // Bar 2 — hold the peak, cascade down, final jump
  1047,  0,    0,   0,   880,   0, 784,   0,   659,   0, 587,   0,   659,   0, 880,   0,
];
// Counter-pulse — higher harmonics match the chorus energy
// C5=523  E5=659  A4=440  G4=392  D4=294
const BIT_CH_PULSE = [
    0, 523,   0, 659,     0, 523,   0, 392,     0, 330,   0, 440,     0, 523,   0,   0,
    0, 659,   0, 523,     0, 523,   0, 440,     0, 330,   0, 294,     0, 330,   0, 523,
];
// Bass — F section added for harmonic contrast
const BIT_CH_BASS = [
  110,   0,   0,   0,  87.3,   0,   0,   0,  87.3,   0,   0,   0,   110,   0,   0,   0,
  87.3,  0,   0,   0,    98,   0,   0,   0,   110,   0,   0,   0,    98,   0,   0,   0,
];
// Percussion — 8th-note hihats (double density), extra kick/snare fills
const BIT_CH_KICK  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0];
const BIT_CH_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0];
const BIT_CH_HAT   = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1];

// Simple square-wave voice (no reverb/detune — pure chiptune feel)
function _bitNote(when, freq, dur, vol = 0.11) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(_masterBus);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(vol, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.start(when); osc.stop(when + dur + 0.01);
  } catch (_) {}
}

function _schedBit(stepIdx, when) {
  const fullIdx  = stepIdx % BIT_FULL_LEN;
  const section  = Math.floor(fullIdx / BIT_SEC_LEN);
  const i        = fullIdx % BIT_SEC_LEN;
  const isChorus = BIT_SECTIONS[section] === 1;

  const LEAD  = isChorus ? BIT_CH_LEAD  : BIT_MT_LEAD;
  const PULSE = isChorus ? BIT_CH_PULSE : BIT_MT_PULSE;
  const BASS  = isChorus ? BIT_CH_BASS  : BIT_MT_BASS;
  const KICK  = isChorus ? BIT_CH_KICK  : BIT_MT_KICK;
  const SNARE = isChorus ? BIT_CH_SNARE : BIT_MT_SNARE;
  const HAT   = isChorus ? BIT_CH_HAT   : BIT_MT_HAT;

  const mDur = BIT_STEP * 0.82;   // melody note — slightly detached
  const bDur = BIT_STEP * 3.2;    // bass note — longer sustain

  if (KICK[i])  _kick   (when, 0.42);
  if (SNARE[i]) _snare  (when, 0.25);
  if (HAT[i])   _hihat  (when, false, 0.06);
  if (LEAD[i])  _bitNote(when, LEAD[i],  mDur, 0.11);
  if (PULSE[i]) _bitNote(when, PULSE[i], mDur * 1.6, 0.07);
  if (BASS[i])  _bitNote(when, BASS[i],  bDur, 0.15);
}

// ── Track 4 — Lode Runner Melody ─────────────────────────────
// Mario underground-inspired: chromatic bass ostinato + syncopated
// square melody. C chromatic/minor feel, 140 BPM, 16th-note steps.
// Structure: MT1→CH→MT1→CH→MT2→MT2→CH  (7 × 32 = 224 steps, ~24 s)
// Section types: 0=MT1  1=CH  2=MT2
// 0 = rest / hold.
const LR_STEP     = 60 / 140 / 4;   // ~0.107 s per 16th note
const LR_SEC_LEN  = 32;
const LR_SECTIONS = [0, 1, 0, 1, 2, 2, 1];
const LR_FULL_LEN = LR_SECTIONS.length * LR_SEC_LEN; // 224

// ── Theme 1 ───────────────────────────────────────────────────
// Mirrors the SMB underground first phrase:
//   E G C D E C G(rest) | F G Ab A C A(rest)(rest)
// E4=330 G4=392 C5=523 D5=587 E5=659 F4=349 Ab4=415 A4=440
const LR_MT1_MEL = [
  330, 0, 392, 0,  523, 0, 587, 0,  659, 0, 523, 0,  392, 0,   0, 0,
  349, 0, 392, 0,  415, 0, 440, 0,  523, 0, 440, 0,    0, 0,   0, 0,
];

// ── Theme 2 ───────────────────────────────────────────────────
// Contrasting descending phrase — steps down chromatically then
// turns back up, like the SMB underground B-section feel.
// E5=659 D5=587 C5=523 B4=494 C5=523 Ab4=415 G4=392
// F4=349 Ab4=415 A4=440 C5=523 D5=587 C5=523
const LR_MT2_MEL = [
  659, 0, 587, 0,  523, 0, 494, 0,  523, 0, 415, 0,  392, 0,   0, 0,
  349, 0, 415, 0,  440, 0, 523, 0,  587, 0, 523, 0,    0, 0,   0, 0,
];

// ── Chorus ────────────────────────────────────────────────────
// Leaps up to G5, high-energy descent back down.
// G5=784 E5=659 C5=523 Ab4=415 A4=440
const LR_CH_MEL = [
  659, 0,   0, 0,  523, 0, 659, 0,  784, 0,   0, 0,  659, 0, 523, 0,
  415, 0, 440, 0,  523, 0, 659, 0,  523, 0, 392, 0,  330, 0,   0, 0,
];

// ── Bass (shared) ─────────────────────────────────────────────
// Iconic chromatic walk: C–C–Ab–C–Eb–C–F#–B (quarter notes)
// C3=131 Ab2=104 Eb3=156 F#2=93 B2=123
const LR_BAS = [
  131, 0, 0, 0,  131, 0, 0, 0,  104, 0, 0, 0,  131, 0, 0, 0,
  156, 0, 0, 0,  131, 0, 0, 0,   93, 0, 0, 0,  123, 0, 0, 0,
];

// ── Percussion (shared) ───────────────────────────────────────
// Light underground-feel: kick on 1+3, closed hihat on 2+4
const LR_KICK  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0,
                  1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
const LR_HIHAT = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
                  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];

function _schedLR(stepIdx, when) {
  const sec     = Math.floor((stepIdx % LR_FULL_LEN) / LR_SEC_LEN);
  const i       = stepIdx % LR_SEC_LEN;
  const secType = LR_SECTIONS[sec];  // 0=MT1 1=CH 2=MT2

  const isMT = secType === 0 || secType === 2;

  if (!isMT && LR_KICK[i])  _kick (when, 0.28);
  if (!isMT && LR_HIHAT[i]) _hihat(when, false, 0.04);

  // MT sections play bass only — melody suppressed
  if (secType === 1 && LR_CH_MEL[i])
    _toneAt(when, LR_CH_MEL[i],  LR_STEP * 1.7, { type: 'square', vol: 0.11, attack: 0.004 });
  if (LR_BAS[i])
    _toneAt(when, LR_BAS[i],     LR_STEP * 3.6, { type: 'triangle', vol: 0.09, attack: 0.012 });
}

// ── Track 5 — Patriot ────────────────────────────────────────
// D minor / Phrygian: ominous danger march, heavy chromaticism.
// 140 BPM, 16th-note steps. Structure: MT1→CH→MT2→CH→MT1→CH
// Key colors: Eb (Phrygian b2), Ab (tritone of D), Bb (b6) — all dark.
// Section types: 0=MT1  1=CH  2=MT2
const PAT_STEP     = 60 / 140 / 4;   // ~0.107 s per 16th note
const PAT_SEC_LEN  = 32;
const PAT_SECTIONS = [0, 1, 2, 1, 0, 1];
const PAT_FULL_LEN = PAT_SECTIONS.length * PAT_SEC_LEN; // 192

// Frequencies reference:
// D4=294  Eb4=311  F4=349  F#4=370  G4=392  Ab4=415  A4=440  Bb4=466
// C5=523  C#5=554  D5=587  Eb5=622  F5=698  G5=784  Ab5=831
// D2=73.4  Eb2=77.8  F2=87.3  G2=98  Ab2=103.8  A2=110  Bb2=116.5  D3=146.8

// ── Main Theme 1 ─────────────────────────────────────────────
// "The Warning" — Phrygian call (D→Eb sharp sting) then chromatic descent
const PAT_MT1_LEAD = [
  587,  0,  0,  0,  622,  0, 587,  0,  440,  0,  0,  0,  415,  0, 392,  0,
  349,  0, 392,  0,  415,  0, 440,  0,  466,  0,  0,  0,  440,  0,  0,  0,
];
// Minor-3rd lower — creates thick, dark two-voice texture
// (B4=494 pairs with D5; C5=523 with Eb5; F#4=370 with A4; Bb3=233 with D4)
const PAT_MT1_HARM = [
  494,  0,  0,  0,  523,  0, 494,  0,  370,  0,  0,  0,  330,  0, 311,  0,
  294,  0, 311,  0,  330,  0, 370,  0,  392,  0,  0,  0,  370,  0,  0,  0,
];
// Bass — D pedal with chromatic climb under the phrase
// D2→A2→Ab2→G2 then F2→G2→Ab2→A2→Bb2
const PAT_MT1_BASS = [
   73.4, 0,  0,  0,  73.4,  0,  0,  0,  110,  0,   0,   0, 103.8, 0,  98,  0,
   87.3, 0,  0,  0,    98,  0,103.8,  0,  110,  0, 116.5, 0,   0,  0, 110,  0,
];

// ── Main Theme 2 ─────────────────────────────────────────────
// "Chromatic Storm" — whole-step chromatic climb then catastrophic fall
const PAT_MT2_LEAD = [
  349,  0, 415,  0,  466,  0, 523,  0,  587,  0, 622,  0,  587,  0, 523,  0,
  466,  0, 440,  0,  415,  0, 392,  0,  349,  0, 311,  0,  294,  0,  0,  0,
];
// Minor-3rd below: D4→Bb3=233, F4→D4=294, Ab4→E4=330, Bb4→G4=392, D5→B4=494, Eb5→C5=523
const PAT_MT2_HARM = [
  294,  0, 330,  0,  392,  0, 440,  0,  494,  0, 523,  0,  494,  0, 440,  0,
  392,  0, 370,  0,  330,  0, 311,  0,  294,  0, 262,  0,  247,  0,  0,  0,
];
// Bass — ascending chromatic walk F2→D3 then reversal
const PAT_MT2_BASS = [
   87.3, 0,  0,  0, 103.8,  0,  0,  0, 116.5,  0,   0,  0, 130.8, 0,  0,  0,
  146.8, 0,  0,  0, 130.8,  0,116.5,  0,   110,  0, 103.8, 0,  98,  0, 87.3, 0,
];

// ── Chorus ───────────────────────────────────────────────────
// "The Storm" — D→Ab tritone leap (devil's interval) anchors the climax
// then crashes down through Eb5/C#5 dissonances
const PAT_CH_LEAD = [
  294,  0, 349,  0,  415,  0, 587,  0,  554,  0, 587,  0,  622,  0,  0,  0,
  698,  0, 622,  0,  587,  0, 554,  0,  523,  0, 466,  0,  440,  0, 294,  0,
];
// Minor-3rd below: D4→Bb3=233, F4→D4=294, Ab4→E4=330, D5→B4=494, C#5→A#4=466, Eb5→C5=523
const PAT_CH_HARM = [
  233,  0, 294,  0,  330,  0, 494,  0,  440,  0, 494,  0,  523,  0,  0,  0,
  587,  0, 523,  0,  494,  0, 440,  0,  415,  0, 370,  0,  349,  0, 233,  0,
];
// Bass — D pedal, tritone Ab2 jab, chromatic descent back
const PAT_CH_BASS = [
   73.4, 0,  0,  0,  73.4,  0,  0,  0, 103.8,  0,   0,  0,   110,  0,  0,  0,
  116.5, 0,  0,  0,   110,  0,103.8,  0,    98,  0,  87.3, 0, 77.8, 0, 73.4, 0,
];

// ── Drums — ominous heavy march ──────────────────────────────
// Quarter-note hihats in main themes = slow stomp, danger approaching
const PAT_MT_KICK  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
const PAT_MT_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
const PAT_MT_HAT   = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];
// Chorus: double kick + 8th hihats = relentless assault
const PAT_CH_KICK  = [1,0,0,0, 1,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0, 0,0,0,0];
const PAT_CH_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,1];
const PAT_CH_HAT   = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1];

function _schedPatriot(stepIdx, when) {
  const sec      = Math.floor((stepIdx % PAT_FULL_LEN) / PAT_SEC_LEN);
  const i        = stepIdx % PAT_SEC_LEN;
  const secType  = PAT_SECTIONS[sec];  // 0=MT1  1=CH  2=MT2
  const isChorus = secType === 1;

  const LEAD  = secType === 2 ? PAT_MT2_LEAD : isChorus ? PAT_CH_LEAD : PAT_MT1_LEAD;
  const HARM  = secType === 2 ? PAT_MT2_HARM : isChorus ? PAT_CH_HARM : PAT_MT1_HARM;
  const BASS  = secType === 2 ? PAT_MT2_BASS : isChorus ? PAT_CH_BASS : PAT_MT1_BASS;
  const KICK  = isChorus ? PAT_CH_KICK  : PAT_MT_KICK;
  const SNARE = isChorus ? PAT_CH_SNARE : PAT_MT_SNARE;
  const HAT   = isChorus ? PAT_CH_HAT   : PAT_MT_HAT;

  const mDur = PAT_STEP * 0.78;
  const hDur = PAT_STEP * 1.50;
  const bDur = PAT_STEP * 3.60;

  if (KICK[i])  _kick  (when, 0.58);
  if (SNARE[i]) _snare (when, 0.38);
  // Open hihat on beat 1 of each bar — ominous sustain
  if (HAT[i])   _hihat (when, i === 0 || i === 16, isChorus ? 0.09 : 0.06);
  if (LEAD[i])  _bitNote(when, LEAD[i], mDur, isChorus ? 0.14 : 0.12);
  if (HARM[i])  _bitNote(when, HARM[i], hDur, 0.08);
  if (BASS[i])  _bitNote(when, BASS[i], bDur, 0.18);
}

// ── Lookahead scheduler ───────────────────────────────────────
// schedules notes up to LOOKAHEAD seconds into the future,
// called every SCHED_INT ms. This gives accurate, glitch-free timing.
const LOOKAHEAD  = 0.13;  // seconds
const SCHED_INT  = 25;    // ms

let _track    = 1;   // 0=off  1=chip  2=synth  3=8bit  4=dungeon  5=patriot
let _schedInt = null;
let _stepIdx  = 0;
let _stepTime = 0;   // audioCtx time of the next step to schedule

function _schedulerTick() {
  if (_track === 0) return;
  const ctx   = getAudioCtx();
  const stepS = _track === 1 ? CHIP_STEP
              : _track === 2 ? SP_STEP
              : _track === 3 ? BIT_STEP
              : _track === 4 ? LR_STEP
              : PAT_STEP;
  const loopL = _track === 1 ? CHIP_FULL_LEN
              : _track === 2 ? SP_FULL_LEN
              : _track === 3 ? BIT_FULL_LEN
              : _track === 4 ? LR_FULL_LEN
              : PAT_FULL_LEN;

  while (_stepTime < ctx.currentTime + LOOKAHEAD) {
    if      (_track === 1) _schedChip    (_stepIdx, _stepTime);
    else if (_track === 2) _schedSynthPop(_stepIdx, _stepTime);
    else if (_track === 3) _schedBit     (_stepIdx, _stepTime);
    else if (_track === 4) _schedLR      (_stepIdx, _stepTime);
    else                   _schedPatriot (_stepIdx, _stepTime);
    _stepIdx  = (_stepIdx + 1) % loopL;
    _stepTime += stepS;
  }
}

// ── Public music API ──────────────────────────────────────────

let _musicEnabled = true;

function startMusic() {
  if (!_musicEnabled) return; // muted by user
  if (_track === 0) return;   // no track selected
  if (_schedInt)    return;   // already running
  const ctx  = getAudioCtx();
  _stepIdx   = 0;
  _stepTime  = ctx.currentTime + 0.05;  // small offset to avoid click
  _schedInt  = setInterval(_schedulerTick, SCHED_INT);
}

function stopMusic() {
  if (_schedInt) { clearInterval(_schedInt); _schedInt = null; }
  // Pre-scheduled notes (within LOOKAHEAD window) will finish naturally
}

// Cycle:  chip (1) → synth (2) → 8bit (3) → dungeon (4) → patriot (5) → chip (1) → …
// Returns { track, name } so the UI can update its label.
function cycleTrack() {
  stopMusic();
  _track = (_track % 5) + 1;  // 1→2→3→4→5→1, never 0
  if (_musicEnabled) startMusic();
  const names = ['', 'CHIP', 'SYNTH', '8BIT', 'DUNGEON', 'PATRIOT'];
  return { track: _track, name: names[_track] };
}

// Toggle music on/off without changing the selected track.
function toggleMusic() {
  _musicEnabled = !_musicEnabled;
  if (_musicEnabled) { startMusic(); } else { stopMusic(); }
  return { on: _musicEnabled };
}

function getTrack() { return _track; }

// Set the active track without starting/stopping playback.
// Call before startMusic() to set a per-game default.
// 0 = off, 1 = chip, 2 = synth-pop, 3 = 8-bit arcade
function setTrack(n) { _track = n; }

// ── Expose globally ───────────────────────────────────────────
window.NeonArcade = { SFX, startMusic, stopMusic, cycleTrack, toggleMusic, getTrack, setTrack, getAudioCtx, getMasterBus };
