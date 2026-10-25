'use strict';

(() => {
  const PERIOD = 20 * 60 * 1000;
  const DURATION = 9 * 1000;
  const ROUTE = [
    {x: 35.5, y: 55},
    {x: 38, y: 54},
    {x: 41, y: 53.5},
    {x: 45, y: 52.5}
  ];
  const phaseAt = timestamp => ((timestamp % PERIOD) + PERIOD) % PERIOD;

  // The epoch anchors every pass, so reloading cannot start a new one.
  function scannerSignalPositionAt(timestamp) {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
    const phase = phaseAt(timestamp);
    if (phase >= DURATION) return null;
    const progress = phase / DURATION;
    const eased = progress * progress * (3 - 2 * progress);
    const routeProgress = eased * (ROUTE.length - 1);
    const segment = Math.min(ROUTE.length - 2, Math.floor(routeProgress));
    const t = routeProgress - segment;
    const p0 = ROUTE[Math.max(0, segment - 1)];
    const p1 = ROUTE[segment];
    const p2 = ROUTE[segment + 1];
    const p3 = ROUTE[Math.min(ROUTE.length - 1, segment + 2)];
    const interpolate = axis => .5 * (
      2 * p1[axis] +
      (-p0[axis] + p2[axis]) * t +
      (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t * t +
      (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t * t * t
    );
    return {x: interpolate('x'), y: interpolate('y')};
  }

  function createScannerSignal({element, isActive}) {
    if (!element || !element.style || typeof isActive !== 'function') {
      throw new TypeError('Scanner signal requires an element and an isActive function.');
    }
    let running = false;
    let timer = null;
    let frame = null;
    element.hidden = true;

    function cancelScheduled() {
      if (timer !== null) window.clearTimeout(timer);
      if (frame !== null) window.cancelAnimationFrame(frame);
      timer = null;
      frame = null;
    }

    function tick() {
      if (!running) return;
      timer = null;
      frame = null;
      const timestamp = Date.now();
      const position = scannerSignalPositionAt(timestamp);
      if (position && isActive()) {
        element.style.left = position.x + '%';
        element.style.top = position.y + '%';
        element.hidden = false;
      } else {
        element.hidden = true;
      }
      // Only animate during a pass; the quiet interval needs one timer.
      if (position) frame = window.requestAnimationFrame(tick);
      else timer = window.setTimeout(tick, PERIOD - phaseAt(timestamp));
    }

    return Object.freeze({
      start() {
        if (running) return;
        running = true;
        tick();
      },
      stop() {
        running = false;
        cancelScheduled();
        element.hidden = true;
      },
      refresh() {
        if (!running) return;
        cancelScheduled();
        tick();
      }
    });
  }

  window.scannerSignalPositionAt = scannerSignalPositionAt;
  window.createScannerSignal = createScannerSignal;
})();
