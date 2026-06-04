(function (global) {
  'use strict';

  function VirtualJoystick(opts) {
    const base = opts.base;
    const knob = opts.knob;
    const maxRadius = opts.maxRadius || 56;
    const deadzone = opts.deadzone != null ? opts.deadzone : 0.18;
    const onChange = opts.onChange || function () {};

    let activeId = null;
    let centerX = 0, centerY = 0;
    let lastState = { x: 0, y: 0, magnitude: 0, angle: 0 };

    function emit(state) {
      lastState = state;
      onChange(state);
    }

    function emitZero() {
      if (lastState.magnitude === 0) return;
      emit({ x: 0, y: 0, magnitude: 0, angle: 0 });
    }

    function setKnob(dx, dy) {
      knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    }

    function recalcCenter() {
      const r = base.getBoundingClientRect();
      centerX = r.left + r.width / 2;
      centerY = r.top + r.height / 2;
    }

    function update(clientX, clientY) {
      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        const k = maxRadius / dist;
        dx *= k; dy *= k;
      }
      setKnob(dx, dy);
      const mag = Math.min(1, dist / maxRadius);
      if (mag < deadzone) {
        emit({ x: 0, y: 0, magnitude: 0, angle: 0 });
      } else {
        emit({
          x: dx / maxRadius,
          y: dy / maxRadius,
          magnitude: mag,
          angle: Math.atan2(dy, dx)
        });
      }
    }

    function onStart(e) {
      if (activeId !== null) return;
      const t = e.changedTouches[0];
      activeId = t.identifier;
      recalcCenter();
      base.classList.add('dragging');
      e.preventDefault();
      update(t.clientX, t.clientY);
    }

    function findTouch(touchList) {
      for (let i = 0; i < touchList.length; i++) {
        if (touchList[i].identifier === activeId) return touchList[i];
      }
      return null;
    }

    function onMove(e) {
      if (activeId === null) return;
      const t = findTouch(e.touches);
      if (!t) return;
      e.preventDefault();
      update(t.clientX, t.clientY);
    }

    function onEnd(e) {
      if (activeId === null) return;
      const t = findTouch(e.changedTouches);
      if (!t) return;
      activeId = null;
      base.classList.remove('dragging');
      setKnob(0, 0);
      emitZero();
    }

    base.addEventListener('touchstart', onStart, { passive: false });
    base.addEventListener('touchmove', onMove, { passive: false });
    base.addEventListener('touchend', onEnd, { passive: false });
    base.addEventListener('touchcancel', onEnd, { passive: false });

    setKnob(0, 0);

    return {
      destroy: function () {
        base.removeEventListener('touchstart', onStart);
        base.removeEventListener('touchmove', onMove);
        base.removeEventListener('touchend', onEnd);
        base.removeEventListener('touchcancel', onEnd);
      }
    };
  }

  global.NeonArcade = global.NeonArcade || {};
  global.NeonArcade.VirtualJoystick = VirtualJoystick;
})(window);
