// Race start + "lap time".
// The five start lights come on, go out, and the lap clock starts. The lap
// time is how long this site's own files took to load in the visitor's
// browser; after lights out the clock rolls up to it and each sector lights
// up as the clock passes it. If the page is still loading at lights out,
// the clock ticks live until it's done.
//   S1  request until the first byte of HTML arrives (network)
//   S2  first byte until the HTML is parsed
//   S3  parsed until the site's own files (CSS, fonts, scripts) are in
// Third-party requests (the tracking pixel) are left out on purpose, so a
// slow outside server can't make the site look slow.
(function () {
  var lap = document.getElementById('lap');
  if (!lap || !window.performance || !performance.getEntriesByType || !window.requestAnimationFrame) return;
  var nav = performance.getEntriesByType('navigation')[0];
  if (!nav) return;

  var lights = document.querySelectorAll('.lights i');
  var timeEl = lap.querySelector('.time');
  var cells = lap.querySelectorAll('.sectors > div');

  var LIGHT_GAP = 150;  // ms between each light coming on
  var HOLD = 250;       // ms all five stay on before lights out
  var ROLL = 900;       // ms the clock takes to roll up to the lap time
  // [purple below, green below] in milliseconds; anything slower is yellow
  var LIMITS = [[150, 600], [150, 600], [200, 1000]];
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // where each sector ends, in ms since the navigation started; null until known
  var ends = [nav.responseStart - nav.startTime, null, null];
  var shown = [false, false, false];
  var lightsOutAt = null;

  function lapTime(ms) {
    var total = Math.max(0, ms) / 1000;
    var minutes = Math.floor(total / 60);
    var rest = (total - minutes * 60).toFixed(3);
    return minutes + ':' + (rest.length < 6 ? '0' + rest : rest);
  }

  function reveal(i) {
    if (shown[i] || !cells[i]) return;
    shown[i] = true;
    var ms = i === 0 ? ends[0] : ends[i] - ends[i - 1];
    cells[i].className = ms < LIMITS[i][0] ? 'purple' : ms < LIMITS[i][1] ? 'green' : 'yellow';
    cells[i].querySelector('b').textContent = (Math.max(0, ms) / 1000).toFixed(3);
    if (cells[i + 1]) cells[i + 1].className = 'active';
  }

  function frame() {
    var done = ends[2] !== null;
    var t = still ? 1 : Math.min(1, (performance.now() - lightsOutAt) / ROLL);
    var progress = 1 - Math.pow(1 - t, 3); // ease out
    // with reduced motion, don't tick: just show the result once it's known
    if (still && !done) { requestAnimationFrame(frame); return; }
    var shownMs = (done ? ends[2] : performance.now()) * progress;

    timeEl.textContent = lapTime(shownMs);
    for (var i = 0; i < 3; i++) {
      if (ends[i] !== null && shownMs >= ends[i]) reveal(i);
    }
    if (done && progress >= 1) {
      timeEl.textContent = lapTime(ends[2]);
      reveal(0); reveal(1); reveal(2);
      return;
    }
    requestAnimationFrame(frame);
  }

  function lightsOut() {
    for (var i = 0; i < lights.length; i++) lights[i].classList.remove('on');
    lightsOutAt = performance.now();
    if (cells[0]) cells[0].className = 'active';
    requestAnimationFrame(frame);
  }

  function startLights() {
    timeEl.textContent = lapTime(0);
    if (still || !lights.length) { lightsOut(); return; }
    for (var i = 0; i < lights.length; i++) {
      setTimeout(function (light) { light.classList.add('on'); }, i * LIGHT_GAP, lights[i]);
    }
    setTimeout(lightsOut, (lights.length - 1) * LIGHT_GAP + HOLD);
  }

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

  startLights();
  // domContentLoadedEventEnd is only filled in after the event's handlers run
  if (nav.domContentLoadedEventEnd) {
    setTimeout(measure, 0);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(measure, 0); });
  }
})();
