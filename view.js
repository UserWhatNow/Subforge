'use strict';
/* SubForge views: canvas chart, software 3D box renderer, baffle layout + sheet SVGs. */
(function (g) {
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function niceTicks(a, b, target) {
    const span = b - a, raw = span / (target || 6), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p, t = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }

  /* ================= Chart ================= */
  class Chart {
    constructor(cv, tip) {
      this.cv = cv; this.tip = tip; this.cfg = null; this.hx = null; this.geom = null;
      const mv = (e) => { const r = cv.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; this.hx = p.clientX - r.left; this.hy = p.clientY - r.top; this.draw(); };
      cv.addEventListener('mousemove', mv); cv.addEventListener('touchmove', mv, { passive: true }); cv.addEventListener('touchstart', mv, { passive: true });
      cv.addEventListener('mouseleave', () => { this.hx = null; this.draw(); });
      new ResizeObserver(() => this.draw()).observe(cv);
    }
    set(cfg) { this.cfg = cfg; this.draw(); }
    draw() {
      const cfg = this.cfg, cv = this.cv; if (!cfg) return;
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (!w) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const pad = { l: 52, r: 14, t: 10, b: 32 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const th = cfg.theme || {}, line = th.line || css('--line'), mut = th.mut || css('--mut'), fg = th.fg || css('--fg');
      if (th.bg) { c.fillStyle = th.bg; c.fillRect(0, 0, w, h); }
      const lx = (x) => cfg.xlog ? Math.log(x / cfg.xmin) / Math.log(cfg.xmax / cfg.xmin) : (x - cfg.xmin) / (cfg.xmax - cfg.xmin);
      const X = (x) => pad.l + lx(x) * pw, Y = (y) => pad.t + ph - (y - cfg.ymin) / (cfg.ymax - cfg.ymin) * ph;
      this.geom = { pad, pw, ph, X, Y };
      c.font = '11px "Segoe UI",system-ui,sans-serif'; c.lineWidth = 1;
      // grid
      const xt = cfg.xlog ? [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400].filter((v) => v >= cfg.xmin && v <= cfg.xmax) : niceTicks(cfg.xmin, cfg.xmax, 8);
      c.fillStyle = mut; c.strokeStyle = line; c.textAlign = 'center';
      xt.forEach((v) => { const x = Math.round(X(v)) + 0.5; c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, pad.t + ph); c.stroke(); c.fillText(String(v), x, h - 16); });
      c.textAlign = 'right';
      niceTicks(cfg.ymin, cfg.ymax, 7).forEach((v) => { const y = Math.round(Y(v)) + 0.5; c.beginPath(); c.moveTo(pad.l, y); c.lineTo(pad.l + pw, y); c.stroke(); c.fillText(String(v), pad.l - 6, y + 4); });
      c.textAlign = 'center'; c.fillText(cfg.xLabel || '', pad.l + pw / 2, h - 3);
      c.save(); c.translate(11, pad.t + ph / 2); c.rotate(-Math.PI / 2); c.fillText(cfg.yLabel || '', 0, 0); c.restore();
      c.save(); c.beginPath(); c.rect(pad.l, pad.t, pw, ph); c.clip();
      (cfg.vlines || []).forEach((v) => {
        if (v.x < cfg.xmin || v.x > cfg.xmax) return;
        const x = Math.round(X(v.x)) + 0.5; c.strokeStyle = v.color || mut; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, pad.t + ph); c.stroke(); c.setLineDash([]);
        c.fillStyle = v.color || mut; c.textAlign = 'left'; c.fillText(v.label, x + 4, pad.t + 12);
      });
      (cfg.refs || []).forEach((r) => {
        const y = Math.round(Y(r.y)) + 0.5; c.strokeStyle = r.color; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(pad.l, y); c.lineTo(pad.l + pw, y); c.stroke(); c.setLineDash([]);
        c.fillStyle = r.color; c.textAlign = 'right'; c.fillText(r.label, pad.l + pw - 4, y - 4);
      });
      cfg.series.forEach((s) => {
        c.strokeStyle = s.color; c.lineWidth = s.width || 2; c.setLineDash(s.dash || []); c.beginPath();
        let started = false;
        for (let i = 0; i < s.x.length; i++) {
          if (s.x[i] < cfg.xmin * 0.97 || s.x[i] > cfg.xmax * 1.03) continue;
          const x = X(s.x[i]), y = Y(s.y[i]);
          if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
        }
        c.stroke(); c.setLineDash([]);
      });
      c.restore(); c.lineWidth = 1;
      // hover
      const tip = this.tip;
      if (this.hx != null && this.hx > pad.l && this.hx < pad.l + pw) {
        const f = (this.hx - pad.l) / pw;
        const xv = cfg.xlog ? cfg.xmin * Math.pow(cfg.xmax / cfg.xmin, f) : cfg.xmin + f * (cfg.xmax - cfg.xmin);
        const xs = Math.round(this.hx) + 0.5;
        c.strokeStyle = fg; c.globalAlpha = 0.35; c.beginPath(); c.moveTo(xs, pad.t); c.lineTo(xs, pad.t + ph); c.stroke(); c.globalAlpha = 1;
        let html = `<div><b>${cfg.xfmt ? cfg.xfmt(xv) : xv.toFixed(1)}</b></div>`;
        cfg.series.forEach((s) => {
          if (s.noTip) return;
          let bi = 0, bd = Infinity;
          for (let i = 0; i < s.x.length; i++) { const d = Math.abs(s.x[i] - xv); if (d < bd) { bd = d; bi = i; } }
          const yv = s.y[bi];
          html += `<div><i style="background:${s.color}"></i>${s.name}: <b>${cfg.yfmt ? cfg.yfmt(yv) : yv.toFixed(1)}</b></div>`;
          c.fillStyle = s.color; c.beginPath(); c.arc(X(s.x[bi]), Y(yv), 3.5, 0, 7); c.fill();
        });
        tip.innerHTML = html; tip.hidden = false;
        const tw = tip.offsetWidth; tip.style.left = Math.min(w - tw - 4, this.hx + 14) + 'px'; tip.style.top = Math.max(4, (this.hy || 40) - 20) + 'px';
      } else tip.hidden = true;
    }
  }

  /* ================= 3D ================= */
  const FINISH = { carpet: [44, 50, 64], mdf: [186, 152, 114], plywood: [218, 184, 134], wood: [196, 140, 88], rosewood: [112, 58, 46], white: [226, 228, 234] };
  const BGS = { theme: null, gray: '#7c838f', green: '#2f6f4f', white: '#f4f5f8', black: '#0b0c10' };

  function draw3d(cv, S, geo, lay, V) {
    const dpr = window.devicePixelRatio || 1, cw = cv.clientWidth, chh = cv.clientHeight;
    if (!cw) return;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, chh);
    if (BGS[V.bg]) { c.fillStyle = BGS[V.bg]; c.fillRect(0, 0, cw, chh); }
    const { w, h, d } = S.dims, hx = w / 2, hy = h / 2, hz = d / 2, t = S.t, tf = geo.tf;
    const Wi = geo.Wi, Hi = geo.Hi, Di = geo.Di, zf = hz - tf, zb = -hz + t;
    const isBP = g.Eng.isBP, bp = isBP(S.type);
    const off = V.explode ? Math.max(w, h, d) * 0.32 : 0;
    const diag = Math.hypot(w, h, d) + off * 1.6, cam = diag * 2.4, sc = Math.min(cw, chh) * 0.78 / diag * V.zoom * cam;
    const cyw = Math.cos(V.ry), syw = Math.sin(V.ry), cp = Math.cos(V.rx), sp = Math.sin(V.rx);
    const rot = (p) => { const x = p[0] * cyw + p[2] * syw, z = -p[0] * syw + p[2] * cyw, y = p[1]; return [x, y * cp - z * sp, y * sp + z * cp]; };
    const proj = (p) => { const r = rot(p), k = sc / (cam - r[2]); return [cw / 2 + r[0] * k, chh / 2 - r[1] * k, r[2]]; };
    const base = FINISH[V.finish] || FINISH.carpet;
    const Ld = [-0.4, 0.7, 0.6]; const ll = Math.hypot(...Ld); const L = Ld.map((v) => v / ll);
    const poly = (pts, fill, stroke, lw) => {
      c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
    };
    const line3 = (a, b, col, lw) => { const p = proj(a), q = proj(b); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.strokeStyle = col; c.lineWidth = lw || 1; c.stroke(); };
    const toCam = (n, p) => { const nr = rot(n), pr = rot(p); return nr[0] * -pr[0] + nr[1] * -pr[1] + nr[2] * (cam - pr[2]) > 0; };
    const shade = (n) => { const nr = rot(n); return 0.35 + 0.5 * Math.max(0, nr[0] * L[0] + nr[1] * L[1] + nr[2] * L[2]); };
    const rgb = (sh, a) => `rgba(${Math.round(base[0] * sh)},${Math.round(base[1] * sh)},${Math.round(base[2] * sh)},${a == null ? 1 : a})`;

    // axis-aligned solid box; draws the faces that point at the camera
    const slab = (x0, x1, y0, y1, z0, z1, fill, stroke, lw) => {
      const Vt = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], P = Vt.map(proj);
      const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, czm = (z0 + z1) / 2;
      [[[0, 1, 2, 3], [0, 0, 1], [cxm, cym, z1]], [[5, 4, 7, 6], [0, 0, -1], [cxm, cym, z0]], [[4, 0, 3, 7], [-1, 0, 0], [x0, cym, czm]], [[1, 5, 6, 2], [1, 0, 0], [x1, cym, czm]], [[3, 2, 6, 7], [0, 1, 0], [cxm, y1, czm]], [[4, 5, 1, 0], [0, -1, 0], [cxm, y0, czm]]]
        .forEach(([ix, n, ctr]) => { if (toCam(n, ctr)) poly(ix.map((i) => P[i]), fill(shade(n)), stroke, lw); });
    };

    // ---- panel frames: a = right (as seen from outside), b = up, n = direction into the box. o = centre of the outer face
    const dsp = { front: [0, 0, off], back: [0, 0, -off], top: [0, off, 0], bottom: [0, -off, 0], left: [-off, 0, 0], right: [off, 0, 0] };
    const FR = {
      front: { o: [0, 0, hz], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], th: tf },
      back: { o: [0, 0, -hz], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], th: t },
      right: { o: [hx, 0, 0], u: [0, 0, -1], v: [0, 1, 0], n: [-1, 0, 0], th: t },
      left: { o: [-hx, 0, 0], u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0], th: t },
    };
    Object.keys(FR).forEach((k) => { const f = FR[k]; f.o = [f.o[0] + dsp[k][0], f.o[1] + dsp[k][1], f.o[2] + dsp[k][2]]; });
    const W3 = (f, a, b, dd) => [f.o[0] + f.u[0] * a + f.v[0] * b + f.n[0] * dd, f.o[1] + f.u[1] * a + f.v[1] * b + f.n[1] * dd, f.o[2] + f.u[2] * a + f.v[2] * b + f.n[2] * dd];
    const PP = (f, a, b, dd) => proj(W3(f, a, b, dd));
    const circF = (f, a, b, r, dd, n) => { const arr = []; for (let i = 0; i < (n || 40); i++) { const th = i / (n || 40) * 6.2832; arr.push(PP(f, a + Math.cos(th) * r, b + Math.sin(th) * r, dd)); } return arr; };
    const rectF = (f, a0, a1, b0, b1, dd) => [PP(f, a0, b0, dd), PP(f, a1, b0, dd), PP(f, a1, b1, dd), PP(f, a0, b1, dd)];
    const slabF = (f, a0, a1, b0, b1, d0, d1, fill, stroke, lw) => {
      const p = W3(f, a0, b0, d0), q = W3(f, a1, b1, d1);
      slab(Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1]), Math.min(p[2], q[2]), Math.max(p[2], q[2]), fill, stroke, lw);
    };
    const wallCol = (sh) => rgb(sh * 0.72);
    // depth walls of a hole cut through a panel
    const holeWalls = (f, o, thick) => {
      const dir = (a, b) => { const p0 = W3(f, a, b, 0), p1 = W3(f, a, b, thick); return [p0, p1]; };
      if (o.r) {
        const n = 40;
        for (let i = 0; i < n; i++) {
          const a0 = i / n * 6.2832, a1 = (i + 1) / n * 6.2832, am = (a0 + a1) / 2;
          const nn = [-(f.u[0] * Math.cos(am) + f.v[0] * Math.sin(am)), -(f.u[1] * Math.cos(am) + f.v[1] * Math.sin(am)), -(f.u[2] * Math.cos(am) + f.v[2] * Math.sin(am))];
          if (!toCam(nn, W3(f, o.a + Math.cos(am) * o.r, o.b + Math.sin(am) * o.r, 0))) continue;
          const pa = (ang, dd) => PP(f, o.a + Math.cos(ang) * o.r, o.b + Math.sin(ang) * o.r, dd), col = wallCol(shade(nn));
          poly([pa(a0, 0), pa(a1, 0), pa(a1, thick), pa(a0, thick)], col, col, 0.6);
        }
      } else {
        const a0 = o.a - o.w / 2, a1 = o.a + o.w / 2, b0 = o.b - o.h / 2, b1 = o.b + o.h / 2;
        [[[a0, b0, a1, b0], [f.v[0], f.v[1], f.v[2]]], [[a0, b1, a1, b1], [-f.v[0], -f.v[1], -f.v[2]]], [[a0, b0, a0, b1], [f.u[0], f.u[1], f.u[2]]], [[a1, b0, a1, b1], [-f.u[0], -f.u[1], -f.u[2]]]].forEach(([e, nn]) => {
          if (!toCam(nn, W3(f, (e[0] + e[2]) / 2, (e[1] + e[3]) / 2, 0))) return;
          const col = wallCol(shade(nn));
          poly([PP(f, e[0], e[1], 0), PP(f, e[2], e[3], 0), PP(f, e[2], e[3], thick), PP(f, e[0], e[1], thick)], col, col, 0.6);
        });
      }
    };
    const driverDecal = (f, q, thick) => {
      poly(circF(f, q.x, q.y, q.d / 2, -0.1), '#07080b', 'rgba(255,255,255,.25)', 1);
      holeWalls(f, { a: q.x, b: q.y, r: q.d / 2 }, thick);
      poly(circF(f, q.x, q.y, q.d * 0.45, -0.2), '#2a2e38');
      poly(circF(f, q.x, q.y, q.d * 0.37, -0.3), '#15171d', 'rgba(255,255,255,.12)', 1);
      poly(circF(f, q.x, q.y, q.d * 0.11, -0.4), '#353a46');
    };
    const portDecal = (f, it, thick) => {
      if (it.shape === 'circle') { poly(circF(f, it.x, it.y, it.d / 2, -0.1), '#040507', 'rgba(255,255,255,.35)', 1.5); holeWalls(f, { a: it.x, b: it.y, r: it.d / 2 }, thick); }
      else { poly(rectF(f, it.x - it.w / 2, it.x + it.w / 2, it.y - it.h / 2, it.y + it.h / 2, -0.1), '#040507', 'rgba(255,255,255,.35)', 1.5); holeWalls(f, { a: it.x, b: it.y, w: it.w, h: it.h }, thick); }
    };
    const decalsFor = (id) => {
      if (id === 'front') { if (!bp) lay.drivers.forEach((q) => driverDecal(FR.front, q, tf)); lay.ports.forEach((q) => portDecal(FR.front, q, tf)); }
      if (id === 'back') lay.rear.forEach((q) => portDecal(FR.back, q, t));
      if (id === 'left' || id === 'right') { if (lay.side.length && lay.sideFace === id) lay.side.forEach((q) => portDecal(FR[id], q, t)); }
    };
    // joint lines on the outside so the real panel thickness is visible (front/back full size, top/bottom full width, sides inset)
    const seams = (id) => {
      const ln = (a, b) => line3(a, b, 'rgba(0,0,0,.45)', 1), zi = hz - tf, zj = -hz + t, yi = hy - t;
      if (id === 'top') { ln([-hx, hy, zi], [hx, hy, zi]); ln([-hx, hy, zj], [hx, hy, zj]); }
      if (id === 'bottom') { ln([-hx, -hy, zi], [hx, -hy, zi]); ln([-hx, -hy, zj], [hx, -hy, zj]); }
      if (id === 'left' || id === 'right') { const x = id === 'left' ? -hx : hx; ln([x, yi, zj], [x, yi, zi]); ln([x, -yi, zj], [x, -yi, zi]); ln([x, -yi, zi], [x, yi, zi]); ln([x, -yi, zj], [x, yi, zj]); }
    };

    const hasP = S.type !== 'sealed' && geo.port;
    const prims = [];
    // ---- internals (shown in X-ray and exploded views)
    const internals = () => {
      geo.bracesList.forEach((b) => {
        const c0 = [b.x - Wi / 2, b.y - Hi / 2, zf - b.z];
        const ax = b.axis === 'vertical' ? [0, 1, 0] : b.axis === 'side' ? [1, 0, 0] : [0, 0, 1];
        const u = b.axis === 'side' ? [0, 1, 0] : [1, 0, 0], vv = b.axis === 'vertical' || b.axis === 'side' ? [0, 0, 1] : [0, 1, 0];
        const hl = b.len / 2, r = b.size / 2;
        const e0 = [c0[0] - ax[0] * hl, c0[1] - ax[1] * hl, c0[2] - ax[2] * hl], e1 = [c0[0] + ax[0] * hl, c0[1] + ax[1] * hl, c0[2] + ax[2] * hl];
        const ring = (e) => { const a = []; for (let i = 0; i < 16; i++) { const th = i / 16 * 6.2832, cc = Math.cos(th) * r, ss = Math.sin(th) * r; a.push(proj([e[0] + u[0] * cc + vv[0] * ss, e[1] + u[1] * cc + vv[1] * ss, e[2] + u[2] * cc + vv[2] * ss])); } return a; };
        const sqr = (e) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([su, sv]) => proj([e[0] + (u[0] * su + vv[0] * sv) * r, e[1] + (u[1] * su + vv[1] * sv) * r, e[2] + (u[2] * su + vv[2] * sv) * r]));
        prims.push({ z: c0[2], f: () => {
          const col = 'rgba(255,176,0,.9)', fill = 'rgba(255,176,0,.25)', A = b.shape === 'round' ? ring(e0) : sqr(e0), Bp = b.shape === 'round' ? ring(e1) : sqr(e1), step = b.shape === 'round' ? 4 : 1;
          for (let i = 0; i < A.length; i += step) { c.beginPath(); c.moveTo(A[i][0], A[i][1]); c.lineTo(Bp[i][0], Bp[i][1]); c.strokeStyle = col; c.lineWidth = 1.2; c.stroke(); }
          poly(Bp, fill, col, 1.2); poly(A, fill, col, 1.2);
        } });
      });
      // slot port: only the real wall panels (divider + cheeks) at the actual material thickness
      const slotWalls = (f, it, len, A, B) => {
        const fill = () => 'rgba(76,201,240,.34)', st = 'rgba(76,201,240,.95)';
        const a0 = it.x - it.w / 2, a1 = it.x + it.w / 2, b0 = it.y - it.h / 2, b1 = it.y + it.h / 2, d0 = f.th, d1 = f.th + len;
        if (it.w >= it.h) {
          if ((b0 + B) <= (B - b1)) slabF(f, a0, a1, b1, b1 + t, d0, d1, fill, st, 1.2); else slabF(f, a0, a1, b0 - t, b0, d0, d1, fill, st, 1.2);
          if (a0 > -A + 1) slabF(f, a0 - t, a0, b0, b1, d0, d1, fill, st, 1.2);
          if (a1 < A - 1) slabF(f, a1, a1 + t, b0, b1, d0, d1, fill, st, 1.2);
        } else {
          if ((a0 + A) <= (A - a1)) slabF(f, a1, a1 + t, b0, b1, d0, d1, fill, st, 1.2); else slabF(f, a0 - t, a0, b0, b1, d0, d1, fill, st, 1.2);
          if (b0 > -B + 1) slabF(f, a0, a1, b0 - t, b0, d0, d1, fill, st, 1.2);
          if (b1 < B - 1) slabF(f, a0, a1, b1, b1 + t, d0, d1, fill, st, 1.2);
        }
      };
      // folded port: a serpentine of straight segments stacked away from the nearest box wall, joined by U-turns
      const foldedPort = (f, it, port, A, B) => {
        const n = port.nSeg, pitch = port.pitch, seg = port.segLen, d0 = f.th, slot = it.shape === 'rect', horizontal = !slot || it.w >= it.h;
        let dir;
        if (slot && !horizontal) dir = ((it.x - it.w / 2) + A) <= (A - (it.x + it.w / 2)) ? 1 : -1;
        else if (slot) dir = ((it.y - it.h / 2) + B) <= (B - (it.y + it.h / 2)) ? 1 : -1;
        else dir = it.y < 0 ? 1 : -1;
        const fill = () => 'rgba(76,201,240,.34)', st = 'rgba(76,201,240,.95)';
        prims.push({ z: W3(f, it.x, it.y, d0 + seg / 2)[2], f: () => {
          for (let k = 0; k < n; k++) {
            const off = dir * k * pitch, x = it.x + (slot && !horizontal ? off : 0), y = it.y + (slot && !horizontal ? 0 : off), farTurn = k % 2 === 0;
            if (slot) {
              const sh = horizontal ? it.h : it.w, a0 = x - it.w / 2, a1 = x + it.w / 2, b0 = y - it.h / 2, b1 = y + it.h / 2;
              const z0 = k === n - 1 ? d0 : (farTurn ? d0 : d0 + sh), z1 = k === n - 1 ? d0 + seg : (farTurn ? d0 + seg - sh : d0 + seg);
              if (horizontal) { if (dir > 0) slabF(f, a0, a1, b1, b1 + t, z0, z1, fill, st, 1.2); else slabF(f, a0, a1, b0 - t, b0, z0, z1, fill, st, 1.2); if (a0 > -A + 1) slabF(f, a0 - t, a0, b0, b1, d0, d0 + seg, fill, st, 1); if (a1 < A - 1) slabF(f, a1, a1 + t, b0, b1, d0, d0 + seg, fill, st, 1); }
              else { if (dir > 0) slabF(f, a1, a1 + t, b0, b1, z0, z1, fill, st, 1.2); else slabF(f, a0 - t, a0, b0, b1, z0, z1, fill, st, 1.2); if (b0 > -B + 1) slabF(f, a0, a1, b0 - t, b0, d0, d0 + seg, fill, st, 1); if (b1 < B - 1) slabF(f, a0, a1, b1, b1 + t, d0, d0 + seg, fill, st, 1); }
            } else {
              const ra = circF(f, x, y, it.d / 2, d0, 20), rb = circF(f, x, y, it.d / 2, d0 + seg, 20);
              for (let i = 0; i < 20; i += 5) { c.beginPath(); c.moveTo(ra[i][0], ra[i][1]); c.lineTo(rb[i][0], rb[i][1]); c.strokeStyle = 'rgba(76,201,240,.5)'; c.lineWidth = 1; c.stroke(); }
              poly(rb, 'rgba(76,201,240,.12)', 'rgba(76,201,240,.85)', 1.2); poly(ra, 'rgba(76,201,240,.12)', 'rgba(76,201,240,.85)', 1.2);
              if (k < n - 1) { const dEnd = farTurn ? d0 + seg : d0, p1 = PP(f, x, y, dEnd), p2 = PP(f, x, y + dir * pitch, dEnd); c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.strokeStyle = 'rgba(255,176,0,.95)'; c.lineWidth = 2.2; c.stroke(); }
            }
          }
        } });
      };
      const tube = (f, it, len, A, B, port) => {
        if (port && port.nSeg > 1) { foldedPort(f, it, port, A, B); return; }        const zc = W3(f, it.x, it.y, f.th + len / 2)[2];
        prims.push({ z: zc, f: () => {
          if (it.shape === 'circle') {
            const a = circF(f, it.x, it.y, it.d / 2, f.th, 24), b = circF(f, it.x, it.y, it.d / 2, f.th + len, 24);
            for (let i = 0; i < 24; i += 3) { c.beginPath(); c.moveTo(a[i][0], a[i][1]); c.lineTo(b[i][0], b[i][1]); c.strokeStyle = 'rgba(76,201,240,.45)'; c.lineWidth = 1; c.stroke(); }
            poly(b, 'rgba(76,201,240,.12)', 'rgba(76,201,240,.8)', 1.2); poly(a, 'rgba(76,201,240,.18)', 'rgba(76,201,240,.9)', 1.5);
          } else slotWalls(f, it, len, A, B);
        } });
      };
      if (hasP) {
        const p = geo.port;
        if (bp) { lay.ports.forEach((q) => tube(FR.front, q, Math.min(p.L, geo.Df - 10), Wi / 2, Hi / 2, p)); if (geo.port2) lay.rear.forEach((q) => tube(FR.back, q, Math.min(geo.port2.L, geo.Dr - 10), Wi / 2, Hi / 2, geo.port2)); }
        else if (geo.sidePort) lay.side.forEach((q) => tube(FR[geo.sidePort], q, Math.min(p.L, Wi - 10), Di / 2, Hi / 2, p));
        else if (S.port.pos === 'rear') lay.rear.forEach((q) => tube(FR.back, q, Math.min(p.L, Di - 10), Wi / 2, Hi / 2, p));
        else lay.ports.forEach((q) => tube(FR.front, q, Math.min(p.L, Di - 10), Wi / 2, Hi / 2, p));
      }
      if (bp) {
        const zd = zf - geo.Df;
        prims.push({ z: zd, f: () => {
          slab(-Wi / 2, Wi / 2, -Hi / 2, Hi / 2, zd - t, zd, () => 'rgba(200,200,220,.14)', 'rgba(255,255,255,.55)', 1.2);
          const fd = { o: [0, 0, zd], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], th: t };
          lay.divDrivers.forEach((q) => driverDecal(fd, q, t));
        } });
      } else {
        const dep = Math.min(S.driver.depth > 0 ? S.driver.depth : 120, Di * 0.95);
        lay.drivers.forEach((q) => {
          const f = FR.front;
          prims.push({ z: W3(f, q.x, q.y, tf + dep / 2)[2], f: () => {
            const a = circF(f, q.x, q.y, q.d / 2, tf, 24), bb = circF(f, q.x, q.y, q.d * 0.42, tf + dep * 0.45, 24), m = circF(f, q.x, q.y, q.d * 0.24, tf + dep, 20);
            for (let i = 0; i < 24; i += 4) { c.beginPath(); c.moveTo(a[i][0], a[i][1]); c.lineTo(bb[i][0], bb[i][1]); c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1; c.stroke(); }
            poly(bb, 'rgba(255,255,255,.06)', 'rgba(255,255,255,.4)', 1); poly(m, 'rgba(20,20,26,.7)', 'rgba(255,255,255,.5)', 1);
          } });
        });
      }
    };

    const panelBoxes = () => {
      const zi = hz - tf, zj = -hz + t, yi = hy - t, e = off;
      return [
        { id: 'front', b: [-hx, hx, -hy, hy, zi + e, hz + e], c: [0, 0, hz + e] },
        { id: 'back', b: [-hx, hx, -hy, hy, -hz - e, zj - e], c: [0, 0, -hz - e] },
        { id: 'top', b: [-hx, hx, yi + e, hy + e, zj, zi], c: [0, hy + e, 0] },
        { id: 'bottom', b: [-hx, hx, -hy - e, -yi - e, zj, zi], c: [0, -hy - e, 0] },
        { id: 'left', b: [-hx - e, -hx + t - e, -yi, yi, zj, zi], c: [-hx - e, 0, 0] },
        { id: 'right', b: [hx - t + e, hx + e, -yi, yi, zj, zi], c: [hx + e, 0, 0] },
      ];
    };

    if (!V.xray && !V.explode) {
      const faces = [
        { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], id: 'front' },
        { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], id: 'back' },
        { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], id: 'left' },
        { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], id: 'right' },
        { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], id: 'top' },
        { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], id: 'bottom' },
      ];
      faces.forEach((f) => {
        const ctr = f.v.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
        f.depth = rot(ctr)[2]; f.vis = toCam(f.n, ctr); f.p = f.v.map(proj);
        f.col = rgb(shade(f.n));
      });
      faces.filter((f) => f.vis).sort((a, b) => a.depth - b.depth).forEach((f) => { poly(f.p, f.col, 'rgba(255,255,255,.18)', 1); seams(f.id); decalsFor(f.id); });
    } else {
      const opaque = !!V.explode;
      internals();
      panelBoxes().forEach((p) => {
        prims.push({ z: p.c[2] + p.c[0] * 0.001, f: () => {
          slab(p.b[0], p.b[1], p.b[2], p.b[3], p.b[4], p.b[5], opaque ? (sh) => rgb(sh) : (sh) => rgb(0.6 + sh * 0.6, 0.2), opaque ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.4)', 1);
          if (opaque) decalsFor(p.id);
        } });
      });
      prims.sort((a, b) => rot([0, 0, a.z])[2] - rot([0, 0, b.z])[2]).forEach((p) => p.f());
      if (!opaque) panelBoxes().forEach((p) => { const f = p.id; if ((f === 'front' && toCam([0, 0, 1], [0, 0, hz])) || (f === 'back' && toCam([0, 0, -1], [0, 0, -hz])) || (f === 'right' && toCam([1, 0, 0], [hx, 0, 0])) || (f === 'left' && toCam([-1, 0, 0], [-hx, 0, 0]))) decalsFor(f); });
    }

    // ---- dimension labels
    if (V.dims && V.dimText) {
      const mg = Math.max(w, h, d) * 0.07 + off * 0.3;
      const dimLine = (a, b, txt) => {
        line3(a, b, 'rgba(255,176,0,.95)', 1.4);
        const pa = proj(a), pb = proj(b), dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len * 5, ny = dx / len * 5;
        [pa, pb].forEach((p) => { c.beginPath(); c.moveTo(p[0] - nx, p[1] - ny); c.lineTo(p[0] + nx, p[1] + ny); c.strokeStyle = 'rgba(255,176,0,.95)'; c.lineWidth = 1.4; c.stroke(); });
        const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
        c.font = '600 12px "Segoe UI",sans-serif'; const tw = c.measureText(txt).width + 10;
        c.fillStyle = 'rgba(15,17,23,.88)'; c.fillRect(mx - tw / 2, my - 10, tw, 20); c.fillStyle = '#ffd27a'; c.textAlign = 'center'; c.fillText(txt, mx, my + 4);
      };
      dimLine([-hx, -hy - mg, hz + mg * 0.4], [hx, -hy - mg, hz + mg * 0.4], V.dimText.w);
      dimLine([hx + mg, -hy, hz + mg * 0.4], [hx + mg, hy, hz + mg * 0.4], V.dimText.h);
      dimLine([hx + mg, -hy - mg * 0.6, hz], [hx + mg, -hy - mg * 0.6, -hz], V.dimText.d);
    }
    c.fillStyle = BGS[V.bg] && V.bg !== 'black' && V.bg !== 'gray' && V.bg !== 'green' ? '#444' : css('--mut'); c.font = '12px "Segoe UI",sans-serif'; c.textAlign = 'right';
    if (BGS[V.bg] && (V.bg === 'gray' || V.bg === 'green' || V.bg === 'black')) c.fillStyle = 'rgba(255,255,255,.75)';
    c.fillText(V.label || '', cw - 10, chh - 8);
  }

  /* ================= baffle layout ================= */
  function baffleLayout(S, geo) {
    const W = S.dims.w, H = S.dims.h, m = 20, lo = S.layout, gap = Math.max(10, lo.gap), pgap = 12, warn = [];
    const isBP = g.Eng.isBP, bp = isBP(S.type), six = S.type === 'bandpass6';
    const p = geo.port, front = !!p && (bp || S.port.pos === 'front');
    const cut = S.driver.cut, n = S.n, place0 = S.port.place || 'auto';
    const box = (q) => { const r = (q.outD || q.d) / 2; return q.shape === 'rect' ? [q.x - q.w / 2, q.x + q.w / 2, q.y - q.h / 2, q.y + q.h / 2] : [q.x - r, q.x + r, q.y - r, q.y + r]; };
    const portGroup = (pt, stack) => {
      if (pt.kind === 'slot') { const w = pt.vertical ? pt.hSlot : pt.wSlot, h = pt.vertical ? pt.wSlot : pt.hSlot; return { w, h, items: [{ shape: 'rect', x: 0, y: 0, w, h }] }; }
      const o = pt.outD, k = pt.n, tot = k * o + (k - 1) * pgap, items = [];
      for (let i = 0; i < k; i++) items.push(stack === 'col' ? { shape: 'circle', x: 0, y: tot / 2 - o / 2 - i * (o + pgap), d: pt.dia, outD: o } : { shape: 'circle', x: -tot / 2 + o / 2 + i * (o + pgap), y: 0, d: pt.dia, outD: o });
      return stack === 'col' ? { w: o, h: tot, items } : { w: tot, h: o, items };
    };
    const shift = (items, dx, dy) => items.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy }));
    const driverGroup = (dir) => {
      const tot = n * cut + (n - 1) * gap, items = [];
      for (let i = 0; i < n; i++) items.push(dir === 'col' ? { shape: 'circle', x: 0, y: tot / 2 - cut / 2 - i * (cut + gap), d: cut } : { shape: 'circle', x: -tot / 2 + cut / 2 + i * (cut + gap), y: 0, d: cut });
      return dir === 'col' ? { w: cut, h: tot, items } : { w: tot, h: cut, items };
    };
    const placeDrivers = (dir, x0, x1, y0, y1) => {
      const gd = driverGroup(dir), fx = x1 - x0 - gd.w, fy = y1 - y0 - gd.h;
      const cx0 = fx >= 0 ? x0 + gd.w / 2 + fx * lo.align / 100 : (x0 + x1) / 2;
      const cy0 = fy >= 0 ? y0 + gd.h / 2 + fy * (dir === 'col' ? lo.align / 100 : 0.5) : (y0 + y1) / 2;
      return shift(gd.items, cx0, cy0);
    };
    const fits = (list, RW, RH) => {
      for (const q of list) { const b = box(q); if (b[0] < -RW / 2 + m * 0.75 || b[1] > RW / 2 - m * 0.75 || b[2] < -RH / 2 + m * 0.75 || b[3] > RH / 2 - m * 0.75) return false; }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const A = box(list[i]), B = box(list[j]); if (A[0] < B[1] + 4 && B[0] < A[1] + 4 && A[2] < B[3] + 4 && B[2] < A[3] + 4) return false; }
      return true;
    };
    const cxy = (RW, RH) => ({ x: lo.px != null ? lo.px - RW / 2 : 0, y: lo.py != null ? lo.py - RH / 2 : 0 });
    const dirs = lo.dir === 'auto' ? (W >= H ? ['row', 'col'] : ['col', 'row']) : [lo.dir];

    // ---- front (baffle) layout candidates
    const tryFront = (place, dir) => {
      let x0 = -W / 2 + m, x1 = W / 2 - m, y0 = -H / 2 + m, y1 = H / 2 - m, ports = [];
      if (front) {
        if (place === 'custom') ports = shift(portGroup(p, 'row').items, cxy(W, H).x, cxy(W, H).y);
        else if (bp && place === 'auto') ports = portGroup(p, 'row').items;
        else {
          const side = place === 'auto' ? 'right' : place, pg = portGroup(p, side === 'left' || side === 'right' ? 'col' : 'row');
          if (side === 'right') { ports = shift(pg.items, W / 2 - m - pg.w / 2, 0); x1 = W / 2 - m - pg.w - gap; }
          else if (side === 'left') { ports = shift(pg.items, -W / 2 + m + pg.w / 2, 0); x0 = -W / 2 + m + pg.w + gap; }
          else if (side === 'below') { ports = shift(pg.items, 0, -H / 2 + m + pg.h / 2); y0 = -H / 2 + m + pg.h + gap; }
          else { ports = shift(pg.items, 0, H / 2 - m - pg.h / 2); y1 = H / 2 - m - pg.h - gap; }
        }
      }
      const drivers = bp ? [] : placeDrivers(dir, x0, x1, y0, y1);
      return { drivers, ports, place, ok: fits(drivers.concat(ports), W, H) };
    };
    const places = front && !bp ? (place0 === 'auto' ? ['right', 'left', 'below', 'above'] : [place0]) : [place0];
    let best = null;
    outer: for (const pl of places) for (const d of dirs) { const c = tryFront(pl, d); if (!best) best = c; if (c.ok) { best = c; break outer; } }

    // ---- divider drivers (band-pass)
    let divDrivers = [], okDiv = true;
    if (bp) {
      const Wi = geo.Wi, Hi = geo.Hi;
      for (const d of dirs) { const dr = placeDrivers(d, -Wi / 2 + m, Wi / 2 - m, -Hi / 2 + m, Hi / 2 - m); if (!divDrivers.length) divDrivers = dr; if (fits(dr, Wi, Hi)) { divDrivers = dr; okDiv = true; break; } okDiv = false; }
    }
    // ---- rear panel ports
    let rear = [];
    const rp = six ? geo.port2 : (!front && p && !geo.sidePort ? p : null);
    if (rp) { const off = place0 === 'custom' && !six ? cxy(W, H) : { x: 0, y: 0 }; rear = shift(portGroup(rp, 'row').items, off.x, off.y); }
    const okRear = fits(rear, W, H);
    // port on the left / right panel (panel seen from outside: D wide, H tall)
    let side = [], okSide = true;
    if (geo.sidePort && p) {
      const D = S.dims.d, off = place0 === 'custom' ? { x: lo.px != null ? lo.px - D / 2 : 0, y: lo.py != null ? lo.py - H / 2 : 0 } : { x: 0, y: 0 };
      side = shift(portGroup(p, 'row').items, off.x, off.y);
      okSide = fits(side, D, H);
    }

    if (!best.ok) warn.push(front && !bp ? 'Driver cut-outs and front port do not fit on the baffle. Try another port side, fewer/smaller ports, a smaller driver gap, or a larger baffle.' : 'The front port does not fit on the baffle.');
    if (!okRear) warn.push('Rear port does not fit on the back panel.');
    if (!okSide) warn.push('The side port does not fit on the side panel.');
    if (!okDiv) warn.push('Drivers do not fit on the chamber divider.');
    return { drivers: best.drivers, divDrivers, ports: best.ports, rear, side, sideFace: geo.sidePort || null, ok: best.ok && okRear && okDiv && okSide, warn, place: best.place };
  }
  function baffleSVG(S, geo, lay, fmt) {
    const W = S.dims.w, H = S.dims.h, pad = Math.max(W, H) * 0.1, fs = Math.max(W, H) / 26;
    let s = `<svg viewBox="${-W / 2 - pad} ${-H / 2 - pad} ${W + pad * 2} ${H + pad * 2}" role="img" aria-label="Baffle layout">`;
    s += `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" rx="4" fill="var(--panel)" stroke="${lay.ok ? 'var(--fg)' : 'var(--bad)'}" stroke-width="${fs / 12}"/>`;
    const Y = (y) => -y;
    lay.drivers.forEach((q) => { s += `<circle cx="${q.x}" cy="${Y(q.y)}" r="${q.d / 2}" fill="var(--bg)" stroke="var(--acc)" stroke-width="${fs / 14}"/><circle cx="${q.x}" cy="${Y(q.y)}" r="${q.d * .36}" fill="none" stroke="var(--mut)" stroke-width="${fs / 20}"/><text x="${q.x}" y="${Y(q.y) + fs * .35}" font-size="${fs * .9}" text-anchor="middle" fill="var(--fg)">Ø${fmt(q.d)}</text>`; });
    lay.ports.forEach((q) => {
      if (q.shape === 'rect') s += `<rect x="${q.x - q.w / 2}" y="${Y(q.y) - q.h / 2}" width="${q.w}" height="${q.h}" fill="var(--bg)" stroke="var(--acc2)" stroke-width="${fs / 14}"/><text x="${q.x}" y="${Y(q.y) + fs * .3}" font-size="${fs * .8}" text-anchor="middle" fill="var(--fg)" ${q.h > q.w * 2 ? `transform="rotate(-90 ${q.x} ${Y(q.y)})"` : ''}>${fmt(q.w)} × ${fmt(q.h)}</text>`;
      else s += `<circle cx="${q.x}" cy="${Y(q.y)}" r="${q.d / 2}" fill="var(--bg)" stroke="var(--acc2)" stroke-width="${fs / 14}"/><text x="${q.x}" y="${Y(q.y) + fs * .3}" font-size="${fs * .8}" text-anchor="middle" fill="var(--fg)">Ø${fmt(q.d)}</text>`;
    });
    s += `<text x="0" y="${H / 2 + pad * 0.7}" font-size="${fs}" text-anchor="middle" fill="var(--mut)">${fmt(W)}</text>`;
    s += `<text x="${-W / 2 - pad * 0.3}" y="0" font-size="${fs}" text-anchor="middle" fill="var(--mut)" transform="rotate(-90 ${-W / 2 - pad * 0.3} 0)">${fmt(H)}</text>`;
    if (geo.sidePort) s += `<text x="0" y="${-H / 2 + fs * 1.6}" font-size="${fs * .8}" text-anchor="middle" fill="var(--mut)">port is on the ${geo.sidePort} panel</text>`;
    if (g.Eng.isBP(S.type)) s += `<text x="0" y="${-H / 2 + fs * 1.6}" font-size="${fs * .8}" text-anchor="middle" fill="var(--mut)">drivers are on the internal divider</text>`;
    if (S.type === 'bandpass6' || (S.type === 'ported' && S.port.pos === 'rear')) s += `<text x="0" y="${-H / 2 + fs * 1.6}" font-size="${fs * .8}" text-anchor="middle" fill="var(--mut)">rear port is on the back panel</text>`;
    return s + '</svg>';
  }

  function sheetsSVG(res, sw, sh) {
    const colors = ['#ffb000', '#4cc9f0', '#b388ff', '#6ee7a1', '#ff7a90', '#f4a261', '#9ad1d4'];
    const cmap = {}; let ci = 0;
    return res.sheets.map((sheet, i) => {
      let s = `<svg viewBox="-10 -10 ${sw + 20} ${sh + 40}"><rect width="${sw}" height="${sh}" fill="none" stroke="var(--mut)" stroke-width="3"/>`;
      sheet.placed.forEach((p) => {
        if (!(p.name in cmap)) cmap[p.name] = colors[ci++ % colors.length];
        const fsz = Math.min(p.w, p.h) > 120 ? sw / 70 : sw / 110;
        s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${cmap[p.name]}" fill-opacity=".28" stroke="${cmap[p.name]}" stroke-width="2"/>`;
        if (Math.min(p.w, p.h) > 60) s += `<text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" font-size="${fsz}" text-anchor="middle" fill="var(--fg)">${p.name.split(' ')[0]} ${Math.round(p.w)}×${Math.round(p.h)}</text>`;
      });
      return s + `<text x="0" y="${sh + 28}" font-size="${sw / 60}" fill="var(--mut)">Sheet ${i + 1} · ${sw}×${sh}</text></svg>`;
    }).join('');
  }

  /* ================= 2D panel plans ================= */
  function planSVG(S, geo, lay, fmt, unit) {
    const t = S.t, W = S.dims.w, H = S.dims.h, D = S.dims.d, tf = geo.tf, dIn = D - t - tf, out = [];
    const holeSvg = (q, fs, col) => q.shape === 'rect'
      ? `<rect x="${q.x - q.w / 2}" y="${-q.y - q.h / 2}" width="${q.w}" height="${q.h}" fill="var(--bg)" stroke="${col}" stroke-width="${fs / 12}"/><text x="${q.x}" y="${-q.y - fs * .5}" font-size="${fs * .75}" text-anchor="middle" fill="var(--fg)" ${q.h > q.w * 2 ? `transform="rotate(-90 ${q.x} ${-q.y})"` : ''}>${fmt(q.w)} × ${fmt(q.h)}</text>`
      : `<circle cx="${q.x}" cy="${-q.y}" r="${q.d / 2}" fill="var(--bg)" stroke="${col}" stroke-width="${fs / 12}"/><text x="${q.x}" y="${-q.y - fs * .5}" font-size="${fs * .8}" text-anchor="middle" fill="var(--fg)">Ø${fmt(q.d)}</text>`;
    const panel = (title, pw, ph, qty, holes, note) => {
      const pad = Math.max(pw, ph) * 0.13, fs = Math.max(pw, ph) / 22;
      let s = `<svg viewBox="${-pw / 2 - pad} ${-ph / 2 - pad} ${pw + 2 * pad} ${ph + 2 * pad}"><rect x="${-pw / 2}" y="${-ph / 2}" width="${pw}" height="${ph}" fill="var(--panel)" stroke="var(--fg)" stroke-width="${fs / 14}"/>`;
      const centres = [];
      let nd = 0, np = 0;
      holes.forEach((q) => { s += holeSvg(q, fs, q.kind === 'port' ? 'var(--acc2)' : 'var(--acc)'); });
      // centre of every cut-out, measured from the bottom edge up (and from the left edge across)
      holes.forEach((q) => {
        if (q.kind === 'port') return; // only driver cut-outs are dimensioned
        const yb = q.y + ph / 2, xl = q.x + pw / 2, cy = -q.y, by = ph / 2, tk = fs * 0.28, cr = fs * 0.4;
        centres.push(`${q.kind === 'port' ? 'Port ' + (++np) : 'Driver ' + (++nd)}: <b>${fmt(yb)}${unit || ''}</b> up from the bottom · ${fmt(xl)}${unit || ''} from the left`);
        s += `<g stroke="var(--fg)" stroke-width="${fs / 16}" fill="none"><line x1="${q.x}" y1="${by}" x2="${q.x}" y2="${cy}" stroke-dasharray="${fs / 3} ${fs / 5}"/><line x1="${q.x - tk}" y1="${by}" x2="${q.x + tk}" y2="${by}"/><line x1="${q.x - cr}" y1="${cy}" x2="${q.x + cr}" y2="${cy}"/><line x1="${q.x}" y1="${cy - cr}" x2="${q.x}" y2="${cy + cr}"/></g>`;
        const my = (by + cy) / 2, txt = fmt(yb) + (unit || '');
        s += `<text x="${q.x + fs * 0.25}" y="${my + fs * 0.3}" font-size="${fs * 0.78}" fill="var(--acc-text)" stroke="var(--panel2)" stroke-width="${fs / 5}" paint-order="stroke" font-weight="700">${txt}</text>`;
      });
      s += `<text x="0" y="${ph / 2 + pad * .7}" font-size="${fs}" text-anchor="middle" fill="var(--mut)">${fmt(pw)}</text><text x="${-pw / 2 - pad * .35}" y="0" font-size="${fs}" text-anchor="middle" fill="var(--mut)" transform="rotate(-90 ${-pw / 2 - pad * .35} 0)">${fmt(ph)}</text></svg>`;
      out.push(`<figure><figcaption><b>${title}</b> · ${qty}× · ${fmt(pw)} × ${fmt(ph)} · ${fmt(title.includes('baffle') && S.dbl ? t : t)} thick${note ? ' · ' + note : ''}</figcaption>${s}${centres.length ? '<div class="cc">' + centres.join('<br>') + '</div>' : ''}</figure>`);
    };
    const tag = (arr, kind) => arr.map((q) => ({ ...q, kind }));
    panel(S.dbl ? 'Front baffle (2 layers)' : 'Front baffle', W, H, S.dbl ? 2 : 1, tag(lay.drivers, 'drv').concat(tag(lay.ports, 'port')), S.dbl ? 'cut both layers the same' : '');
    panel('Back', W, H, 1, tag(lay.rear, 'port'), '');
    panel('Top / bottom', W, dIn, 2, [], '');
    if (geo.sidePort) {
      const rel = (a) => a - (geo.sidePort === 'right' ? (tf - t) / 2 : (t - tf) / 2);
      panel(geo.sidePort === 'right' ? 'Right side' : 'Left side', dIn, H - 2 * t, 1, tag(lay.side.map((q) => ({ ...q, x: rel(q.x) })), 'port'), 'port cut-out');
      panel(geo.sidePort === 'right' ? 'Left side' : 'Right side', dIn, H - 2 * t, 1, [], '');
    } else panel('Sides', dIn, H - 2 * t, 2, [], '');
    if (g.Eng.isBP(S.type)) panel('Chamber divider', geo.Wi, geo.Hi, 1, tag(lay.divDrivers, 'drv'), 'driver mounts here');
    geo.portList.forEach(({ label, port }) => {
      if (port.kind !== 'slot') return;
      const segs = port.nSeg, plen = segs > 1 ? port.segLen : port.L;
      panel(label + ' slot wall', port.wSlot, plen, segs, [], segs > 1 ? 'folded: leave a turn gap of ' + fmt(port.hSlot) + ' at alternating ends' : 'forms the port channel');
      const longSide = port.vertical ? port.PH : port.PW;
      if (port.wSlot < longSide - 1) panel(label + ' slot cheeks', port.hSlot, plen, 2 * segs, [], '');
    });
    return out.join('');
  }
  g.View = { Chart, draw3d, baffleLayout, baffleSVG, sheetsSVG, planSVG, niceTicks };
})(window);
