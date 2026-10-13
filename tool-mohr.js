// Mohr's circle calculator for the Mohr's circle tool page.
// Three modes (plane stress, plane strain and second moments of area), rotation to any angle and,
// for plane stress only, the absolute maximum shear and the von Mises and Tresca equivalents.
// Plain JavaScript and inline SVG: no libraries, no network requests, no storage.
// It began as a small plane-stress React page I wrote while studying mechanics of materials.

(function () {
  'use strict';

  var MINUS = '−';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var LIMIT = 1e100; // inputs beyond this are refused, so the squares below stay finite
  var RAD = Math.PI / 180;

  // ---------- The calculation (no DOM) ----------

  // All three modes use one circle. a and b are the normal components along x and y, and s is the shear
  // component the circle is built from: tau for stress, gamma/2 for strain, and -Ixy for second moments.
  // For that circle, turning the element (or axes) by theta gives
  //   a' = C + h cos 2theta + s sin 2theta,  b' = C - h cos 2theta - s sin 2theta,  s' = -h sin 2theta + s cos 2theta
  // with C = (a + b) / 2 and h = (a - b) / 2. The vertical coordinate on the plot is vs * s, so that tau,
  // gamma/2 and Ixy are all plotted upwards. toS and fromS convert between the number the user types
  // (or reads) and s.
  var MODES = {
    stress: { vs: 1, toS: function (c) { return c; }, fromS: function (s) { return s; } },
    strain: { vs: 1, toS: function (c) { return c / 2; }, fromS: function (s) { return 2 * s; } },
    inertia: { vs: -1, toS: function (c) { return -c; }, fromS: function (s) { return -s; } }
  };

  // Units labels only. Nothing is converted.
  function unit(k, label, text, plain) {
    return { k: k, label: label, text: text, sfx: text ? ' ' + text : '', plain: plain, psfx: plain ? ' ' + plain : '' };
  }
  var UNITS = {
    stress: [unit('MPa', 'MPa', 'MPa', 'MPa'), unit('kPa', 'kPa', 'kPa', 'kPa'), unit('psi', 'psi', 'psi', 'psi'), unit('ksi', 'ksi', 'ksi', 'ksi')],
    strain: [unit('ue', 'microstrain (µε)', 'µε', 'microstrain'), unit('none', 'strain, no units (m/m)', '', '')],
    inertia: [unit('mm4', 'mm⁴', 'mm⁴', 'mm^4'), unit('cm4', 'cm⁴', 'cm⁴', 'cm^4'), unit('m4', 'm⁴', 'm⁴', 'm^4'), unit('in4', 'in⁴', 'in⁴', 'in^4')]
  };

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function unitOf(mode, k) {
    var list = UNITS[mode];
    for (var i = 0; i < list.length; i++) if (list[i].k === k) return list[i];
    return list[0];
  }

  // Angles run from -90 to 90 degrees. Turning by 180 degrees changes nothing.
  function norm90(a) {
    while (a < -90) a += 180;
    while (a > 90) a -= 180;
    return a;
  }

  // The circle itself. The circle is a point when the radius is zero (or lost in rounding),
  // and then every direction is principal, so there is no principal angle.
  function circle(a, b, s) {
    var half = (a - b) / 2;
    var centre = (a + b) / 2;
    var radius = Math.hypot(half, s);
    var scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(s));
    var point = !(radius > 1e-12 * scale);
    return {
      a: a, b: b, s: s, half: half, centre: centre, radius: radius,
      p1: centre + radius, p2: centre - radius, point: point,
      // Counterclockwise from the x axis to the direction that carries the larger principal value.
      angle: point ? null : 0.5 * Math.atan2(2 * s, a - b) / RAD
    };
  }

  function rotate(k, thetaDeg) {
    var t = 2 * thetaDeg * RAD;
    var cs = Math.cos(t);
    var sn = Math.sin(t);
    var u = k.half * cs + k.s * sn;
    return { a: k.centre + u, b: k.centre - u, s: -k.half * sn + k.s * cs, cs: cs, sn: sn };
  }

  // sx, sy: normal stresses; txy: shear stress. Any one consistent unit. Kept for the plane-stress case on its own.
  // Tension is positive. txy is positive when it acts in the +y direction on the face whose outward normal is +x.
  function compute(sx, sy, txy) {
    var k = circle(sx, sy, txy);
    return {
      sx: sx, sy: sy, txy: txy,
      centre: k.centre, radius: k.radius, s1: k.p1, s2: k.p2,
      tauMax: k.radius, // maximum in-plane shear
      angle: k.angle
    };
  }

  // The full analysis for one mode. c is the third number as typed (tau, gamma or Ixy).
  // theta is the rotation in degrees (NaN for none) and yieldStrength is optional (plane stress only).
  function analyse(modeId, a, b, c, theta, yieldStrength) {
    var mode = MODES[modeId];
    var s = mode.toS(c);
    var k = circle(a, b, s);
    var m = {
      mode: modeId, a: a, b: b, c: c, s: s, vs: mode.vs,
      scale: Math.max(Math.abs(a), Math.abs(b), Math.abs(c)),
      centre: k.centre, half: k.half, radius: k.radius, p1: k.p1, p2: k.p2, point: k.point, angle: k.angle,
      // The angle that puts the point at the top of the circle (plotted vertical coordinate equal to +R).
      shearAngle: k.point ? null : norm90(k.angle - 45 * mode.vs),
      A: [a, mode.vs * s], B: [b, -mode.vs * s],
      rot: null, ext: null, warn: []
    };

    if (isFinite(theta)) {
      var r = rotate(k, theta);
      m.rot = {
        theta: theta, a: r.a, b: r.b, s: r.s, c: mode.fromS(r.s), cs: r.cs, sn: r.sn,
        P: [r.a, mode.vs * r.s], Q: [r.b, -mode.vs * r.s],
        // Change of the point's direction round the circle, as drawn (counterclockwise positive).
        delta: -mode.vs * 2 * theta * RAD
      };
    }

    if (modeId === 'stress') {
      // Plane stress: the third principal stress is taken as zero.
      var order = [k.p1, k.p2, 0].sort(function (x, y) { return y - x; });
      var vm = Math.sqrt(Math.max(0, a * a - a * b + b * b + 3 * c * c));
      var tresca = order[0] - order[2];
      m.ext = {
        p3: 0, max: order[0], mid: order[1], min: order[2],
        tauAbs: tresca / 2, vm: vm, tresca: tresca,
        radicand: a * a - a * b + b * b + 3 * c * c,
        // The main circle (p1, p2) and the two lighter ones that include the third principal stress.
        extras: [{ cx: k.p1 / 2, r: Math.abs(k.p1) / 2 }, { cx: k.p2 / 2, r: Math.abs(k.p2) / 2 }],
        yieldStrength: null, fosVM: null, fosT: null
      };
      m.ext.maxR = Math.max(k.radius, m.ext.extras[0].r, m.ext.extras[1].r);
      if (isFinite(yieldStrength) && yieldStrength > 0) {
        m.ext.yieldStrength = yieldStrength;
        m.ext.fosVM = vm === 0 ? Infinity : yieldStrength / vm;
        m.ext.fosT = tresca === 0 ? Infinity : yieldStrength / tresca;
      }
    }

    if (modeId === 'inertia' && k.p2 < -1e-9 * m.scale) {
      m.warn.push('The smaller principal second moment is negative, so these values cannot come from a real area.');
    }
    return m;
  }

  // ---------- Text (no DOM) ----------

  // Fixed decimals, with a true minus sign and no "-0.00".
  function fmt(x, digits) {
    var s = x.toFixed(digits);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', MINUS);
  }

  // The same, with commas in numbers of 10,000 or more.
  function fmtG(x, digits) {
    var s = fmt(x, digits);
    var neg = s.charAt(0) === MINUS;
    if (neg) s = s.slice(1);
    var parts = s.split('.');
    if (parts[0].length > 4) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? MINUS : '') + parts.join('.');
  }

  // Two decimals normally, more when the values are all small, so tiny inputs do not show as 0.00.
  function digitsForScale(m) {
    if (m === 0 || m >= 1) return 2;
    return Math.min(8, 2 + Math.ceil(-Math.log10(m)));
  }

  function digitsFor(r) {
    return digitsForScale(r.scale !== undefined ? r.scale : Math.max(Math.abs(r.sx), Math.abs(r.sy), Math.abs(r.txy)));
  }

  // Symbols use _{...} for a subscript. plain() drops the markup, for text.
  function plain(text) { return String(text).replace(/_\{([^}]*)\}/g, '$1'); }

  // Plane stress on its own, as the first version of this page reported it.
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

  // Everything that changes with the mode.
  var UI = {
    stress: {
      name: 'Plane stress',
      legend: 'Stress state',
      labels: ['Normal stress σ_{x}', 'Normal stress σ_{y}', 'Shear stress τ_{xy}'],
      short: ['σx', 'σy', 'τxy'],
      defaults: ['80', '-40', '30'],
      axisH: 'σ', axisV: 'τ', pl: 'σ',
      figTitle: 'Mohr’s circle for these stresses',
      figSub: 'Positive τ is drawn upwards, and both axes use the same scale.',
      note: 'Plane stress: the stress out of the plane is taken as zero, as on a thin plate or at a free surface. Enter σx, σy and τxy.',
      hint: 'Tension is positive. τxy is positive when it acts in the +y direction on the face whose outward normal is +x. The results update as you type.',
      legendA: 'A: (σ_{x}, τ_{xy})', legendB: 'B: (σ_{y}, −τ_{xy})', legendP: 'Principal stresses, on the σ axis',
      legendX: 'x′: the point for the turned element', legendY: 'y′: the other end of its diameter',
      unitLine: 'All stresses in the unit chosen above, angles in degrees.',
      shearBtn: 'Set to maximum shear angle',
      pName: 'Principal stress', plural: 'Principal stresses',
      conv: [
        'Normal stress is positive in tension. τxy is positive when it acts in the +y direction on the face whose outward normal is +x, which is the usual tensor sign. Equilibrium then fixes the shear on the other faces.',
        'The circle has σ across and τ up. Point A is (σx, τxy) and point B is (σy, −τxy), so a positive τxy puts A above the σ axis.',
        'Angles are positive counterclockwise, from the x axis towards the y axis. Turning the element counterclockwise by θ moves the point clockwise round the circle by 2θ. A book that plots positive shear downwards shows the circle turning the other way.',
        'θp is counterclockwise from the x axis to the plane that carries σ1, and the plane for σ2 is 90° further round. The maximum shear button turns to the angle where τx′y′ = +R, which is the top of the circle, at θp − 45°.'
      ],
      presets: [
        { k: 'uniaxial', label: 'Uniaxial tension', v: ['100', '0', '0'], note: 'Tension along x only.' },
        { k: 'shear', label: 'Pure shear', v: ['0', '0', '50'], note: 'Shear only, no normal stress.' },
        { k: 'biaxial', label: 'Equal biaxial tension', v: ['100', '100', '0'], note: 'The same tension on x and y, so the circle is a single point.' },
        { k: 'vessel', label: 'Thin-walled pressure vessel wall', v: ['50', '100', '0'], note: 'x is the longitudinal direction and y is the hoop direction, with the hoop stress twice the longitudinal stress.' },
        { k: 'shaft', label: 'Shaft surface, bending plus torsion', v: ['100', '0', '50'], note: 'x runs along the shaft, with bending stress in x and torsional shear in xy.' }
      ]
    },
    strain: {
      name: 'Plane strain',
      legend: 'Strain state',
      labels: ['Normal strain ε_{x}', 'Normal strain ε_{y}', 'Shear strain γ_{xy}'],
      short: ['εx', 'εy', 'γxy'],
      defaults: ['500', '-300', '600'],
      axisH: 'ε', axisV: 'γ/2', pl: 'ε',
      figTitle: 'Mohr’s circle for these strains',
      figSub: 'Positive γ/2 is drawn upwards, and both axes use the same scale.',
      note: 'Plane strain: enter the normal strains εx and εy and the engineering shear strain γxy. The vertical axis is γ/2, which makes this the same circle as for stress.',
      hint: 'Extension is positive. γxy is the engineering shear strain, positive when the angle between the +x and +y directions decreases, the sense that goes with a positive τxy. The results update as you type.',
      legendA: 'A: (ε_{x}, γ_{xy}/2)', legendB: 'B: (ε_{y}, −γ_{xy}/2)', legendP: 'Principal strains, on the ε axis',
      legendX: 'x′: the point for the turned element', legendY: 'y′: the other end of its diameter',
      unitLine: 'All strains in the unit chosen above, angles in degrees.',
      shearBtn: 'Set to maximum shear angle',
      pName: 'Principal strain', plural: 'Principal strains',
      conv: [
        'Extension is positive. γxy is the engineering shear strain, positive when the angle between the +x and +y directions decreases. That is the sense that goes with a positive τxy. The tensor shear strain is γxy/2.',
        'The circle has ε across and γ/2 up, not γ. Point A is (εx, γxy/2) and point B is (εy, −γxy/2).',
        'Angles are positive counterclockwise, from the x axis towards the y axis. Turning the element counterclockwise by θ moves the point clockwise round the circle by 2θ, as for stress.',
        'θp is counterclockwise from the x axis to the direction of ε1. The maximum shear button turns to the angle where γx′y′/2 = +R, the top of the circle, at θp − 45°. The largest engineering shear strain is 2R.'
      ],
      presets: [
        { k: 'uniaxial', label: 'Uniaxial tension', v: ['500', '-150', '0'], unit: 'ue', note: 'The uniaxial stress case worked out with E = 200 GPa and ν = 0.3.' },
        { k: 'shear', label: 'Pure shear', v: ['0', '0', '650'], unit: 'ue', note: 'The pure shear stress case, with γ = τ / G and G = E / (2(1 + ν)) for E = 200 GPa and ν = 0.3.' },
        { k: 'biaxial', label: 'Equal biaxial tension', v: ['350', '350', '0'], unit: 'ue', note: 'The equal biaxial stress case with E = 200 GPa and ν = 0.3, so the circle is a single point.' },
        { k: 'vessel', label: 'Thin-walled pressure vessel wall', v: ['100', '425', '0'], unit: 'ue', note: 'x is longitudinal and y is hoop, with the hoop stress twice the longitudinal stress, E = 200 GPa and ν = 0.3.' },
        { k: 'shaft', label: 'Shaft surface, bending plus torsion', v: ['500', '-150', '650'], unit: 'ue', note: 'The shaft stress case with E = 200 GPa and ν = 0.3.' }
      ]
    },
    inertia: {
      name: 'Second moments of area',
      legend: 'Second moments of area',
      labels: ['Second moment I_{x}', 'Second moment I_{y}', 'Product of inertia I_{xy}'],
      short: ['Ix', 'Iy', 'Ixy'],
      defaults: ['8640000', '2160000', '0'],
      axisH: 'I', axisV: 'Ixy', pl: 'I',
      figTitle: 'Mohr’s circle for these second moments of area',
      figSub: 'Positive Ixy is drawn upwards, and both axes use the same scale.',
      note: 'Second moments of area: enter Ix, Iy and the product of inertia Ixy about axes through the same point, usually the centroid. The circle gives the principal second moments and the principal axes.',
      hint: 'Ix = ∫y² dA, Iy = ∫x² dA and Ixy = ∫xy dA, with x to the right and y up. Ix and Iy cannot be negative, and Ixy can have either sign. The results update as you type.',
      legendA: 'A: (I_{x}, I_{xy})', legendB: 'B: (I_{y}, −I_{xy})', legendP: 'Principal second moments, on the I axis',
      legendX: 'x′: the point for the turned axes', legendY: 'y′: the other end of its diameter',
      unitLine: 'All second moments in the unit chosen above, angles in degrees.',
      shearBtn: 'Set to largest product angle',
      pName: 'Principal second moment', plural: 'Principal second moments',
      conv: [
        'The axes are right-handed, with x to the right and y up. Ix = ∫y² dA and Iy = ∫x² dA, so both are positive. Ixy = ∫xy dA can have either sign. Ix′ is the second moment about the turned x′ axis.',
        'The circle has I across and Ixy up. Point A is (Ix, Ixy) and point B is (Iy, −Ixy).',
        'Angles are positive counterclockwise, from the x axis towards the y axis. Because of how Ixy is defined, turning the axes counterclockwise by θ moves the point counterclockwise round the circle by 2θ. That is the opposite sense to the stress and strain circles.',
        'θp is counterclockwise from the x axis to the principal axis about which the second moment is the larger one, I1, and the axis for I2 is 90° further round. Ixy is zero about both. The largest product button turns to the angle where Ix′y′ = +R, the top of the circle, at θp + 45°.'
      ],
      presets: [
        { k: 'rect', label: 'Rectangle 60 × 120 mm, centroidal axes', v: ['8640000', '2160000', '0'], unit: 'mm4', note: 'Ix = b h³ / 12 with b = 60 mm along x and h = 120 mm along y, and Iy = h b³ / 12. Ixy is zero by symmetry.' },
        { k: 'turned', label: 'The same rectangle, axes turned about 26.6°', v: ['7344000', '3456000', '2592000'], unit: 'mm4', note: 'The rectangle’s values on axes turned 26.57° counterclockwise (tan θ = 1/2), so Ixy is not zero. The principal axis should come back at −26.57°.' },
        { k: 'angle', label: 'L-section 100 × 80 mm, 20 mm thick', v: ['2906667', '1626667', '-1200000'], unit: 'mm4', note: 'Long leg 100 mm along +y and short leg 80 mm along +x from the outside corner, about the centroid at (25, 35) mm. Rounded to the nearest mm⁴.' },
        { k: 'square', label: 'Square 100 × 100 mm, centroidal axes', v: ['8333333', '8333333', '0'], unit: 'mm4', note: 'Ix = Iy and Ixy = 0, so every axis is principal and the circle is a single point. Rounded to the nearest mm⁴.' }
      ]
    }
  };

  var NAMES = {
    stress: { a: 'σ_{x}', b: 'σ_{y}', s: 'τ_{xy}', ra: 'σ_{x′}', rb: 'σ_{y′}', rc: 'τ_{x′y′}', p1: 'σ_{1}', p2: 'σ_{2}' },
    strain: { a: 'ε_{x}', b: 'ε_{y}', s: 'γ_{xy}/2', ra: 'ε_{x′}', rb: 'ε_{y′}', rc: 'γ_{x′y′}', p1: 'ε_{1}', p2: 'ε_{2}' },
    inertia: { a: 'I_{x}', b: 'I_{y}', s: 'I_{xy}', ra: 'I_{x′}', rb: 'I_{y′}', rc: 'I_{x′y′}', p1: 'I_{1}', p2: 'I_{2}' }
  };

  // Result rows, in groups. Each row is [label, value]. With opts.plain the values are for copying as text.
  function groupsFor(m, unit, opts) {
    var ui = UI[m.mode];
    var nm = NAMES[m.mode];
    var asText = !!(opts && opts.plain);
    var n = digitsForScale(m.scale);
    function val(x) {
      if (asText) return fmt(x, n).replace(MINUS, '-') + unit.psfx;
      return fmtG(x, n) + unit.sfx;
    }
    function num(x) { return asText ? fmt(x, n).replace(MINUS, '-') : fmtG(x, n); }
    function deg(x) { return (asText ? fmt(x, 2).replace(MINUS, '-') : fmt(x, 2)) + '°'; }
    var groups = [];
    var g = { title: null, rows: [] };
    var rows = g.rows;

    if (m.mode === 'stress') rows.push(['Centre, C', val(m.centre)]);
    else if (m.mode === 'strain') rows.push(['Centre, C (average normal strain)', val(m.centre)]);
    else rows.push(['Centre, C (average second moment)', val(m.centre)]);
    rows.push(['Radius, R', val(m.radius)]);
    rows.push([ui.pName + ' ' + nm.p1 + ' (C + R)', val(m.p1)]);
    rows.push([ui.pName + ' ' + nm.p2 + ' (C − R)', val(m.p2)]);
    if (m.mode === 'stress') rows.push(['Maximum in-plane shear, τ_{max} (= R)', val(m.radius)]);
    if (m.mode === 'strain') rows.push(['Maximum in-plane shear strain, γ_{max} (= 2R)', val(2 * m.radius)]);
    if (m.mode === 'inertia') rows.push(['Polar second moment, J (= I_{x} + I_{y})', val(m.a + m.b)]);

    var none = 'not defined';
    if (m.mode === 'inertia') {
      rows.push(['Axis of ' + nm.p1 + ', θ_{p}', m.angle === null ? none : deg(m.angle)]);
      rows.push(['Axis of ' + nm.p2 + ', θ_{p} + 90°', m.angle === null ? none : deg(norm90(m.angle + 90))]);
      rows.push(['Axis of largest I_{x′y′}', m.shearAngle === null ? none : deg(m.shearAngle)]);
    } else {
      rows.push(['Principal angle, θ_{p}', m.angle === null ? none : deg(m.angle)]);
      rows.push(['Maximum shear angle, θ_{s}', m.shearAngle === null ? none : deg(m.shearAngle)]);
    }
    rows.push(['Point A (' + nm.a + ', ' + nm.s + ')', '(' + num(m.A[0]) + ', ' + num(m.A[1]) + ')']);
    rows.push(['Point B (' + nm.b + ', −' + nm.s + ')', '(' + num(m.B[0]) + ', ' + num(m.B[1]) + ')']);
    groups.push(g);

    if (m.rot) {
      var r = m.rot;
      var what = m.mode === 'inertia' ? 'axes' : 'element';
      var g2 = { title: 'On the ' + what + ' turned by θ = ' + deg(r.theta), rows: [] };
      g2.rows.push([nm.ra, val(r.a)]);
      g2.rows.push([nm.rb, val(r.b)]);
      g2.rows.push([nm.rc, val(r.c)]);
      if (m.mode === 'strain') g2.rows.push(['γ_{x′y′}/2 (plotted)', val(r.s)]);
      g2.rows.push([nm.ra + ' + ' + nm.rb + ' (= ' + nm.a + ' + ' + nm.b + ')', val(r.a + r.b)]);
      groups.push(g2);
    }

    if (m.ext) {
      var e = m.ext;
      var g3 = { title: 'Yield checks, plane stress with σ_{z} = 0', rows: [] };
      g3.rows.push(['Third principal stress, σ_{3} (taken as zero)', val(0)]);
      g3.rows.push(['Absolute maximum shear, τ_{abs}', val(e.tauAbs)]);
      g3.rows.push(['von Mises equivalent stress', val(e.vm)]);
      g3.rows.push(['Tresca equivalent stress (σ_{max} − σ_{min})', val(e.tresca)]);
      if (e.yieldStrength !== null) {
        g3.rows.push(['Yield strength, σ_{Y}', val(e.yieldStrength)]);
        g3.rows.push(['Factor of safety, von Mises', e.fosVM === Infinity ? 'no limit (zero stress)' : fmt(e.fosVM, 2).replace(MINUS, '-')]);
        g3.rows.push(['Factor of safety, Tresca', e.fosT === Infinity ? 'no limit (zero stress)' : fmt(e.fosT, 2).replace(MINUS, '-')]);
      }
      groups.push(g3);
    }
    return groups;
  }

  // The status sentence, in words.
  function describe(m, unit) {
    var ui = UI[m.mode];
    var n = digitsForScale(m.scale);
    function v(x) { return fmtG(x, n) + unit.sfx; }
    function deg(x) { return fmt(x, 2) + ' degrees'; }
    var t = 'Centre ' + v(m.centre) + '. Radius ' + v(m.radius) + '. ' + ui.plural + ' ' + v(m.p1) + ' and ' + v(m.p2) + '. ';
    if (m.mode === 'stress') t += 'Maximum in-plane shear ' + v(m.radius) + '. ';
    if (m.mode === 'strain') t += 'Maximum in-plane shear strain ' + v(2 * m.radius) + '. ';
    if (m.point) {
      t += m.mode === 'inertia' ? 'Ix equals Iy and Ixy is zero, so every axis is a principal axis.' : 'The circle is a single point, so there is no principal angle.';
    } else if (m.mode === 'inertia') {
      t += 'Principal axis for the larger second moment at ' + deg(m.angle) + ', counterclockwise from the x axis. The other principal axis is 90 degrees further round.';
    } else if (m.mode === 'strain') {
      t += 'Principal angle ' + deg(m.angle) + ', counterclockwise from the x axis to the direction of the first principal strain.';
    } else {
      t += 'Principal angle ' + deg(m.angle) + ', counterclockwise from the x axis to the plane of the first principal stress.';
    }
    if (m.rot) {
      var r = m.rot;
      if (m.mode === 'stress') {
        t += ' Turned by ' + deg(r.theta) + ': normal stress ' + v(r.a) + ' on x prime and ' + v(r.b) + ' on y prime, shear stress ' + v(r.c) + '.';
      } else if (m.mode === 'strain') {
        t += ' Turned by ' + deg(r.theta) + ': normal strain ' + v(r.a) + ' along x prime and ' + v(r.b) + ' along y prime, engineering shear strain ' + v(r.c) + '.';
      } else {
        t += ' Axes turned by ' + deg(r.theta) + ': second moment ' + v(r.a) + ' about x prime and ' + v(r.b) + ' about y prime, product of inertia ' + v(r.c) + '.';
      }
    }
    if (m.ext) {
      var e = m.ext;
      t += ' With the third principal stress taken as zero: absolute maximum shear ' + v(e.tauAbs) + ', von Mises ' + v(e.vm) + ', Tresca ' + v(e.tresca) + '.';
      if (e.yieldStrength !== null) {
        t += ' Factor of safety against yield: von Mises ' + (e.fosVM === Infinity ? 'no limit' : fmt(e.fosVM, 2)) + ', Tresca ' + (e.fosT === Infinity ? 'no limit' : fmt(e.fosT, 2)) + '.';
      }
    }
    for (var i = 0; i < m.warn.length; i++) t += ' ' + m.warn[i];
    return t;
  }

  // The plain-text summary that Copy results puts on the clipboard.
  function reportText(m, unit, link) {
    var ui = UI[m.mode];
    var lines = [];
    function p(x) { return fmt(x, 12).replace(MINUS, '-').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }
    lines.push('Mohr’s circle calculator, ' + ui.name.toLowerCase() + ' (a study aid, not for design use)');
    lines.push('Units label: ' + (unit.plain || 'none') + ' (label only, so the inputs must be in consistent units)');
    lines.push('Inputs: ' + ui.short[0] + ' = ' + p(m.a) + ', ' + ui.short[1] + ' = ' + p(m.b) + ', ' + ui.short[2] + ' = ' + p(m.c));
    groupsFor(m, unit, { plain: true }).forEach(function (g) {
      lines.push('');
      lines.push(plain(g.title || 'Circle and principal values'));
      g.rows.forEach(function (row) { lines.push('  ' + plain(row[0]) + ': ' + row[1]); });
    });
    for (var i = 0; i < m.warn.length; i++) lines.push('Note: ' + m.warn[i]);
    if (link) { lines.push(''); lines.push('Link: ' + link); }
    return lines.join('\n');
  }

  // The working: formulas with the current numbers put in. Each line is one string of symbols.
  function workingLines(m, unit) {
    var nm = NAMES[m.mode];
    var n = digitsForScale(m.scale);
    var sfx = unit.sfx;
    function v(x) { return fmtG(x, n); }
    function q(x) { return x < 0 ? '(' + v(x) + ')' : v(x); }
    function k4(x) { return fmt(x, 4); }
    function k4q(x) { return x < 0 ? '(' + k4(x) + ')' : k4(x); }
    var L = [];
    var sSym = m.mode === 'strain' ? '(γ_{xy}/2)' : nm.s;
    var sVal = q(m.s);

    L.push('C = (' + nm.a + ' + ' + nm.b + ') / 2 = (' + q(m.a) + ' + ' + q(m.b) + ') / 2 = ' + v(m.centre) + sfx);
    L.push('h = (' + nm.a + ' − ' + nm.b + ') / 2 = (' + q(m.a) + ' − ' + q(m.b) + ') / 2 = ' + v(m.half) + sfx);
    if (m.mode === 'inertia') {
      L.push('R = √(h² + I_{xy}²) = √(' + q(m.half) + '² + ' + q(m.c) + '²) = ' + v(m.radius) + sfx);
    } else {
      L.push('R = √(h² + ' + sSym + '²) = √(' + q(m.half) + '² + ' + sVal + '²) = ' + v(m.radius) + sfx);
    }
    L.push(nm.p1 + ' = C + R = ' + q(m.centre) + ' + ' + q(m.radius) + ' = ' + v(m.p1) + sfx);
    L.push(nm.p2 + ' = C − R = ' + q(m.centre) + ' − ' + q(m.radius) + ' = ' + v(m.p2) + sfx);
    if (m.mode === 'stress') {
      L.push('τ_{max} = R = ' + v(m.radius) + sfx);
    } else if (m.mode === 'strain') {
      L.push('γ_{max} = 2R = 2 × ' + q(m.radius) + ' = ' + v(2 * m.radius) + sfx);
    } else {
      L.push('J = I_{x} + I_{y} = ' + q(m.a) + ' + ' + q(m.b) + ' = ' + v(m.a + m.b) + sfx);
    }

    if (m.point) {
      L.push('R is zero, so the circle is a single point and every direction is principal. There is no principal angle.');
    } else if (m.mode === 'inertia') {
      L.push('θ_{p} = ½ atan2(−2I_{xy}, I_{x} − I_{y}) = ½ atan2(' + q(-2 * m.c) + ', ' + q(m.a - m.b) + ') = ' + fmt(m.angle, 2) + '°');
      L.push('The other principal axis is at θ_{p} + 90° = ' + fmt(norm90(m.angle + 90), 2) + '°.');
    } else if (m.mode === 'strain') {
      L.push('θ_{p} = ½ atan2(γ_{xy}, ε_{x} − ε_{y}) = ½ atan2(' + q(m.c) + ', ' + q(m.a - m.b) + ') = ' + fmt(m.angle, 2) + '°');
    } else {
      L.push('θ_{p} = ½ atan2(2τ_{xy}, σ_{x} − σ_{y}) = ½ atan2(' + q(2 * m.c) + ', ' + q(m.a - m.b) + ') = ' + fmt(m.angle, 2) + '°');
    }
    if (!m.point) {
      L.push('θ_{s} = θ_{p} ' + (m.vs > 0 ? '−' : '+') + ' 45° = ' + fmt(m.shearAngle, 2) + '°, where the point is at the top of the circle.');
    }

    if (m.rot) {
      var r = m.rot;
      L.push('2θ = 2 × ' + q(r.theta) + '° = ' + fmt(2 * r.theta, 2) + '°, so cos 2θ = ' + k4(r.cs) + ' and sin 2θ = ' + k4(r.sn));
      if (m.mode === 'inertia') {
        L.push('I_{x′} = C + h cos 2θ − I_{xy} sin 2θ = ' + q(m.centre) + ' + ' + q(m.half) + ' × ' + k4q(r.cs) + ' − ' + q(m.c) + ' × ' + k4q(r.sn) + ' = ' + v(r.a) + sfx);
        L.push('I_{y′} = C − h cos 2θ + I_{xy} sin 2θ = ' + q(m.centre) + ' − ' + q(m.half) + ' × ' + k4q(r.cs) + ' + ' + q(m.c) + ' × ' + k4q(r.sn) + ' = ' + v(r.b) + sfx);
        L.push('I_{x′y′} = h sin 2θ + I_{xy} cos 2θ = ' + q(m.half) + ' × ' + k4q(r.sn) + ' + ' + q(m.c) + ' × ' + k4q(r.cs) + ' = ' + v(r.c) + sfx);
        L.push('I_{x′} + I_{y′} = ' + v(r.a + r.b) + sfx + ', the same as I_{x} + I_{y}.');
      } else {
        var sv = q(m.s);
        L.push(nm.ra + ' = C + h cos 2θ + ' + sSym + ' sin 2θ = ' + q(m.centre) + ' + ' + q(m.half) + ' × ' + k4q(r.cs) + ' + ' + sv + ' × ' + k4q(r.sn) + ' = ' + v(r.a) + sfx);
        L.push(nm.rb + ' = C − h cos 2θ − ' + sSym + ' sin 2θ = ' + q(m.centre) + ' − ' + q(m.half) + ' × ' + k4q(r.cs) + ' − ' + sv + ' × ' + k4q(r.sn) + ' = ' + v(r.b) + sfx);
        if (m.mode === 'strain') {
          L.push('γ_{x′y′}/2 = −h sin 2θ + (γ_{xy}/2) cos 2θ = −' + q(m.half) + ' × ' + k4q(r.sn) + ' + ' + sv + ' × ' + k4q(r.cs) + ' = ' + v(r.s) + sfx + ', so γ_{x′y′} = ' + v(r.c) + sfx);
        } else {
          L.push(nm.rc + ' = −h sin 2θ + τ_{xy} cos 2θ = −' + q(m.half) + ' × ' + k4q(r.sn) + ' + ' + sv + ' × ' + k4q(r.cs) + ' = ' + v(r.c) + sfx);
        }
        L.push(nm.ra + ' + ' + nm.rb + ' = ' + v(r.a + r.b) + sfx + ', the same as ' + nm.a + ' + ' + nm.b + '.');
      }
    }

    if (m.ext) {
      var e = m.ext;
      L.push('Plane stress with σ_{z} = 0, so σ_{3} = 0. In order: σ_{max} = ' + v(e.max) + ', σ_{mid} = ' + v(e.mid) + ', σ_{min} = ' + v(e.min) + sfx);
      L.push('τ_{abs} = (σ_{max} − σ_{min}) / 2 = (' + q(e.max) + ' − ' + q(e.min) + ') / 2 = ' + v(e.tauAbs) + sfx);
      L.push('σ_{vm} = √(σ_{x}² − σ_{x}σ_{y} + σ_{y}² + 3τ_{xy}²) = √(' + q(m.a) + '² − ' + q(m.a) + ' × ' + q(m.b) + ' + ' + q(m.b) + '² + 3 × ' + q(m.c) + '²) = √' + v(e.radicand) + ' = ' + v(e.vm) + sfx);
      L.push('σ_{T} = σ_{max} − σ_{min} = ' + q(e.max) + ' − ' + q(e.min) + ' = ' + v(e.tresca) + sfx);
      if (e.yieldStrength !== null) {
        L.push('n_{vm} = σ_{Y} / σ_{vm} = ' + q(e.yieldStrength) + ' / ' + v(e.vm) + ' = ' + (e.fosVM === Infinity ? 'no limit, the stress is zero' : fmt(e.fosVM, 2)));
        L.push('n_{T} = σ_{Y} / σ_{T} = ' + q(e.yieldStrength) + ' / ' + v(e.tresca) + ' = ' + (e.fosT === Infinity ? 'no limit, the stress is zero' : fmt(e.fosT, 2)));
      }
    }
    return L;
  }

  // ---------- The shared link ----------

  function cleanNumber(text) {
    var t = String(text === null || text === undefined ? '' : text).trim();
    if (t === '' || t.length > 30) return null;
    var x = Number(t);
    return isFinite(x) && Math.abs(x) <= LIMIT ? t : null;
  }

  // Reads "m=stress&a=80&b=-40&c=30&u=MPa&t=0&y=250" (with or without the #). Anything it cannot read is ignored.
  function parseHash(hash) {
    var out = { found: false, bad: false, mode: null, vals: [null, null, null], unit: null, angle: null, yield: null };
    var text = String(hash || '').replace(/^#/, '');
    if (text === '' || typeof URLSearchParams !== 'function') return out;
    var p;
    try { p = new URLSearchParams(text); } catch (e) { return out; }
    var mk = p.get('m');
    if (mk !== null) {
      if (hasOwn(MODES, mk)) { out.mode = mk; out.found = true; } else out.bad = true;
    }
    ['a', 'b', 'c'].forEach(function (key, i) {
      var raw = p.get(key);
      if (raw === null) return;
      var c = cleanNumber(raw);
      if (c === null) out.bad = true; else { out.vals[i] = c; out.found = true; }
    });
    var uk = p.get('u');
    if (uk !== null) {
      var list = UNITS[out.mode || 'stress'];
      var okUnit = list.some(function (u) { return u.k === uk; });
      if (okUnit) { out.unit = uk; out.found = true; } else out.bad = true;
    }
    var tk = p.get('t');
    if (tk !== null) {
      var t = cleanNumber(tk);
      if (t === null || Math.abs(Number(t)) > 90) out.bad = true;
      else { out.angle = t; out.found = true; }
    }
    var yk = p.get('y');
    if (yk !== null) {
      var y = cleanNumber(yk);
      if (y === null || Number(y) <= 0) out.bad = true; else { out.yield = y; out.found = true; }
    }
    return out;
  }

  // st: { mode, vals: [strings or null], unit, angle, yield }. Only values that are valid numbers go in.
  function buildHash(st) {
    var parts = [];
    function add(key, value) {
      if (value !== null && value !== undefined && value !== '') parts.push(key + '=' + encodeURIComponent(value));
    }
    add('m', st.mode);
    add('a', cleanNumber(st.vals[0]));
    add('b', cleanNumber(st.vals[1]));
    add('c', cleanNumber(st.vals[2]));
    add('u', st.unit);
    add('t', cleanNumber(st.angle));
    if (st.mode === 'stress') {
      var y = cleanNumber(st.yield);
      if (y !== null && Number(y) > 0) add('y', y);
    }
    return parts.join('&');
  }

  var api = {
    compute: compute, fmt: fmt, summary: summary, digitsFor: digitsFor,
    circle: circle, rotate: rotate, analyse: analyse, norm90: norm90, describe: describe,
    groupsFor: groupsFor, reportText: reportText, workingLines: workingLines, plain: plain,
    parseHash: parseHash, buildHash: buildHash, fmtG: fmtG, UNITS: UNITS, UI: UI, unitOf: unitOf
  };
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

  // A label such as "sigma 1": a letter with a subscript.
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

  // Tick labels: fixed decimals, or a short exponent form when the numbers are very large or very small.
  function tickText(v, step, big) {
    if (v === 0) return '0';
    if (big || step < 1e-4) {
      return Number(v.toPrecision(6)).toExponential().replace('e+', 'e').replace(/-/g, MINUS);
    }
    var digits = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
    return fmt(v, digits);
  }

  // Draws the circle into the group `plot`, one pixel per unit on both axes. v describes what to draw.
  function draw(plot, W, H, v) {
    var top = 24;
    var bottom = 40;
    var right = 14;
    var left = 50;
    var geo;
    var big = Math.max(Math.abs(v.p1), Math.abs(v.p2), Math.abs(v.maxR)) >= 1e5;

    for (var pass = 0; pass < 2; pass++) {
      var pw = W - left - right;
      var ph = H - top - bottom;

      // The horizontal range always includes zero, so the vertical axis is always on the plot.
      var xlo = Math.min(0, v.p2);
      var xhi = Math.max(0, v.p1);
      if (xhi - xlo === 0) { xlo = -1; xhi = 1; }
      var pad = (xhi - xlo) * 0.12;
      xlo -= pad;
      xhi += pad;

      var s = pw / (xhi - xlo); // pixels per unit
      if (v.maxR > 0) s = Math.min(s, ph / (2 * v.maxR * 1.18));

      var x0 = left + pw / 2 - ((xlo + xhi) / 2) * s; // pixel x of zero
      var y0 = top + ph / 2; // pixel y of zero

      var hLo = (left - x0) / s;
      var hHi = (left + pw - x0) / s;
      var vHalf = ph / 2 / s;
      var hStep = niceStep(hHi - hLo, pw < 340 ? 5 : 8);
      var vStep = niceStep(2 * vHalf, 6);
      var vTicks = tickValues(-vHalf, vHalf, vStep);
      var longest = 0;
      for (var i = 0; i < vTicks.length; i++) {
        longest = Math.max(longest, tickText(vTicks[i], vStep, big).length);
      }
      var need = Math.ceil(longest * 7.4) + 16;

      geo = { pw: pw, ph: ph, s: s, x0: x0, y0: y0, hLo: hLo, hHi: hHi, vHalf: vHalf,
        hStep: hStep, vStep: vStep, vTicks: vTicks };
      if (need <= left) break;
      left = need;
    }

    var scale = geo.s;
    function X(u) { return geo.x0 + u * scale; }
    function Y(u) { return geo.y0 - u * scale; }
    var plotRight = left + geo.pw;
    var plotBottom = top + geo.ph;
    var cx = X(v.centre), cy = Y(0);

    while (plot.firstChild) plot.removeChild(plot.firstChild);

    // Grid and tick labels, kept outside the frame so the circle never covers them.
    tickValues(geo.hLo, geo.hHi, geo.hStep).forEach(function (u) {
      plot.appendChild(svgEl('line', { 'class': 'mc-grid', x1: X(u), y1: top, x2: X(u), y2: plotBottom }));
      plot.appendChild(svgEl('text', { 'class': 'mc-tick', x: X(u), y: plotBottom + 15, 'text-anchor': 'middle' }, tickText(u, geo.hStep, big)));
    });
    geo.vTicks.forEach(function (u) {
      plot.appendChild(svgEl('line', { 'class': 'mc-grid', x1: left, y1: Y(u), x2: plotRight, y2: Y(u) }));
      plot.appendChild(svgEl('text', { 'class': 'mc-tick', x: left - 6, y: Y(u) + 4, 'text-anchor': 'end' }, tickText(u, geo.vStep, big)));
    });
    plot.appendChild(svgEl('rect', { 'class': 'mc-frame', x: left, y: top, width: geo.pw, height: geo.ph }));

    // Axes: horizontal (vertical coordinate zero) and vertical (horizontal coordinate zero).
    plot.appendChild(svgEl('line', { 'class': 'mc-axis', x1: left, y1: Y(0), x2: plotRight, y2: Y(0) }));
    plot.appendChild(svgEl('line', { 'class': 'mc-axis', x1: X(0), y1: top, x2: X(0), y2: plotBottom }));
    plot.appendChild(svgEl('text', { 'class': 'mc-axis-title', x: left, y: top - 8, 'text-anchor': 'start' }, v.vTitle));
    plot.appendChild(svgEl('text', { 'class': 'mc-axis-title', x: plotRight, y: H - 6, 'text-anchor': 'end' }, v.hTitle));

    // The two lighter circles of the plane-stress case, which include the third principal stress.
    if (v.extras) {
      v.extras.forEach(function (e) {
        plot.appendChild(svgEl('circle', { 'class': 'mc-extra', cx: X(e.cx), cy: cy, r: e.r * scale }));
      });
    }

    // The circle, and the diameter through the two state points.
    plot.appendChild(svgEl('circle', { 'class': 'mc-circle', cx: cx, cy: cy, r: v.radius * scale }));
    plot.appendChild(svgEl('line', { 'class': 'mc-diam', x1: X(v.A[0]), y1: Y(v.A[1]), x2: X(v.B[0]), y2: Y(v.B[1]) }));

    var ax = X(v.A[0]), ay = Y(v.A[1]), bx = X(v.B[0]), by = Y(v.B[1]);
    var rpx = v.radius * scale;
    var showRot = v.rot && !v.point;

    // The turned element: its diameter, the angle 2 theta between A and its point, and the two end points.
    if (showRot) {
      var px = X(v.rot.P[0]), py = Y(v.rot.P[1]), qx = X(v.rot.Q[0]), qy = Y(v.rot.Q[1]);
      plot.appendChild(svgEl('line', { 'class': 'mc-pq', x1: px, y1: py, x2: qx, y2: qy }));
      if (rpx >= 18 && Math.abs(v.rot.delta) > 1e-9) {
        var phi0 = Math.atan2(v.A[1], v.A[0] - v.centre);
        var rr = Math.max(13, Math.min(0.4 * rpx, 60));
        var steps = Math.max(2, Math.ceil(Math.abs(v.rot.delta) / (Math.PI / 36)));
        var d = '';
        for (var j = 0; j <= steps; j++) {
          var phi = phi0 + v.rot.delta * j / steps;
          d += (j ? 'L' : 'M') + (cx + rr * Math.cos(phi)).toFixed(1) + ' ' + (cy - rr * Math.sin(phi)).toFixed(1);
        }
        plot.appendChild(svgEl('path', { 'class': 'mc-arc', d: d }));
        var mid = phi0 + v.rot.delta / 2;
        plot.appendChild(svgEl('text', { 'class': 'mc-lab mc-small', x: cx + (rr + 12) * Math.cos(mid), y: cy - (rr + 12) * Math.sin(mid) + 4, 'text-anchor': 'middle' }, '2θ'));
      }
      plot.appendChild(svgEl('circle', { 'class': 'mc-ring mc-ring--q', cx: qx, cy: qy, r: 8 }));
      plot.appendChild(svgEl('circle', { 'class': 'mc-ring', cx: px, cy: py, r: 9 }));
    }

    // State points: A as a circle, B as a square, so colour is not the only cue.
    plot.appendChild(svgEl('rect', { 'class': 'mc-b', x: bx - 4.5, y: by - 4.5, width: 9, height: 9 }));
    plot.appendChild(svgEl('circle', { 'class': 'mc-a', cx: ax, cy: ay, r: 5 }));

    // Principal values: ticks where the circle crosses the horizontal axis.
    [[v.p1, '1'], [v.p2, '2']].forEach(function (p) {
      plot.appendChild(svgEl('line', { 'class': 'mc-prin', x1: X(p[0]), y1: Y(0) - 7, x2: X(p[0]), y2: Y(0) + 7 }));
      plot.appendChild(subLabel({ 'class': 'mc-lab', x: X(p[0]), y: Y(0) - 12, 'text-anchor': 'middle' }, v.pl, p[1]));
    });

    // The third principal stress, when the lighter circles are drawn.
    if (v.extras && Math.abs(X(0) - X(v.p1)) > 24 && Math.abs(X(0) - X(v.p2)) > 24) {
      plot.appendChild(svgEl('line', { 'class': 'mc-prin', x1: X(0), y1: Y(0) - 7, x2: X(0), y2: Y(0) + 7 }));
      plot.appendChild(subLabel({ 'class': 'mc-lab', x: X(0) - 5, y: Y(0) + 20, 'text-anchor': 'end' }, 'σ', '3'));
    }

    // Centre.
    plot.appendChild(svgEl('circle', { 'class': 'mc-c', cx: cx, cy: cy, r: 3 }));
    plot.appendChild(svgEl('text', { 'class': 'mc-lab', x: cx + 7, y: cy + 16 }, 'C'));

    // Names of the points, pushed outwards from the centre.
    function away(px, py, name, dist) {
      var dx = px - cx, dy = py - cy;
      var len = Math.hypot(dx, dy);
      if (len < 1) { dx = 0; dy = -1; len = 1; }
      plot.appendChild(svgEl('text', { 'class': 'mc-lab', x: px + (dx / len) * dist, y: py + (dy / len) * dist + 4, 'text-anchor': 'middle' }, name));
    }
    if (v.point) {
      away(ax, ay, 'A, B', 16);
    } else {
      away(ax, ay, 'A', 14);
      away(bx, by, 'B', 14);
      if (showRot) {
        away(X(v.rot.P[0]), Y(v.rot.P[1]), 'x′', 27);
        away(X(v.rot.Q[0]), Y(v.rot.Q[1]), 'y′', 27);
      }
    }
  }

  // The small square element (or pair of axes) turned by theta. Stress arrows are drawn for plane stress only.
  function drawElement(g, m) {
    var C = 120;
    var half = 40;
    var th = m.rot ? m.rot.theta : 0;
    var rad = th * RAD;
    var cs = Math.cos(rad);
    var sn = Math.sin(rad);

    while (g.firstChild) g.removeChild(g.firstChild);

    function arrow(parent, x1, y1, x2, y2, cls) {
      var X1 = C + x1, Y1 = C - y1, X2 = C + x2, Y2 = C - y2;
      var dx = X2 - X1, dy = Y2 - Y1;
      var len = Math.hypot(dx, dy) || 1;
      var ux = dx / len, uy = dy / len;
      var bx = X2 - ux * 7, by = Y2 - uy * 7;
      parent.appendChild(svgEl('line', { 'class': cls, x1: X1, y1: Y1, x2: bx, y2: by }));
      parent.appendChild(svgEl('polygon', { 'class': cls,
        points: X2.toFixed(1) + ',' + Y2.toFixed(1) + ' ' + (bx - uy * 3.5).toFixed(1) + ',' + (by + ux * 3.5).toFixed(1) + ' ' + (bx + uy * 3.5).toFixed(1) + ',' + (by - ux * 3.5).toFixed(1) }));
    }

    // The fixed x and y directions.
    g.appendChild(svgEl('line', { 'class': 'el-ref', x1: 14, y1: C, x2: 226, y2: C }));
    g.appendChild(svgEl('line', { 'class': 'el-ref', x1: C, y1: 14, x2: C, y2: 226 }));
    g.appendChild(svgEl('text', { 'class': 'mc-tick', x: 236, y: C + 16, 'text-anchor': 'end' }, 'x'));
    g.appendChild(svgEl('text', { 'class': 'mc-tick', x: C + 8, y: 14, 'text-anchor': 'start' }, 'y'));

    // The angle from x to x′.
    if (Math.abs(th) > 0.05) {
      var steps = Math.max(2, Math.ceil(Math.abs(th) / 5));
      var d = '';
      for (var j = 0; j <= steps; j++) {
        var ph = rad * j / steps;
        d += (j ? 'L' : 'M') + (C + 76 * Math.cos(ph)).toFixed(1) + ' ' + (C - 76 * Math.sin(ph)).toFixed(1);
      }
      g.appendChild(svgEl('path', { 'class': 'mc-arc', d: d }));
    }

    // The turned square, drawn upright and then rotated (SVG rotates clockwise for positive angles).
    var rg = svgEl('g', { transform: 'rotate(' + (-th).toFixed(4) + ' ' + C + ' ' + C + ')' });
    rg.appendChild(svgEl('rect', { 'class': 'el-square', x: C - half, y: C - half, width: 2 * half, height: 2 * half }));
    arrow(rg, 0, 0, 84, 0, 'el-axis');
    arrow(rg, 0, 0, 0, 84, 'el-axis');

    if (m.mode === 'stress' && m.rot) {
      var tol = 1e-9 * Math.max(m.scale, 1e-300);
      var r = m.rot;
      var L = 26;
      if (Math.abs(r.a) > tol) {
        var out = r.a > 0;
        arrow(rg, out ? half : half + L, 0, out ? half + L : half, 0, 'el-n');
        arrow(rg, out ? -half : -half - L, 0, out ? -half - L : -half, 0, 'el-n');
      }
      if (Math.abs(r.b) > tol) {
        var outY = r.b > 0;
        arrow(rg, 0, outY ? half : half + L, 0, outY ? half + L : half, 'el-n');
        arrow(rg, 0, outY ? -half : -half - L, 0, outY ? -half - L : -half, 'el-n');
      }
      if (Math.abs(r.s) > tol) {
        var up = r.s > 0 ? 1 : -1;
        var o = half + 8;
        arrow(rg, o, up > 0 ? 8 : 36, o, up > 0 ? 36 : 8, 'el-s');
        arrow(rg, -o, up > 0 ? -8 : -36, -o, up > 0 ? -36 : -8, 'el-s');
        arrow(rg, up > 0 ? 8 : 36, o, up > 0 ? 36 : 8, o, 'el-s');
        arrow(rg, up > 0 ? -8 : -36, -o, up > 0 ? -36 : -8, -o, 'el-s');
      }
    }
    g.appendChild(rg);

    // Names of the turned axes, placed in unrotated coordinates so the letters stay upright.
    g.appendChild(svgEl('text', { 'class': 'mc-lab', x: C + 98 * cs, y: C - 98 * sn + 5, 'text-anchor': 'middle' }, 'x′'));
    g.appendChild(svgEl('text', { 'class': 'mc-lab', x: C - 98 * sn, y: C - 98 * cs + 5, 'text-anchor': 'middle' }, 'y′'));
  }

  // ---------- The page ----------

  function init() {
    var form = document.getElementById('mohr-form');
    var svg = document.getElementById('mohr-svg');
    var plot = document.getElementById('mohr-plot');
    var status = document.getElementById('mohr-status');
    if (!form || !svg || !plot || !status) return;

    function $(id) { return document.getElementById(id); }
    function mk(tag, cls, text) {
      var el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text !== undefined) el.textContent = text;
      return el;
    }
    function setRich(el, text) {
      while (el.firstChild) el.removeChild(el.firstChild);
      String(text).split(/(_\{[^}]*\})/).forEach(function (part) {
        if (!part) return;
        if (part.indexOf('_{') === 0) el.appendChild(mk('sub', '', part.slice(2, -1)));
        else el.appendChild(document.createTextNode(part));
      });
    }
    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

    var inputs = [$('in-sx'), $('in-sy'), $('in-txy')];
    var labels = inputs.map(function (input) { return form.querySelector('label[for="' + input.id + '"]'); });
    var radios = Array.prototype.slice.call(form.querySelectorAll('input[name="mode"]'));
    var unitSel = $('in-unit');
    var presetSel = $('in-preset');
    var presetNote = $('mohr-preset-note');
    var modeNote = $('mohr-mode-note');
    var hint = $('mohr-hint');
    var fieldsLegend = $('mohr-fields-legend');
    var angleBox = $('in-ang');
    var angleRange = $('in-ang-r');
    var btnPrin = $('btn-prin');
    var btnShear = $('btn-shear');
    var btnZero = $('btn-zero');
    var yieldWrap = $('mohr-yield');
    var yieldBox = $('in-yield');
    var yieldLabel = $('mohr-yield-label');
    var figTitle = $('mohr-fig-title');
    var figSub = $('mohr-fig-sub');
    var legendList = $('mohr-legend');
    var elemSvg = $('mohr-elem');
    var elemG = $('mohr-elem-g');
    var elemText = $('mohr-elem-text');
    var groupsEl = $('mohr-groups');
    var unitLine = $('mohr-unitline');
    var shareFields = $('mohr-share-fields');
    var outLink = $('out-link');
    var outText = $('out-text');
    var copyNote = $('mohr-copy-note');
    var btnLink = $('btn-link');
    var btnCopy = $('btn-copy');
    var workingBody = $('mohr-working-body');
    var convList = $('mohr-conv-list');
    var desc = $('mohr-desc');
    var wrap = svg.parentNode;

    var needed = [unitSel, presetSel, modeNote, hint, fieldsLegend, angleBox, angleRange, btnPrin, btnShear, btnZero, yieldWrap, yieldBox,
      yieldLabel, figTitle, figSub, legendList, elemSvg, elemG, elemText, groupsEl, unitLine, shareFields, outLink, outText, copyNote,
      btnLink, btnCopy, workingBody, convList, desc, presetNote];
    for (var ni = 0; ni < needed.length; ni++) if (!needed[ni]) return;

    var timer = null;
    var mode = 'stress';
    var mem = {};
    var model = null; // the last valid analysis, redrawn when the width changes
    var valid = false;
    var drawnWidth = 0;
    var shareOpen = false;

    Object.keys(UI).forEach(function (k) { mem[k] = { v: UI[k].defaults.slice(), u: UNITS[k][0].k }; });

    function readNumber(input) {
      var t = input.value.trim();
      if (t === '' || (input.validity && input.validity.badInput)) return NaN;
      var n = Number(t);
      return isFinite(n) && Math.abs(n) <= LIMIT ? n : NaN;
    }

    function readAngle() {
      var x = readNumber(angleBox);
      if (isNaN(x) || x < -90 || x > 90) return NaN;
      return x;
    }

    // '' when empty, NaN when not a number above zero.
    function readYield() {
      if (yieldBox.value.trim() === '' && !(yieldBox.validity && yieldBox.validity.badInput)) return '';
      var x = readNumber(yieldBox);
      return isNaN(x) || x <= 0 ? NaN : x;
    }

    function currentUnit() { return unitOf(mode, unitSel.value); }

    function size() {
      var W = Math.round(wrap.clientWidth) || 560;
      W = Math.max(260, W);
      var H = Math.max(280, Math.min(440, Math.round(W * 0.78)));
      return { W: W, H: H };
    }

    function viewOf(m) {
      var ui = UI[m.mode];
      var u = currentUnit();
      var suffix = u.text ? ' (' + u.text + ')' : '';
      return {
        centre: m.centre, radius: m.radius, p1: m.p1, p2: m.p2, A: m.A, B: m.B, rot: m.rot, point: m.point,
        extras: m.ext ? m.ext.extras : null,
        maxR: m.ext ? m.ext.maxR : m.radius,
        hTitle: ui.axisH + suffix, vTitle: ui.axisV + suffix, pl: ui.pl
      };
    }

    function redraw() {
      if (!model) return;
      var d = size();
      drawnWidth = d.W;
      svg.setAttribute('viewBox', '0 0 ' + d.W + ' ' + d.H);
      draw(plot, d.W, d.H, viewOf(model));
      drawElement(elemG, model);
    }

    function announce(text, delay) {
      window.clearTimeout(timer);
      if (delay === 0) { status.textContent = text; return; }
      timer = window.setTimeout(function () { status.textContent = text; }, 600);
    }

    function setLegendItems(m) {
      var ui = UI[m.mode];
      clear(legendList);
      function add(keyClass, text) {
        var li = mk('li');
        li.appendChild(mk('span', keyClass));
        li.appendChild(document.createTextNode(' '));
        var span = mk('span');
        setRich(span, text);
        li.appendChild(span);
        legendList.appendChild(li);
      }
      add('key key--dot mohr__a', ui.legendA);
      add('key mohr__b', ui.legendB);
      add('key key--tick', ui.legendP);
      add('key key--dash', 'Diameter AB, through the centre C');
      if (m.rot) {
        add('key key--dot mohr__ring', ui.legendX);
        add('key key--dot mohr__ring mohr__ring--q', ui.legendY);
      }
      if (m.ext) add('key key--line mohr__extra', 'Lighter circles, with the third principal stress taken as zero');
    }

    function renderGroups(list) {
      clear(groupsEl);
      list.forEach(function (g) {
        var sec = mk('div', 'mohr__group');
        if (g.title) {
          var h = mk('h4', 'mohr__sub');
          setRich(h, g.title);
          sec.appendChild(h);
        }
        var dl = mk('dl');
        g.rows.forEach(function (row) {
          var wrapRow = mk('div');
          var dt = mk('dt');
          setRich(dt, row[0]);
          wrapRow.appendChild(dt);
          wrapRow.appendChild(mk('dd', '', row[1]));
          dl.appendChild(wrapRow);
        });
        sec.appendChild(dl);
        groupsEl.appendChild(sec);
      });
    }

    function renderMessage(text) {
      clear(groupsEl);
      groupsEl.appendChild(mk('p', 'mohr__msg', text));
    }

    function renderWorking(lines) {
      clear(workingBody);
      var ol = mk('ol', 'mohr__steps');
      lines.forEach(function (line) {
        var li = mk('li');
        setRich(li, line);
        ol.appendChild(li);
      });
      workingBody.appendChild(ol);
    }

    function currentHash() {
      var ys = yieldBox.value.trim();
      return buildHash({ mode: mode, vals: inputs.map(function (i) { return i.value; }), unit: unitSel.value, angle: angleBox.value, yield: ys });
    }

    function currentLink() {
      return window.location.href.split('#')[0] + '#' + currentHash();
    }

    function refreshShare() {
      if (!shareOpen) return;
      outLink.value = currentLink();
      outText.value = valid ? reportText(model, currentUnit(), currentLink()) : 'Enter valid numbers to get a summary.';
    }

    // The main update. announceIt: say the new results in the live region. lead: text for the start of the announcement.
    function render(announceIt, lead, keepStatus) {
      var ui = UI[mode];
      var u = currentUnit();
      var vals = inputs.map(readNumber);
      var bad = [];
      inputs.forEach(function (input, i) {
        var ok = !isNaN(vals[i]);
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok) bad.push(ui.short[i]);
      });

      var ang = readAngle();
      var angleOk = !isNaN(ang);
      angleBox.setAttribute('aria-invalid', angleOk ? 'false' : 'true');

      var yld = mode === 'stress' ? readYield() : '';
      var yieldBad = yld !== '' && isNaN(yld);
      yieldBox.setAttribute('aria-invalid', yieldBad ? 'true' : 'false');

      if (bad.length) {
        valid = false;
        renderMessage('Enter a number for ' + bad.join(', ') + ' to see the results.');
        workingBody.textContent = 'Enter a number for each value to see the working.';
        setAria(btnPrin, true);
        setAria(btnShear, true);
        refreshShare();
        if (announceIt) announce((lead ? lead + ' ' : '') + 'Enter a number for ' + bad.join(', ') + ' to update the results.');
        return;
      }

      model = analyse(mode, vals[0], vals[1], vals[2], angleOk ? ang : NaN, yld === '' || yieldBad ? NaN : yld);
      valid = true;

      renderGroups(groupsFor(model, u));
      if (!angleOk) groupsEl.appendChild(mk('p', 'mohr__msg', 'Enter an angle from −90 to 90 degrees to see the turned element.'));
      if (yieldBad) groupsEl.appendChild(mk('p', 'mohr__msg', 'The yield strength must be a number above zero. Leave it empty to skip the factor of safety.'));
      model.warn.forEach(function (w) { groupsEl.appendChild(mk('p', 'mohr__msg', w)); });
      renderWorking(workingLines(model, u));
      setLegendItems(model);

      var n = digitsForScale(model.scale);
      desc.textContent = 'Circle centred at ' + fmtG(model.centre, n) + u.sfx + ' with radius ' + fmtG(model.radius, n) + u.sfx +
        '. Point A at ' + fmtG(model.A[0], n) + ', ' + fmtG(model.A[1], n) + ' and point B at ' + fmtG(model.B[0], n) + ', ' + fmtG(model.B[1], n) +
        ' lie at opposite ends of a diameter. The circle crosses the horizontal axis at the principal values ' + fmtG(model.p1, n) + ' and ' + fmtG(model.p2, n) + u.sfx + '.' +
        (model.rot ? ' The turned element is at ' + fmtG(model.rot.P[0], n) + ', ' + fmtG(model.rot.P[1], n) + ', and its other end is at ' + fmtG(model.rot.Q[0], n) + ', ' + fmtG(model.rot.Q[1], n) + '.' : '');

      if (model.rot) {
        elemText.textContent = (mode === 'inertia' ? 'Axes' : 'Element') + ' turned ' + fmt(model.rot.theta, 2) + ' degrees counterclockwise from the x axis. ' + elementValues(model, u);
      } else {
        elemText.textContent = 'Enter an angle from −90 to 90 degrees to turn the element.';
      }
      $('mohr-elem-title').textContent = (mode === 'inertia' ? 'Axes' : 'Element') + ' turned to the chosen angle';

      setAria(btnPrin, model.point);
      setAria(btnShear, model.point);
      redraw();
      refreshShare();

      var text = describe(model, u);
      if (announceIt) announce((lead ? lead + ' ' : '') + text, lead ? 0 : undefined);
      else if (!keepStatus && status.textContent !== text) status.textContent = text;
    }

    function elementValues(m, u) {
      var n = digitsForScale(m.scale);
      var nm = plain(NAMES[m.mode].ra), nb = plain(NAMES[m.mode].rb), nc = plain(NAMES[m.mode].rc);
      var t = nm + ' = ' + fmtG(m.rot.a, n) + u.sfx + ', ' + nb + ' = ' + fmtG(m.rot.b, n) + u.sfx + ', ' + nc + ' = ' + fmtG(m.rot.c, n) + u.sfx + '.';
      if (m.mode === 'stress') t += ' Arrows point out for tension and in for compression, and the shear arrows show the positive direction on each face.';
      return t;
    }

    function setAria(btn, off) {
      if (off) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    }

    // ----- Mode, units and presets -----

    function saveMem() {
      mem[mode].v = inputs.map(function (i) { return i.value; });
      mem[mode].u = unitSel.value;
    }

    function setLegendText() {
      var u = currentUnit();
      fieldsLegend.textContent = UI[mode].legend + (u.text ? ', in ' + u.text : ', no units');
      setRich(yieldLabel, 'Yield strength σ_{Y} (optional)' + (u.text ? ', in ' + u.text : ''));
      unitLine.textContent = UI[mode].unitLine;
    }

    function fillUnits(k) {
      clear(unitSel);
      UNITS[k].forEach(function (u) {
        var o = mk('option', '', u.label);
        o.value = u.k;
        unitSel.appendChild(o);
      });
    }

    function fillPresets(k) {
      clear(presetSel);
      var o = mk('option', '', 'Choose a preset');
      o.value = '';
      presetSel.appendChild(o);
      UI[k].presets.forEach(function (p) {
        var op = mk('option', '', p.label);
        op.value = p.k;
        presetSel.appendChild(op);
      });
      presetNote.textContent = '';
    }

    function fillConv(k) {
      clear(convList);
      UI[k].conv.forEach(function (t) { convList.appendChild(mk('li', '', t)); });
    }

    function applyMode(k) {
      mode = k;
      var ui = UI[k];
      radios.forEach(function (r) { r.checked = r.value === k; });
      inputs.forEach(function (input, i) {
        setRich(labels[i], ui.labels[i]);
        input.value = mem[k].v[i];
      });
      fillUnits(k);
      unitSel.value = mem[k].u;
      fillPresets(k);
      fillConv(k);
      modeNote.textContent = ui.note;
      hint.textContent = ui.hint;
      figTitle.textContent = ui.figTitle;
      figSub.textContent = ui.figSub;
      yieldWrap.hidden = k !== 'stress';
      btnShear.textContent = ui.shearBtn;
      setLegendText();
    }

    function switchMode(k) {
      if (k === mode || !hasOwn(UI, k)) return;
      saveMem();
      applyMode(k);
      render(true, UI[k].name + ' selected.');
    }

    function applyPreset(key) {
      var list = UI[mode].presets;
      var p = null;
      for (var i = 0; i < list.length; i++) if (list[i].k === key) p = list[i];
      if (!p) { presetNote.textContent = ''; return; }
      inputs.forEach(function (input, i) { input.value = p.v[i]; });
      if (p.unit) { unitSel.value = p.unit; setLegendText(); }
      presetNote.textContent = p.note;
      render(true, 'Preset: ' + p.label + '. ' + p.note);
    }

    function setAngle(x) {
      var t = Math.max(-90, Math.min(90, x));
      var s = String(Number(t.toFixed(8)));
      angleBox.value = s;
      angleRange.value = s;
    }

    // ----- Copying -----

    function noteCopy(text) { copyNote.textContent = text; }

    // Puts the text of `field` on the clipboard. Where that is not possible the field stays on show, selected, for copying by hand.
    function copyOut(field, what, shown) {
      var done = function (ok) {
        if (ok) {
          noteCopy(what + ' copied.');
        } else {
          noteCopy('Copying was not available here. ' + shown + ' below, so you can select it and copy it by hand.');
          try { field.focus(); field.select(); } catch (e) { /* nothing to do */ }
        }
      };
      var manual = function () {
        var ok = false;
        try {
          field.focus();
          field.select();
          ok = !!(document.execCommand && document.execCommand('copy'));
        } catch (e) { ok = false; }
        done(ok);
      };
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(field.value).then(function () { done(true); }, manual);
          return;
        }
      } catch (e) { /* fall through to the manual copy */ }
      manual();
    }

    function showShare() {
      shareOpen = true;
      shareFields.hidden = false;
      refreshShare();
    }

    function copyLink() {
      try { window.history.replaceState(null, '', '#' + currentHash()); } catch (e) { /* the address bar stays as it was */ }
      showShare();
      copyOut(outLink, 'Link', 'The link is shown');
    }

    function copyResults() {
      showShare();
      if (!valid) { noteCopy('Enter valid numbers first, then copy the results.'); return; }
      copyOut(outText, 'Results', 'The results are shown');
    }

    // ----- Events -----

    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t.type === 'radio' || t.tagName === 'SELECT') return;
      if (t === angleBox) {
        var a = readAngle();
        if (!isNaN(a)) angleRange.value = String(a);
      } else if (t === angleRange) {
        angleBox.value = angleRange.value;
      } else if (inputs.indexOf(t) >= 0) {
        presetSel.value = '';
        presetNote.textContent = '';
      }
      render(true);
    });

    form.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type === 'radio') {
        switchMode(t.value);
      } else if (t === unitSel) {
        setLegendText();
        render(true, 'Units label set to ' + currentUnit().label + '.');
      } else if (t === presetSel) {
        applyPreset(presetSel.value);
      } else if (t === angleBox) {
        var x = readNumber(angleBox);
        if (!isNaN(x) && (x < -90 || x > 90)) { setAngle(x); render(true); }
      }
    });

    form.addEventListener('submit', function (e) { e.preventDefault(); render(true); });

    form.addEventListener('reset', function (e) {
      e.preventDefault();
      Object.keys(UI).forEach(function (k) { mem[k] = { v: UI[k].defaults.slice(), u: UNITS[k][0].k }; });
      setAngle(0);
      yieldBox.value = '';
      applyMode('stress');
      render(true, 'Reset to the starting values.');
    });

    btnPrin.addEventListener('click', function () {
      if (!valid || !model || model.point) { announce('The circle is a single point, so there is no principal angle.', 0); return; }
      setAngle(model.angle);
      render(true, 'Angle set to the principal angle, ' + fmt(model.angle, 2) + ' degrees.');
    });

    btnShear.addEventListener('click', function () {
      if (!valid || !model || model.point) { announce('The circle is a single point, so there is no maximum shear angle.', 0); return; }
      setAngle(model.shearAngle);
      render(true, 'Angle set to ' + fmt(model.shearAngle, 2) + ' degrees, where the point is at the top of the circle.');
    });

    btnZero.addEventListener('click', function () {
      setAngle(0);
      render(true, 'Angle set to zero.');
    });

    btnLink.addEventListener('click', copyLink);
    btnCopy.addEventListener('click', copyResults);

    // Redraw only when the width changes, so the text stays about the same size at any screen width.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () {
        if (Math.round(wrap.clientWidth) !== drawnWidth) redraw();
      }).observe(wrap);
    } else {
      window.addEventListener('resize', function () { redraw(); });
    }

    // ----- A case from the address -----

    function loadHash(first) {
      var st = parseHash(window.location.hash);
      if (!st.found) return false;
      saveMem();
      var target = st.mode || mode;
      st.vals.forEach(function (v, i) { if (v !== null) mem[target].v[i] = v; });
      if (st.unit && unitOf(target, st.unit).k === st.unit) mem[target].u = st.unit;
      if (st.angle !== null) setAngle(Number(st.angle));
      if (st.yield !== null) yieldBox.value = st.yield;
      applyMode(target);
      render(!first, st.bad ? 'Some values in the link could not be read and were ignored.' : '');
      if (first && st.bad) status.textContent = 'Some values in the link could not be read and were ignored. ' + status.textContent;
      return true;
    }

    window.addEventListener('hashchange', function () { loadHash(false); });

    setAngle(0);
    applyMode('stress');
    // With no case in the address, the starting results are already in the page text, so leave the live region alone.
    if (!loadHash(true)) render(false, '', true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
