/* ============================================================
   Neon Arcade — Common Audio & Utilities
   ============================================================ */
'use strict';

// ── Audio Context ─────────────────────────────────────────────
let _audioCtx      = null;
let _noiseBuffer   = null;  // pre-baked white noise for drums
let _masterBus     = null;  // DynamicsCompressor → destination (all audio routes here)
let _leadDelayNode = null;  // persistent delay node for lead echo

// Lead echo: 3 × 16th notes at 128 BPM ≈ 0.352 s (dotted-8th Space-Echo feel).
const _LEAD_ECHO_DELAY = (60 / 128 / 4) * 3;

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
    _leadDelayNode = _audioCtx.createDelay(1.0);
    _leadDelayNode.delayTime.value = _LEAD_ECHO_DELAY;

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

  // Robot shoot: low blip, quieter and duller than player shot
  berzerkRobotShoot() {
    playTone(320, 0.05, { type: 'square', vol: 0.08 });
    setTimeout(() => playTone(200, 0.04, { type: 'square', vol: 0.05 }), 25);
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

  // Brotto appears: slow rising wail with vibrato — eerie and wavy
  berzerkBrotto() {
    const ctx = getAudioCtx();
    const bus = getMasterBus();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(340, ctx.currentTime + 1.2);
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5, ctx.currentTime);
    lfoGain.gain.setValueAtTime(28, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.15);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.9);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.3);
    osc.connect(gain);
    gain.connect(bus);
    lfo.start(ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.3);
    lfo.stop(ctx.currentTime + 1.3);
  },

  // Brotto moving: short rapid wobble pulse — plays periodically while chasing
  berzerkBrottoMove() {
    const ctx = getAudioCtx();
    const bus = getMasterBus();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, ctx.currentTime);
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(18, ctx.currentTime);
    lfoGain.gain.setValueAtTime(90, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.04);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(bus);
    lfo.start(ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);
    lfo.stop(ctx.currentTime + 0.22);
  },

  // Room entered: quick 3-note ascending portal sweep
  berzerkRoomEnter() {
    scheduleNotes([
      { freq: 220, start: 0,    dur: 0.07, opts: { type: 'square', vol: 0.18 } },
      { freq: 330, start: 0.08, dur: 0.07, opts: { type: 'square', vol: 0.20 } },
      { freq: 440, start: 0.16, dur: 0.12, opts: { type: 'square', vol: 0.22 } },
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


  // ── BLOCK'N'BALL (arkanoid) SFX ───────────────────────────────
  // Ball hits a brick: crisp mid-frequency click
  arkanoidHit() {
    playTone(520, 0.04, { type: 'square', vol: 0.20 });
    setTimeout(() => playTone(380, 0.03, { type: 'square', vol: 0.12 }), 20);
  },

  // Ball bounces off a wall or indestructible brick: short dull thud
  arkanoidWall() {
    playTone(200, 0.05, { type: 'square', vol: 0.14 });
  },

  // Ball hits paddle: satisfying mid-low pop
  arkanoidPaddle() {
    playTone(310, 0.06, { type: 'triangle', vol: 0.22 });
    setTimeout(() => playTone(440, 0.04, { type: 'triangle', vol: 0.14 }), 25);
  },

  // Power-up capsule caught: bright ascending shimmer
  arkanoidBonus() {
    scheduleNotes([
      { freq: 523,  start: 0,    dur: 0.055, opts: { type: 'square', vol: 0.18 } },
      { freq: 784,  start: 0.06, dur: 0.055, opts: { type: 'square', vol: 0.22 } },
      { freq: 1047, start: 0.12, dur: 0.09,  opts: { type: 'square', vol: 0.26 } },
      { freq: 1319, start: 0.21, dur: 0.14,  opts: { type: 'square', vol: 0.30 } },
    ]);
  },

  // Laser fired: sharp electronic zap
  arkanoidLaser() {
    playTone(1800, 0.04, { type: 'square', vol: 0.20 });
    setTimeout(() => playTone(900, 0.06, { type: 'square', vol: 0.12 }), 25);
  },

  // Ball lost (miss): descending alarm pulse
  arkanoidLose() {
    scheduleNotes([
      { freq: 440, start: 0,    dur: 0.12, opts: { type: 'sawtooth', vol: 0.28 } },
      { freq: 330, start: 0.14, dur: 0.12, opts: { type: 'sawtooth', vol: 0.28 } },
      { freq: 220, start: 0.28, dur: 0.18, opts: { type: 'sawtooth', vol: 0.30 } },
      { freq: 110, start: 0.48, dur: 0.30, opts: { type: 'sawtooth', vol: 0.32 } },
    ]);
  },

  // Level cleared: cheerful ascending fanfare
  arkanoidLevelClear() {
    scheduleNotes([
      { freq: 523,  start: 0,    dur: 0.08, opts: { type: 'square', vol: 0.25 } },
      { freq: 659,  start: 0.09, dur: 0.08, opts: { type: 'square', vol: 0.25 } },
      { freq: 784,  start: 0.18, dur: 0.08, opts: { type: 'square', vol: 0.28 } },
      { freq: 1047, start: 0.27, dur: 0.08, opts: { type: 'square', vol: 0.30 } },
      { freq: 1319, start: 0.36, dur: 0.08, opts: { type: 'square', vol: 0.30 } },
      { freq: 1568, start: 0.45, dur: 0.35, opts: { type: 'square', vol: 0.35 } },
    ]);
  },

  highScoreFanfare() {
    scheduleNotes([
      { freq: 523, start: 0,    dur: 0.10, opts: { type: 'square', vol: 0.25 } },
      { freq: 659, start: 0.10, dur: 0.10, opts: { type: 'square', vol: 0.25 } },
      { freq: 784, start: 0.20, dur: 0.10, opts: { type: 'square', vol: 0.28 } },
      { freq: 1047,start: 0.30, dur: 0.35, opts: { type: 'square', vol: 0.35 } },
    ]);
  },

  highScoreClick() {
    playTone(880, 0.04, { type: 'square', vol: 0.12 });
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

// ── Track 6 — OVERDRIVE ──────────────────────────────────────
// Highway-chase music: E natural minor, 150 BPM, 16th-note steps.
// AABA structure: sections [0,0,1,0], 4 bars each, 64 steps/section.
// A sections = Spy-Hunter-style tense driving; B section = F-Zero urgency burst.
// Em → C → G → D chord loop (classic minor i–VI–III–VII).
// Bass lives 80–165 Hz — above the engine SFX 500 Hz lowpass cutoff.
// Lead sits 330–880 Hz (E4–A5), pulse wave with pitch-bend illusion.
// Full loop: 256 steps × 0.1 s = 25.6 s.
//
// Frequency reference (Hz):
//   E2=82.4  G2=98   C2=65.4 D2=73.4  B2=123.5 A2=110
//   E3=164.8 G3=196  C3=130.8 D3=146.8 B3=246.9 A3=220
//   E4=329.6 G4=392  C4=261.6 D4=293.7 B4=493.9 A4=440
//   E5=659.3 G5=784  C5=523.3 D5=587.3 B5=987.8 A5=880

const OD_STEP     = 60 / 150 / 4;    // 0.1 s per 16th note
const OD_SEC_LEN  = 64;              // 4 bars × 16 steps
const OD_SECTIONS = [0, 0, 1, 0];   // A A B A
const OD_FULL_LEN = OD_SECTIONS.length * OD_SEC_LEN; // 256

// ── Section A — bass (8th-note pulse, root + fifth walk) ─────
// Bar 1 Em: E2 roots on 8th notes, passing fifth B2 on beat 3
// Bar 2 C:  C2 roots, G2 fifth
// Bar 3 G:  G2 roots, D3 fifth
// Bar 4 D:  D2 roots, A2 fifth — resolves back to E2
const OD_A_BASS = [
  // Bar 1  Em
   82.4, 0,  82.4, 0,  123.5, 0, 123.5, 0,   82.4, 0,  82.4, 0,  123.5, 0,   82.4, 0,
  // Bar 2  C
   65.4, 0,  65.4, 0,   98,   0,  98,   0,   65.4, 0,  65.4, 0,   98,   0,  65.4, 0,
  // Bar 3  G
   98,   0,  98,   0,  146.8, 0, 146.8, 0,   98,   0,  98,   0,  146.8, 0,   98,  0,
  // Bar 4  D
   73.4, 0,  73.4, 0,  110,   0, 110,   0,   73.4, 0,  73.4, 0,  110,   0,  82.4, 0,
];

// ── Section A — lead melody (surf-rock minor hook) ────────────
// E4=329.6  B4=493.9  G4=392  A4=440  D5=587.3  C5=523.3  E5=659.3
// Phrasing: 2-bar arch that peaks then resolves — classic surf-rock shape.
// Bar 1: rising anticipation  Bar 2: peak + bend down
// Bar 3: counter-melody answering phrase  Bar 4: cadential descent to hold
const OD_A_LEAD = [
  // Bar 1  Em — rising hook
  329.6, 0,   0,  0,  392,  0, 440,   0,  493.9, 0,   0,   0, 440,   0, 392,   0,
  // Bar 2  C  — peak, step back
  523.3, 0,   0,  0,  493.9,0,   0,   0,  440,   0, 392,   0, 329.6, 0,   0,   0,
  // Bar 3  G  — answer phrase, minor colour
  392,   0, 440,  0,  493.9,0, 523.3, 0,  493.9, 0, 440,   0, 392,   0,   0,   0,
  // Bar 4  D  — cadential figure, leave gap for breath
  587.3, 0,   0,  0,  523.3,0, 493.9, 0,  440,   0, 392,   0,   0,   0,   0,   0,
];

// ── Section A — counter-arp (off-beat 5ths, adds the surf texture) ─
// Fires on 16th offbeats. Quiet, adds shimmer without dominating.
// Em offset: B4/B3  C offset: G4/E4  G offset: D4/B3  D offset: A4/F#4
const OD_A_ARP = [
  // Bar 1  Em off-beats
    0, 246.9, 0, 246.9,  0, 246.9, 0, 246.9,  0, 246.9, 0, 246.9,  0, 246.9, 0, 246.9,
  // Bar 2  C
    0, 196,   0, 196,    0, 196,   0, 196,    0, 196,   0, 196,    0, 196,   0, 196,
  // Bar 3  G
    0, 293.7, 0, 293.7,  0, 293.7, 0, 293.7,  0, 293.7, 0, 293.7,  0, 293.7, 0, 293.7,
  // Bar 4  D
    0, 220,   0, 220,    0, 220,   0, 220,    0, 220,   0, 220,    0, 220,   0, 220,
];

// ── Section A — drums ─────────────────────────────────────────
// Straight-rock feel: kick on 1&3, snare on 2&4, 8th hi-hats.
// Bar 4 gets a snare fill (extra hits) to mark the loop boundary.
const OD_A_KICK = [
  1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0,   // bar 1
  1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0,   // bar 2
  1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0,   // bar 3
  1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0,   // bar 4 (fill kick)
];
const OD_A_SNARE = [
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,1,   // fill
];
const OD_A_HIHAT = [
  0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0,   // 8th hi-hats (positions 2,6,10,14…)
  0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0,
  0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0,
  0,0,1,0, 0,0,1,0, 0,0,1,1, 0,0,1,0,   // bar 4 extra hats in fill
];

// ── Section B — bass (F-Zero urgency: every 8th note, chromatic climb) ─
// All-8th drive on Em pedal with chromatic walk upward in bars 2-3,
// then crashing back down in bar 4. Maximum propulsion.
const OD_B_BASS = [
  // Bar 1  Em — solid pedal 8ths
   82.4, 0,  82.4, 0,  82.4, 0,  82.4, 0,   82.4, 0,  82.4, 0,  82.4, 0,  82.4, 0,
  // Bar 2  chromatic climb: E2→F2→F#2→G2 (each two 8ths)
   82.4, 0,  82.4, 0,  87.3, 0,  87.3, 0,   92.5, 0,  92.5, 0,  98,   0,  98,   0,
  // Bar 3  continued climb: G2→Ab2→A2→Bb2
   98,   0,  98,   0, 103.8, 0, 103.8, 0,  110,   0, 110,   0, 116.5, 0, 116.5, 0,
  // Bar 4  crash back down: Bb2→A2→G2→E2 (resolution to tonic)
  116.5, 0, 110,   0,  98,   0,  98,   0,   82.4, 0,  82.4, 0,  82.4, 0,  82.4, 0,
];

// ── Section B — lead (F-Zero urgency: chromatic tension line) ──
// E5 stabs on every beat, chromatic approach notes in between.
// Creates that relentless "flooring the accelerator" urgency.
// E5=659.3  D#5=622.3  D5=587.3  C#5=554.4  G5=784  F#5=740
const OD_B_LEAD = [
  // Bar 1  Em — hammered E5 stabs with chromatic descents
  659.3, 0, 622.3, 0,  587.3, 0, 622.3, 0,  659.3, 0, 622.3, 0,  784,   0,   0,   0,
  // Bar 2  chromatic tension — ascend then bite
  659.3, 0, 622.3, 0,  587.3, 0, 554.4, 0,  523.3, 0,   0,   0,  587.3, 0,   0,   0,
  // Bar 3  G peak — highest energy phrase
  784,   0,   0,   0,  740,   0, 784,   0,  659.3, 0, 740,   0,  784,   0, 659.3, 0,
  // Bar 4  descent — crash back home
  659.3, 0, 622.3, 0,  587.3, 0, 554.4, 0,  493.9, 0, 440,   0,  392,   0,   0,   0,
];

// ── Section B — drums (relentless: double kick, 16th hi-hats) ──
const OD_B_KICK = [
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,   // double time
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,
  1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,0,0,   // extra kicks bar 3
  1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,0,0,   // bar 4 maintained
];
const OD_B_SNARE = [
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,
  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,1,
];
const OD_B_HIHAT = [
  1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0,   // 16th hi-hats (B section)
  1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0,
  1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0,
  1,0,1,0, 1,0,1,0, 1,1,1,1, 1,0,1,1,   // full 16th fury bar 4
];

// ── OVERDRIVE lead voice — pulse wave, quick-attack, short release ─
// Sharper than _lead (which is lush detuned saw). No echo feed.
// Bright pulse gives the "chip-surf" guitar sound without being muddy.
function _odLead(when, freq, dur, vol = 0.13) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(_masterBus);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, when);
    // Tiny pitch-bend up (+4%) then settle — mimics surf-guitar pick attack
    osc.frequency.linearRampToValueAtTime(freq * 1.04, when + 0.012);
    osc.frequency.linearRampToValueAtTime(freq,        when + 0.04);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.006);
    gain.gain.setValueAtTime(vol * 0.72, when + dur * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.start(when); osc.stop(when + dur + 0.01);
  } catch (_) {}
}

// ── OVERDRIVE arp voice — quieter square, off-beat shimmer ───
function _odArp(when, freq, dur, vol = 0.055) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(_masterBus);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.start(when); osc.stop(when + dur + 0.01);
  } catch (_) {}
}

