(function () {
  "use strict";

  var host = document.querySelector("[data-particles]");
  if (!host) return;

  var d = host.dataset;
  var num = function (v, dflt) { v = parseFloat(v); return isFinite(v) ? v : dflt; };

  var SCENE = {
    renderW:   2400,
    renderH:   1254,
    emitterW:  309.4014,
    emitterH:  150.4082,
    boxW:      181.1811,
    boxH:      92.8001,
    minR:      0.3,
    maxR:      1.8,
    featureCm: 135,
    animSpeed: 0.3,
    octaves:   6,
    cRadius:   0.56,
    cColour:   0.25,
    fps:       30,

  };

  SCENE.rSkew = num(d.rSkew, 2.7);
  SCENE.animZ = num(d.animZ, 157);
  SCENE.boundary = num(d.boundary, 3);
  SCENE.coverage = num(d.coverage, 1.15);
  SCENE.innerPull = num(d.innerPull, 0.35);
  SCENE.innerFrom = Math.min(0.98, Math.max(0, num(d.innerFrom, 0.35)));
  SCENE.featureCm = num(d.featureCm, SCENE.featureCm);
  SCENE.redFrac0 = num(d.redFrac0, 0.008);
  SCENE.redFrac1 = num(d.redFrac1, 0.047);
  SCENE.redBias = num(d.redBias, 1.0);
  SCENE.redLine = num(d.redLine, 1.4);
  SCENE.redHold = num(d.redHold, 1.45);
  SCENE.redFall = num(d.redFall, 0.40);
  SCENE.whiteHyst = num(d.whiteHyst, 0.03);

  SCENE.gap = num(d.gap, 1.0);
  SCENE.stiffness = num(d.stiffness, 0.9);
  SCENE.contactDamp = num(d.contactDamp, 0.35);
  SCENE.growRoom = num(d.growRoom, 0.45);
  SCENE.growPush = num(d.growPush, 0.14);
  SCENE.shrinkMax = num(d.shrinkMax, 0.14);
  SCENE.vLock = Math.max(0, Math.min(1, num(d.vLock, 1)));
  SCENE.dens = num(d.density, 90);
  SCENE.densTol = Math.max(1, num(d.densityTol, 2.2));
  SCENE.relaxMax = num(d.relaxMax, 12);
  SCENE.relaxTol = num(d.relaxTol, 0.02);
  SCENE.relaxDepth = num(d.relaxDepth, 0.02);

  var frameDt = 1 / 30;
  var playDt = 1 / 30;
  var PX_PER_CM = SCENE.renderW / SCENE.emitterW;
  var FRAME_W = SCENE.emitterW;
  var FRAME_H = SCENE.renderH / PX_PER_CM;
  var FRAME_AREA = FRAME_W * FRAME_H;

  var CFG = {
    count:     Math.max(100, num(d.count, 5000) | 0),
    substeps:  Math.max(1, Math.min(20, num(d.substeps, 4) | 0)),
    cycle:     Math.max(1, num(d.cycle, 18.7)),
    push:      num(d.push, 500),
    friction:  num(d.friction, 60),
    field:     num(d.field, 60),
    fieldFall: num(d.fieldFall, 150),
    maxSpd:    num(d.maxSpd, 22),
    relax:     num(d.relax, 2) | 0,
    timeScale: num(d.timeScale, 0.25),
    accent:    d.accent || "#e6392c",
    ink:       d.ink || "#111111",
    bg:        d.bg || "#ffffff",
    hud:       d.hud === "1",
    panel:     d.panel === "1",
    seed:      num(d.seed, 12345) | 0,
    maxDpr:    num(d.maxDpr, 2),
  };

  // Any CSS colour, resolved the only way that covers every syntax the browser
  // will ever grow: hand it to a 1x1 canvas and read the pixel back. Hex, rgb,
  // hsl, named, color-mix, oklch, color(display-p3 ...) all land in sRGB bytes.
  // The two-seed check first, because fillStyle silently keeps its old value
  // when handed something it cannot parse.
  var probeCtx = null;
  function rasterColor(s) {
    if (!s) return null;
    try {
      if (!probeCtx) {
        var c = document.createElement("canvas");
        c.width = 1; c.height = 1;
        probeCtx = c.getContext("2d", { willReadFrequently: true });
      }
      probeCtx.fillStyle = "#000000";
      probeCtx.fillStyle = s;
      if (probeCtx.fillStyle === "#000000") {
        probeCtx.fillStyle = "#ffffff";
        probeCtx.fillStyle = s;
        if (probeCtx.fillStyle !== "#000000") return null;
      }
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillRect(0, 0, 1, 1);
      var d = probeCtx.getImageData(0, 0, 1, 1).data;
      if (d[3] === 0) return null;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    } catch (e) { return null; }
  }

  var hex = function (s, fallback) {
    var rgb = rasterColor((s == null ? "" : String(s)).trim());
    return rgb || fallback || [0, 0, 0];
  };

  function hexStr(rgb) {
    var f = function (x) {
      var h = Math.round(x * 255).toString(16);
      return h.length < 2 ? "0" + h : h;
    };
    return "#" + f(rgb[0]) + f(rgb[1]) + f(rgb[2]);
  }

  function pageBg() {
    var n = host;
    for (var g = 0; g < 12 && n; g++) {
      var c = "";
      try { c = getComputedStyle(n).backgroundColor; } catch (e) {}
      if (c && c !== "transparent" && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(c)) return c;
      n = n.parentElement;
    }
    return "";
  }

  function normColor(v) {
    var rgb = rasterColor(String(v == null ? "" : v).trim());
    return rgb ? hexStr(rgb) : "";
  }

  function resolveColors() {
    CFG.ink    = normColor(cssVal(d.ink    || "var(--brg-ink)",  "", "color")) || "#111111";
    CFG.accent = normColor(cssVal(d.accent || "var(--brg-red)",  "", "color")) || "#e6392c";
    CFG.bg     = normColor(cssVal(d.bg || "var(--brg-paper)", "", "background-color"))
              || normColor(pageBg()) || "#ffffff";
    try {
      host.style.setProperty("--brg-ink", CFG.ink);
      host.style.setProperty("--brg-red", CFG.accent);
      host.style.setProperty("--brg-paper", CFG.bg);
    } catch (e) {}
    return {
      ink:    hex(CFG.ink,    [0.067, 0.067, 0.067]),
      bg:     hex(CFG.bg,     [1, 1, 1]),
      accent: hex(CFG.accent, [0.902, 0.224, 0.173]),
    };
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(rand) {
    var P = new Uint8Array(512);
    var i, j, t;
    for (i = 0; i < 256; i++) P[i] = i;
    for (i = 255; i > 0; i--) { j = (rand() * (i + 1)) | 0; t = P[i]; P[i] = P[j]; P[j] = t; }
    for (i = 0; i < 256; i++) P[i + 256] = P[i];

    var G = new Float32Array(512);
    for (i = 0; i < 512; i++) G[i] = P[i] / 255 * 2 - 1;

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function val(ix, iy, iz) {
      var h = P[(ix & 255)] + iy;
      h = P[h & 255] + iz;
      return G[h & 511];
    }

    return function noise3(x, y, z) {
      var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      var fx = x - ix, fy = y - iy, fz = z - iz;
      var u = fade(fx), v = fade(fy), w = fade(fz);

      var c000 = val(ix,     iy,     iz),     c100 = val(ix + 1, iy,     iz);
      var c010 = val(ix,     iy + 1, iz),     c110 = val(ix + 1, iy + 1, iz);
      var c001 = val(ix,     iy,     iz + 1), c101 = val(ix + 1, iy,     iz + 1);
      var c011 = val(ix,     iy + 1, iz + 1), c111 = val(ix + 1, iy + 1, iz + 1);

      return lerp(
        lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
        lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
        w);
    };
  }

  var LATTICE_CM = 2;
  var LAT_W = 0, LAT_H = 0, LX = 0, LY = 0, lat = null;
  function sizeLattice() {
    LAT_W = FRAME_W * 1.45; LAT_H = FRAME_H * 1.6;
    LX = Math.ceil(LAT_W / LATTICE_CM) + 1;
    LY = Math.ceil(LAT_H / LATTICE_CM) + 1;
    if (!lat || lat.length !== LX * LY) lat = new Float32Array(LX * LY);
  }
  sizeLattice();

  var noise3 = makeNoise(mulberry32(CFG.seed));

  var BASE_FREQ = 1 / SCENE.featureCm;

  function bakeField(t) {
    var x0 = -LAT_W / 2, y0 = -LAT_H / 2;
    var zt = t * SCENE.animSpeed;
    for (var j = 0; j < LY; j++) {
      var y = y0 + j * LATTICE_CM;
      var row = j * LX;
      for (var i = 0; i < LX; i++) {
        var x = x0 + i * LATTICE_CM;
        var amp = 1, freq = BASE_FREQ, sum = 0, norm = 0;
        for (var o = 0; o < SCENE.octaves; o++) {
          var n = noise3(x * freq, y * freq, zt * freq * SCENE.animZ);
          sum += (1 - Math.abs(n)) * amp;
          norm += amp;
          amp *= 0.5; freq *= 2;
        }
        lat[row + i] = sum / norm;
      }
    }

    var m = 0, i2, len = LX * LY;
    for (i2 = 0; i2 < len; i2++) m += lat[i2];
    m /= len;
    var sd = 0;
    for (i2 = 0; i2 < len; i2++) { var dv = lat[i2] - m; sd += dv * dv; }
    sd = Math.sqrt(sd / len) || 1e-6;
    var k2 = 1 / (4 * sd);
    for (i2 = 0; i2 < len; i2++) {
      var v2 = 0.5 + (lat[i2] - m) * k2;
      lat[i2] = v2 < 0 ? 0 : v2 > 1 ? 1 : v2;
    }
  }

  function sampleField(x, y) {
    var fx = (x + LAT_W / 2) / LATTICE_CM;
    var fy = (y + LAT_H / 2) / LATTICE_CM;
    var ix = fx | 0, iy = fy | 0;
    if (ix < 0) ix = 0; else if (ix > LX - 2) ix = LX - 2;
    if (iy < 0) iy = 0; else if (iy > LY - 2) iy = LY - 2;
    var tx = fx - ix, ty = fy - iy;
    var a = iy * LX + ix, b = a + LX;
    return (lat[a] * (1 - tx) + lat[a + 1] * tx) * (1 - ty) +
           (lat[b] * (1 - tx) + lat[b + 1] * tx) * ty;
  }

  function contrast(v, c) {
    var g = 1 / Math.max(0.05, 1 - c);
    var o = (v - 0.5) * g + 0.5;
    return o < 0 ? 0 : o > 1 ? 1 : o;
  }

  var N = 0;
  var px, py, vx, vy, rad, act, pushX, pushY, pushN, order, cellOf, room;
  var corrX, corrY, corrN;
  var score, fieldV, radV, tjit;
  var vRef = -1;
  var redOn, lineOn, whiteOn, redTimer, lineTimer;
  var redNow = 0;

  var DBG = { on: false, want: 0, near: 0, far: 0 };
  var preX, preY;
  var gpuPos, gpuR, gpuCol;

  function allocate(n) {
    N = n;
    px = new Float32Array(N); py = new Float32Array(N);
    vx = new Float32Array(N); vy = new Float32Array(N);
    rad = new Float32Array(N); act = new Float32Array(N);
    pushX = new Float32Array(N); pushY = new Float32Array(N);
    pushN = new Int32Array(N);
    order = new Int32Array(N); cellOf = new Int32Array(N);
    room = new Float32Array(N);
    corrX = new Float32Array(N); corrY = new Float32Array(N);
    corrN = new Int32Array(N);
    preX = new Float32Array(N); preY = new Float32Array(N);
    score = new Float32Array(N); fieldV = new Float32Array(N);
    radV = new Float32Array(N);
    tjit = new Float32Array(N);
    redOn = new Uint8Array(N); lineOn = new Uint8Array(N); whiteOn = new Uint8Array(N);
    redTimer = new Float32Array(N); lineTimer = new Float32Array(N);

    gpuPos = new Float32Array(N * 2);
    gpuR   = new Float32Array(N);
    gpuCol = new Float32Array(N * 2);

    var rand = mulberry32(CFG.seed);
    var gap = Math.sqrt(FRAME_W * FRAME_H / N);
    var rowH = gap * 0.8660254;
    var cols = Math.max(1, Math.ceil(FRAME_W / gap));
    var rows = Math.max(1, Math.ceil(FRAME_H / rowH));
    var r0 = Math.min((SCENE.minR + SCENE.maxR) * 0.5, gap * 0.45);
    for (var i = 0; i < N; i++) {
      var lx = i % cols, ly = ((i / cols) | 0) % rows;
      px[i] = -FRAME_W / 2 + (lx + 0.5) * gap + ((ly & 1) ? gap * 0.5 : 0)
            + (rand() - 0.5) * gap * 0.45;
      py[i] = -FRAME_H / 2 + (ly + 0.5) * rowH + (rand() - 0.5) * rowH * 0.45;
      vx[i] = 0; vy[i] = 0;
      rad[i] = r0;

      tjit[i] = rand();
    }
  }

  var CELL = SCENE.maxR * 2;
  var GX = 0, GY = 0, GOX = 0, GOY = 0;
  var cellStart = null, cellCount = null, gridCursor = null;
  function sizeGrid() {
    GX = Math.ceil((FRAME_W + 4 * CELL) / CELL) | 0;
    GY = Math.ceil((FRAME_H + 4 * CELL) / CELL) | 0;
    GOX = -FRAME_W / 2 - 2 * CELL;
    GOY = -FRAME_H / 2 - 2 * CELL;
    var nc = GX * GY;
    if (!cellStart || cellCount.length !== nc) {
      cellStart = new Int32Array(nc + 1);
      cellCount = new Int32Array(nc);
      gridCursor = new Int32Array(nc);
    }
  }

  function reframe(cw, ch) {
    var asp = (cw > 0 && ch > 0) ? cw / ch : FRAME_W / FRAME_H;
    if (asp < 0.2) asp = 0.2; else if (asp > 6) asp = 6;
    var w = Math.sqrt(FRAME_AREA * asp), h = FRAME_AREA / w;
    if (Math.abs(w - FRAME_W) < 1e-3) return false;
    FRAME_W = w; FRAME_H = h;
    sizeLattice(); sizeGrid();
    if (U && U.uHalf) gl.uniform2f(U.uHalf, FRAME_W / 2, FRAME_H / 2);
    return true;
  }

  sizeGrid();
  reframe(host.clientWidth, host.clientHeight);
  allocate(CFG.count);

  function buildGrid() {
    cellCount.fill(0);
    var i, c, cx, cy;
    for (i = 0; i < N; i++) {
      cx = (px[i] - GOX) / CELL | 0;
      cy = (py[i] - GOY) / CELL | 0;
      if (cx < 0) cx = 0; else if (cx >= GX) cx = GX - 1;
      if (cy < 0) cy = 0; else if (cy >= GY) cy = GY - 1;
      c = cy * GX + cx;
      cellOf[i] = c;
      cellCount[c]++;
    }
    var acc = 0;
    for (c = 0; c < GX * GY; c++) { cellStart[c] = acc; acc += cellCount[c]; }
    cellStart[GX * GY] = acc;
    gridCursor.fill(0);
    var cursor = gridCursor;
    for (i = 0; i < N; i++) {
      c = cellOf[i];
      order[cellStart[c] + cursor[c]++] = i;
    }
  }

  var NB_DX = [0, 1, -1, 0, 1];
  var NB_DY = [0, 0, 1, 1, 1];

  var ACT_DECAY = 0.90;

  function pushApart(strength, dt) {
    pushX.fill(0); pushY.fill(0); pushN.fill(0);

    var gx, gy, k, s, e, s2, e2, ai, bi, i, j;
    for (gy = 0; gy < GY; gy++) {
      for (gx = 0; gx < GX; gx++) {
        var c = gy * GX + gx;
        s = cellStart[c]; e = cellStart[c + 1];
        if (s === e) continue;

        for (k = 0; k < 5; k++) {
          var nx = gx + NB_DX[k], ny = gy + NB_DY[k];
          if (nx < 0 || nx >= GX || ny >= GY) continue;
          var c2 = ny * GX + nx;
          s2 = cellStart[c2]; e2 = cellStart[c2 + 1];
          if (s2 === e2) continue;

          for (ai = s; ai < e; ai++) {
            i = order[ai];
            var xi = px[i], yi = py[i], ri = rad[i];
            var bStart = (k === 0) ? ai + 1 : s2;
            for (bi = bStart; bi < e2; bi++) {
              j = order[bi];
              var dx = xi - px[j], dy = yi - py[j];
              var touch = ri + rad[j];
              var d2 = dx * dx + dy * dy;
              if (d2 >= touch * touch || d2 < 1e-8) continue;

              var dist = Math.sqrt(d2);
              var overlap = touch - dist;
              var inv = 1 / dist;
              var ux = dx * inv, uy = dy * inv;

              if (overlap > touch) overlap = touch;
              var mag = overlap * strength;

              pushX[i] += ux * mag; pushY[i] += uy * mag; pushN[i]++;
              pushX[j] -= ux * mag; pushY[j] -= uy * mag; pushN[j]++;
            }
          }
        }
      }
    }

    for (i = 0; i < N; i++) {
      if (pushN[i] === 0) { act[i] *= ACT_DECAY; continue; }
      var invN = 1 / pushN[i];
      var axp = pushX[i] * invN, ayp = pushY[i] * invN;
      vx[i] += axp * dt;
      vy[i] += ayp * dt;
      act[i] = act[i] * ACT_DECAY + Math.sqrt(axp * axp + ayp * ayp) * (1 - ACT_DECAY);
    }
  }

  function clampSpeed(maxSpd) {
    var m2 = maxSpd * maxSpd;
    for (var i = 0; i < N; i++) {
      var s2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (s2 > m2) {
        var k = maxSpd / Math.sqrt(s2);
        vx[i] *= k; vy[i] *= k;
      }
    }
  }

  function fieldForce(strength, fall, dt) {
    var hx = FRAME_W / 2 * SCENE.coverage, hy = FRAME_H / 2 * SCENE.coverage;
    var n = SCENE.boundary;
    for (var i = 0; i < N; i++) {
      var x = px[i], y = py[i];
      var ax = Math.abs(x) / hx, ay = Math.abs(y) / hy;

      var q = Math.pow(Math.pow(ax, n) + Math.pow(ay, n), 1 / n);
      if (q < 1e-4) continue;

      var gx2 = (n / hx) * Math.pow(ax, n - 1) * Math.sign(x);
      var gy2 = (n / hy) * Math.pow(ay, n - 1) * Math.sign(y);
      var gl = Math.sqrt(gx2 * gx2 + gy2 * gy2) || 1e-6;

      var qk = (q - SCENE.innerFrom) / (1 - SCENE.innerFrom);
      if (qk < 0) qk = 0; else if (qk > 1) qk = 1;
      var mag = SCENE.innerPull * qk * strength;
      if (q > 1) mag += ((q - 1) * hx / fall) * strength;
      vx[i] -= (gx2 / gl) * mag * dt;
      vy[i] -= (gy2 / gl) * mag * dt;
    }
  }

  function densityForce(strength, dt) {
    if (strength <= 0) return;
    var c, occ = 0, tot = 0;
    for (c = 0; c < GX * GY; c++) if (cellCount[c] > 0) { occ++; tot += cellCount[c]; }
    if (occ === 0) return;
    var mean = tot / occ, over0 = mean * SCENE.densTol;
    var i, cx, cy;
    for (i = 0; i < N; i++) {
      c = cellOf[i];
      var over = cellCount[c] - over0;
      if (over <= 0) continue;
      cx = c % GX; cy = (c - cx) / GX;
      var l = cx > 0 ? cellCount[c - 1] : cellCount[c];
      var r = cx < GX - 1 ? cellCount[c + 1] : cellCount[c];
      var dn = cy > 0 ? cellCount[c - GX] : cellCount[c];
      var up = cy < GY - 1 ? cellCount[c + GX] : cellCount[c];
      var gx2 = r - l, gy2 = up - dn;
      var m = Math.sqrt(gx2 * gx2 + gy2 * gy2);
      if (m < 1e-6) continue;
      var k = (over / mean) * strength * dt;
      vx[i] -= (gx2 / m) * k;
      vy[i] -= (gy2 / m) * k;
    }
  }

  function friction(strength, dt) {
    var k = Math.exp(-strength * 0.028 * dt);
    for (var i = 0; i < N; i++) { vx[i] *= k; vy[i] *= k; }
  }

  function integrate(dt) {
    for (var i = 0; i < N; i++) { px[i] += vx[i] * dt; py[i] += vy[i] * dt; }
  }

  function separate(iters) {
    if (iters <= 0) return;
    buildGrid();
    preX.set(px); preY.set(py);

    var cap = Math.max(iters, SCENE.relaxMax);
    var stopAt = N * SCENE.relaxTol;
    for (var it = 0; it < cap; it++) {
      var hits = 0;
      corrX.fill(0); corrY.fill(0); corrN.fill(0);
      var last = (it + 1 >= iters);
      if (last) room.fill(1e9);
      var gx, gy, k, ai, bi, i, j;
      for (gy = 0; gy < GY; gy++) {
        for (gx = 0; gx < GX; gx++) {
          var c = gy * GX + gx;
          var s0 = cellStart[c], e0 = cellStart[c + 1];
          if (s0 === e0) continue;
          for (k = 0; k < 5; k++) {
            var nx = gx + NB_DX[k], ny = gy + NB_DY[k];
            if (nx < 0 || nx >= GX || ny >= GY) continue;
            var c2 = ny * GX + nx;
            var s2 = cellStart[c2], e2 = cellStart[c2 + 1];
            if (s2 === e2) continue;
            for (ai = s0; ai < e0; ai++) {
              i = order[ai];
              var xi = px[i], yi = py[i], ri = rad[i];
              var bStart = (k === 0) ? ai + 1 : s2;
              for (bi = bStart; bi < e2; bi++) {
                j = order[bi];
                var dx = xi - px[j], dy = yi - py[j];
                var touch = (ri + rad[j]) * SCENE.gap;
                var d2 = dx * dx + dy * dy;

                if (last) {
                  var dNear = Math.sqrt(d2);
                  var fi = dNear - rad[j], fj = dNear - ri;
                  if (fi < room[i]) room[i] = fi;
                  if (fj < room[j]) room[j] = fj;
                }

                if (d2 >= touch * touch) continue;
                var dist = Math.sqrt(d2);
                if (dist < 1e-5) { dx = 1e-3; dy = 0; dist = 1e-3; }
                if ((touch - dist) / touch > SCENE.relaxDepth) hits++;

                var wi = 1 / (ri * ri), wj = 1 / (rad[j] * rad[j]);
                var wsum = wi + wj;
                var corr = (touch - dist) * SCENE.stiffness / wsum;
                var ux = dx / dist, uy = dy / dist;
                corrX[i] += ux * corr * wi; corrY[i] += uy * corr * wi;
                corrX[j] -= ux * corr * wj; corrY[j] -= uy * corr * wj;
                corrN[i]++; corrN[j]++;

                var rvn = (vx[i] - vx[j]) * ux + (vy[i] - vy[j]) * uy;
                if (rvn < 0) {
                  var imp = rvn * SCENE.contactDamp;
                  vx[i] -= ux * imp * wi / wsum * 2; vy[i] -= uy * imp * wi / wsum * 2;
                  vx[j] += ux * imp * wj / wsum * 2; vy[j] += uy * imp * wj / wsum * 2;
                }
              }
            }
          }
        }
      }

      for (var q = 0; q < N; q++) {
        var cn = corrN[q];
        if (cn === 0) continue;
        px[q] += corrX[q] / cn;
        py[q] += corrY[q] / cn;
      }
      if (it + 1 >= iters && hits <= stopAt) break;
    }

    var pv = 1 / frameDt;
    for (var w = 0; w < N; w++) {
      vx[w] += (px[w] - preX[w]) * pv;
      vy[w] += (py[w] - preY[w]) * pv;
    }
  }

  function shade(grow) {
    var whiteFill = 0.50 + (0.48 - 0.50) * grow;

    var i, mAct = 0;
    for (i = 0; i < N; i++) mAct += act[i];
    mAct = mAct / N || 1e-6;

    var smallHi = SCENE.minR + (SCENE.maxR - SCENE.minR) * 0.22;
    var invSmall = 1 / (smallHi - SCENE.minR);

    var waveOn = RED.on, wr = RED.r, ws = RED.soft, wb = RED.base;
    var wcx = RED.cx, wcy = RED.cy, whw = RED.hw, whh = RED.hh;
    var nearOn = RED.on && RED.focus;
    var ncm = RED.nearCm || 1;
    var fcx = RED.fx, fcy = RED.fy, fhw = RED.fhw, fhh = RED.fhh;

    for (i = 0; i < N; i++) {
      var v0 = contrast(sampleField(px[i], py[i]), SCENE.cColour);
      fieldV[i] = v0;

      var small = (smallHi - rad[i]) * invSmall;
      if (small < 0) small = 0; else if (small > 1) small = 1;

      var vg = v0 > 0.62 ? 0.03 : 1;
      var sc;
      if (waveOn) {

        var tex = act[i] / (act[i] + mAct + 1e-12);
        sc = (0.70 + 0.30 * small) * (0.85 + 0.15 * tex) * (v0 > 0.62 ? 0.82 : 1);
      } else {

        sc = vg * small * (act[i] / mAct);
      }

      if (waveOn && sc > 0) {

        var dx = Math.abs(px[i] - wcx) - whw, dy = Math.abs(py[i] - wcy) - whh;
        if (dx < 0) dx = 0;
        if (dy < 0) dy = 0;
        var dd = Math.sqrt(dx * dx + dy * dy);
        var t = (wr + ws - dd) / (2 * ws);
        if (t < 0) t = 0; else if (t > 1) t = 1;
        t = t * t * (3 - 2 * t);
        sc *= wb + (1 - wb) * t;
      }

      if (nearOn && sc > 0) {

        var ex = Math.abs(px[i] - fcx) - fhw, ey = Math.abs(py[i] - fcy) - fhh;
        if (ex < 0) ex = 0;
        if (ey < 0) ey = 0;
        var ed = Math.sqrt(ex * ex + ey * ey) / ncm;
        var prof = 0;
        if (ed < 1) { var nf = 1 - ed; prof = nf * nf * (3 - 2 * nf); }
        sc *= RED.outK + (1 - RED.outK) * prof;
      }
      score[i] = sc;
    }

    var want = (SCENE.redFrac0 + (SCENE.redFrac1 - SCENE.redFrac0) * grow) * SCENE.redBias;
    if (want < 0) want = 0; else if (want > 1) want = 1;
    var wantLine = want * SCENE.redLine;
    if (wantLine > 1) wantLine = 1;

    var stride = Math.max(1, (N / 4096) | 0);
    var quantOf = function (arr, share) {
      if (!arr.length) return Infinity;

      if (share >= 1) return 0;
      var qi = Math.floor((1 - share) * (arr.length - 1));
      if (qi < 0) qi = 0; else if (qi >= arr.length) qi = arr.length - 1;
      var t = arr[qi];

      return t > 0 ? t : 0;
    };
    var asc = function (a, b) { return a - b; };
    var samp = [];
    for (i = 0; i < N; i += stride) samp.push(score[i]);
    samp.sort(asc);

    var select = function (want, on, timer) {
      var k, off = quantOf(samp, want) * SCENE.redFall, held = 0;
      for (k = 0; k < N; k++) {
        if (timer[k] > 0) timer[k] -= playDt;
        if (on[k] && (timer[k] > 0 || score[k] >= off)) held++;
        else on[k] = 0;
      }
      var quota = Math.round(want * N) - held;
      if (quota <= 0) return;
      var free = [];
      for (k = 0; k < N; k += stride) if (!on[k]) free.push(score[k]);
      free.sort(asc);
      var t = quantOf(free, quota / Math.max(1, N - held));
      for (k = 0; k < N; k++) {
        if (!on[k] && score[k] > t) { on[k] = 1; timer[k] = SCENE.redHold; }
      }
    };
    select(want, redOn, redTimer);
    select(wantLine, lineOn, lineTimer);

    DBG.want = want;
    if (DBG.on && RED.focus) {
      var rn = 0, nn = 0, rf = 0, nf2 = 0, rc = RED.nearCm || 1;
      for (i = 0; i < N; i++) {
        var qx = Math.abs(px[i] - RED.fx) - RED.fhw;
        var qy = Math.abs(py[i] - RED.fy) - RED.fhh;
        if (qx < 0) qx = 0;
        if (qy < 0) qy = 0;
        if (Math.sqrt(qx * qx + qy * qy) <= rc) { nn++; if (redOn[i]) rn++; }
        else { nf2++; if (redOn[i]) rf++; }
      }
      DBG.near = nn ? rn / nn : 0;
      DBG.far = nf2 ? rf / nf2 : 0;
    }

    redNow = 0;
    for (i = 0; i < N; i++) {
      var v = fieldV[i];

      if (whiteOn[i]) {
        if (v < whiteFill - SCENE.whiteHyst) whiteOn[i] = 0;
      } else if (v > whiteFill + SCENE.whiteHyst) {
        whiteOn[i] = 1;
      }

      if (redOn[i]) redNow++;
      gpuCol[i * 2]     = redOn[i] ? 2 : (whiteOn[i] ? 1 : 0);
      gpuCol[i * 2 + 1] = (redOn[i] || lineOn[i]) ? 2 : 0;
    }
    redNow /= N;
  }

  function shadeRadius() {
    var span = SCENE.maxR - SCENE.minR;
    var p = SCENE.rSkew;

    var slack = SCENE.growRoom, limited = CFG.relax > 0;

    var vsum = 0, q;
    for (q = 0; q < N; q++) {
      radV[q] = contrast(sampleField(px[q], py[q]), SCENE.cRadius);
      vsum += radV[q];
    }
    var vm = vsum / N;
    if (vRef < 0) vRef = vm;
    var shift = SCENE.vLock * (vRef - vm);

    for (var i = 0; i < N; i++) {
      var v = radV[i] + shift;
      if (v < 0) v = 0; else if (v > 1) v = 1;
      var target = SCENE.minR + span * Math.pow(v, p);
      if (limited && target > rad[i]) {
        var free = room[i] - rad[i];
        if (free < 0) free = 0;

        var cap = rad[i] + free * slack + SCENE.growPush;
        if (target > cap) target = cap;
      } else if (limited && SCENE.shrinkMax > 0) {
        var floor = rad[i] - SCENE.shrinkMax;
        if (target < floor) target = floor;
      }
      rad[i] = target;
    }
  }

  var canvas = document.createElement("canvas");
  host.insertBefore(canvas, host.firstChild);

  var gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: true,
    depth: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!gl) {
    var fb = document.getElementById("fallback");
    if (fb) fb.style.display = "grid";
    return;
  }

  var VERT = `#version 300 es
  layout(location = 0) in vec2 aPos;    // cm
  layout(location = 1) in float aR;     // cm
  layout(location = 2) in vec2 aCol;    // x = fill code, y = outline code

  uniform vec2  uHalf;      // cm
  uniform float uPxPerCm;
  uniform float uDpr;
  uniform float uRingPx;
  uniform vec3  uInk;
  uniform vec3  uBg;
  uniform vec3  uAccent;
  uniform float uZoom;
  uniform float uHollow;

  out vec3  vFill;
  out vec3  vLine;
  out float vRingFrac;
  out float vAlpha;
  out float vFillA;

  vec3 pick(float code) {
    if (code < 0.5) return uInk;
    if (code < 1.5) return uBg;
    return uAccent;
  }

  void main() {
    vFill = pick(aCol.x);
    vLine = pick(aCol.y);
    vFillA = (aCol.x > 0.5 && aCol.x < 1.5) ? 1.0 - uHollow : 1.0;

    float sizePx = aR * 2.0 * uPxPerCm * uDpr * uZoom;

    // Sub-pixel guard: a disc smaller than a device pixel is drawn at one
    // pixel and faded, rather than aliasing in and out between frames.
    vAlpha = 1.0;
    if (sizePx < 1.0) { vAlpha = max(sizePx * sizePx, 0.05); sizePx = 1.0; }
    gl_PointSize = sizePx;

    // Outline is a constant pixel width, so it occupies a larger fraction of a
    // small disc than a large one.
    vRingFrac = clamp(uRingPx * uDpr / sizePx, 0.04, 0.42);

    gl_Position = vec4(aPos * uZoom / uHalf, 0.0, 1.0);
  }`;

  var FRAG = `#version 300 es
  precision mediump float;

  in vec3  vFill;
  in vec3  vLine;
  in float vRingFrac;
  in float vAlpha;
  in float vFillA;

  out vec4 outColor;

  void main() {
    vec2  c    = gl_PointCoord - vec2(0.5);
    float dist = length(c);
    float r    = 0.47;

    float outer = 1.0 - smoothstep(r - 0.03, r + 0.01, dist);
    if (outer < 0.004) discard;

    // Step interpolation in the gradients means no blend between fill and
    // outline either — just an antialiased boundary between two flat colours.
    float inner = 1.0 - smoothstep(r - vRingFrac - 0.02, r - vRingFrac + 0.02, dist);
    vec3 col = mix(vLine, vFill, inner);

    outColor = vec4(col, outer * vAlpha * mix(1.0, vFillA, inner));
  }`;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s), src);
    }
    return s;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  var U = {};
  ["uHalf","uPxPerCm","uDpr","uRingPx","uInk","uBg","uAccent","uZoom","uHollow"]
  .forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  function buffer(loc, data, size) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  }

  var bufPos = buffer(0, gpuPos, 2);
  var bufR   = buffer(1, gpuR, 1);
  var bufCol = buffer(2, gpuCol, 2);

  function reallocGpu() {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, gpuPos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufR);
    gl.bufferData(gl.ARRAY_BUFFER, gpuR, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, gpuCol, gl.DYNAMIC_DRAW);
  }

  function setCount(n) {
    allocate(Math.max(100, n | 0));
    reallocGpu();
  }

  gl.enable(gl.BLEND);

  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
                       gl.ONE,       gl.ONE_MINUS_SRC_ALPHA);

  (function adoptFonts() {
    var map = [["fontSans", "--brg-sans"], ["fontSerif", "--brg-serif"]], i;
    for (i = 0; i < map.length; i++) {
      var raw = d[map[i][0]];
      if (!raw) continue;
      var attr = map[i][0] === "fontSans" ? "data-font-sans" : "data-font-serif";
      var got = cssVal(String(raw), "", "font-family");
      if (!got || /var\(|from\(/i.test(got)) {
        warn(attr + '="' + raw + '" did not resolve to a font family.');
        continue;
      }
      host.style.setProperty(map[i][1], got);
    }
  })();

  var COL = resolveColors();
  gl.uniform3fv(U.uInk, COL.ink);
  gl.uniform3fv(U.uBg, COL.bg);
  gl.uniform3fv(U.uAccent, COL.accent);
  gl.uniform2f(U.uHalf, FRAME_W / 2, FRAME_H / 2);
  var ringPx = num(d.ringPx, 1.4);
  gl.uniform1f(U.uRingPx, ringPx);
  gl.uniform1f(U.uZoom, 1);
  gl.uniform1f(U.uHollow, d.hollow === "1" ? 1 : 0);

  var PAINT = d.paint === "1";
  function setClear(c) {
    if (PAINT) gl.clearColor(c[0], c[1], c[2], 1);
    else gl.clearColor(0, 0, 0, 0);
  }
  setClear(COL.bg);

  var DPR = 1;
  function resize() {
    DPR = Math.min(CFG.maxDpr, window.devicePixelRatio || 1);
    var w = host.clientWidth, h = host.clientHeight;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);

    reframe(w, h);
    gl.uniform2f(U.uHalf, FRAME_W / 2, FRAME_H / 2);
    rescaleCopy(w);

    var sx = canvas.width / FRAME_W;
    var sy = canvas.height / FRAME_H;
    gl.uniform1f(U.uPxPerCm, Math.sqrt(sx * sy));
    gl.uniform1f(U.uDpr, 1);
  }
  resize();

  var TXT = {
    bloatEm:  num(d.textBloatEm, 0.30),
    bloatMin: num(d.textBloatMin, 1.6),
    bloat:    num(d.textBloat, -1),
    pad:      num(d.textPad, 1.1),
    radFloor: num(d.textRadFloor, 0.6),
    jitter:   num(d.textJitter, 2.2),
    seal:     num(d.textSeal, -1),
    slack:    num(d.textSlack, 0.35),
    damp:     num(d.textDamp, 0.10),
    rise:     num(d.textRise, 1.8),
    rushK:    num(d.textRush, 1.2),
    strength: num(d.textStrength, 520),
    wall:     num(d.textWall, 2.2),
    halo:     num(d.textHalo, 7),
    haloK:    num(d.textHaloPush, 0.15),
    pull:     num(d.textPull, 0.85),
    reach:    num(d.textReach, 14),
    tail:     num(d.textRelTail, 1.1),
    proj:     num(d.textProj, 1),
    settle:   Math.max(0, num(d.textSettle, 0) | 0),
    hold:     num(d.textHold, 4.5),
    fade:     num(d.textFade, 2.2),
    tracking: num(d.textTracking, -0.015),
    lineH:    num(d.textLine, 1.06),
    maxW:     num(d.textMaxW, 0.86),
    weight:   cssVal(d.textWeight || "600", "600", "font-weight"),
    family:   cssVal(d.textFamily || 'Geist, "Helvetica Neue", "Segoe UI", system-ui, sans-serif',
                     'Geist, "Helvetica Neue", "Segoe UI", system-ui, sans-serif', "font-family"),
    color:    normColor(cssVal(d.textColor || "", "", "color")) || CFG.ink,
    raster:   0.5,
    on:       d.text !== "0",
    items:    [],
    ready:    false,
    sx: 1, sy: 1, sg: 1, W: 0, H: 0,
  };

  function sealCmFor(item) {
    if (TXT.seal >= 0) return TXT.seal;
    return TXT.pad + SCENE.maxR + TXT.jitter * 0.5;
  }

  function bloatCmFor(item) {
    if (TXT.bloat >= 0) return TXT.bloat;
    var em = item.sizeCm * (item.fit || 1);
    var v = TXT.bloatEm * em;
    var floor = Math.max(TXT.bloatMin, TXT.pad + SCENE.minR);
    return v > floor ? v : floor;
  }

  (function injectBaseCss() {
    var ID = "brg-base-css";
    if (document.getElementById(ID)) return;
    var mount = document.head || document.documentElement;
    if (!mount || !mount.appendChild) return;
    var st = document.createElement("style");
    st.id = ID;
    st.textContent =
      "[data-brg-copy]{display:none !important}" +
      "[data-particles] > canvas{display:block;width:100%;height:100%}" +
      "[data-particles] .brg-textlayer{position:absolute;inset:0;pointer-events:none;" +
      "display:grid;place-items:center;overflow:hidden;" +
      "transform-origin:50% 50%;will-change:transform}" +
      "[data-particles] .brg-text{grid-area:1/1;width:100%;height:auto;max-width:none;" +
      "opacity:0;will-change:opacity,transform}";
    mount.appendChild(st);
  })();

  (function hideCopyBlocks() {
    var all = document.querySelectorAll("[data-brg-copy]"), i;
    for (i = 0; i < all.length; i++) {
      if (all[i].tagName === "SCRIPT") continue;
      try { all[i].style.setProperty("display", "none", "important"); } catch (e) {}
    }
  })();

  var textLayer = document.createElement("div");
  textLayer.className = "brg-textlayer";
  host.appendChild(textLayer);

  function warn(msg) {
    try { if (window.console && console.warn) console.warn("[brg] " + msg); } catch (e) {}
  }

  function cssVal(v, fallback, prop) {
    if (typeof v !== "string") return fallback;
    var t = v.trim();
    if (/^--[\w-]+$/.test(t)) t = "var(" + t + ")";

    var m = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/.exec(t);
    if (m) {
      var got = "";
      try { got = getComputedStyle(host).getPropertyValue(m[1]).trim(); } catch (e) {}
      return got || (m[2] == null ? "" : m[2].trim()) || fallback;
    }

    var f = /^from\(\s*([\s\S]+?)\s*(?:,\s*([-\w]+)\s*)?\)$/.exec(t);
    if (f) {
      var el = null;
      try { el = document.querySelector(f[1]); } catch (e) {}
      if (!el) return fallback;
      var out = "";
      try { out = getComputedStyle(el).getPropertyValue(f[2] || prop || "color").trim(); } catch (e) {}
      return out || fallback;
    }

    if (/^var\(|^from\(/i.test(t)) {
      warn("could not read " + t + " -- check for a missing )");
      return fallback;
    }
    return v;
  }

  function parseCopy(list) {
    var out = [];
    if (!list || !list.length) return out;
    for (var i = 0; i < list.length; i++) {
      var o = list[i] || {};
      var t = String(o.text == null ? "" : o.text).replace(/\\n/g, "\n");
      if (o.case === "upper") t = t.toUpperCase();
      else if (o.case === "lower") t = t.toLowerCase();
      if (!t) continue;
      out.push({
        text: t,

        sizePx: num(o.sizePx, 120),
        minPx:  num(o.minPx, 0),
        maxPx:  num(o.maxPx, 1e9),
        refPx:  num(o.refPx, 1600),
        family: (o.font === "serif" ? "var(--brg-serif)"
              : o.font === "sans"  ? "var(--brg-sans)"
              : o.family) || TXT.family,
        rawWeight: String(o.weight == null ? TXT.weight : o.weight),
        weight: String(o.weight == null ? TXT.weight : o.weight),
        lineH:  num(o.line, TXT.lineH),
        tracking: num(o.tracking, TXT.tracking),
        color:  o.color || TXT.color,
        colorSet: o.color != null,
        ph: 0, tgt: 0, _in: 0, _out: 1,
        sizeCm: 0, fam: "", col: "",
        fit: 1, drawPx: 0, drawCw: 0,
        w: 0, prevW: 0, rel: 0, hold: 0, grab: 0, sdf: null, el: null, live: false,
        offY: 0,
        bx0: 0, bx1: 0, by0: 0, by1: 0,
        rx0: 0, rx1: 0, ry0: 0, ry1: 0 });
    }
    return out;
  }

  function readCopy() {
    var el = document.getElementById("brg-copy") || document.querySelector("[data-brg-copy]");
    if (!el) return [];
    try { return JSON.parse(el.textContent || el.text || "[]"); }
    catch (e) { console.error("#brg-copy is not valid JSON — no copy will render.", e); return []; }
  }

  var fitCanvas = null;
  function specPx(item, cw) {
    var px = item.sizePx * (cw / item.refPx);
    if (px < item.minPx) px = item.minPx;
    if (px > item.maxPx) px = item.maxPx;
    return px;
  }

  function measureFit(item, px, cw) {
    if (!fitCanvas) {
      fitCanvas = document.createElement("canvas");
      fitCanvas.width = 1; fitCanvas.height = 1;
    }
    if (!(px > 0)) return 1;
    var ctx = fitCanvas.getContext("2d");
    ctx.font = item.weight + " " + px.toFixed(2) + "px " + (item.fam || TXT.family);
    if ("letterSpacing" in ctx) ctx.letterSpacing = (item.tracking * px).toFixed(2) + "px";
    var lines = item.text.split("\n"), widest = 0;
    for (var i = 0; i < lines.length; i++) {
      var m = ctx.measureText(lines[i]);
      var wl = (m && isFinite(m.width)) ? m.width : 0;
      if (wl > widest) widest = wl;
    }
    var limit = cw * TXT.maxW;
    return (widest > limit && widest > 0) ? limit / widest : 1;
  }

  function drawnPxFor(item, cw) {
    var px = specPx(item, cw);
    return px * measureFit(item, px, cw);
  }

  function adoptRole(item) {
    var stack = String(item.fam || "");
    var token = /sans-serif\s*$/i.test(stack) ? (d.fontSans ? "--brg-sans" : "")
              : /serif\s*$/i.test(stack)      ? (d.fontSerif ? "--brg-serif" : "")
              : "";
    if (!token) return;
    var asked = firstFamily(stack);
    if (familyAvailable(asked, item.weight)) return;
    var sub2 = cssVal("var(" + token + ")", "", "font-family");
    if (!sub2 || sub2 === stack) return;
    if (!familyAvailable(firstFamily(sub2), item.weight)) return;
    if (!item.roleWarned) {
      item.roleWarned = 1;
      warn('"' + item.text.split("\n")[0] + '" names ' + asked +
           ', which this page cannot render, so it is being drawn in ' +
           (token === "--brg-sans" ? "data-font-sans" : "data-font-serif") +
           ' instead. Add "font": "' + (token === "--brg-sans" ? "sans" : "serif") +
           '" to that phrase in the copy embed to say so outright.');
    }
    item.fam = sub2;
  }

  function fitPhrase(item, cw) {
    var px = specPx(item, cw);
    item.sizeCm = TXT.sg > 0 ? px / TXT.sg : 0;
    item.fam = cssVal(item.family, TXT.family, "font-family");
    item.col = normColor(cssVal(item.color, "", "color")) || TXT.color || CFG.ink;
    item.weight = String(cssVal(item.rawWeight, TXT.weight, "font-weight"));
    adoptRole(item);
    item.fit = measureFit(item, px, cw);
    item.drawPx = px * item.fit;
    item.drawCw = cw;
  }

  function rescaleCopy(cw) {
    if (!TXT || !TXT.items || !(cw > 0)) return;
    for (var i = 0; i < TXT.items.length; i++) {
      var it = TXT.items[i];
      if (!it.el || !(it.drawPx > 0) || !(it.drawCw > 0)) continue;
      var want = drawnPxFor(it, cw);
      it.el.style.width = (it.drawCw * want / it.drawPx).toFixed(2) + "px";
    }
  }

  function drawPhrase(ctx, item, w, h, scale, color) {
    var fontPx = item.sizeCm * TXT.sg * scale * (item.fit || 1);
    ctx.clearRect(0, 0, w, h);
    ctx.font = item.weight + " " + fontPx.toFixed(2) + "px " + (item.fam || TXT.family);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;

    if ("letterSpacing" in ctx) ctx.letterSpacing = (item.tracking * fontPx).toFixed(2) + "px";
    var lines = item.text.split("\n");
    var lh = fontPx * item.lineH;
    var y0 = h / 2 - (lines.length - 1) * lh / 2;
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], w / 2, y0 + i * lh);
  }

  function edt1d(f, off, stride, n, dOut, v, z) {
    var k = 0, q, sep;
    v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (q = 1; q < n; q++) {
      var fq = f[off + q * stride];
      for (;;) {
        var vk = v[k];
        sep = ((fq + q * q) - (f[off + vk * stride] + vk * vk)) / (2 * q - 2 * vk);
        if (sep > z[k]) break;
        k--;
      }
      k++; v[k] = q; z[k] = sep; z[k + 1] = 1e20;
    }
    k = 0;
    for (q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      var vb = v[k];
      dOut[q] = (q - vb) * (q - vb) + f[off + vb * stride];
    }
    for (q = 0; q < n; q++) f[off + q * stride] = dOut[q];
  }

  function edt2d(f, w, h) {
    var n = w > h ? w : h;
    var dOut = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
    var y, x;
    for (y = 0; y < h; y++) edt1d(f, y * w, 1, w, dOut, v, z);
    for (x = 0; x < w; x++) edt1d(f, x, w, h, dOut, v, z);
  }

  function bakeSdf(item) {
    var w = TXT.W, h = TXT.H, n = w * h;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    drawPhrase(ctx, item, w, h, TXT.raster, "#000");
    var data = ctx.getImageData(0, 0, w, h).data;

    var INF = 1e20, k;
    var mask = new Uint8Array(n);
    for (k = 0; k < n; k++) mask[k] = data[k * 4 + 3] > 127 ? 1 : 0;

    var bloatPx = bloatCmFor(item) * TXT.sg * TXT.raster;
    if (bloatPx > 0.5) {
      var s2 = bloatPx * bloatPx;
      var f1 = new Float32Array(n);
      for (k = 0; k < n; k++) f1[k] = mask[k] ? 0 : INF;
      edt2d(f1, w, h);
      for (k = 0; k < n; k++) if (f1[k] <= s2) mask[k] = 1;

      var seen = new Uint8Array(n);
      var stack = new Int32Array(n);
      var sp = 0, x, y;
      for (x = 0; x < w; x++) {
        if (!mask[x]) { seen[x] = 1; stack[sp++] = x; }
        var b = (h - 1) * w + x;
        if (!mask[b]) { seen[b] = 1; stack[sp++] = b; }
      }
      for (y = 0; y < h; y++) {
        var l = y * w, r = l + w - 1;
        if (!mask[l] && !seen[l]) { seen[l] = 1; stack[sp++] = l; }
        if (!mask[r] && !seen[r]) { seen[r] = 1; stack[sp++] = r; }
      }
      while (sp > 0) {
        var c = stack[--sp], cx = c % w, cy = (c - cx) / w;
        if (cx > 0)     { var a1 = c - 1; if (!mask[a1] && !seen[a1]) { seen[a1] = 1; stack[sp++] = a1; } }
        if (cx < w - 1) { var a2 = c + 1; if (!mask[a2] && !seen[a2]) { seen[a2] = 1; stack[sp++] = a2; } }
        if (cy > 0)     { var a3 = c - w; if (!mask[a3] && !seen[a3]) { seen[a3] = 1; stack[sp++] = a3; } }
        if (cy < h - 1) { var a4 = c + w; if (!mask[a4] && !seen[a4]) { seen[a4] = 1; stack[sp++] = a4; } }
      }
      for (k = 0; k < n; k++) if (!mask[k] && !seen[k]) mask[k] = 1;
    }

    var sealPx = sealCmFor(item) * TXT.sg * TXT.raster;
    if (sealPx > 0.5) {
      var q2 = sealPx * sealPx, kq;
      var fs = new Float32Array(n), m2 = new Uint8Array(n);
      for (kq = 0; kq < n; kq++) fs[kq] = mask[kq] ? 0 : INF;
      edt2d(fs, w, h);
      for (kq = 0; kq < n; kq++) m2[kq] = fs[kq] <= q2 ? 1 : 0;
      for (kq = 0; kq < n; kq++) fs[kq] = m2[kq] ? INF : 0;
      edt2d(fs, w, h);
      for (kq = 0; kq < n; kq++) if (fs[kq] > q2) mask[kq] = 1;
    }

    var fo = new Float32Array(n), fi = new Float32Array(n);

    var gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
    for (k = 0; k < n; k++) {
      var inside = mask[k] === 1;
      fo[k] = inside ? 0 : INF;
      fi[k] = inside ? INF : 0;
      if (inside) {
        var qx = k % w, qy = (k - qx) / w;
        if (qx < gx0) gx0 = qx; if (qx > gx1) gx1 = qx;
        if (qy < gy0) gy0 = qy; if (qy > gy1) gy1 = qy;
      }
    }

    item.live = gx1 >= gx0;
    if (item.live) {

      var R = TXT.raster;
      var cx0 = (gx0 / R) / TXT.sx - FRAME_W / 2, cx1 = (gx1 / R) / TXT.sx - FRAME_W / 2;
      var cy0 = FRAME_H / 2 - (gy1 / R) / TXT.sy, cy1 = FRAME_H / 2 - (gy0 / R) / TXT.sy;

      item.cx0 = cx0; item.cx1 = cx1; item.cy0 = cy0; item.cy1 = cy1;
      var push = TXT.pad + SCENE.maxR + TXT.halo + TXT.jitter + 0.5;
      item.bx0 = cx0 - push; item.bx1 = cx1 + push;
      item.by0 = cy0 - push; item.by1 = cy1 + push;
      var rel = push + TXT.reach;
      item.rx0 = cx0 - rel; item.rx1 = cx1 + rel;
      item.ry0 = cy0 - rel; item.ry1 = cy1 + rel;
    }
    edt2d(fo, w, h);
    edt2d(fi, w, h);

    var sdf = new Float32Array(n), inv = 1 / TXT.raster;
    for (k = 0; k < n; k++) sdf[k] = (Math.sqrt(fo[k]) - Math.sqrt(fi[k])) * inv;
    item.sdf = sdf;
  }

  function sdfAt(sdf, gx, gy) {
    var W = TXT.W, H = TXT.H;
    if (gx < 0) gx = 0; else if (gx > W - 1.001) gx = W - 1.001;
    if (gy < 0) gy = 0; else if (gy > H - 1.001) gy = H - 1.001;
    var ix = gx | 0, iy = gy | 0;
    var tx = gx - ix, ty = gy - iy;
    var a = iy * W + ix, b = a + W;
    return (sdf[a] * (1 - tx) + sdf[a + 1] * tx) * (1 - ty) +
           (sdf[b] * (1 - tx) + sdf[b + 1] * tx) * ty;
  }

  var probeD = 0, probeX = 0, probeY = 0;
  function probe(sdf, x, y) {
    var R = TXT.raster;
    var gx = (x + FRAME_W / 2) * TXT.sx * R;
    var gy = (FRAME_H / 2 - y) * TXT.sy * R;
    probeD = sdfAt(sdf, gx, gy);

    var sp = 1, ux = 0, uy = 0, m = 0;
    for (var a = 0; a < 2; a++) {
      var dgx = sdfAt(sdf, gx + sp, gy) - sdfAt(sdf, gx - sp, gy);
      var dgy = sdfAt(sdf, gx, gy + sp) - sdfAt(sdf, gx, gy - sp);
      ux = dgx / TXT.sx; uy = -dgy / TXT.sy;
      m = Math.sqrt(ux * ux + uy * uy);
      if (m > 1e-9) { probeX = ux / m; probeY = uy / m; return true; }
      sp = 4;
    }
    probeX = 0; probeY = 0;
    return false;
  }

  function clearCm(i) {
    var r = rad[i];
    if (r < TXT.radFloor) r = TXT.radFloor;
    var v = TXT.pad + r + TXT.jitter * tjit[i];
    return v > 0 ? v : 0;
  }

  function textForce(dt) {
    if (!TXT.ready) return;
    var items = TXT.items, sg = TXT.sg;
    for (var t = 0; t < items.length; t++) {
      var it = items[t];
      if (!it.sdf || !it.live || (it.w <= 0.002 && it.hold <= 0.002)) continue;
      var sdf = it.sdf, wgt = it.w, rel = it.hold;
      var releasing = rel > 0.002;
      var bx0 = releasing ? it.rx0 : it.bx0, bx1 = releasing ? it.rx1 : it.bx1;
      var by0 = releasing ? it.ry0 : it.by0, by1 = releasing ? it.ry1 : it.by1;
      var reach = releasing ? TXT.reach * sg : 0;
      var halo = TXT.halo * sg;
      var boost = 1 + TXT.rise * (it.grab || 0);

      var oy = it.offY;
      for (var i = 0; i < N; i++) {
        var x = px[i], y = py[i] - oy;
        if (x < bx0 || x > bx1 || y < by0 || y > by1) continue;
        var need = clearCm(i) * sg;
        var far = need + halo + reach;
        if (!probe(sdf, x, y)) continue;
        if (probeD >= far) continue;

        var mag = 0;
        if (probeD < need) {

          var k = (need - probeD) / need;
          if (k > 1) k = 1;
          mag += TXT.strength * (k + TXT.wall * k * k * k) * wgt * boost;
        } else if (halo > 0 && probeD < need + halo) {

          var hk = 1 - (probeD - need) / halo;
          hk = hk * hk * (3 - 2 * hk);
          mag += TXT.strength * TXT.haloK * hk * wgt * boost;
        }
        if (releasing) {

          var kp = (far - probeD) / far;
          if (kp > 1) kp = 1;
          mag -= TXT.strength * TXT.pull * kp * rel;
        }
        if (mag === 0) continue;
        vx[i] += probeX * mag * dt;
        vy[i] += probeY * mag * dt;
      }
    }
  }

  function textProject() {
    if (!TXT.ready || TXT.proj <= 0) return;
    var items = TXT.items, invSg = 1 / TXT.sg, sg = TXT.sg;
    for (var t = 0; t < items.length; t++) {
      var it = items[t];
      if (!it.sdf || !it.live || it.w <= 0.002) continue;
      var sdf = it.sdf, wgt = it.w;
      var bx0 = it.bx0, bx1 = it.bx1, by0 = it.by0, by1 = it.by1;
      var oy = it.offY;
      for (var i = 0; i < N; i++) {
        var x = px[i], y = py[i] - oy;
        if (x < bx0 || x > bx1 || y < by0 || y > by1) continue;
        var need = clearCm(i) * sg;
        if (!probe(sdf, x, y)) continue;
        if (probeD >= need - TXT.slack * sg) continue;

        var f = (probeD < 0 && wgt > 0.05) ? 1 : TXT.proj * wgt;
        var move = (need - probeD) * invSg * f;
        px[i] += probeX * move;
        py[i] += probeY * move;

        var vn = vx[i] * probeX + vy[i] * probeY;
        if (vn < 0) { vx[i] -= probeX * vn * wgt; vy[i] -= probeY * vn * wgt; }
        if (TXT.damp > 0) {
          var dk = 1 - TXT.damp * wgt;
          vx[i] *= dk; vy[i] *= dk;
        }
      }
    }
  }

  function nearestSticky(el) {
    var n = el && el.parentElement;
    while (n && n !== document.body && n !== document.documentElement) {
      var pos = "";
      try { pos = getComputedStyle(n).position; } catch (e) {}
      if (pos === "sticky") return n;
      n = n.parentElement;
    }
    return null;
  }

  function tallAncestor(el) {
    var n = el && el.parentElement, vh = window.innerHeight || 800;
    while (n && n !== document.body && n !== document.documentElement) {
      if (n.offsetHeight > vh * 1.25) return n;
      n = n.parentElement;
    }
    return null;
  }

  var SCR = {
    on:     d.scroll !== "0",
    rail:   null,
    sticky: null,
    panel:  document.querySelector("[data-brg-panel]"),
    mover:  null,
    p: 0,
    lock: null,
  };

  SCR.sticky = document.getElementById("brg-sticky")
            || document.querySelector("[data-brg-sticky]")
            || nearestSticky(host);
  SCR.rail = document.getElementById("brg-scroll")
          || document.querySelector("[data-brg-scroll]")
          || (SCR.sticky && SCR.sticky.parentElement)
          || tallAncestor(host);

  if (SCR.panel) SCR.mover = SCR.panel.parentElement || SCR.panel;

  function scrollP() {
    if (SCR.lock != null) return SCR.lock;
    if (!SCR.rail) return 0;
    var span = SCR.rail.offsetHeight - window.innerHeight;
    if (span <= 0) return 0;
    var v = -SCR.rail.getBoundingClientRect().top / span;
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  var TWEEN = { dur: num(d.textTween, 0.55), out: num(d.textTweenOut, 0.95) };

  var CAM = { z: 1, max: num(d.zoom, 1.42) };

  var HYST = num(d.textHyst, 0.02);

  var BEAT = {
    outA: [num(d.beatOutA0, 0.20), num(d.beatOutA1, 0.30)],
    red:  [num(d.beatRed0,  0.24), num(d.beatRed1,  0.46)],
    inB:  [num(d.beatInB0,  0.28), num(d.beatInB1,  0.38)],
    outB: [num(d.beatOutB0, 0.85), num(d.beatOutB1, 0.91)],
    zoom: [num(d.beatZoom0, 0.85), num(d.beatZoom1, 1.00)],
    exit: [num(d.beatExit0, 0.85), num(d.beatExit1, 1.00)],
  };

  function above(cur, p, mark) {
    if (p > mark + HYST) return 1;
    if (p < mark - HYST) return 0;
    return cur;
  }
  function below(cur, p, mark) {
    if (p < mark - HYST) return 1;
    if (p > mark + HYST) return 0;
    return cur;
  }

  function ramp(p, a, b) {
    if (b <= a) return p >= b ? 1 : 0;
    var t = (p - a) / (b - a);
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  var RED = {
    on:    false,
    r:     0,
    soft:  num(d.redWaveSoft, 16),
    base:  num(d.redWaveBase, 0.06),
    span:  num(d.redWaveSpan, 1.75),

    bias1: num(d.redBiasEnd, 13),
    bias0: 0,

    skew1: num(d.redSkewEnd, 6.2),
    skew0: 0,

    nearCm: num(d.redNearCm, 46),
    outK:   num(d.redOutside, 0.06),

    settle: num(d.redSettle, 0.46),

    fx: 0, fy: 0, fhw: 0, fhh: 0, focus: false,
    cx: 0, cy: 0, hw: 0, hh: 0, live: false,
  };
  RED.bias0 = SCENE.redBias;
  RED.skew0 = SCENE.rSkew;

  function redFromRect(it) {
    if (!it || !it.live) { RED.live = false; return; }
    RED.cx = (it.cx0 + it.cx1) * 0.5;
    RED.cy = (it.cy0 + it.cy1) * 0.5;
    RED.hw = (it.cx1 - it.cx0) * 0.5;
    RED.hh = (it.cy1 - it.cy0) * 0.5;
    RED.live = true;
  }

  function redFocus(items) {
    if (!RED.live) return;
    var best = null, bw = 0.05;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.live && it.w > bw) { bw = it.w; best = it; }
    }
    RED.fx = RED.cx;
    RED.fhw = RED.hw;
    RED.fhh = RED.hh;
    var fy = RED.cy + (best ? best.offY : 0);
    var lim = FRAME_H * 0.5;
    RED.fy = fy > lim ? lim : (fy < -lim ? -lim : fy);
    RED.focus = true;
  }

  function scrollTimeline() {
    var items = TXT.items, n = items.length, i;
    var p = SCR.p;

    var a = items[0], b = items[1];
    if (a) {
      a.tgt = below(a.tgt, p, BEAT.outA[0]);
      a.offY = 0;
    }
    if (b) {
      b.offY = 0;
      b._in  = above(b._in,  p, BEAT.inB[0]);
      b._out = below(b._out, p, BEAT.outB[0]);
      b.tgt = (b._in && b._out) ? 1 : 0;
    }
    for (i = 2; i < n; i++) { items[i].tgt = 0; items[i].offY = 0; }

    var stepUp = TWEEN.dur > 0 ? playDt / TWEEN.dur : 1;
    var stepDn = TWEEN.out > 0 ? playDt / TWEEN.out : 1;
    for (i = 0; i < n; i++) {
      var itp = items[i];
      if (itp.ph < itp.tgt) itp.ph = Math.min(itp.tgt, itp.ph + stepUp);
      else if (itp.ph > itp.tgt) itp.ph = Math.max(itp.tgt, itp.ph - stepDn);
      itp.w = itp.ph * itp.ph * (3 - 2 * itp.ph);
    }

    if (a && a.live && !RED.live) redFromRect(a);
    redFocus(items);
    var rp = ramp(p, BEAT.red[0], BEAT.red[1]);
    RED.on = rp > 0 && RED.live;
    RED.r = rp * FRAME_W * RED.span;
    var ease = 1 - RED.settle * ramp(p, BEAT.inB[0], BEAT.inB[1]);
    SCENE.redBias = (RED.bias0 + (RED.bias1 - RED.bias0) * rp) * ease;
    SCENE.rSkew   = RED.skew0 + (RED.skew1 - RED.skew0) * rp;

    var relDecay = TXT.tail > 0 ? Math.exp(-playDt / TXT.tail) : 0;
    for (i = 0; i < n; i++) {
      var itm = items[i];
      itm.rel = (itm.w < itm.prevW) ? 4 * itm.w * (1 - itm.w) : 0;
      itm.grab = (itm.w > itm.prevW) ? 4 * itm.w * (1 - itm.w) : 0;
      itm.hold = itm.grab > 0 ? 0 : Math.max(itm.rel, itm.hold * relDecay);
      itm.prevW = itm.w;
      if (itm.el) {
        itm.el.style.opacity = itm.w;
        itm.el.style.transform = itm.offY
          ? "translateY(" + (-itm.offY * TXT.sy).toFixed(1) + "px)" : "";
      }
    }

    CAM.z = 1 + (CAM.max - 1) * ramp(p, BEAT.zoom[0], BEAT.zoom[1]);

    var pe = ramp(p, BEAT.exit[0], BEAT.exit[1]);
    var py2 = ((1 - pe) * 110).toFixed(2) + "vh";
    if (SCR.sticky) {
      SCR.sticky.style.setProperty("--brg-panel-y", py2);
      SCR.sticky.style.setProperty("--brg-p", p.toFixed(4));
    }

    if (SCR.mover) SCR.mover.style.transform = "translateY(" + py2 + ")";
    return rp;
  }

  var textIdx = 0, textT = 0;
  function textTimeline() {
    var items = TXT.items, n = items.length, i;
    if (!n) return;
    textT += playDt;
    for (i = 0; i < n; i++) items[i].w = 0;
    if (n === 1 || TXT.hold + TXT.fade <= 0) {
      items[0].w = 1; textIdx = 0;
    } else {
      var per = TXT.hold + TXT.fade;
      var tt = textT % (per * n);
      var k = Math.floor(tt / per) % n, u = tt - k * per;
      textIdx = k;
      if (u < TXT.hold) items[k].w = 1;
      else {
        var f = (u - TXT.hold) / (TXT.fade || 1e-6);
        if (f > 1) f = 1;
        f = f * f * (3 - 2 * f);
        items[k].w = 1 - f;
        items[(k + 1) % n].w = f;
      }
    }

    var relDecay = TXT.tail > 0 ? Math.exp(-playDt / TXT.tail) : 0;
    for (i = 0; i < n; i++) {
      var itm = items[i];
      itm.rel = (itm.w < itm.prevW) ? 4 * itm.w * (1 - itm.w) : 0;
      itm.grab = (itm.w > itm.prevW) ? 4 * itm.w * (1 - itm.w) : 0;
      itm.hold = itm.grab > 0 ? 0 : Math.max(itm.rel, itm.hold * relDecay);
      itm.prevW = itm.w;
      if (itm.el) itm.el.style.opacity = itm.w;
    }
  }

  function textLayout() {
    var cw = host.clientWidth, ch = host.clientHeight;
    if (!cw || !ch) return;
    reframe(cw, ch);
    TXT.sx = cw / FRAME_W;
    TXT.sy = ch / FRAME_H;
    TXT.sg = Math.sqrt(TXT.sx * TXT.sy);
    TXT.W = Math.max(16, Math.round(cw * TXT.raster));
    TXT.H = Math.max(16, Math.round(ch * TXT.raster));

    var dw = Math.round(cw * DPR), dh = Math.round(ch * DPR);
    for (var i = 0; i < TXT.items.length; i++) {
      var it = TXT.items[i];
      if (!it.el) {
        it.el = document.createElement("canvas");
        it.el.className = "brg-text";
        textLayer.appendChild(it.el);
      }
      fitPhrase(it, cw);
      it.el.width = dw; it.el.height = dh;
      drawPhrase(it.el.getContext("2d"), it, dw, dh, DPR, it.col);
      it.el.style.width = "";
      it.el.style.opacity = it.w;
      bakeSdf(it);
    }
    TXT.ready = TXT.on && TXT.items.length > 0;
    RED.live = false;
  }

  var PROBE_STR = "mmmmmmmmwwwwwwwwiiiiiiiil0O";
  function familyAvailable(fam, weight) {
    if (!fam) return true;
    try {
      if (!fitCanvas) {
        fitCanvas = document.createElement("canvas");
        fitCanvas.width = 1; fitCanvas.height = 1;
      }
      var ctx = fitCanvas.getContext("2d");
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      var wOf = function (stack) {
        ctx.font = (weight || "400") + " 72px " + stack;
        return ctx.measureText(PROBE_STR).width;
      };
      var q = '"' + String(fam).replace(/"/g, "") + '", ';
      if (Math.abs(wOf(q + "monospace") - wOf("monospace")) > 0.5) return true;
      return Math.abs(wOf(q + "serif") - wOf("serif")) > 0.5;
    } catch (e) { return true; }
  }

  function firstFamily(stack) {
    var f = String(stack || "").split(",")[0].trim();
    return f.replace(/^["']|["']$/g, "");
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return;
    var seen = {}, jobs = [], i;
    var add = function (spec) {
      if (seen[spec]) return;
      seen[spec] = 1;
      try { jobs.push(document.fonts.load(spec)); } catch (e) {}
    };
    for (i = 0; i < TXT.items.length; i++) {
      var it = TXT.items[i];
      var fam = it.fam || cssVal(it.family, TXT.family, "font-family");
      if (!fam) continue;
      add(it.weight + " 100px " + fam);
    }
    // The project's own faces too, whether or not the copy names them: a
    // phrase can only be moved onto one (see adoptRole) if it has been
    // downloaded, and nothing else on the page is obliged to use it.
    var roles = [["fontSans", "--brg-sans"], ["fontSerif", "--brg-serif"]];
    for (i = 0; i < roles.length; i++) {
      if (!d[roles[i][0]]) continue;
      var rf = cssVal("var(" + roles[i][1] + ")", "", "font-family");
      if (!rf) continue;
      add("400 100px " + rf);
      add("700 100px " + rf);
    }
    if (!jobs.length) { checkFonts(); return; }
    var done = function () { textLayout(); checkFonts(); };
    Promise.all(jobs).then(done, done);
  }

  function checkFonts() {
    if (!document.fonts || !document.fonts.check) return;
    for (var i = 0; i < TXT.items.length; i++) {
      var it = TXT.items[i], first = firstFamily(it.fam);
      if (!first || familyAvailable(first, it.weight)) continue;
      var hint = "";
      if (d.fontSerif || d.fontSans) {
        hint = ' The component sets a project font, but this phrase does not' +
               ' follow it -- give the phrase "font": "sans" or "font": "serif"' +
               ' in the copy embed instead of a hard-coded "family".';
      }
      warn('"' + it.text.split("\n")[0] + '" asked for ' + first +
           ', which is not available -- drawing the next family in the stack.' + hint);
    }
  }

  function setCopy(list) {
    for (var i = 0; i < TXT.items.length; i++) {
      if (TXT.items[i].el) textLayer.removeChild(TXT.items[i].el);
    }
    TXT.items = parseCopy(list);
    textLayout();
    loadFonts();
  }

  TXT.items = parseCopy(readCopy());
  textLayout();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { textLayout(); });
  }
  loadFonts();

  var simTime = 0, elapsed = 0, running = true, rafId = 0;
  frameDt = (1 / SCENE.fps) * CFG.timeScale;
  playDt = 1 / SCENE.fps;
  var msPhys = 0, msShade = 0, fps = 0, lastNow = 0;

  function step() {
    var dt = (1 / SCENE.fps) * CFG.timeScale;
    frameDt = dt;
    var sub = dt / CFG.substeps;
    var rush = 1, itl = TXT.items;
    for (var g = 0; g < itl.length; g++) {
      var gk = 1 + (itl[g].grab || 0) * TXT.rushK;
      if (gk > rush) rush = gk;
    }

    bakeField(simTime);
    shadeRadius();

    for (var s = 0; s < CFG.substeps; s++) {
      buildGrid();
      pushApart(CFG.push, sub);
      fieldForce(CFG.field, CFG.fieldFall, sub);
      densityForce(SCENE.dens, sub);
      textForce(sub);
      friction(CFG.friction, sub);
      clampSpeed(CFG.maxSpd * rush);
      integrate(sub);
    }

    separate(CFG.relax);
    textProject();

    for (var q = 0; q < TXT.settle; q++) { separate(1); textProject(); }

    simTime += dt;
    elapsed += dt;
  }

  function upload() {
    for (var i = 0; i < N; i++) {
      gpuPos[i * 2] = px[i];
      gpuPos[i * 2 + 1] = py[i];
      gpuR[i] = rad[i];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpuPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufR);   gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpuR);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufCol); gl.bufferSubData(gl.ARRAY_BUFFER, 0, gpuCol);
  }

  var camZ = 1;
  function draw() {
    if (CAM.z !== camZ) {
      camZ = CAM.z;
      gl.uniform1f(U.uZoom, camZ);
      textLayer.style.transform = camZ === 1 ? "" : "scale(" + camZ.toFixed(4) + ")";
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!running) return;
    tick(now);
  }

  var wasOff = null;
  function clipOffscreen() {
    var r;
    try { r = host.getBoundingClientRect(); } catch (e) { return; }
    var vh = window.innerHeight || 0, vw = window.innerWidth || 0;
    var off = r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw;
    if (off === wasOff) return;
    wasOff = off;
    var v = off ? "hidden" : "";
    textLayer.style.visibility = v;
    canvas.style.visibility = v;
  }

  function tick(now) {
    clipOffscreen();
    if (lastNow) fps = fps * 0.9 + (1000 / Math.max(1, now - lastNow)) * 0.1;
    lastNow = now;

    var grow;
    if (SCR.on && SCR.rail) {
      SCR.p = scrollP();
      grow = scrollTimeline();
    } else {
      textTimeline();
      grow = (elapsed % CFG.cycle) / CFG.cycle;
    }

    var t0 = performance.now();
    step();
    var t1 = performance.now();
    shade(grow);
    var t2 = performance.now();

    msPhys = msPhys * 0.9 + (t1 - t0) * 0.1;
    msShade = msShade * 0.9 + (t2 - t1) * 0.1;

    upload();
    draw();

  }

  var PREROLL = Math.max(0, Math.min(120, num(d.preroll, 16) | 0));
  for (var pr = 0; pr < PREROLL; pr++) step();

  requestAnimationFrame(frame);

  window.BRG = {
    lockP: function (v) { SCR.lock = (v == null ? null : +v); },
    raw: function () { return { n: N, px: px, py: py, rad: rad, w: FRAME_W, h: FRAME_H }; },
    recolor: function () {
      var c = resolveColors();
      gl.uniform3fv(U.uInk, c.ink);
      gl.uniform3fv(U.uBg, c.bg);
      gl.uniform3fv(U.uAccent, c.accent);
      setClear(c.bg);
      TXT.color = normColor(cssVal(d.textColor || "", "", "color")) || CFG.ink;
      for (var i = 0; i < TXT.items.length; i++) {
        if (!TXT.items[i].colorSet) TXT.items[i].color = TXT.color;
      }
      textLayout();
      return { ink: CFG.ink, bg: CFG.bg, accent: CFG.accent };
    },
    styleOf: function (sel, prop) {
      var el = null;
      try { el = document.querySelector(sel); } catch (e) {}
      if (!el) return null;
      var g = getComputedStyle(el);
      if (prop) return g.getPropertyValue(prop).trim();
      return { fontFamily: g.fontFamily, fontWeight: g.fontWeight,
               color: g.color, backgroundColor: g.backgroundColor };
    },
    fonts: function () {
      return TXT.items.map(function (it) {
        var first = firstFamily(it.fam);
        return { text: it.text.split("\n")[0], stack: it.fam, first: first,
                 available: familyAvailable(first, it.weight) };
      });
    },
    debug: function (on) { DBG.on = on !== false; },

    relayout: function () { textLayout(); },
    tick: function (k) {
      var t = lastNow || 0;
      for (var i = 0; i < (k || 1); i++) { t += 1000 / SCENE.fps; tick(t); }
      upload(); draw();
    },

    intro: function () {
      for (var i = 0; i < TXT.items.length; i++) {
        var it = TXT.items[i];
        it.ph = it.tgt;
        it.w = it.ph * it.ph * (3 - 2 * it.ph);
      }
    },
    state: function () {
      return {
        p: SCR.p, locked: SCR.lock, tween: TWEEN.dur, red: redNow, dbg: DBG,
        zoom: CAM.z, frame: [FRAME_W, FRAME_H],
        color: { ink: CFG.ink, bg: CFG.bg, accent: CFG.accent },
        redOn: RED.on, redR: RED.r, redBias: SCENE.redBias,
        items: TXT.items.map(function (it) {
          var reqPx = it.sizeCm * TXT.sg;
          return { text: it.text, w: it.w, tgt: it.tgt, ph: it.ph, offY: it.offY,
                   px: reqPx, fit: it.fit,

                   drawnPx: reqPx * (it.fit || 1),
                   live: it.live };
        }),
      };
    },
  };

  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    lastNow = 0;
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    resize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(textLayout, 120);
  });

})();
