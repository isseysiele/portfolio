// Mohr's circle calculator for the Mohr's circle tool page (plane stress only).
// Plain JavaScript and inline SVG: no libraries, no network requests, no storage.
// Ported from a small React page I wrote while studying mechanics of materials.

(function () {
  'use strict';

  var MINUS = '−';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- The calculation (no DOM) ----------

  // sx, sy: normal stresses; txy: shear stress. Any one consistent unit (the page uses MPa).
  // Tension is positive. txy is positive when it acts in the +y direction on the face whose outward normal is +x.
  function compute(sx, sy, txy) {
    var half = (sx - sy) / 2;
    var centre = (sx + sy) / 2;
    var radius = Math.hypot(half, txy);
    return {
      sx: sx,
      sy: sy,
      txy: txy,
      centre: centre,
      radius: radius,
      s1: centre + radius,
      s2: centre - radius,
      tauMax: radius, // maximum in-plane shear
      // Angle in degrees, counterclockwise from the x axis to the plane that carries s1.
      // The second principal plane is 90 degrees further round. Not defined when the circle is a point.
      angle: radius === 0 ? null : 0.5 * Math.atan2(2 * txy, sx - sy) * 180 / Math.PI
    };
  }

  // Fixed decimals, with a true minus sign and no "-0.00".
  function fmt(x, digits) {
    var s = x.toFixed(digits);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', MINUS);
  }

  // Two decimals normally, more when the stresses are all small, so tiny inputs do not show as 0.00.
  function digitsFor(r) {
    var m = Math.max(Math.abs(r.sx), Math.abs(r.sy), Math.abs(r.txy));
    if (m === 0 || m >= 1) return 2;
    return Math.min(8, 2 + Math.ceil(-Math.log10(m)));
  }

  function summary(r) {
    var n = digitsFor(r);
    var t = 'Centre ' + fmt(r.centre, n) + ' MPa. Radius ' + fmt(r.radius, n) + ' MPa. ' +
      'Principal stresses ' + fmt(r.s1, n) + ' and ' + fmt(r.s2, n) + ' MPa. ' +
      'Maximum in-plane shear ' + fmt(r.tauMax, n) + ' MPa. ';
    if (r.angle === null) {
      t += 'The circle is a single point, so there is no principal angle.';
    } else {
      t += 'Principal angle ' + fmt(r.angle, 2) + ' degrees, counterclockwise from the x axis to the plane of the first principal stress.';
    }
    return t;
  }

  var api = { compute: compute, fmt: fmt, summary: summary, digitsFor: digitsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- Drawing ----------

  function svgEl(name, attrs, text) {
    var el = document.createElementNS(SVG_NS, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    }
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  // A label such as "sigma 1": a Greek letter with a subscript.
  function subLabel(attrs, letter, sub) {
    var t = svgEl('text', attrs, letter);
    if (sub) t.appendChild(svgEl('tspan', { 'class': 'mc-sub', dy: '3' }, sub));
    return t;
  }

  function niceStep(range, target) {
    var raw = range / target;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  function tickValues(lo, hi, step) {
    var out = [];
    var i = Math.ceil(lo / step - 1e-9);
    var j = Math.floor(hi / step + 1e-9);
    for (; i <= j; i++) out.push(i * step);
    return out;
  }

  function tickText(v, step) {
    var digits = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
    return fmt(v, digits);
  }

  // Draws the circle into the group `plot`, one pixel per SVG unit, with the same scale on both axes.
  function draw(plot, W, H, r) {
    var top = 24;
    var bottom = 40;
    var right = 14;
    var left = 50;
    var geo;

    for (var pass = 0; pass < 2; pass++) {
      var pw = W - left - right;
      var ph = H - top - bottom;

      // The sigma range always includes sigma = 0, so the tau axis is always on the plot.
      var xlo = Math.min(0, r.s2);
      var xhi = Math.max(0, r.s1);
      if (xhi - xlo === 0) { xlo = -1; xhi = 1; }
      var pad = (xhi - xlo) * 0.12;
      xlo -= pad;
      xhi += pad;

      var s = pw / (xhi - xlo); // pixels per MPa
      if (r.radius > 0) s = Math.min(s, ph / (2 * r.radius * 1.18));

      var x0 = left + pw / 2 - ((xlo + xhi) / 2) * s; // pixel x of sigma = 0
      var y0 = top + ph / 2; // pixel y of tau = 0

      var sigLo = (left - x0) / s;
      var sigHi = (left + pw - x0) / s;
      var tauHalf = ph / 2 / s;
      var sigStep = niceStep(sigHi - sigLo, pw < 340 ? 5 : 8);
      var tauStep = niceStep(2 * tauHalf, 6);
      var tauTicks = tickValues(-tauHalf, tauHalf, tauStep);
      var longest = 0;
      for (var i = 0; i < tauTicks.length; i++) {
        longest = Math.max(longest, tickText(tauTicks[i], tauStep).length);
      }
      var need = Math.ceil(longest * 7.4) + 16;

      geo = { pw: pw, ph: ph, s: s, x0: x0, y0: y0, sigLo: sigLo, sigHi: sigHi, tauHalf: tauHalf,
        sigStep: sigStep, tauStep: tauStep, tauTicks: tauTicks };
      if (need <= left) break;
      left = need;
    }

    var scale = geo.s;
    function X(v) { return geo.x0 + v * scale; }
    function Y(v) { return geo.y0 - v * scale; }
    var plotRight = left + geo.pw;
    var plotBottom = top + geo.ph;

    while (plot.firstChild) plot.removeChild(plot.firstChild);

    // Grid and tick labels, kept outside the frame so the circle never covers them.
    var sigTicks = tickValues(geo.sigLo, geo.sigHi, geo.sigStep);
    sigTicks.forEach(function (v) {
      plot.appendChild(svgEl('line', { 'class': 'mc-grid', x1: X(v), y1: top, x2: X(v), y2: plotBottom }));
      plot.appendChild(svgEl('text', { 'class': 'mc-tick', x: X(v), y: plotBottom + 15, 'text-anchor': 'middle' }, tickText(v, geo.sigStep)));
    });
    geo.tauTicks.forEach(function (v) {
      plot.appendChild(svgEl('line', { 'class': 'mc-grid', x1: left, y1: Y(v), x2: plotRight, y2: Y(v) }));
      plot.appendChild(svgEl('text', { 'class': 'mc-tick', x: left - 6, y: Y(v) + 4, 'text-anchor': 'end' }, tickText(v, geo.tauStep)));
    });
    plot.appendChild(svgEl('rect', { 'class': 'mc-frame', x: left, y: top, width: geo.pw, height: geo.ph }));

    // Axes: sigma (tau = 0) and tau (sigma = 0).
    plot.appendChild(svgEl('line', { 'class': 'mc-axis', x1: left, y1: Y(0), x2: plotRight, y2: Y(0) }));
    plot.appendChild(svgEl('line', { 'class': 'mc-axis', x1: X(0), y1: top, x2: X(0), y2: plotBottom }));
    plot.appendChild(svgEl('text', { 'class': 'mc-axis-title', x: left, y: top - 8, 'text-anchor': 'start' }, 'τ (MPa)'));
    plot.appendChild(svgEl('text', { 'class': 'mc-axis-title', x: plotRight, y: H - 6, 'text-anchor': 'end' }, 'σ (MPa)'));

    // The circle, and the diameter through the two state points.
    plot.appendChild(svgEl('circle', { 'class': 'mc-circle', cx: X(r.centre), cy: Y(0), r: r.radius * scale }));
    plot.appendChild(svgEl('line', { 'class': 'mc-diam', x1: X(r.sx), y1: Y(r.txy), x2: X(r.sy), y2: Y(-r.txy) }));

    // State points: A = (sx, txy) as a circle, B = (sy, -txy) as a square, so colour is not the only cue.
    var ax = X(r.sx), ay = Y(r.txy), bx = X(r.sy), by = Y(-r.txy), cx = X(r.centre), cy = Y(0);
    plot.appendChild(svgEl('rect', { 'class': 'mc-b', x: bx - 4.5, y: by - 4.5, width: 9, height: 9 }));
    plot.appendChild(svgEl('circle', { 'class': 'mc-a', cx: ax, cy: ay, r: 5 }));

    // Principal stresses: ticks where the circle crosses the sigma axis.
    [[r.s1, '1'], [r.s2, '2']].forEach(function (p) {
      plot.appendChild(svgEl('line', { 'class': 'mc-prin', x1: X(p[0]), y1: Y(0) - 7, x2: X(p[0]), y2: Y(0) + 7 }));
      plot.appendChild(subLabel({ 'class': 'mc-lab', x: X(p[0]), y: Y(0) - 12, 'text-anchor': 'middle' }, 'σ', p[1]));
    });

    // Centre.
    plot.appendChild(svgEl('circle', { 'class': 'mc-c', cx: cx, cy: cy, r: 3 }));
    plot.appendChild(svgEl('text', { 'class': 'mc-lab', x: cx + 7, y: cy + 16 }, 'C'));

    // Names of the two state points, pushed outwards from the centre.
    function away(px, py, name) {
      var dx = px - cx, dy = py - cy;
      var len = Math.hypot(dx, dy);
      if (len < 1) { dx = 0; dy = -1; len = 1; }
      plot.appendChild(svgEl('text', { 'class': 'mc-lab', x: px + (dx / len) * 14, y: py + (dy / len) * 14 + 4, 'text-anchor': 'middle' }, name));
    }
    away(ax, ay, 'A');
    away(bx, by, 'B');
  }

  // ---------- The page ----------

  function init() {
    var form = document.getElementById('mohr-form');
    var svg = document.getElementById('mohr-svg');
    var plot = document.getElementById('mohr-plot');
    var status = document.getElementById('mohr-status');
    if (!form || !svg || !plot || !status) return;

    var inputs = [document.getElementById('in-sx'), document.getElementById('in-sy'), document.getElementById('in-txy')];
    var names = ['σx', 'σy', 'τxy'];
    var out = {
      centre: document.getElementById('out-c'),
      radius: document.getElementById('out-r'),
      s1: document.getElementById('out-s1'),
      s2: document.getElementById('out-s2'),
      tauMax: document.getElementById('out-tau'),
      angle: document.getElementById('out-angle'),
      a: document.getElementById('out-a'),
      b: document.getElementById('out-b')
    };
    var desc = document.getElementById('mohr-desc');
    var wrap = svg.parentNode;
    var timer = null;
    var current = null;
    var drawnWidth = 0;

    function readNumber(input) {
      var v = input.value.trim();
      if (v === '') return NaN;
      var n = Number(v);
      return isFinite(n) ? n : NaN;
    }

    function size() {
      var W = Math.round(wrap.clientWidth) || 560;
      W = Math.max(260, W);
      var H = Math.max(280, Math.min(440, Math.round(W * 0.78)));
      return { W: W, H: H };
    }

    function redraw() {
      if (!current) return;
      var d = size();
      drawnWidth = d.W;
      svg.setAttribute('viewBox', '0 0 ' + d.W + ' ' + d.H);
      draw(plot, d.W, d.H, current);
    }

    function announce(text) {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { status.textContent = text; }, 600);
    }

    function setText(r) {
      var n = digitsFor(r);
      out.centre.textContent = fmt(r.centre, n) + ' MPa';
      out.radius.textContent = fmt(r.radius, n) + ' MPa';
      out.s1.textContent = fmt(r.s1, n) + ' MPa';
      out.s2.textContent = fmt(r.s2, n) + ' MPa';
      out.tauMax.textContent = fmt(r.tauMax, n) + ' MPa';
      out.angle.textContent = r.angle === null ? 'not defined' : fmt(r.angle, 2) + '°';
      out.a.textContent = '(' + fmt(r.sx, n) + ', ' + fmt(r.txy, n) + ')';
      out.b.textContent = '(' + fmt(r.sy, n) + ', ' + fmt(-r.txy, n) + ')';
    }

    function clearText() {
      Object.keys(out).forEach(function (k) { out[k].textContent = 'n/a'; });
    }

    function render(announceIt) {
      var vals = inputs.map(readNumber);
      var bad = [];
      inputs.forEach(function (input, i) {
        var ok = !isNaN(vals[i]);
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok) bad.push(names[i]);
      });

      if (bad.length) {
        clearText();
        if (announceIt) announce('Enter a number for ' + bad.join(', ') + ' to update the results.');
        return;
      }

      current = compute(vals[0], vals[1], vals[2]);
      setText(current);
      var n = digitsFor(current);
      desc.textContent = 'Circle centred at ' + fmt(current.centre, n) + ' MPa with radius ' + fmt(current.radius, n) +
        ' MPa. Point A at ' + fmt(current.sx, n) + ', ' + fmt(current.txy, n) + ' and point B at ' + fmt(current.sy, n) + ', ' +
        fmt(-current.txy, n) + ' lie at opposite ends of a diameter. The circle crosses the sigma axis at the principal stresses ' +
        fmt(current.s1, n) + ' and ' + fmt(current.s2, n) + ' MPa.';
      redraw();
      if (announceIt) announce(summary(current));
    }

    form.addEventListener('input', function () { render(true); });
    form.addEventListener('submit', function (e) { e.preventDefault(); render(true); });
    form.addEventListener('reset', function () { window.setTimeout(function () { render(true); }, 0); });

    // Redraw only when the width changes, so the text stays about the same size at any screen width.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () {
        if (Math.round(wrap.clientWidth) !== drawnWidth) redraw();
      }).observe(wrap);
    } else {
      window.addEventListener('resize', function () { redraw(); });
    }

    render(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
