// "Lap time": how long this site's own files took to load in the visitor's
// browser. The clock runs live while the page loads, then stops; each sector
// is coloured like F1 timing as it completes.
//   S1  request until the first byte of HTML arrives (network)
//   S2  first byte until the HTML is parsed
//   S3  parsed until the site's own files (CSS, fonts, scripts) are in
// Third-party requests (the tracking pixel) are left out on purpose, so a
// slow outside server can't make the site look slow.
(function () {
  var panel = document.getElementById('lap');
  if (!panel || !window.performance || !performance.getEntriesByType || !window.requestAnimationFrame) return;

  var timeEl = panel.querySelector('.time');
  var cells = panel.querySelectorAll('.sectors > div');
  // [purple below, green below] in milliseconds; anything slower is yellow
  var LIMITS = [[150, 600], [150, 600], [200, 1000]];
  var running = true;

  function nav() {
    return performance.getEntriesByType('navigation')[0];
  }

  function lapTime(ms) {
    var total = Math.max(0, ms) / 1000;
    var minutes = Math.floor(total / 60);
    var rest = (total - minutes * 60).toFixed(3);
    return minutes + ':' + (rest.length < 6 ? '0' + rest : rest);
  }

  function setSector(i, ms) {
    if (!cells[i]) return;
    cells[i].className = ms < LIMITS[i][0] ? 'purple' : ms < LIMITS[i][1] ? 'green' : 'yellow';
    cells[i].querySelector('b').textContent = (Math.max(0, ms) / 1000).toFixed(3);
    if (cells[i + 1]) cells[i + 1].className = 'active';
  }

  // performance.now() counts from the start of navigation, the same zero as the timings
  function tick() {
    if (!running) return;
    timeEl.textContent = lapTime(performance.now());
    requestAnimationFrame(tick);
  }

  function lastOwnFile() {
    var end = 0;
    performance.getEntriesByType('resource').forEach(function (r) {
      if (r.name.indexOf(location.origin + '/') === 0) end = Math.max(end, r.responseEnd);
    });
    return end;
  }

  function finish() {
    var n = nav();
    var parsed = n.domContentLoadedEventEnd || performance.now();
    setSector(1, parsed - n.responseStart);
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(function () {
      var end = Math.max(parsed, lastOwnFile());
      setSector(2, end - parsed);
      running = false;
      timeEl.textContent = lapTime(end - n.startTime);
    });
  }

  var start = nav();
  if (!start) return;
  setSector(0, start.responseStart - start.startTime);
  requestAnimationFrame(tick);

  // domContentLoadedEventEnd is only filled in after the event's handlers run
  if (start.domContentLoadedEventEnd) {
    setTimeout(finish, 0);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(finish, 0); });
  }
})();