function _schedOverdrive(stepIdx, when) {
  const fullIdx = stepIdx % OD_FULL_LEN;
  const section = Math.floor(fullIdx / OD_SEC_LEN);
  const i       = fullIdx % OD_SEC_LEN;
  const isB     = OD_SECTIONS[section] === 1;

  const BASS  = isB ? OD_B_BASS  : OD_A_BASS;
  const LEAD  = isB ? OD_B_LEAD  : OD_A_LEAD;
  const KICK  = isB ? OD_B_KICK  : OD_A_KICK;
  const SNARE = isB ? OD_B_SNARE : OD_A_SNARE;
  const HIHAT = isB ? OD_B_HIHAT : OD_A_HIHAT;

  // Bass note duration: dotted-8th feel (sustains across the 8th-note gap)
  const bDur = OD_STEP * 1.75;
  // Lead note: slightly detached on A, tight on B
  const lDur = isB ? OD_STEP * 0.72 : OD_STEP * 0.85;
  // Arp: very short, just a blip
  const aDur = OD_STEP * 0.55;

  if (KICK[i])  _kick (when, isB ? 0.52 : 0.40);
  if (SNARE[i]) _snare(when, isB ? 0.30 : 0.22);
  if (HIHAT[i]) _hihat(when, false, isB ? 0.10 : 0.07);
  if (BASS[i])  _bass (when, BASS[i], bDur, 0.22);
  if (LEAD[i])  _odLead(when, LEAD[i], lDur);
  // Off-beat arp only in A sections (adds surf texture, omit in B for clarity)
  if (!isB && OD_A_ARP[i]) _odArp(when, OD_A_ARP[i], aDur);
}

