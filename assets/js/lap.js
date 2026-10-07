// Race-start intro, shown once per visit before the site.
//
// The five lights come on, hold for a random moment, go out, and the lap
// clock rolls up to the lap time: how long this site's own files took to
// load in the visitor's browser. Then a red/yellow stripe wipes the intro
// away. Tapping after lights out measures the visitor's reaction time;
// tapping before is a jump start. Skip button, Escape or scrolling skip it.
//
// Sectors of the lap time:
//   S1  request until the first byte of HTML arrives (network)
//   S2  first byte until the HTML is parsed
//   S3  parsed until the site's own files (CSS, fonts, scripts) are in
// Third-party requests (the tracking pixel) are left out on purpose.
//
// The inline script in <head> decides whether to show the intro at all
// (adds .show-intro to <html>) and removes it again if this file never runs.
(function () {
  var root = document.documentElement;
  var intro = document.getElementById('intro');
  var wipe = document.getElementById('wipe');
  var replay = document.getElementById('replay-start');
  var supported = intro && window.performance && performance.getEntriesByType && window.requestAnimationFrame;
  var nav = supported && performance.getEntriesByType('navigation')[0];
  if (!nav) {
    root.classList.remove('show-intro');
    return;
  }

  var cols = intro.querySelectorAll('.gantry .col');
  var clock = intro.querySelector('.clock');
  var cells = intro.querySelectorAll('.sectors > div');
  var result = intro.querySelector('.result');
  var skipButton = intro.querySelector('.skip-intro');
  var rtl = root.dir === 'rtl';

  var FIRST = 250;        // ms before the first light comes on
  var GAP = 180;          // ms between lights
  var HOLD = [200, 600];  // random ms all five stay on, like a real start
  var ROLL = 700;         // ms the clock takes to roll up to the lap time
  var SHOW = 650;         // ms the result stays up before the wipe
  var SHOW_REACTION = 1600;
  var WIPE = 650;
  // [purple below, green below] in milliseconds; anything slower is yellow
  var LIMITS = [[150, 600], [150, 600], [200, 1000]];

  /* ---------- measuring the lap ---------- */

  // where each sector ends, in ms since the navigation started; null until known
  var ends = [nav.responseStart - nav.startTime, null, null];

  function lastOwnFile() {
    var end = 0;
    performance.getEntriesByType('resource').forEach(function (r) {
      if (r.name.indexOf(location.origin + '/') === 0) end = Math.max(end, r.responseEnd);
    });
    return end;
  }

  // Wait for the font files the page actually requested. Not document.fonts.ready:
  // browsers can hold that until every image is in, including the slow pixel.
  function fontsLoaded() {
    var pending = [];
    if (document.fonts && document.fonts.forEach) {
      document.fonts.forEach(function (face) {
        if (face.status !== 'unloaded') pending.push(face.loaded.catch(function () {}));
      });
    }
    return Promise.all(pending);
  }

  function measure() {
    var n = performance.getEntriesByType('navigation')[0];
    ends[1] = Math.max(ends[0], (n.domContentLoadedEventEnd || performance.now()) - n.startTime);
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      ends[2] = Math.max(ends[1], lastOwnFile() - n.startTime);
    }
    fontsLoaded().then(finish);
    setTimeout(finish, 10000); // never leave the clock running forever
  }

  /* ---------- the start sequence ---------- */

  var run = null;

  function lapTime(ms) {
    var total = Math.max(0, ms) / 1000;
    var minutes = Math.floor(total / 60);
    var rest = (total - minutes * 60).toFixed(3);
    return minutes + ':' + (rest.length < 6 ? '0' + rest : rest);
  }

  function later(fn, ms) {
    run.timers.push(setTimeout(fn, ms));
  }

  function setResult(className, main, note) {
    result.className = className;
    result.textContent = main;
    if (note) {
      var small = document.createElement('small');
      small.textContent = note;
      result.appendChild(small);
    }
  }

  function start() {
    stop();
    run = { timers: [], phase: 'lights', lightsOutAt: 0, reaction: null, jump: false, shown: [false, false, false] };
    root.classList.add('show-intro', 'intro-running');

    clock.textContent = lapTime(0);
    setResult('result', '');
    for (var i = 0; i < cells.length; i++) {
      cells[i].className = '';
      cells[i].querySelector('b').textContent = '-';
    }
    for (var j = 0; j < cols.length; j++) {
      cols[j].classList.remove('on');
      later(function (col) { col.classList.add('on'); }.bind(null, cols[j]), FIRST + j * GAP);
    }
    var hold = HOLD[0] + Math.random() * (HOLD[1] - HOLD[0]);
    later(lightsOut, FIRST + (cols.length - 1) * GAP + hold);
  }

  function lightsOut() {
    for (var i = 0; i < cols.length; i++) cols[i].classList.remove('on');
    run.phase = 'race';
    run.lightsOutAt = performance.now();
    cells[0].className = 'active';
    run.raf = requestAnimationFrame(tick);
  }

  function showSector(i) {
    if (run.shown[i]) return;
    run.shown[i] = true;
    var ms = i === 0 ? ends[0] : ends[i] - ends[i - 1];
    cells[i].className = ms < LIMITS[i][0] ? 'purple' : ms < LIMITS[i][1] ? 'green' : 'yellow';
    cells[i].querySelector('b').textContent = (Math.max(0, ms) / 1000).toFixed(3);
    if (cells[i + 1] && !run.shown[i + 1]) cells[i + 1].className = 'active';
  }

  function tick() {
    if (!run || run.phase !== 'race') return;
    var done = ends[2] !== null;
    var t = Math.min(1, (performance.now() - run.lightsOutAt) / ROLL);
    var progress = 1 - Math.pow(1 - t, 3); // ease out
    // still loading at lights out: tick live until the site is in
    var shownMs = (done ? ends[2] : performance.now()) * progress;

    clock.textContent = lapTime(shownMs);
    for (var i = 0; i < 3; i++) {
      if (ends[i] !== null && shownMs >= ends[i]) showSector(i);
    }
    if (done && progress >= 1) {
      clock.textContent = lapTime(ends[2]);
      showSector(0); showSector(1); showSector(2);
      run.phase = 'result';
      later(reveal, run.reaction !== null || run.jump ? SHOW_REACTION : SHOW);
      return;
    }
    run.raf = requestAnimationFrame(tick);
  }

  // a tap, click, Space or Enter
  function press() {
    if (!run) return;
    if (run.phase === 'lights') {
      if (!run.jump) {
        run.jump = true;
        setResult('result jump', intro.getAttribute('data-jump'));
      }
    } else if (run.phase === 'race' && run.reaction === null && !run.jump) {
      run.reaction = performance.now() - run.lightsOutAt;
      setResult('result', intro.getAttribute('data-reaction') + ' ' + (run.reaction / 1000).toFixed(3) + ' s',
        intro.getAttribute('data-compare'));
    } else if (run.phase === 'result') {
      reveal();
    }
  }

  /* ---------- wiping the intro away ---------- */

  function reveal() {
    if (!run || run.phase === 'wipe') return;
    clearTimers();
    run.phase = 'wipe';
    if (!intro.animate || !wipe) {
      stop();
      return;
    }

    var w = window.innerWidth;
    var h = window.innerHeight;
    var slant = Math.min(0.3 * w, 0.3 * h);       // how far the top of the edge leans ahead
    var stripe = Math.max(48, 0.08 * w);
    var angle = Math.atan(slant / h) * 180 / Math.PI;
    function x(px) { return rtl ? w - px : px; }   // mirror the sweep on the Farsi page

    // the intro stays visible to the right of a slanted edge that sweeps across
    function shape(edge) {
      var far = w + slant + 20;
      return 'polygon(' + x(edge + slant) + 'px 0px, ' + x(far) + 'px 0px, ' +
        x(far) + 'px ' + h + 'px, ' + x(edge) + 'px ' + h + 'px)';
    }
    // Moved with `left`, not transform: transforms animate on the compositor and
    // would run a frame or two ahead of the clip-path, leaving a sliver showing.
    function stripeAt(edge) {
      return (x(edge + slant / 2) - stripe / 2) + 'px';
    }

    var from = -slant - stripe;
    var to = w + stripe;
    var options = { duration: WIPE, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' };
    wipe.style.width = stripe + 'px';
    wipe.style.transform = 'skewX(' + (rtl ? angle : -angle) + 'deg)';
    wipe.classList.add('go');
    intro.animate([{ clipPath: shape(from) }, { clipPath: shape(to) }], options);
    wipe.animate([{ left: stripeAt(from) }, { left: stripeAt(to) }], options);
    later(stop, WIPE + 50);
  }

  function clearTimers() {
    if (!run) return;
    run.timers.forEach(clearTimeout);
    run.timers = [];
    cancelAnimationFrame(run.raf);
  }

  function stop() {
    clearTimers();
    run = null;
    root.classList.remove('show-intro', 'intro-running');
    if (wipe) {
      wipe.classList.remove('go');
      if (wipe.getAnimations) wipe.getAnimations().forEach(function (a) { a.cancel(); });
    }
    if (intro.getAnimations) intro.getAnimations().forEach(function (a) { a.cancel(); });
  }

  /* ---------- input ---------- */

  intro.addEventListener('pointerdown', function (e) {
    if (e.target === skipButton) return;
    e.preventDefault();
    press();
  });
  skipButton.addEventListener('click', function () { if (run) reveal(); });
  document.addEventListener('keydown', function (e) {
    if (!run) return;
    if (e.key === ' ' || (e.key === 'Enter' && document.activeElement !== skipButton)) {
      e.preventDefault();
      press();
    } else if (e.key !== 'Enter' && e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
      reveal(); // Escape, Tab or anything else: get on with it
    }
  });
  window.addEventListener('wheel', function () { if (run) reveal(); }, { passive: true });
  window.addEventListener('touchmove', function () { if (run) reveal(); }, { passive: true });

  if (replay) {
    replay.hidden = false;
    replay.addEventListener('click', function () {
      start();
      skipButton.focus({ preventScroll: true });
    });
  }

  /* ---------- go ---------- */

  // domContentLoadedEventEnd is only filled in after the event's handlers run
  if (nav.domContentLoadedEventEnd) {
    setTimeout(measure, 0);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(measure, 0); });
  }
  if (root.classList.contains('show-intro')) start();
})();
