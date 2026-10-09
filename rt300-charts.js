// RT300 case study charts: the small-user reach explorer and the stroke trade-off scatter.
// Data comes from the thesis workbook and the d(theta) export, embedded in the page as JSON.
// Charts are drawn at the container's real width so text stays legible on phones.

(function () {
  var dataEl = document.getElementById('rt300-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var NS = 'http://www.w3.org/2000/svg';
  var LIMIT = DATA.limit; // small-user reach limit L1 + L2, mm

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function txt(parent, x, y, s, cls, anchor) {
    var t = el('text', { x: x, y: y, 'class': cls || 'tick', 'text-anchor': anchor || 'start' }, parent);
    t.textContent = s;
    return t;
  }

  function fmt(v, d) { return Number(v).toFixed(d === undefined ? 1 : d); }

  function tipRows(tip, head, rows) {
    tip.textContent = '';
    var h = document.createElement('div');
    h.className = 'chart-tip__head';
    h.textContent = head;
    tip.appendChild(h);
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'chart-tip__row';
      if (r.key) {
        var i = document.createElement('i');
        if (r.key === 'ctx') i.className = 'ctx';
        row.appendChild(i);
      }
      var s = document.createElement('strong');
      s.textContent = r.value;
      row.appendChild(s);
      var l = document.createElement('span');
      l.textContent = r.label;
      row.appendChild(l);
      tip.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- reach explorer
  var host = document.getElementById('reach-chart');
  var form = document.getElementById('reach-form');
  var readout = document.getElementById('reach-readout');
  var legendSel = document.getElementById('reach-legend-sel');
  var legendCtx = document.getElementById('reach-legend-ctx');

  var state = { sel: 'T1', idx: null };

  function contextFor(sel) { return sel === 'T1' ? 'T2' : 'T1'; }

  function drawReach() {
    if (!host) return;
    host.textContent = '';
    var W = Math.max(300, host.clientWidth);
    var H = Math.round(Math.min(380, Math.max(250, W * 0.52)));
    var m = { l: 46, r: 12, t: 30, b: 36 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var y0 = 460, y1 = 700;
    var X = function (a) { return m.l + (a / 360) * pw; };
    var Y = function (d) { return m.t + (1 - (d - y0) / (y1 - y0)) * ph; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img',
      'aria-label': 'Line chart of small-user shoulder to wrist distance over one crank turn for ' + state.sel +
        ' and ' + contextFor(state.sel) + ', against the 615 millimetre reach limit.' }, host);

    var grid = el('g', { 'class': 'grid' }, svg);
    var axis = el('g', { 'class': 'axis' }, svg);
    [480, 520, 560, 600, 640, 680].forEach(function (v) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid);
      if (Math.abs(Y(v) - Y(LIMIT)) > 13) txt(axis, m.l - 8, Y(v) + 4, String(v), 'tick', 'end');
    });
    [0, 90, 180, 270, 360].forEach(function (a) {
      el('line', { x1: X(a), x2: X(a), y1: m.t, y2: H - m.b }, grid);
      txt(axis, X(a), H - m.b + 18, a + '°', 'tick', a === 0 ? 'start' : (a === 360 ? 'end' : 'middle'));
    });
    txt(axis, W - m.r, H - 4, 'Crank angle', 'axis-title', 'end');

    var angles = DATA.angle;
    var sel = DATA.series[state.sel];
    var ctx = DATA.series[contextFor(state.sel)];

    function pathOf(arr) {
      var d = '';
      for (var i = 0; i < arr.length; i++) d += (i ? 'L' : 'M') + X(angles[i]).toFixed(1) + ' ' + Y(arr[i]).toFixed(1);
      return d;
    }

    // over-reach wash for the selected configuration
    var area = '';
    var yl = Y(LIMIT);
    for (var i = 0; i < sel.length; i++) {
      var yy = Math.min(Y(sel[i]), yl);
      area += (i ? 'L' : 'M') + X(angles[i]).toFixed(1) + ' ' + yy.toFixed(1);
    }
    area += 'L' + X(360) + ' ' + yl + 'L' + X(0) + ' ' + yl + 'Z';
    el('path', { d: area, 'class': 'overreach' }, svg);

    el('path', { d: pathOf(ctx), 'class': 'series series--context' }, svg);
    el('path', { d: pathOf(sel), 'class': 'series series--accent' }, svg);

    el('line', { x1: m.l, x2: W - m.r, y1: yl, y2: yl, 'class': 'limit' }, svg);
    txt(svg, m.l - 8, yl + 4, String(LIMIT), 'limit-label', 'end');
    txt(svg, 0, 12, 'Shoulder to wrist, mm', 'axis-title', 'start');

    // crosshair + tooltip
    var cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, 'class': 'crosshair', visibility: 'hidden' }, svg);
    var dotS = el('circle', { r: 5, 'class': 'dot dot--accent', visibility: 'hidden' }, svg);
    var dotC = el('circle', { r: 4, 'class': 'dot dot--context', visibility: 'hidden' }, svg);
    var hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent', tabindex: 0,
      'aria-label': 'Chart area. Use left and right arrow keys to step through the crank cycle.' }, svg);
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('aria-hidden', 'true');
    host.appendChild(tip);

    function show(idx) {
      state.idx = idx;
      var a = angles[idx], ds = sel[idx], dc = ctx[idx];
      cross.setAttribute('x1', X(a)); cross.setAttribute('x2', X(a));
      cross.setAttribute('visibility', 'visible');
      dotS.setAttribute('cx', X(a)); dotS.setAttribute('cy', Y(ds)); dotS.setAttribute('visibility', 'visible');
      dotC.setAttribute('cx', X(a)); dotC.setAttribute('cy', Y(dc)); dotC.setAttribute('visibility', 'visible');
      tipRows(tip, 'Crank angle ' + fmt(a, 0) + '°', [
        { key: 'sel', value: fmt(ds) + ' mm', label: ' ' + state.sel + (ds > LIMIT ? ', out of reach' : '') },
        { key: 'ctx', value: fmt(dc) + ' mm', label: ' ' + contextFor(state.sel) + (dc > LIMIT ? ', out of reach' : '') }
      ]);
      var tx = X(a) + 12;
      if (tx > W - 190) tx = X(a) - 190;
      tip.style.left = Math.max(0, tx) + 'px';
      tip.style.top = (m.t + 6) + 'px';
      tip.classList.add('is-on');
    }
    function hide() {
      state.idx = null;
      cross.setAttribute('visibility', 'hidden');
      dotS.setAttribute('visibility', 'hidden');
      dotC.setAttribute('visibility', 'hidden');
      tip.classList.remove('is-on');
    }
    function nearest(clientX) {
      var r = svg.getBoundingClientRect();
      var px = (clientX - r.left) * (W / r.width);
      var a = Math.max(0, Math.min(360, (px - m.l) / pw * 360));
      var best = 0, bd = 1e9;
      for (var i = 0; i < angles.length; i++) {
        var dd = Math.abs(angles[i] - a);
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    }
    hit.addEventListener('pointermove', function (e) { show(nearest(e.clientX)); });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', function () { show(state.idx === null ? Math.round(angles.length / 2) : state.idx); });
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var step = Math.round(angles.length / 36);
      var i = state.idx === null ? 0 : state.idx + (e.key === 'ArrowRight' ? step : -step);
      show(Math.max(0, Math.min(angles.length - 1, i)));
    });
  }

  function updateReadout() {
    var c = DATA.configs[state.sel];
    if (!readout || !c) return;
    readout.querySelector('[data-f="name"]').textContent = state.sel + ' ' + c.name;
    readout.querySelector('[data-f="change"]').textContent = c.change;
    readout.querySelector('[data-f="stroke"]').textContent = fmt(c.stroke) + ' mm';
    readout.querySelector('[data-f="mu"]').textContent = fmt(c.mu[0]) + '° to ' + fmt(c.mu[1]) + '°';
    readout.querySelector('[data-f="rom"]').textContent = fmt(c.rom[0]) + ' / ' + fmt(c.rom[1]) + ' / ' + fmt(c.rom[2]) + '°';
    var med = readout.querySelector('[data-f="med"]');
    med.textContent = c.med === 0 ? 'Fully reachable' : fmt(c.med) + '% of cycle';
    med.classList.toggle('is-bad', c.med > 0);
    var sm = readout.querySelector('[data-f="small"]');
    sm.textContent = c.small === 0 ? 'Fully reachable' : fmt(c.small) + '% of cycle';
    sm.classList.toggle('is-bad', c.small > 0);
    readout.querySelector('[data-f="peak"]').textContent = fmt(c.peak) + ' mm';
    if (legendSel) legendSel.textContent = state.sel + ' ' + c.name;
    var cc = contextFor(state.sel);
    if (legendCtx) legendCtx.textContent = cc + ' ' + DATA.configs[cc].name;
  }

  if (form) {
    form.addEventListener('change', function (e) {
      if (e.target.name !== 'cfg') return;
      state.sel = e.target.value;
      updateReadout();
      drawReach();
    });
  }

  // ---------------------------------------------------------------- trade-off scatter
  var sHost = document.getElementById('tradeoff-chart');

  function drawScatter() {
    if (!sHost) return;
    sHost.textContent = '';
    var W = Math.max(300, sHost.clientWidth);
    var H = Math.round(Math.min(340, Math.max(240, W * 0.48)));
    var m = { l: 40, r: 16, t: 30, b: 36 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var x0 = 100, x1 = 320, yMax = 40;
    var X = function (v) { return m.l + (v - x0) / (x1 - x0) * pw; };
    var Y = function (v) { return m.t + (1 - v / yMax) * ph; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img',
      'aria-label': 'Scatter plot of handle stroke against the share of the crank cycle the small user cannot reach, for the eight configurations. Only T2 reaches zero.' }, sHost);
    var grid = el('g', { 'class': 'grid' }, svg);
    var axis = el('g', { 'class': 'axis' }, svg);
    [0, 10, 20, 30, 40].forEach(function (v) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid);
      txt(axis, m.l - 8, Y(v) + 4, v + '%', 'tick', 'end');
    });
    [100, 150, 200, 250, 300].forEach(function (v) {
      el('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b }, grid);
      txt(axis, X(v), H - m.b + 18, String(v), 'tick', 'middle');
    });
    txt(axis, W - m.r, H - 4, 'Stroke, mm', 'axis-title', 'end');
    txt(axis, 0, 12, 'Out of reach, % of cycle (small user)', 'axis-title', 'start');

    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('aria-hidden', 'true');
    sHost.appendChild(tip);

    Object.keys(DATA.configs).forEach(function (k) {
      var c = DATA.configs[k];
      var cx = X(c.stroke), cy = Y(c.small);
      var g = el('g', {}, svg);
      var hit = el('circle', { cx: cx, cy: cy, r: 14, 'class': 'hit', tabindex: 0,
        'aria-label': k + ' ' + c.name + ': stroke ' + fmt(c.stroke) + ' millimetres, ' + fmt(c.small) + ' percent of the cycle out of reach' }, g);
      var dot = el('circle', { cx: cx, cy: cy, r: 5, 'class': 'dot ' + (k === 'T2' ? 'dot--accent' : 'dot--context') }, g);
      var label = k === 'T2' ? 'T2 short crank: fully reachable' : k;
      var left = k === 'T8'; // T8 sits just left of T3, so its label goes on the other side
      txt(g, left ? cx - 9 : cx + 9, cy + (k === 'T2' ? -8 : 4), label, 'dot-label', left ? 'end' : 'start');
      function on() {
        dot.classList.add('is-hot');
        tipRows(tip, k + ' ' + c.name, [
          { value: fmt(c.stroke) + ' mm', label: ' stroke' },
          { value: fmt(c.small) + '%', label: ' of cycle out of reach' }
        ]);
        var tx = cx + 14;
        if (tx > W - 180) tx = cx - 190;
        tip.style.left = Math.max(0, tx) + 'px';
        tip.style.top = Math.max(0, cy - 64) + 'px';
        tip.classList.add('is-on');
      }
      function off() { dot.classList.remove('is-hot'); tip.classList.remove('is-on'); }
      hit.addEventListener('pointerenter', on);
      hit.addEventListener('pointerleave', off);
      hit.addEventListener('focus', on);
      hit.addEventListener('blur', off);
    });
  }

  function drawAll() {
    drawReach();
    drawScatter();
  }

  updateReadout();
  drawAll();
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(drawAll, 150);
  });
})();
