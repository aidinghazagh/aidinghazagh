// "Lap time": how long this page took to load in the visitor's browser,
// split into three sectors and coloured like F1 timing.
//   S1  request until the first byte arrives (network)
//   S2  first byte until the HTML is parsed
//   S3  parsed until everything (fonts, images) has loaded
(function () {
  var panel = document.getElementById('lap');
  if (!panel || !window.performance || !performance.getEntriesByType) return;

  // [purple below, green below] in milliseconds; anything slower is yellow
  var LIMITS = [[150, 600], [150, 600], [200, 1000]];

  function seconds(ms) {
    return (Math.max(0, ms) / 1000).toFixed(3);
  }

  function lapTime(ms) {
    var total = Math.max(0, ms) / 1000;
    var minutes = Math.floor(total / 60);
    var rest = (total - minutes * 60).toFixed(3);
    return minutes + ':' + (rest.length < 6 ? '0' + rest : rest);
  }

  function show() {
    var nav = performance.getEntriesByType('navigation')[0];
    if (!nav || !nav.loadEventEnd) return;

    var sectors = [
      nav.responseStart - nav.startTime,
      nav.domContentLoadedEventEnd - nav.responseStart,
      nav.loadEventEnd - nav.domContentLoadedEventEnd
    ];
    var cells = panel.querySelectorAll('.sectors > div');

    for (var i = 0; i < cells.length && i < sectors.length; i++) {
      var t = sectors[i];
      cells[i].className = t < LIMITS[i][0] ? 'purple' : t < LIMITS[i][1] ? 'green' : 'yellow';
      cells[i].querySelector('b').textContent = seconds(t);
    }
    panel.querySelector('.time').textContent = lapTime(nav.loadEventEnd - nav.startTime);
  }

  // loadEventEnd is only filled in after the load handlers have run
  if (document.readyState === 'complete') {
    setTimeout(show, 0);
  } else {
    window.addEventListener('load', function () { setTimeout(show, 0); });
  }
})();
