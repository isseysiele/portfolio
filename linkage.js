/* RT300SL arm-crank retrofit, replayed from the SolidWorks Motion export.
   Every frame is an exported joint position (251 per turn at 30 rpm), drawn in the side view:
   x toward the seated user, z up, origin at the crank axis. The handle runs level on the
   gearbox rail under the rocker pivot P; the arm is a two-link model reaching from the
   shoulder S to the exported wrist point W, red where that user cannot reach.
   Usage: <div class="linkage" data-linkage="hero"></div> or data-linkage="full". */
(function () {
  'use strict';

  var SRC = 'assets/data/rt300-motion.json';
  var NS = 'http://www.w3.org/2000/svg';
  var FRAME_MS = 8; // export step: 0.008 s, so one turn is 2.0 s (30 rpm)
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var USER_NAMES = { small: 'Small user', medium: 'Medium user', large: 'Large user' };

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function set(e, attrs) { for (var k in attrs) e.setAttribute(k, attrs[k]); }
  function X(x) { return -x; }   // the user sits on the left of the drawing
  function Y(z) { return -z; }
  function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function pts(list) { return list.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' '); }

  // SVG arc in world coordinates (angles measured in the x-z plane, then mirrored for screen)
  function arc(cx, cz, r, a1, a2) {
    var x1 = cx + r * Math.cos(a1), z1 = cz + r * Math.sin(a1), x2 = cx + r * Math.cos(a2), z2 = cz + r * Math.sin(a2);
    var large = Math.abs(a2 - a1) > Math.PI ? 1 : 0, sweep = a2 > a1 ? 1 : 0;
    return 'M' + X(x1).toFixed(1) + ' ' + Y(z1).toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' ' + sweep + ' ' + X(x2).toFixed(1) + ' ' + Y(z2).toFixed(1);
  }

  function build(root, data) {
    var full = root.getAttribute('data-linkage') === 'full';
    var ids = full ? Object.keys(data.tests) : ['T1', 'T2', 'T3'];
    var test = data.tests[ids[0]], tid = ids[0], user = 'small';
    var frame = 0, running = !reduce, visible = true, dragging = false, last = null, acc = 0;
    var uid = 'lk' + Math.random().toString(36).slice(2, 7);

    root.innerHTML = '';
    var svg = el('svg', { class: 'linkage__svg', role: 'img', tabindex: '0', 'aria-labelledby': uid + '-t ' + uid + '-d' }, root);
    el('title', { id: uid + '-t' }, svg).textContent = 'RT300 arm-crank retrofit, replayed from the motion study';
    el('desc', { id: uid + '-d' }, svg).textContent = 'Side view of the retrofit linkage and the user’s arm. The crank turns at 30 rpm; drag the crank, or focus the drawing and use the arrow keys, to step through the turn. Red marks the crank angles where the selected user cannot reach the handle.';

    // View box: every test, the shoulder, and room for labels
    var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    ids.forEach(function (k) {
      var t = data.tests[k];
      t.Ax.concat(t.Bx, t.Hx, t.Wx, [t.P[0], t.S[0], -t.crank]).forEach(function (v) { minX = Math.min(minX, v); maxX = Math.max(maxX, v); });
      t.Az.concat(t.Bz, t.Wz, [t.Hz, t.P[1], t.S[1], -t.crank]).forEach(function (v) { minZ = Math.min(minZ, v); maxZ = Math.max(maxZ, v); });
    });
    var pad = { x: 70, top: 90, bot: full ? 120 : 90 };
    set(svg, { viewBox: [X(maxX) - pad.x, Y(maxZ) - pad.top, (maxX - minX) + 2 * pad.x, (maxZ - minZ) + pad.top + pad.bot].map(function (n) { return n.toFixed(0); }).join(' ') });

    var defs = el('defs', {}, svg);
    var mk = el('marker', { id: uid + '-a', viewBox: '0 0 12 12', refX: '11', refY: '6', markerWidth: '13', markerHeight: '13', markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0 2 L12 6 L0 10 Z', class: 'lk-fill-accent' }, mk);

    var g = el('g', {}, svg);
    function ground(x, z) {
      el('line', { x1: X(x) - 40, y1: Y(z) + 30, x2: X(x) + 40, y2: Y(z) + 30, class: 'lk-thin lk-w2' }, g);
      for (var i = -34; i <= 34; i += 12) el('line', { x1: X(x) + i, y1: Y(z) + 30, x2: X(x) + i - 10, y2: Y(z) + 42, class: 'lk-thin' }, g);
      el('line', { x1: X(x) - 16, y1: Y(z) + 30, x2: X(x), y2: Y(z) + 8, class: 'lk-thin' }, g);
      el('line', { x1: X(x) + 16, y1: Y(z) + 30, x2: X(x), y2: Y(z) + 8, class: 'lk-thin' }, g);
    }

    // Static layer (redrawn when the test changes)
    var gStatic = el('g', {}, g);
    var gReach = el('g', {}, g);
    // Moving parts
    var rail = el('line', { class: 'lk-phantom' }, g);
    var rack = el('line', { class: 'lk-rack' }, g);
    var housing = el('rect', { class: 'lk-housing', width: 150, height: 96, rx: 6 }, g);
    var rocker = el('line', { class: 'lk-link' }, g);
    var coupler = el('line', { class: 'lk-link' }, g);
    var crank = el('line', { class: 'lk-link' }, g);
    var muArc = full ? el('path', { class: 'lk-thin lk-accent', 'marker-start': 'url(#' + uid + '-a)', 'marker-end': 'url(#' + uid + '-a)' }, g) : null;
    var muText = full ? el('text', { class: 'lk-text lk-accent-text', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g) : null;
    function joint(r, cls) { return el('circle', { r: r, class: cls || 'lk-joint' }, g); }
    var jO = joint(12), jA = joint(9), jB = joint(9), jP = joint(12);
    var grip = el('rect', { class: 'lk-grip', width: 22, height: 46, rx: 10 }, g);
    // Arm
    var upper = el('line', { class: 'lk-arm' }, g), fore = el('line', { class: 'lk-arm' }, g), hand = el('line', { class: 'lk-hand' }, g);
    var gap = el('line', { class: 'lk-gap' }, g);
    var jS = joint(14, 'lk-shoulder'), jE = joint(9, 'lk-arm-joint'), jW = joint(8, 'lk-arm-joint');
    var labels = {};
    ['O', 'A', 'B', 'P', 'S', 'E', 'W', 'H'].forEach(function (n) { labels[n] = el('text', { class: 'lk-text lk-small', 'text-anchor': 'middle' }, g); labels[n].textContent = n; });
    if (!full) ['A', 'E', 'W', 'H'].forEach(function (n) { labels[n].style.display = 'none'; });

    // Readout
    var dl = document.createElement('dl'); dl.className = 'linkage__readout'; root.appendChild(dl);
    function cell(label) { var d = document.createElement('div'), t = document.createElement('dt'), v = document.createElement('dd'); t.innerHTML = label; d.appendChild(t); d.appendChild(v); dl.appendChild(d); return { box: d, v: v }; }
    var rTheta = cell('Crank angle θ'), rMu = cell('Transmission angle μ'), rD = cell('Shoulder to wrist d'), rReach = cell('Small user');
    var rStroke = full ? cell('Handle stroke') : null;

    // Pickers
    var items = [], userBtns = [];
    if (full) {
      var seg = document.createElement('div'); seg.className = 'linkage__seg'; seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'User size');
      root.appendChild(seg);
      Object.keys(data.users).forEach(function (u) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.user = u;
        var L = data.users[u]; b.innerHTML = USER_NAMES[u] + ' <span>' + (L[0] + L[1]) + ' mm</span>';
        b.addEventListener('click', function () { user = u; refreshUser(); });
        seg.appendChild(b); userBtns.push(b);
      });
      var wrap = document.createElement('div'); wrap.className = 'table-wrap linkage__tests';
      var tbl = document.createElement('table'); tbl.className = 'data-table';
      tbl.innerHTML = '<caption>Pick a test. Stroke and reach come from the exported motion; reach is the share of the turn the wrist is out of reach.</caption><thead><tr><th scope="col">Test</th><th scope="col">Change</th><th scope="col">Stroke, mm</th><th scope="col">Small user out of reach</th><th scope="col">Medium user out of reach</th></tr></thead>';
      var body = document.createElement('tbody'); body.setAttribute('role', 'radiogroup'); body.setAttribute('aria-label', 'Test configuration');
      tbl.appendChild(body); wrap.appendChild(tbl); root.appendChild(wrap);
      ids.forEach(function (k) {
        var t = data.tests[k], tr = document.createElement('tr'); tr.setAttribute('role', 'radio'); tr.dataset.id = k;
        tr.innerHTML = '<th scope="row">' + k + ' ' + t.name + '</th><td>' + t.change + '</td><td>' + t.report.stroke.toFixed(2) + '</td><td>' + t.report.unreach.small.toFixed(1) + '%</td><td>' + t.report.unreach.medium.toFixed(1) + '%</td>';
        body.appendChild(tr); items.push(tr);
      });
    } else {
      var segT = document.createElement('div'); segT.className = 'linkage__seg'; segT.setAttribute('role', 'radiogroup'); segT.setAttribute('aria-label', 'Crank length');
      root.appendChild(segT);
      ids.forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.id = k;
        b.innerHTML = '<span>' + k + '</span> ' + data.tests[k].crank + ' mm';
        segT.appendChild(b); items.push(b);
      });
    }
    items.forEach(function (it, i) {
      it.addEventListener('click', function () { setTest(ids[i]); });
      it.addEventListener('keydown', function (e) {
        var j = ids.indexOf(tid), k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowRight') j = (j + 1) % ids.length; else if (k === 'ArrowUp' || k === 'ArrowLeft') j = (j + ids.length - 1) % ids.length; else return;
        e.preventDefault(); setTest(ids[j]); items[j].focus();
      });
    });

    var ctl = document.createElement('div'); ctl.className = 'linkage__ctl'; root.appendChild(ctl);
    var hint = document.createElement('p'); hint.className = 'linkage__hint';
    hint.textContent = full
      ? 'Replay of the SolidWorks Motion export: 251 frames per turn at 30 rpm, joint centres projected onto the side view. The handle runs level on the gearbox rail under P. Red on the crank circle marks where the selected user’s wrist is out of reach. Drag the crank or use the arrow keys.'
      : 'My RT300 motion study, replayed. Red marks the crank angles where a small user can’t reach the handle. Drag the crank or pick a crank length.';
    ctl.appendChild(hint);
    var run = document.createElement('button'); run.type = 'button'; run.className = 'linkage__run'; ctl.appendChild(run);
    function runLabel() { run.textContent = running ? 'Stop' : 'Run at 30 rpm'; run.setAttribute('aria-pressed', running ? 'true' : 'false'); }
    run.addEventListener('click', function () { running = !running; last = null; runLabel(); });

    var aAng = [];
    function reachLimit() { var L = data.users[user]; return L[0] + L[1]; }

    function drawStatic() {
      while (gStatic.firstChild) gStatic.removeChild(gStatic.firstChild);
      var t = test;
      el('circle', { cx: 0, cy: 0, r: t.crank, class: 'lk-centre' }, gStatic);
      [[0, 0], t.P].forEach(function (p) {
        el('line', { x1: X(p[0]) - 30, y1: Y(p[1]), x2: X(p[0]) + 30, y2: Y(p[1]), class: 'lk-centre' }, gStatic);
        el('line', { x1: X(p[0]), y1: Y(p[1]) - 30, x2: X(p[0]), y2: Y(p[1]) + 30, class: 'lk-centre' }, gStatic);
      });
      var gr = el('g', {}, gStatic); var keep = g; g = gr; ground(0, 0); g = keep;
      var xmin = Math.min.apply(null, t.Hx), xmax = Math.max.apply(null, t.Hx);
      set(rail, { x1: X(xmax + 40), y1: Y(t.Hz), x2: X(xmin - 40), y2: Y(t.Hz) });
      set(housing, { x: X(t.P[0]) - 75, y: Y(t.P[1]) - 48 });
      set(jP, { cx: X(t.P[0]), cy: Y(t.P[1]) });
      set(jO, { cx: 0, cy: 0 });
      set(jS, { cx: X(t.S[0]), cy: Y(t.S[1]) });
      set(labels.O, { x: X(0) + 34, y: Y(0) + 64 });
      set(labels.P, { x: X(t.P[0]), y: Y(t.P[1]) - 62 });
      set(labels.S, { x: X(t.S[0]), y: Y(t.S[1]) - 30 });
      aAng = t.Ax.map(function (x, i) { return Math.atan2(t.Az[i], x); });
      if (rStroke) rStroke.v.textContent = t.report.stroke.toFixed(2) + ' mm';
    }

    function drawReach() {
      while (gReach.firstChild) gReach.removeChild(gReach.firstChild);
      var t = test, L = reachLimit(), n = t.d.length, r = t.crank + 26, i = 0;
      // group consecutive out-of-reach frames into arcs on the crank circle
      while (i < n) {
        if (t.d[i] > L) {
          var j = i; while (j + 1 < n && t.d[j + 1] > L) j++;
          var a1 = aAng[i], a2 = aAng[j];
          // the crank turns clockwise in this view; unwrap so the arc follows the motion
          while (a2 > a1) a2 -= 2 * Math.PI;
          el('path', { d: arc(0, 0, r, Math.min(a1, a2) - 0.02, Math.max(a1, a2) + 0.02), class: 'lk-band' }, gReach);
          i = j + 1;
        } else i++;
      }
    }

    function refreshUser() {
      userBtns.forEach(function (b) { b.setAttribute('aria-checked', b.dataset.user === user ? 'true' : 'false'); b.tabIndex = b.dataset.user === user ? 0 : -1; });
      rReach.box.querySelector('dt').textContent = USER_NAMES[user];
      drawReach(); draw();
    }

    function setTest(k) {
      tid = k; test = data.tests[k];
      items.forEach(function (it) { var on = it.dataset.id === k; it.setAttribute('aria-checked', on ? 'true' : 'false'); it.tabIndex = on ? 0 : -1; });
      frame = Math.min(frame, test.q.length - 1);
      drawStatic(); drawReach(); draw();
    }

    function draw() {
      var t = test, i = frame;
      var A = [t.Ax[i], t.Az[i]], B = [t.Bx[i], t.Bz[i]], P = t.P, H = [t.Hx[i], t.Hz], W = [t.Wx[i], t.Wz[i]], S = t.S;
      set(crank, { x1: 0, y1: 0, x2: X(A[0]), y2: Y(A[1]) });
      set(coupler, { x1: X(A[0]), y1: Y(A[1]), x2: X(B[0]), y2: Y(B[1]) });
      set(rocker, { x1: X(P[0]), y1: Y(P[1]), x2: X(B[0]), y2: Y(B[1]) });
      set(jA, { cx: X(A[0]), cy: Y(A[1]) }); set(jB, { cx: X(B[0]), cy: Y(B[1]) });
      set(rack, { x1: X(H[0] - 230), y1: Y(H[1]), x2: X(H[0]), y2: Y(H[1]) });
      set(grip, { x: X(H[0]) - 11, y: Y(H[1]) - 23 });

      // Arm: two links from S toward the wrist W, drawn in the side view
      var L = data.users[user], L1 = L[0], L2 = L[1], d3 = t.d[i];
      var dx = W[0] - S[0], dz = W[1] - S[1], dp = Math.hypot(dx, dz), k = dp / d3;
      var l1 = L1 * k, l2 = L2 * k, ux = dx / dp, uz = dz / dp, out = d3 > L1 + L2;
      var E, Wd;
      if (out) {
        E = [S[0] + ux * l1, S[1] + uz * l1]; Wd = [S[0] + ux * (l1 + l2), S[1] + uz * (l1 + l2)];
      } else {
        var c = Math.max(-1, Math.min(1, (l1 * l1 + dp * dp - l2 * l2) / (2 * l1 * dp))), s = Math.sqrt(1 - c * c);
        // elbow below the shoulder-wrist line
        var e1 = [S[0] + l1 * (c * ux - s * uz), S[1] + l1 * (c * uz + s * ux)], e2 = [S[0] + l1 * (c * ux + s * uz), S[1] + l1 * (c * uz - s * ux)];
        E = e1[1] < e2[1] ? e1 : e2; Wd = W;
      }
      set(upper, { x1: X(S[0]), y1: Y(S[1]), x2: X(E[0]), y2: Y(E[1]) });
      set(fore, { x1: X(E[0]), y1: Y(E[1]), x2: X(Wd[0]), y2: Y(Wd[1]) });
      set(hand, { x1: X(Wd[0]), y1: Y(Wd[1]), x2: X(H[0]), y2: Y(H[1]) });
      set(gap, { x1: X(Wd[0]), y1: Y(Wd[1]), x2: X(W[0]), y2: Y(W[1]) });
      set(jE, { cx: X(E[0]), cy: Y(E[1]) }); set(jW, { cx: X(Wd[0]), cy: Y(Wd[1]) });
      root.classList.toggle('is-out', out);
      hand.style.display = out ? 'none' : '';
      gap.style.display = out ? '' : 'none';

      set(labels.A, { x: X(A[0]) + 30, y: Y(A[1]) + 8 });
      set(labels.B, { x: X(B[0]), y: Y(B[1]) - 26 });
      set(labels.E, { x: X(E[0]), y: Y(E[1]) + 44 });
      set(labels.W, { x: X(Wd[0]), y: Y(Wd[1]) + 40 });
      set(labels.H, { x: X(H[0]), y: Y(H[1]) + 62 });

      if (muArc) {
        var a1 = Math.atan2(A[1] - B[1], A[0] - B[0]), a2 = Math.atan2(P[1] - B[1], P[0] - B[0]), d = a2 - a1;
        while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        set(muArc, { d: arc(B[0], B[1], 58, Math.min(a1, a1 + d), Math.max(a1, a1 + d)) });
        var mid = a1 + d / 2;
        set(muText, { x: X(B[0] + 96 * Math.cos(mid)), y: Y(B[1] + 96 * Math.sin(mid)) });
        muText.textContent = 'μ ' + Math.round(t.mu[i]) + '°';
      }

      rTheta.v.textContent = f1(t.q[i]) + '°';
      rMu.v.textContent = f1(t.mu[i]) + '°';
      rD.v.textContent = Math.round(d3) + ' mm';
      rReach.v.textContent = out ? 'Out of reach' : 'In reach';
      rReach.box.classList.toggle('is-out', out);
    }

    function tick(ts) {
      if (running && visible && !dragging) {
        if (last !== null) { acc += ts - last; var steps = Math.floor(acc / FRAME_MS); if (steps) { acc -= steps * FRAME_MS; frame = (frame + steps) % test.q.length; draw(); } }
        last = ts;
      } else last = null;
      requestAnimationFrame(tick);
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(svg);

    function nearestFrame(ang) {
      var best = 0, bd = 9;
      for (var i = 0; i < aAng.length; i++) { var d = Math.abs(Math.atan2(Math.sin(ang - aAng[i]), Math.cos(ang - aAng[i]))); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function toWorld(e) { var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; var p = pt.matrixTransform(svg.getScreenCTM().inverse()); return [-p.x, -p.y]; }
    svg.addEventListener('pointerdown', function (e) {
      var w = toWorld(e); if (Math.hypot(w[0], w[1]) > test.crank + 140) return;
      dragging = true; root.classList.add('is-dragging'); svg.setPointerCapture(e.pointerId);
      frame = nearestFrame(Math.atan2(w[1], w[0])); draw(); e.preventDefault();
    });
    svg.addEventListener('pointermove', function (e) { if (!dragging) return; var w = toWorld(e); frame = nearestFrame(Math.atan2(w[1], w[0])); draw(); });
    function end() { dragging = false; root.classList.remove('is-dragging'); }
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('keydown', function (e) {
      var n = test.q.length, step = e.shiftKey ? 12 : 3;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') frame = (frame + step) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') frame = (frame - step + n) % n;
      else if (e.key === ' ') { running = !running; runLabel(); } else return;
      e.preventDefault(); draw();
    });

    setTest(tid); refreshUser(); runLabel(); requestAnimationFrame(tick);
    root.classList.add('is-live');
  }

  function init() {
    var roots = document.querySelectorAll('[data-linkage]');
    if (!roots.length || !window.fetch) return;
    fetch(SRC).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (data) {
      Array.prototype.forEach.call(roots, function (root) { build(root, data); });
    }).catch(function () {
      Array.prototype.forEach.call(roots, function (root) {
        root.innerHTML = '<p class="linkage__hint">The RT300 motion replay couldn’t load. The case study has the full results.</p>';
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