// ── Lookahead scheduler ───────────────────────────────────────
// schedules notes up to LOOKAHEAD seconds into the future,
// called every SCHED_INT ms. This gives accurate, glitch-free timing.
const LOOKAHEAD  = 0.13;  // seconds
const SCHED_INT  = 25;    // ms

let _track    = 1;   // 0=off  1=chip  2=synth  3=8bit  4=dungeon  5=patriot  6=overdrive
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
              : _track === 5 ? PAT_STEP
              : OD_STEP;
  const loopL = _track === 1 ? CHIP_FULL_LEN
              : _track === 2 ? SP_FULL_LEN
              : _track === 3 ? BIT_FULL_LEN
              : _track === 4 ? LR_FULL_LEN
              : _track === 5 ? PAT_FULL_LEN
              : OD_FULL_LEN;

  while (_stepTime < ctx.currentTime + LOOKAHEAD) {
    if      (_track === 1) _schedChip      (_stepIdx, _stepTime);
    else if (_track === 2) _schedSynthPop  (_stepIdx, _stepTime);
    else if (_track === 3) _schedBit       (_stepIdx, _stepTime);
    else if (_track === 4) _schedLR        (_stepIdx, _stepTime);
    else if (_track === 5) _schedPatriot   (_stepIdx, _stepTime);
    else                   _schedOverdrive (_stepIdx, _stepTime);
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

// Tracks reachable via the music-button cycle. Default excludes OVERDRIVE (6)
// so it stays highway-exclusive; highway opts in via setCycleTracks().
let _cycleTracks = [1, 2, 3, 4, 5];

// Cycle:  chip (1) → synth (2) → 8bit (3) → dungeon (4) → patriot (5) → chip (1) → …
// (Highway extends the list to include OVERDRIVE.)
// Returns { track, name } so the UI can update its label.
function cycleTrack() {
  stopMusic();
  const i    = _cycleTracks.indexOf(_track);
  _track     = (i < 0) ? _cycleTracks[0] : _cycleTracks[(i + 1) % _cycleTracks.length];
  if (_musicEnabled) startMusic();
  const names = ['', 'CHIP', 'SYNTH', '8BIT', 'DUNGEON', 'PATRIOT', 'OVERDRIVE'];
  return { track: _track, name: names[_track] };
}

// Override the cycle list (e.g. highway opts in to OVERDRIVE).
// Pass an array of valid track ids; empty arrays are ignored.
function setCycleTracks(tracks) {
  if (Array.isArray(tracks) && tracks.length) _cycleTracks = tracks.slice();
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

// ── Local High Score System ───────────────────────────────────
const HighScore = (function() {
  const GAMES = {
    'tetris':         { name: 'TETRIX',            legacyKey: 'tetris_hi',  defaults: [10000, 8000, 6000, 4000, 2000] },
    'pacman':         { name: 'CHOMP',             legacyKey: 'pm_hi',      defaults: [15000, 11000, 8000, 5000, 2500] },
    'xonix':          { name: 'TERRITORY',         legacyKey: 'xonix_hi',   defaults: [18000, 14000, 10000, 6000, 3000] },
    'space-invaders': { name: 'ALIEN WAVE',        legacyKey: 'si-hi',      defaults: [8500, 6500, 4500, 3000, 1500] },
    'snake':          { name: 'NEON SERPENT',      legacyKey: 'snake_hi',   defaults: [450, 350, 250, 150, 80] },
    'berzerk':        { name: 'ROBO MAZE',         legacyKey: 'berzerk_hi', defaults: [9900, 7500, 5200, 3100, 1500] },
    'paratrooper':    { name: 'AIRBORNE',          legacyKey: 'pt-hi',      defaults: [620, 480, 340, 220, 120] },
    'lode-runner':    { name: 'GOLD RUSH',         legacyKey: 'lr_hi',      defaults: [14000, 10500, 7800, 4500, 2000] },
    'highway':        { name: 'HIGHWAY DELIVERY',  legacyKey: 'hh_hi',      defaults: [16000, 12500, 9000, 6000, 3000] },
    'arkanoid':       { name: "BLOCK'N'BALL",      legacyKey: 'blockball_best', defaults: [12000, 9000, 6000, 3500, 1500] }
  };

  const DEFAULT_BOTS = ['ACE', 'NEO', 'CYB', 'ARC', 'BOT'];

  function normalizeKey(key) {
    if (!key) return 'tetris';
    const k = key.toLowerCase().replace(/_/g, '-');
    if (GAMES[k]) return k;
    if (k === 'chomp') return 'pacman';
    if (k === 'territory') return 'xonix';
    if (k === 'alienwave') return 'space-invaders';
    if (k === 'neon-serpent' || k === 'serpent') return 'snake';
    if (k === 'robomaze') return 'berzerk';
    if (k === 'airborne') return 'paratrooper';
    if (k === 'goldrush') return 'lode-runner';
    if (k === 'highway-delivery') return 'highway';
    if (k === 'blocknball' || k === 'block-n-ball' || k === 'blockball') return 'arkanoid';
    return 'tetris';
  }

  function getStorageKey(gameKey) {
    return 'neon_scores_' + normalizeKey(gameKey);
  }

  function getScores(gameKey) {
    const k = normalizeKey(gameKey);
    const g = GAMES[k];
    const sKey = getStorageKey(k);
    let list = null;

    try {
      const raw = localStorage.getItem(sKey);
      if (raw) list = JSON.parse(raw);
    } catch (_) {}

    if (!Array.isArray(list) || list.length === 0) {
      list = [];
      let legacyHi = 0;
      try {
        if (g.legacyKey) legacyHi = parseInt(localStorage.getItem(g.legacyKey) || '0', 10);
      } catch (_) {}

      for (let i = 0; i < 5; i++) {
        const botScore = g.defaults[i] || (5000 - i * 1000);
        list.push({
          name: DEFAULT_BOTS[i] || 'BOT',
          score: botScore,
          date: 'RETRO'
        });
      }

      if (legacyHi > 0) {
        list.unshift({ name: getSavedInitials() || 'PLAYER', score: legacyHi, date: 'BEST' });
        list.sort((a, b) => b.score - a.score);
        list = list.slice(0, 5);
      }

      saveScores(k, list);
    }

    return list;
  }

  function saveScores(gameKey, list) {
    const k = normalizeKey(gameKey);
    try {
      localStorage.setItem(getStorageKey(k), JSON.stringify(list));
      const topScore = list.length > 0 ? list[0].score : 0;
      const legacyKey = GAMES[k]?.legacyKey;
      if (legacyKey) {
        localStorage.setItem(legacyKey, String(topScore));
      }
    } catch (_) {}
  }

  function getTopScore(gameKey) {
    const scores = getScores(gameKey);
    return scores.length > 0 ? scores[0].score : 0;
  }

  function isHighScore(gameKey, score) {
    if (!score || score <= 0) return false;
    const list = getScores(gameKey);
    if (list.length < 5) return true;
    return score > list[list.length - 1].score;
  }

  function getRank(gameKey, score) {
    if (!score || score <= 0) return -1;
    const list = getScores(gameKey);
    for (let i = 0; i < list.length; i++) {
      if (score > list[i].score) return i + 1;
    }
    if (list.length < 5) return list.length + 1;
    return -1;
  }

  function getSavedInitials() {
    try {
      return (localStorage.getItem('neon_arcade_player_initials') || 'AAA').toUpperCase().slice(0, 3);
    } catch (_) {
      return 'AAA';
    }
  }

  function setSavedInitials(name) {
    try {
      localStorage.setItem('neon_arcade_player_initials', (name || 'AAA').toUpperCase().slice(0, 3));
    } catch (_) {}
  }

  function addScore(gameKey, name, score) {
    const k = normalizeKey(gameKey);
    const cleanName = (name || 'AAA').toUpperCase().replace(/[^A-Z0-9]/g, 'A').padEnd(3, 'A').slice(0, 3);
    setSavedInitials(cleanName);

    const dateStr = new Date().toISOString().slice(0, 10);
    const list = getScores(k);
    
    list.push({ name: cleanName, score: score, date: dateStr });
    list.sort((a, b) => b.score - a.score);
    const trimmed = list.slice(0, 5);
    
    saveScores(k, trimmed);
    const rank = trimmed.findIndex(item => item.name === cleanName && item.score === score && item.date === dateStr) + 1;
    return rank;
  }

  let _entryModal = null;
  let _boardModal = null;
  let _currentActiveSlot = 0;
  let _charBoxes = ['A', 'A', 'A'];

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  function ensureModalsCreated() {
    if (_entryModal && _boardModal) return;

    if (!_entryModal) {
      const el = document.createElement('div');
      el.className = 'neon-modal-overlay hidden';
      el.id = 'neon-hs-entry-modal';
      el.innerHTML = `
        <div class="neon-modal">
          <div class="neon-modal-header neon-yellow pulse">★ NEW HIGH SCORE! ★</div>
          <div class="neon-modal-subtitle">RANK <span id="neon-hs-rank" class="neon-cyan">#1</span> IN <span id="neon-hs-gamename" class="neon-magenta">TETRIX</span></div>
          <div class="hs-score-box">
            <span class="hs-score-label">SCORE:</span>
            <span class="hs-score-val neon-cyan" id="neon-hs-scoreval">0</span>
          </div>
          <div class="hs-initials-title">ENTER INITIALS:</div>
          
          <div class="hs-initials-picker">
            <div class="hs-char-col" data-idx="0">
              <button type="button" class="hs-arrow-btn hs-up" data-idx="0">▲</button>
              <div class="hs-char-box neon-cyan" id="hs-char-0">A</div>
              <button type="button" class="hs-arrow-btn hs-dn" data-idx="0">▼</button>
            </div>
            <div class="hs-char-col" data-idx="1">
              <button type="button" class="hs-arrow-btn hs-up" data-idx="1">▲</button>
              <div class="hs-char-box neon-cyan" id="hs-char-1">A</div>
              <button type="button" class="hs-arrow-btn hs-dn" data-idx="1">▼</button>
            </div>
            <div class="hs-char-col" data-idx="2">
              <button type="button" class="hs-arrow-btn hs-up" data-idx="2">▲</button>
              <div class="hs-char-box neon-cyan" id="hs-char-2">A</div>
              <button type="button" class="hs-arrow-btn hs-dn" data-idx="2">▼</button>
            </div>
          </div>

          <div class="hs-actions">
            <button type="button" class="hs-btn hs-submit-btn" id="neon-hs-submit">► SAVE RECORD</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
      _entryModal = el;
      bindEntryModalEvents();
    }

    if (!_boardModal) {
      const el = document.createElement('div');
      el.className = 'neon-modal-overlay hidden';
      el.id = 'neon-hs-board-modal';
      let optionsHtml = '';
      for (const [k, v] of Object.entries(GAMES)) {
        optionsHtml += `<option value="${k}">${v.name}</option>`;
      }

      el.innerHTML = `
        <div class="neon-modal leaderboard-modal">
          <div class="neon-modal-header neon-cyan">★ HIGH SCORES ★</div>
          
          <div class="hs-game-selector">
            <select id="neon-hs-select" class="hs-select">
              ${optionsHtml}
            </select>
          </div>

          <div class="hs-table-wrapper">
            <table class="hs-table">
              <thead>
                <tr>
                  <th>RANK</th>
                  <th>NAME</th>
                  <th>SCORE</th>
                  <th>DATE</th>
                </tr>
              </thead>
              <tbody id="neon-hs-tbody">
              </tbody>
            </table>
          </div>

          <div class="hs-actions">
            <button type="button" class="hs-btn hs-close-btn" id="neon-hs-close">✖ CLOSE</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
      _boardModal = el;
      bindBoardModalEvents();
    }
  }

  function cycleChar(slotIdx, delta) {
    let cur = _charBoxes[slotIdx] || 'A';
    let idx = CHARS.indexOf(cur);
    if (idx === -1) idx = 0;
    idx = (idx + delta + CHARS.length) % CHARS.length;
    _charBoxes[slotIdx] = CHARS[idx];
    updateCharDisplay();
    if (SFX.highScoreClick) SFX.highScoreClick();
  }

  function updateCharDisplay() {
    for (let i = 0; i < 3; i++) {
      const box = document.getElementById(`hs-char-${i}`);
      if (box) {
        box.textContent = _charBoxes[i];
        if (i === _currentActiveSlot) {
          box.classList.add('active-slot');
        } else {
          box.classList.remove('active-slot');
        }
      }
    }
  }

  let _entryCallback = null;
  let _activeGameKey = 'tetris';
  let _activeScore = 0;

  function bindEntryModalEvents() {
    _entryModal.querySelectorAll('.hs-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
        _currentActiveSlot = idx;
        cycleChar(idx, 1);
      });
    });
    _entryModal.querySelectorAll('.hs-dn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
        _currentActiveSlot = idx;
        cycleChar(idx, -1);
      });
    });

    for (let i = 0; i < 3; i++) {
      const box = document.getElementById(`hs-char-${i}`);
      if (box) {
        box.addEventListener('click', () => {
          _currentActiveSlot = i;
          updateCharDisplay();
        });
      }
    }

    const submitBtn = document.getElementById('neon-hs-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        submitHighRecord();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (_entryModal && !_entryModal.classList.contains('hidden')) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          cycleChar(_currentActiveSlot, 1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          cycleChar(_currentActiveSlot, -1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          _currentActiveSlot = (_currentActiveSlot - 1 + 3) % 3;
          updateCharDisplay();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          _currentActiveSlot = (_currentActiveSlot + 1) % 3;
          updateCharDisplay();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          submitHighRecord();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          _charBoxes[_currentActiveSlot] = 'A';
          _currentActiveSlot = (_currentActiveSlot - 1 + 3) % 3;
          updateCharDisplay();
        } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
          e.preventDefault();
          _charBoxes[_currentActiveSlot] = e.key.toUpperCase();
          if (SFX.highScoreClick) SFX.highScoreClick();
          _currentActiveSlot = (_currentActiveSlot + 1) % 3;
          updateCharDisplay();
        }
      }
    });
  }

  function submitHighRecord() {
    const initials = _charBoxes.join('');
    const rank = addScore(_activeGameKey, initials, _activeScore);
    _entryModal.classList.add('hidden');
    if (typeof _entryCallback === 'function') {
      _entryCallback(rank, true);
    }
    showLeaderboard(_activeGameKey);
  }

  function bindBoardModalEvents() {
    const closeBtn = document.getElementById('neon-hs-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        _boardModal.classList.add('hidden');
      });
    }

    const select = document.getElementById('neon-hs-select');
    if (select) {
      select.addEventListener('change', (e) => {
        renderBoardTable(e.target.value);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (_boardModal && !_boardModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
          _boardModal.classList.add('hidden');
        }
      }
    });
  }

  function renderBoardTable(gameKey) {
    const k = normalizeKey(gameKey);
    const select = document.getElementById('neon-hs-select');
    if (select) select.value = k;

    const tbody = document.getElementById('neon-hs-tbody');
    if (!tbody) return;

    const scores = getScores(k);
    let html = '';
    const lastSaved = getSavedInitials();

    scores.forEach((entry, idx) => {
      const rankNum = idx + 1;
      const isGold = rankNum === 1;
      const isSilver = rankNum === 2;
      const isBronze = rankNum === 3;
      const rankClass = isGold ? 'rank-1' : isSilver ? 'rank-2' : isBronze ? 'rank-3' : '';
      const isPlayer = entry.name === lastSaved;
      
      html += `
        <tr class="${rankClass} ${isPlayer ? 'player-row' : ''}">
          <td class="col-rank">#${rankNum}</td>
          <td class="col-name">${entry.name}</td>
          <td class="col-score">${entry.score.toLocaleString()}</td>
          <td class="col-date">${entry.date}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  function checkAndPrompt(gameKey, score, callback) {
    ensureModalsCreated();
    _activeGameKey = normalizeKey(gameKey);
    _activeScore = score;
    _entryCallback = callback;

    const rank = getRank(_activeGameKey, score);
    if (rank > 0 && rank <= 5) {
      if (SFX.highScoreFanfare) SFX.highScoreFanfare();
      
      const saved = getSavedInitials();
      _charBoxes = (saved.padEnd(3, 'A')).split('').slice(0, 3);
      _currentActiveSlot = 0;

      const rankEl = document.getElementById('neon-hs-rank');
      const gameEl = document.getElementById('neon-hs-gamename');
      const scoreEl = document.getElementById('neon-hs-scoreval');

      if (rankEl) rankEl.textContent = `#${rank}`;
      if (gameEl) gameEl.textContent = GAMES[_activeGameKey]?.name || 'GAME';
      if (scoreEl) scoreEl.textContent = score.toLocaleString();

      updateCharDisplay();
      _entryModal.classList.remove('hidden');
      return true;
    } else {
      if (typeof callback === 'function') callback(-1, false);
      return false;
    }
  }

  function showLeaderboard(gameKey) {
    ensureModalsCreated();
    const k = gameKey ? normalizeKey(gameKey) : 'tetris';
    renderBoardTable(k);
    _boardModal.classList.remove('hidden');
  }

  function initScoreButtons() {
    ensureModalsCreated();
    document.querySelectorAll('.scores-btn, #btn-scores').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const path = window.location.pathname;
        let gk = 'tetris';
        for (const key of Object.keys(GAMES)) {
          if (path.includes('/' + key + '/')) {
            gk = key;
            break;
          }
        }
        showLeaderboard(gk);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScoreButtons);
  } else {
    initScoreButtons();
  }

  return {
    getScores,
    getTopScore,
    isHighScore,
    addScore,
    checkAndPrompt,
    showLeaderboard,
    GAMES
  };
})();

// ── Expose globally ───────────────────────────────────────────
window.NeonArcade = { SFX, startMusic, stopMusic, cycleTrack, toggleMusic, getTrack, setTrack, setCycleTracks, getAudioCtx, getMasterBus, HighScore };
