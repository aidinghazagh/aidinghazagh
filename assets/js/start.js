// Race-start reaction game, shown once per visit before the site.
//
// The visitor presses the pedal to line up, five red lights come on about a
// second apart, hold for a random moment and go out. The time from lights out
// to their next press is their reaction time, ranked against F1 drivers.
// Pressing before lights out is a jump start; under 0.100 s counts as
// anticipation; nothing within 2 s is a stall. "Enter the site" wipes the
// intro away with the livery stripe.
//
// The inline script in <head> decides whether to show the intro at all
// (adds .show-intro to <html>) and removes it again if this file never runs.
(function () {
  var root = document.documentElement;
  var intro = document.getElementById('intro');
  var wipe = document.getElementById('wipe');
  var replay = document.getElementById('replay-start');
  var textEl = document.getElementById('intro-text');
  if (!intro || !textEl || !window.requestAnimationFrame || !window.performance) {
    root.classList.remove('show-intro');
    return;
  }

  var T = JSON.parse(textEl.textContent);
  var cols = intro.querySelectorAll('.gantry .col');
  var pedal = intro.querySelector('.pedal');
  var results = intro.querySelector('.results');
  var skipButton = document.querySelector('.skip-intro');
  var rtl = root.dir === 'rtl';

  var FIRST = 700;          // ms from pressing start to the first light
  var GAP = [700, 950];     // ms between lights (real F1: one a second)
  var HOLD = [500, 2800];   // random ms all five stay on before lights out
  var TOO_FAST = 100;       // under this is anticipation, not reaction
  var STALL = 2000;         // no press this long after lights out: stalled
  var LAUNCH = 1100;        // ms to watch the car go before the result shows
  var WIPE = 650;

  // Times F1 drivers set on a lights-out reaction game (Red Bull / WTF1
  // videos, collected by FirstSportz), plus two reference points.
  var FIELD = [
    { code: 'BOT', ms: 201, ref: true }, // FIA-measured race start, Austria 2017
    { code: 'VER', ms: 227 },
    { code: 'GRO', ms: 234 },
    { code: 'GAS', ms: 243 },
    { code: 'ERI', ms: 245 },
    { code: 'PER', ms: 246 },
    { code: 'ALB', ms: 256 },
    { code: 'WEH', ms: 262 },
    { code: 'KVY', ms: 266 },
    { code: 'AVG', ms: 273, ref: true }, // Human Benchmark median
    { code: 'ALO', ms: 285 }
  ];

  var phase = 'off';
  var timers = [];
  var lightsOutAt = 0;

  /* ---------- helpers ---------- */

  function rand(range) { return range[0] + Math.random() * (range[1] - range[0]); }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function secs(ms) { return (ms / 1000).toFixed(3); }
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (m, key) { return values[key]; });
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function setPhase(next) {
    phase = next;
    intro.setAttribute('data-phase', next);
  }
  function lights(on) {
    for (var i = 0; i < cols.length; i++) cols[i].classList.toggle('on', on);
  }
  function readBest() {
    try { var v = parseFloat(localStorage.getItem('gha-best')); return isFinite(v) ? v : null; } catch (e) { return null; }
  }
  function saveBest(ms) {
    try { localStorage.setItem('gha-best', String(Math.round(ms))); } catch (e) { /* private mode */ }
  }

  /* ---------- the start ---------- */

  function open() {
    clearTimers();
    pedal.classList.remove('down');
    root.classList.add('show-intro', 'intro-running');
    intro.classList.remove('launched', 'jumped', 'stalled');
    intro.scrollTop = 0;
    results.hidden = true;
    lights(false);
    setPhase('ready');
  }

  function lineUp() {
    clearTimers();
    pedal.classList.remove('down');
    intro.classList.remove('launched', 'jumped', 'stalled');
    intro.scrollTop = 0;
    results.hidden = true;
    lights(false);
    setPhase('lights');
    var t = FIRST;
    for (var i = 0; i < cols.length; i++) {
      later(function (col) { col.classList.add('on'); }.bind(null, cols[i]), t);
      if (i < cols.length - 1) t += rand(GAP);
    }
    later(lightsOut, t + rand(HOLD));
  }

  function lightsOut() {
    requestAnimationFrame(function () {
      if (phase !== 'lights') return;
      lights(false);
      // the change is on screen from the next frame: time the reaction from there
      requestAnimationFrame(function (frameTime) {
        if (phase !== 'lights') return;
        lightsOutAt = frameTime;
        setPhase('out');
        later(function () { if (phase === 'out') finish('stalled'); }, STALL);
      });
    });
  }

  // pedal, tap, click, Space or Enter
  function press(e) {
    if (phase === 'ready') {
      lineUp();
      // a quick press to line up; the pedal springs back
      pedal.classList.add('down');
      later(function () { pedal.classList.remove('down'); }, 220);
      return;
    }
    // the race press: the pedal stays down so it's clear it counted
    pedal.classList.add('down');
    if (phase === 'lights') {
      finish('jump');
    } else if (phase === 'out') {
      var at = e && e.timeStamp > 0 && e.timeStamp < 1e12 ? e.timeStamp : performance.now();
      var ms = at - lightsOutAt;
      finish(ms < TOO_FAST ? 'early' : 'ok', ms);
    }
  }

  function finish(outcome, ms) {
    clearTimers();
    lights(false);
    setPhase('finish');
    intro.classList.add(outcome === 'ok' ? 'launched' : outcome === 'stalled' ? 'stalled' : 'jumped');
    later(function () {
      render(outcome, ms);
      setPhase('result');
      results.hidden = false;
      intro.scrollTop = 0;
      var go = results.querySelector('.btn.primary');
      if (go) go.focus({ preventScroll: true });
    }, outcome === 'ok' ? LAUNCH : 700);
  }

  /* ---------- the result ---------- */

  function tierFor(position) {
    if (position === 1) return 'pole';
    if (position <= 3) return 'podium';
    if (position <= 8) return 'points';
    if (position <= 11) return 'midfield';
    return 'back';
  }

  function render(outcome, ms) {
    results.textContent = '';
    var ok = outcome === 'ok';
    var you = { code: 'YOU', ms: ok ? ms : Infinity, you: true };
    var board = FIELD.concat([you]).sort(function (a, b) { return a.ms - b.ms; });
    var position = board.indexOf(you) + 1;
    var tier = ok ? tierFor(position) : 'bad';
    var words = ok ? T.tiers[tier] : T.outcomes[outcome];

    var verdict = el('p', 'verdict ' + tier);
    verdict.appendChild(el('span', '', words[0]));
    results.appendChild(verdict);

    if (ok) {
      var time = el('p', 'time', secs(ms));
      time.appendChild(el('small', '', 's'));
      results.appendChild(time);
    }
    results.appendChild(el('p', 'note', words[1]));

    if (ok) {
      var detail = el('p', 'detail');
      detail.appendChild(el('span', '', fill(T.pos, { n: position, total: board.length })));
      var other = position === 1 ? board[1] : board[position - 2];
      var gap = secs(Math.abs(ms - other.ms));
      detail.appendChild(el('span', '', fill(position === 1 ? T.aheadOf : T.gapAhead, { gap: gap, name: T.names[other.code] })));
      var best = readBest();
      if (best === null || ms < best) {
        saveBest(ms);
        detail.appendChild(el('span', 'pb', T.newBest));
      } else {
        detail.appendChild(el('span', '', T.best + ' ' + secs(best) + ' s'));
      }
      results.appendChild(detail);
    }

    var actions = el('div', 'actions');
    var go = el('button', 'btn primary', T.enter + (rtl ? ' ←' : ' →'));
    go.type = 'button';
    go.addEventListener('click', reveal);
    var again = el('button', 'btn', T.again);
    again.type = 'button';
    again.addEventListener('click', lineUp);
    actions.appendChild(go);
    actions.appendChild(again);
    results.appendChild(actions);

    var list = el('ol', 'board');
    board.forEach(function (row, i) {
      var li = el('li', row.you ? 'you' + (ok ? '' : ' out') : row.ref ? 'ref' : '');
      li.style.setProperty('--i', i);
      li.appendChild(el('span', 'p', row.you && !ok ? '-' : String(i + 1)));
      li.appendChild(el('span', 'bar'));
      li.appendChild(el('span', 'c', row.you ? 'YOU' : row.code));
      var name = el('span', 'n', row.you ? T.you : T.names[row.code]);
      var note = row.you ? T.justNow : T.notes[row.code];
      if (note) name.appendChild(el('small', '', note));
      li.appendChild(name);
      li.appendChild(el('span', 't', row.you ? (ok ? secs(ms) : T.outcomes[outcome][2]) : secs(row.ms)));
      list.appendChild(li);
    });
    results.appendChild(list);


    var source = el('p', 'source');
    T.source.forEach(function (part) {
      if (typeof part === 'string') {
        source.appendChild(document.createTextNode(part));
      } else {
        var a = el('a', '', part.t);
        a.href = part.u;
        a.rel = 'noopener';
        a.target = '_blank';
        source.appendChild(a);
      }
    });
    results.appendChild(source);
  }

  /* ---------- wiping the intro away ---------- */

  function reveal() {
    if (phase === 'off' || phase === 'wipe') return;
    clearTimers();
    setPhase('wipe');
    if (!intro.animate || !wipe) {
      close();
      return;
    }

    var w = window.innerWidth;
    var h = window.innerHeight;
    var slant = Math.min(0.3 * w, 0.3 * h);       // how far the top of the edge leans ahead
    var stripe = Math.max(48, 0.08 * w);
    var angle = Math.atan(slant / h) * 180 / Math.PI;
    function x(px) { return rtl ? w - px : px; }   // mirror the sweep on the Farsi page

    // the intro stays visible beyond a slanted edge that sweeps across
    function shape(edge) {
      var far = w + slant + 20;
      return 'polygon(' + x(edge + slant) + 'px 0px, ' + x(far) + 'px 0px, ' +
        x(far) + 'px ' + h + 'px, ' + x(edge) + 'px ' + h + 'px)';
    }
    // moved with `left`, not transform: transforms animate on the compositor and
    // would run a frame or two ahead of the clip-path, leaving a sliver showing
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
    later(close, WIPE + 50);
  }

  function close() {
    clearTimers();
    setPhase('off');
    root.classList.remove('show-intro', 'intro-running');
    if (wipe) {
      wipe.classList.remove('go');
      if (wipe.getAnimations) wipe.getAnimations().forEach(function (a) { a.cancel(); });
    }
    if (intro.getAnimations) intro.getAnimations().forEach(function (a) { a.cancel(); });
  }

  /* ---------- input ---------- */

  intro.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    if (phase !== 'ready' && phase !== 'lights' && phase !== 'out') return;
    if (e.target.closest('a')) return;
    e.preventDefault();
    press(e);
  });
  document.addEventListener('keydown', function (e) {
    if (phase === 'off' || phase === 'wipe') return;
    if (e.key === 'Escape') {
      reveal();
      return;
    }
    if (phase !== 'ready' && phase !== 'lights' && phase !== 'out') return; // result buttons handle their own keys
    if (document.activeElement === skipButton) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
      e.preventDefault();
      if (!e.repeat) press(e);
    }
  });
  if (skipButton) skipButton.addEventListener('click', reveal);
  if (replay) {
    replay.hidden = false;
    replay.addEventListener('click', function () {
      open();
      pedal.focus({ preventScroll: true });
    });
  }

  if (root.classList.contains('show-intro')) open();
})();
