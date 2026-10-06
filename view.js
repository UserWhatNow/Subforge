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
    const TH = { front: tf, rear: t, left: t, right: t, top: t, bottom: t }, cx = 0, cy = 0;
    const EX = geo.ext || { front: 0, rear: 0, left: 0, right: 0, top: 0, bottom: 0 }; // extra outside layers per face
    const OB = [-hx - EX.left, hx + EX.right, -hy - EX.bottom, hy + EX.top, -hz - EX.rear, hz + EX.front]; // overall outside
    const Wi = geo.Wi, Hi = geo.Hi, Di = geo.Di, zf = hz - tf, zb = -hz + TH.rear;
    const isBP = g.Eng.isBP, bp = isBP(S.type);
    const off = V.explode ? Math.max(w, h, d) * 0.32 : 0;
    const diag = Math.hypot(OB[1] - OB[0], OB[3] - OB[2], OB[5] - OB[4]) + off * 1.6, cam = diag * 2.4, sc = Math.min(cw, chh) * 0.78 / diag * V.zoom * cam;
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
      front: { o: [0, 0, hz + EX.front], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], th: tf + EX.front },
      back: { o: [0, 0, -hz - EX.rear], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], th: TH.rear + EX.rear },
      right: { o: [hx + EX.right, 0, 0], u: [0, 0, -1], v: [0, 1, 0], n: [-1, 0, 0], th: TH.right + EX.right },
      left: { o: [-hx - EX.left, 0, 0], u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0], th: TH.left + EX.left },
      top: { o: [0, hy + EX.top, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, -1, 0], th: TH.top + EX.top },
      bottom: { o: [0, -hy - EX.bottom, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], th: TH.bottom + EX.bottom },
    };
    FR.rear = FR.back;
    const PANEL_OF = { front: 'front', back: 'rear', left: 'left', right: 'right', top: 'top', bottom: 'bottom' };
    const onPanel = (id) => (lay.panels && lay.panels[PANEL_OF[id]]) || { drivers: [], ports: [] };
    Object.keys(dsp).forEach((k) => { const f = FR[k]; f.o = [f.o[0] + dsp[k][0], f.o[1] + dsp[k][1], f.o[2] + dsp[k][2]]; });
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
      const f = FR[id], P = onPanel(id);
      if (!bp) P.drivers.forEach((q) => driverDecal(f, q, f.th));
      P.ports.forEach((q) => portDecal(f, q, f.th));
    };
    // joint lines on the outside so the real panel thickness is visible (front/back full size, top/bottom full width, sides inset)
    const seams = (id) => {
      const ln = (a, b) => line3(a, b, 'rgba(0,0,0,.45)', 1), zi = hz - tf, zj = -hz + TH.rear, yt = hy - TH.top, yb = -hy + TH.bottom;
      // every layer boundary of the front and back shows on the top, bottom and sides; top / bottom layers show on the sides
      const zs = [], ys = [];
      for (let z = hz - t; z >= zi - 0.01; z -= t) zs.push(z);
      for (let z = -hz + t; z <= zj + 0.01; z += t) zs.push(z);
      for (let y = hy - t; y >= yt - 0.01; y -= t) ys.push(y);
      for (let y = -hy + t; y <= yb + 0.01; y += t) ys.push(y);
      if (id === 'top' || id === 'bottom') { const y = id === 'top' ? hy : -hy; zs.forEach((z) => ln([-hx, y, z], [hx, y, z])); }
      if (id === 'left' || id === 'right') { const x = id === 'left' ? -hx : hx; zs.forEach((z) => ln([x, yb, z], [x, yt, z])); ys.forEach((y) => ln([x, y, zj], [x, y, zi])); }
    };

    const hasP = S.type !== 'sealed' && geo.port;
    const prims = [];
    // ---- internals (shown in X-ray and exploded views)
    const internals = () => {
      // extra walls: solid panels at their real thickness (inside coordinates -> model coordinates)
      (geo.xwalls || []).forEach((w) => {
        const X = (x) => x - Wi / 2 + cx, Y = (y) => y - Hi / 2 + cy, Z = (z) => zf - z;
        prims.push({ z: Z((w.z0 + w.z1) / 2), f: () => slab(X(w.x0), X(w.x1), Y(w.y0), Y(w.y1), Z(w.z1), Z(w.z0), () => 'rgba(179,136,255,.32)', 'rgba(179,136,255,.95)', 1.2) });
      });
      geo.bracesList.forEach((b) => {
        const c0 = [b.x - Wi / 2 + cx, b.y - Hi / 2 + cy, zf - b.z];
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
      // slot built from a placed wall: the wall stands beside the opening on the side away from the box wall; cheeks close partial slots
      const wallSlot = (f, it, len) => {
        const fill = () => 'rgba(76,201,240,.34)', st = 'rgba(76,201,240,.95)';
        const a0 = it.x - it.w / 2, a1 = it.x + it.w / 2, b0 = it.y - it.h / 2, b1 = it.y + it.h / 2, d0 = f.th, d1 = f.th + len;
        if (it.side === 'left') slabF(f, a1, a1 + t, b0, b1, d0, d1, fill, st, 1.2);
        else if (it.side === 'right') slabF(f, a0 - t, a0, b0, b1, d0, d1, fill, st, 1.2);
        else if (it.side === 'bottom') slabF(f, a0, a1, b1, b1 + t, d0, d1, fill, st, 1.2);
        else slabF(f, a0, a1, b0 - t, b0, d0, d1, fill, st, 1.2);
        if (it.side === 'left' || it.side === 'right') { if (it.cheekLo) slabF(f, a0, a1, b0 - t, b0, d0, d1, fill, st, 1); if (it.cheekHi) slabF(f, a0, a1, b1, b1 + t, d0, d1, fill, st, 1); }
        else { if (it.cheekLo) slabF(f, a0 - t, a0, b0, b1, d0, d1, fill, st, 1); if (it.cheekHi) slabF(f, a1, a1 + t, b0, b1, d0, d1, fill, st, 1); }
      };
      // folded port: a serpentine of straight segments stacked away from the nearest box wall, joined by U-turns
      const foldedPort = (f, it, port, A, B) => {
        const fo = it.fold || port, n = fo.nSeg, pitch = fo.pitch, seg = fo.segLen, d0 = f.th, slot = it.shape === 'rect', horizontal = it.side ? it.side === 'top' || it.side === 'bottom' : !slot || it.w >= it.h;
        let dir;
        if (it.side) dir = it.side === 'left' || it.side === 'bottom' ? 1 : -1;
        else if (slot && !horizontal) dir = ((it.x - it.w / 2) + A) <= (A - (it.x + it.w / 2)) ? 1 : -1;
        else if (slot) dir = ((it.y - it.h / 2) + B) <= (B - (it.y + it.h / 2)) ? 1 : -1;
        else dir = it.y < 0 ? 1 : -1;
        // cheeks: placed walls know which ends are open; the older slots close every end that does not touch the box
        const cheekA0 = it.side ? (horizontal ? it.cheekLo : false) : (x) => x - it.w / 2 > -A + 1, cheekA1 = it.side ? (horizontal ? it.cheekHi : false) : (x) => x + it.w / 2 < A - 1;
        const cheekB0 = it.side ? (!horizontal ? it.cheekLo : false) : (y) => y - it.h / 2 > -B + 1, cheekB1 = it.side ? (!horizontal ? it.cheekHi : false) : (y) => y + it.h / 2 < B - 1;
        const has = (c, v) => (typeof c === 'function' ? c(v) : c);
        const fill = () => 'rgba(76,201,240,.34)', st = 'rgba(76,201,240,.95)';
        prims.push({ z: W3(f, it.x, it.y, d0 + seg / 2)[2], f: () => {
          for (let k = 0; k < n; k++) {
            const off = dir * k * pitch, x = it.x + (slot && !horizontal ? off : 0), y = it.y + (slot && !horizontal ? 0 : off), farTurn = k % 2 === 0;
            if (slot) {
              const sh = horizontal ? it.h : it.w, a0 = x - it.w / 2, a1 = x + it.w / 2, b0 = y - it.h / 2, b1 = y + it.h / 2;
              const z0 = k === n - 1 ? d0 : (farTurn ? d0 : d0 + sh), z1 = k === n - 1 ? d0 + seg : (farTurn ? d0 + seg - sh : d0 + seg);
              if (horizontal) { if (dir > 0) slabF(f, a0, a1, b1, b1 + t, z0, z1, fill, st, 1.2); else slabF(f, a0, a1, b0 - t, b0, z0, z1, fill, st, 1.2); if (has(cheekA0, x)) slabF(f, a0 - t, a0, b0, b1, d0, d0 + seg, fill, st, 1); if (has(cheekA1, x)) slabF(f, a1, a1 + t, b0, b1, d0, d0 + seg, fill, st, 1); }
              else { if (dir > 0) slabF(f, a1, a1 + t, b0, b1, z0, z1, fill, st, 1.2); else slabF(f, a0 - t, a0, b0, b1, z0, z1, fill, st, 1.2); if (has(cheekB0, y)) slabF(f, a0, a1, b0 - t, b0, d0, d0 + seg, fill, st, 1); if (has(cheekB1, y)) slabF(f, a0, a1, b1, b1 + t, d0, d0 + seg, fill, st, 1); }
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
        if ((it.fold && it.fold.nSeg > 1) || (!it.fold && port && port.nSeg > 1)) { foldedPort(f, it, port, A, B); return; }
        const zc = W3(f, it.x, it.y, f.th + len / 2)[2];
        prims.push({ z: zc, f: () => {
          if (it.shape === 'circle') {
            const a = circF(f, it.x, it.y, it.d / 2, f.th, 24), b = circF(f, it.x, it.y, it.d / 2, f.th + len, 24);
            for (let i = 0; i < 24; i += 3) { c.beginPath(); c.moveTo(a[i][0], a[i][1]); c.lineTo(b[i][0], b[i][1]); c.strokeStyle = 'rgba(76,201,240,.45)'; c.lineWidth = 1; c.stroke(); }
            poly(b, 'rgba(76,201,240,.12)', 'rgba(76,201,240,.8)', 1.2); poly(a, 'rgba(76,201,240,.18)', 'rgba(76,201,240,.9)', 1.5);
          } else if (it.side) wallSlot(f, it, len); else slotWalls(f, it, len, A, B);
        } });
      };
      if (hasP) {
        const p = geo.port;
        if (bp) { onPanel('front').ports.forEach((q) => tube(FR.front, q, Math.min(p.L, geo.Df - 10), Wi / 2, Hi / 2, p)); if (geo.port2) onPanel('back').ports.forEach((q) => tube(FR.back, q, Math.min(geo.port2.L, geo.Dr - 10), Wi / 2, Hi / 2, geo.port2)); }
        else {
          const pid = lay.portPanel || 'front', fr = g.Eng.panelFrame(S, geo, pid), id = pid === 'rear' ? 'back' : pid;
          onPanel(id).ports.forEach((q) => tube(FR[id], q, Math.min(p.L, fr.depth - 10), fr.iw / 2, fr.ih / 2, p));
        }
      }
      if (bp) {
        const zd = zf - geo.Df;
        prims.push({ z: zd, f: () => {
          slab(cx - Wi / 2, cx + Wi / 2, cy - Hi / 2, cy + Hi / 2, zd - t, zd,() => 'rgba(200,200,220,.14)', 'rgba(255,255,255,.55)', 1.2);
          const fd = { o: [cx, cy, zd], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], th: t };
          lay.divDrivers.forEach((q) => driverDecal(fd, q, t));
        } });
      } else {
        const pid = lay.drvPanel || 'front', id = pid === 'rear' ? 'back' : pid, f = FR[id], th = f.th;
        const dep = Math.min(S.driver.depth > 0 ? S.driver.depth : 120, g.Eng.panelFrame(S, geo, pid).depth * 0.95);
        onPanel(id).drivers.forEach((q) => {
          prims.push({ z: W3(f, q.x, q.y, th + dep / 2)[2], f: () => {
            const a = circF(f, q.x, q.y, q.d / 2, th, 24), bb = circF(f, q.x, q.y, q.d * 0.42, th + dep * 0.45, 24), m = circF(f, q.x, q.y, q.d * 0.24, th + dep, 20);
            for (let i = 0; i < 24; i += 4) { c.beginPath(); c.moveTo(a[i][0], a[i][1]); c.lineTo(bb[i][0], bb[i][1]); c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1; c.stroke(); }
            poly(bb, 'rgba(255,255,255,.06)', 'rgba(255,255,255,.4)', 1); poly(m, 'rgba(20,20,26,.7)', 'rgba(255,255,255,.5)', 1);
          } });
        });
      }
    };

    const panelBoxes = () => {
      const zi = hz - tf, zj = -hz + TH.rear, yt = hy - TH.top, yb = -hy + TH.bottom, e = off;
      return [
        { id: 'front', b: [-hx, hx, -hy, hy, zi + e, hz + e], c: [0, 0, hz + e] },
        { id: 'back', b: [-hx, hx, -hy, hy, -hz - e, zj - e], c: [0, 0, -hz - e] },
        { id: 'top', b: [-hx, hx, yt + e, hy + e, zj, zi], c: [0, hy + e, 0] },
        { id: 'bottom', b: [-hx, hx, -hy - e, yb - e, zj, zi], c: [0, -hy - e, 0] },
        { id: 'left', b: [-hx - e, -hx + TH.left - e, yb, yt, zj, zi], c: [-hx - e, 0, 0] },
        { id: 'right', b: [hx - TH.right + e, hx + e, yb, yt, zj, zi], c: [hx + e, 0, 0] },
      ];
    };

    // extra outside layers: one slab per board, each with its own outline (k = 1 is the board next to the box)
    const EXID = { front: 'front', back: 'rear', top: 'top', bottom: 'bottom', left: 'left', right: 'right' };
    const layerSlabs = () => {
      const out = [];
      Object.keys(EXID).forEach((id) => {
        const n = Math.round(EX[EXID[id]] / t), e = dsp[id];
        for (let k = 1; k <= n; k++) {
          const a = (k - 1) * t, b = k * t;
          const bx = { front: [-hx, hx, -hy, hy, hz + a, hz + b], back: [-hx, hx, -hy, hy, -hz - b, -hz - a], top: [-hx, hx, hy + a, hy + b, -hz, hz], bottom: [-hx, hx, -hy - b, -hy - a, -hz, hz], left: [-hx - b, -hx - a, -hy, hy, -hz, hz], right: [hx + a, hx + b, -hy, hy, -hz, hz] }[id];
          const q = [bx[0] + e[0], bx[1] + e[0], bx[2] + e[1], bx[3] + e[1], bx[4] + e[2], bx[5] + e[2]];
          out.push({ id, outer: k === n, b: q, c: [(q[0] + q[1]) / 2, (q[2] + q[3]) / 2, (q[4] + q[5]) / 2] });
        }
      });
      return out;
    };
    const OUTN = { front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] };
    const facing = (id) => toCam(OUTN[id], [OUTN[id][0] * (hx + EX.right), OUTN[id][1] * (hy + EX.top), OUTN[id][2] * (hz + EX.front)]);
    const drawLayer = (l, fill, stroke) => { slab(l.b[0], l.b[1], l.b[2], l.b[3], l.b[4], l.b[5], fill, stroke, 1.1); };
    const hasEx = (id) => EX[EXID[id]] > 0;

    if (!V.xray && !V.explode) {
      const LS = layerSlabs(), lfill = (sh) => rgb(sh * 0.94), lst = 'rgba(0,0,0,.55)';
      LS.filter((l) => !facing(l.id)).forEach((l) => drawLayer(l, lfill, lst));
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
      faces.filter((f) => f.vis).sort((a, b) => a.depth - b.depth).forEach((f) => { poly(f.p, f.col, 'rgba(255,255,255,.18)', 1); seams(f.id); if (!hasEx(f.id)) decalsFor(f.id); });
      LS.filter((l) => facing(l.id)).sort((a, b) => rot(a.c)[2] - rot(b.c)[2]).forEach((l) => { drawLayer(l, lfill, lst); if (l.outer) decalsFor(l.id); });
    } else {
      const opaque = !!V.explode;
      internals();
      panelBoxes().forEach((p) => {
        prims.push({ z: p.c[2] + p.c[0] * 0.001, f: () => {
          slab(p.b[0], p.b[1], p.b[2], p.b[3], p.b[4], p.b[5], opaque ? (sh) => rgb(sh) : (sh) => rgb(0.6 + sh * 0.6, 0.2), opaque ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.4)', 1);
          if (opaque && !hasEx(p.id)) decalsFor(p.id);
        } });
      });
      layerSlabs().forEach((l) => prims.push({ z: l.c[2] + l.c[0] * 0.001, f: () => {
        drawLayer(l, opaque ? (sh) => rgb(sh * 0.94) : (sh) => rgb(0.55 + sh * 0.6, 0.22), opaque ? 'rgba(0,0,0,.6)' : 'rgba(255,214,120,.75)');
        if (opaque && l.outer) decalsFor(l.id);
      } }));
      prims.sort((a, b) => rot([0, 0, a.z])[2] - rot([0, 0, b.z])[2]).forEach((p) => p.f());
      const outN = { front: [[0, 0, 1], [0, 0, hz]], back: [[0, 0, -1], [0, 0, -hz]], right: [[1, 0, 0], [hx, 0, 0]], left: [[-1, 0, 0], [-hx, 0, 0]], top: [[0, 1, 0], [0, hy, 0]], bottom: [[0, -1, 0], [0, -hy, 0]] };
      if (!opaque) panelBoxes().forEach((p) => { if (toCam(outN[p.id][0], outN[p.id][1])) decalsFor(p.id); });
    }

    // ---- dimension labels
    if (V.dims && V.dimText) {
      const mg = Math.max(w, h, d) * 0.07 + off * 0.3, [X0, X1, Y0, Y1, Z0, Z1] = OB;
      const dimLine = (a, b, txt) => {
        line3(a, b, 'rgba(255,176,0,.95)', 1.4);
        const pa = proj(a), pb = proj(b), dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len * 5, ny = dx / len * 5;
        [pa, pb].forEach((p) => { c.beginPath(); c.moveTo(p[0] - nx, p[1] - ny); c.lineTo(p[0] + nx, p[1] + ny); c.strokeStyle = 'rgba(255,176,0,.95)'; c.lineWidth = 1.4; c.stroke(); });
        const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
        c.font = '600 12px "Segoe UI",sans-serif'; const tw = c.measureText(txt).width + 10;
        c.fillStyle = 'rgba(15,17,23,.88)'; c.fillRect(mx - tw / 2, my - 10, tw, 20); c.fillStyle = '#ffd27a'; c.textAlign = 'center'; c.fillText(txt, mx, my + 4);
      };
      dimLine([X0, Y0 - mg, Z1 + mg * 0.4], [X1, Y0 - mg, Z1 + mg * 0.4], V.dimText.w);
      dimLine([X1 + mg, Y0, Z1 + mg * 0.4], [X1 + mg, Y1, Z1 + mg * 0.4], V.dimText.h);
      dimLine([X1 + mg, Y0 - mg * 0.6, Z1], [X1 + mg, Y0 - mg * 0.6, Z0], V.dimText.d);
    }
    c.fillStyle = BGS[V.bg] && V.bg !== 'black' && V.bg !== 'gray' && V.bg !== 'green' ? '#444' : css('--mut'); c.font = '12px "Segoe UI",sans-serif'; c.textAlign = 'right';
    if (BGS[V.bg] && (V.bg === 'gray' || V.bg === 'green' || V.bg === 'black')) c.fillStyle = 'rgba(255,255,255,.75)';
    c.fillText(V.label || '', cw - 10, chh - 8);
  }

  /* ================= baffle layout ================= */
  const PNAME = { front: 'front', rear: 'back', left: 'left side', right: 'right side', top: 'top', bottom: 'bottom' };
  // slot openings of a wall-built slot port, in panel coordinates (centre of the outer face), with the footprint of wall + fold stack
  function slotItems(port, fr, t) {
    return port.slots.map((s) => {
      const k = Math.max(s.stack, s.gap + t), a0 = fr.a0, b0 = fr.b0;
      const f = s.side === 'left' ? [s.x0, s.x0 + k, s.y0, s.y1] : s.side === 'right' ? [s.x1 - k, s.x1, s.y0, s.y1] : s.side === 'bottom' ? [s.x0, s.x1, s.y0, s.y0 + k] : [s.x0, s.x1, s.y1 - k, s.y1];
      return { shape: 'rect', slot: true, x: a0 + (s.x0 + s.x1) / 2, y: b0 + (s.y0 + s.y1) / 2, w: s.w, h: s.h, side: s.side, gap: s.gap, cheekLo: s.cheekLo, cheekHi: s.cheekHi, fold: { nSeg: s.nSeg, segLen: s.segLen, pitch: s.pitch }, foot: [a0 + f[0], a0 + f[1], b0 + f[2], b0 + f[3]] };
    });
  }
  function baffleLayout(S, geo) {
    const W = S.dims.w, H = S.dims.h, m = 20, lo = S.layout, gap = Math.max(10, lo.gap), pgap = 12, warn = [];
    const E = g.Eng, bp = E.isBP(S.type), six = S.type === 'bandpass6';
    const p = geo.port, dp = E.drvPanel(S), pp = p ? E.portPanel(S) : null, front = !!p && pp === 'front';
    const cut = S.driver.cut, n = S.n, place0 = S.port.place || 'auto';
    const box = (q) => { if (q.foot) return q.foot; const r = (q.outD || q.d) / 2; return q.shape === 'rect' ? [q.x - q.w / 2, q.x + q.w / 2, q.y - q.h / 2, q.y + q.h / 2] : [q.x - r, q.x + r, q.y - r, q.y + r]; };
    const portGroup = (pt, stack) => {
      if (pt.kind === 'slot') { const w = pt.vertical ? pt.hSlot : pt.wSlot, h = pt.vertical ? pt.wSlot : pt.hSlot; return { w, h, items: [{ shape: 'rect', x: 0, y: 0, w, h }] }; }
      const o = pt.outD, k = pt.n, tot = k * o + (k - 1) * pgap, items = [];
      for (let i = 0; i < k; i++) items.push(stack === 'col' ? { shape: 'circle', x: 0, y: tot / 2 - o / 2 - i * (o + pgap), d: pt.dia, outD: o } : { shape: 'circle', x: -tot / 2 + o / 2 + i * (o + pgap), y: 0, d: pt.dia, outD: o });
      return stack === 'col' ? { w: o, h: tot, items } : { w: tot, h: o, items };
    };
    const shift = (items, dx, dy) => items.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy }));
    // drivers in a row, a column, or a grid of rows (e.g. 2 on 2): 'grid' uses the chosen drivers per row, 'grid:3' a fixed count
    const driverGroup = (dir) => {
      if (String(dir).indexOf('grid') === 0) {
        const cols = Math.max(1, Math.min(n, dir === 'grid' ? Math.round(lo.cols) || 2 : +dir.slice(5))), rows = Math.ceil(n / cols), items = [];
        const w = cols * cut + (cols - 1) * gap, h = rows * cut + (rows - 1) * gap;
        for (let r = 0; r < rows; r++) {
          const k = Math.min(cols, n - r * cols), rw = k * cut + (k - 1) * gap;
          for (let i = 0; i < k; i++) items.push({ shape: 'circle', x: -rw / 2 + cut / 2 + i * (cut + gap), y: h / 2 - cut / 2 - r * (cut + gap), d: cut });
        }
        return { w, h, items };
      }
      const tot = n * cut + (n - 1) * gap, items = [];
      for (let i = 0; i < n; i++) items.push(dir === 'col' ? { shape: 'circle', x: 0, y: tot / 2 - cut / 2 - i * (cut + gap), d: cut } : { shape: 'circle', x: -tot / 2 + cut / 2 + i * (cut + gap), y: 0, d: cut });
      return dir === 'col' ? { w: cut, h: tot, items } : { w: tot, h: cut, items };
    };
    // group centre: automatic inside the free area, or where the user put it (measured from the panel's left / bottom edge)
    const placeDrivers = (dir, x0, x1, y0, y1, PW, PH) => {
      const gd = driverGroup(dir), fx = x1 - x0 - gd.w, fy = y1 - y0 - gd.h;
      let cx0 = fx >= 0 ? x0 + gd.w / 2 + fx * lo.align / 100 : (x0 + x1) / 2;
      let cy0 = fy >= 0 ? y0 + gd.h / 2 + fy * (dir === 'col' ? lo.align / 100 : 0.5) : (y0 + y1) / 2;
      if (lo.dx != null && PW) cx0 = lo.dx - PW / 2;
      if (lo.dy != null && PH) cy0 = lo.dy - PH / 2;
      return shift(gd.items, cx0, cy0);
    };
    // inside the panel margin and clear of each other; wall-built slots are placed inside the box by construction (the engine checks them against each other)
    const fits = (list, RW, RH) => {
      for (const q of list) { if (q.slot) continue; const b = box(q); if (b[0] < -RW / 2 + m * 0.75 || b[1] > RW / 2 - m * 0.75 || b[2] < -RH / 2 + m * 0.75 || b[3] > RH / 2 - m * 0.75) return false; }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { if (list[i].slot && list[j].slot) continue; const A = box(list[i]), B = box(list[j]); if (A[0] < B[1] + 4 && B[0] < A[1] + 4 && A[2] < B[3] + 4 && B[2] < A[3] + 4) return false; }
      return true;
    };
    // cut-outs on the side, top and bottom panels must also stay clear of the panels they butt against
    const inside = (list, fr) => list.every((q) => { const b = box(q); return b[0] >= fr.a0 - 0.01 && b[1] <= fr.a1 + 0.01 && b[2] >= fr.b0 - 0.01 && b[3] <= fr.b1 + 0.01; });
    const cxy = (RW, RH) => ({ x: lo.px != null ? lo.px - RW / 2 : 0, y: lo.py != null ? lo.py - RH / 2 : 0 });

    // ---- one panel: its port (if it opens here) and, on the driver panel, the drivers in the space that is left
    const tryPanel = (pid, place, dir, shrink) => {
      const fr = E.panelFrame(S, geo, pid), PW = fr.PW, PH = fr.PH, hasD = pid === dp;
      const port = p && pp === pid ? p : six && pid === 'rear' ? geo.port2 : null, main = port && port === p;
      let x0 = -PW / 2 + m, x1 = PW / 2 - m, y0 = -PH / 2 + m, y1 = PH / 2 - m, ports = [];
      if (port && port.slots) {
        ports = slotItems(port, fr, S.t);
        if (hasD && shrink) ports.forEach((q) => { const f = q.foot; if (q.side === 'left') x0 = Math.max(x0, f[1] + gap); else if (q.side === 'right') x1 = Math.min(x1, f[0] - gap); else if (q.side === 'bottom') y0 = Math.max(y0, f[3] + gap); else y1 = Math.min(y1, f[2] - gap); });
      } else if (port) {
        if (main && place === 'custom') ports = shift(portGroup(port, 'row').items, cxy(PW, PH).x, cxy(PW, PH).y);
        else if (!hasD && !(bp && pid === 'front' && place !== 'auto')) ports = portGroup(port, 'row').items;
        else {
          const side = place === 'auto' ? 'right' : place, pg = portGroup(port, side === 'left' || side === 'right' ? 'col' : 'row');
          if (side === 'right') { ports = shift(pg.items, PW / 2 - m - pg.w / 2, 0); x1 = PW / 2 - m - pg.w - gap; }
          else if (side === 'left') { ports = shift(pg.items, -PW / 2 + m + pg.w / 2, 0); x0 = -PW / 2 + m + pg.w + gap; }
          else if (side === 'below') { ports = shift(pg.items, 0, -PH / 2 + m + pg.h / 2); y0 = -PH / 2 + m + pg.h + gap; }
          else { ports = shift(pg.items, 0, PH / 2 - m - pg.h / 2); y1 = PH / 2 - m - pg.h - gap; }
        }
      }
      const drivers = hasD ? placeDrivers(dir, x0, x1, y0, y1, PW, PH) : [];
      const ok = fits(drivers.concat(ports), PW, PH) && (!hasD || pid === 'front' || pid === 'rear' || inside(drivers, fr));
      return { drivers, ports, place, ok };
    };
    const res = {};
    E.PANELS.forEach((pid) => { if (pid !== dp) res[pid] = tryPanel(pid, place0, 'row', true); });
    let best = null;
    if (dp) {
      const fr = E.panelFrame(S, geo, dp), slotsHere = p && pp === dp && p.slots;
      const places = p && pp === dp && !slotsHere ? (place0 === 'auto' ? ['right', 'left', 'below', 'above'] : [place0]) : [place0];
      const dirs = lo.dir === 'auto' ? (fr.PW >= fr.PH ? ['row', 'col'] : ['col', 'row']) : [lo.dir];
      // grids are tried only when no single row or column fits, so existing layouts stay as they were
      const grids = lo.dir === 'auto' && n >= 3 ? [...new Set([Math.ceil(Math.sqrt(n)), Math.ceil(n / 2)])].map((c) => 'grid:' + c) : [];
      const cands = [];
      [dirs, grids].forEach((ds) => (slotsHere ? [true, false] : [true]).forEach((sh) => places.forEach((pl) => ds.forEach((d) => cands.push([pl, d, sh])))));
      for (const [pl, d, sh] of cands) { const c = tryPanel(dp, pl, d, sh); if (!best) best = c; if (c.ok) { best = c; break; } }
      res[dp] = best;
    } else best = res.front;

    // ---- divider drivers (band-pass)
    let divDrivers = [], okDiv = true;
    if (bp) {
      const Wi = geo.Wi, Hi = geo.Hi, dirs = lo.dir === 'auto' ? (W >= H ? ['row', 'col'] : ['col', 'row']) : [lo.dir];
      for (const d of dirs) { const dr = placeDrivers(d, -Wi / 2 + m, Wi / 2 - m, -Hi / 2 + m, Hi / 2 - m); if (!divDrivers.length) divDrivers = dr; if (fits(dr, Wi, Hi)) { divDrivers = dr; okDiv = true; break; } okDiv = false; }
    }

    const head = dp || 'front';
    if (!best.ok) {
      if (head === 'front') warn.push(front && !bp ? 'Driver cut-outs and front port do not fit on the baffle. Try another port side, fewer/smaller ports, a smaller driver gap, or a larger baffle.' : bp ? 'The front port does not fit on the baffle.' : 'Driver cut-outs do not fit on the baffle. Try a smaller driver gap, another arrangement, or a larger baffle.');
      else warn.push(pp === head ? `Driver cut-outs and the port do not fit on the ${PNAME[head]} panel. Try another port position, fewer/smaller ports, a smaller driver gap, or a larger panel.` : `Driver cut-outs do not fit on the ${PNAME[head]} panel. Try a smaller driver gap, another arrangement, or a larger panel.`);
    }
    const okOf = (id) => id === head || res[id].ok;
    if (!okOf('rear')) warn.push('Rear port does not fit on the back panel.');
    ['left', 'right'].forEach((id) => { if (!okOf(id)) warn.push('The side port does not fit on the side panel.'); });
    ['top', 'bottom'].forEach((id) => { if (!okOf(id)) warn.push(`The port does not fit on the ${id} panel.`); });
    if (!okDiv) warn.push('Drivers do not fit on the chamber divider.');
    const ok = E.PANELS.every(okOf) && best.ok && okDiv;
    return { drivers: res.front.drivers, divDrivers, ports: res.front.ports, rear: res.rear.ports, side: geo.sidePort ? res[geo.sidePort].ports : [], sideFace: geo.sidePort || null, ok, warn, place: best.place, panels: res, drvPanel: dp, portPanel: pp };
  }
  function baffleSVG(S, geo, lay, fmt) {
    const pid = lay.drvPanel || 'front', fr = g.Eng.panelFrame(S, geo, pid), here = (lay.panels && lay.panels[pid]) || { drivers: lay.drivers, ports: lay.ports };
    const W = fr.PW, H = fr.PH, pad = Math.max(W, H) * 0.1, fs = Math.max(W, H) / 26;
    let s = `<svg viewBox="${-W / 2 - pad} ${-H / 2 - pad} ${W + pad * 2} ${H + pad * 2}" role="img" aria-label="${pid === 'front' ? 'Baffle layout' : 'Layout of the ' + PNAME[pid] + ' panel'}">`;
    s += `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" rx="4" fill="var(--panel)" stroke="${lay.ok ? 'var(--fg)' : 'var(--bad)'}" stroke-width="${fs / 12}"/>`;
    const Y = (y) => -y;
    // placed slot walls, seen through the panel (dashed)
    here.ports.forEach((q) => {
      if (!q.side) return;
      const t = S.t, a0 = q.x - q.w / 2, a1 = q.x + q.w / 2, b0 = q.y - q.h / 2, b1 = q.y + q.h / 2;
      const r = q.side === 'left' ? [a1, a1 + t, b0, b1] : q.side === 'right' ? [a0 - t, a0, b0, b1] : q.side === 'bottom' ? [a0, a1, b1, b1 + t] : [a0, a1, b0 - t, b0];
      s += `<rect x="${r[0]}" y="${Y(r[3])}" width="${r[1] - r[0]}" height="${r[3] - r[2]}" fill="var(--acc2)" fill-opacity=".25" stroke="var(--acc2)" stroke-dasharray="${fs / 4} ${fs / 6}" stroke-width="${fs / 20}"/>`;
    });
    here.drivers.forEach((q) => { s += `<circle cx="${q.x}" cy="${Y(q.y)}" r="${q.d / 2}" fill="var(--bg)" stroke="var(--acc)" stroke-width="${fs / 14}"/><circle cx="${q.x}" cy="${Y(q.y)}" r="${q.d * .36}" fill="none" stroke="var(--mut)" stroke-width="${fs / 20}"/><text x="${q.x}" y="${Y(q.y) + fs * .35}" font-size="${fs * .9}" text-anchor="middle" fill="var(--fg)">Ø${fmt(q.d)}</text>`; });
    here.ports.forEach((q) => {
      if (q.shape === 'rect') s += `<rect x="${q.x - q.w / 2}" y="${Y(q.y) - q.h / 2}" width="${q.w}" height="${q.h}" fill="var(--bg)" stroke="var(--acc2)" stroke-width="${fs / 14}"/><text x="${q.x}" y="${Y(q.y) + fs * .3}" font-size="${fs * .8}" text-anchor="middle" fill="var(--fg)" ${q.h > q.w * 2 ? `transform="rotate(-90 ${q.x} ${Y(q.y)})"` : ''}>${fmt(q.w)} × ${fmt(q.h)}</text>`;
      else s += `<circle cx="${q.x}" cy="${Y(q.y)}" r="${q.d / 2}" fill="var(--bg)" stroke="var(--acc2)" stroke-width="${fs / 14}"/><text x="${q.x}" y="${Y(q.y) + fs * .3}" font-size="${fs * .8}" text-anchor="middle" fill="var(--fg)">Ø${fmt(q.d)}</text>`;
    });
    s += `<text x="0" y="${H / 2 + pad * 0.7}" font-size="${fs}" text-anchor="middle" fill="var(--mut)">${fmt(W)}</text>`;
    s += `<text x="${-W / 2 - pad * 0.3}" y="0" font-size="${fs}" text-anchor="middle" fill="var(--mut)" transform="rotate(-90 ${-W / 2 - pad * 0.3} 0)">${fmt(H)}</text>`;
    const notes = [];
    if (pid !== 'front') notes.push(PNAME[pid] + ' panel, seen from outside' + (pid === 'top' ? ' (front edge at the bottom)' : pid === 'bottom' ? ' (back edge at the bottom)' : ''));
    if (g.Eng.isBP(S.type)) notes.push('drivers are on the internal divider');
    if (S.type === 'bandpass6') notes.push('rear port is on the back panel');
    else if (lay.portPanel && lay.portPanel !== pid && !g.Eng.isBP(S.type)) notes.push(lay.portPanel === 'rear' ? 'rear port is on the back panel' : 'port is on the ' + PNAME[lay.portPanel] + ' panel');
    notes.forEach((txt, i) => { s += `<text x="0" y="${-H / 2 + fs * (1.6 + i * 1.1)}" font-size="${fs * .8}" text-anchor="middle" fill="var(--mut)">${txt}</text>`; });
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
    const panel = (title, pw, ph, qty, holes, note, lab) => {
      lab = lab || ['up from the bottom', 'from the left'];
      const pad = Math.max(pw, ph) * 0.13, fs = Math.max(pw, ph) / 22;
      let s = `<svg viewBox="${-pw / 2 - pad} ${-ph / 2 - pad} ${pw + 2 * pad} ${ph + 2 * pad}"><rect x="${-pw / 2}" y="${-ph / 2}" width="${pw}" height="${ph}" fill="var(--panel)" stroke="var(--fg)" stroke-width="${fs / 14}"/>`;
      const centres = [];
      let nd = 0, np = 0;
      holes.forEach((q) => { s += holeSvg(q, fs, q.kind === 'port' ? 'var(--acc2)' : 'var(--acc)'); });
      // centre of every cut-out, measured from the bottom edge up (and from the left edge across)
      holes.forEach((q) => {
        if (q.kind === 'port') return; // only driver cut-outs are dimensioned
        const yb = q.y + ph / 2, xl = q.x + pw / 2, cy = -q.y, by = ph / 2, tk = fs * 0.28, cr = fs * 0.4;
        centres.push(`${q.kind === 'port' ? 'Port ' + (++np) : 'Driver ' + (++nd)}: <b>${fmt(yb)}${unit || ''}</b> ${lab[0]} · ${fmt(xl)}${unit || ''} ${lab[1]}`);
        s += `<g stroke="var(--fg)" stroke-width="${fs / 16}" fill="none"><line x1="${q.x}" y1="${by}" x2="${q.x}" y2="${cy}" stroke-dasharray="${fs / 3} ${fs / 5}"/><line x1="${q.x - tk}" y1="${by}" x2="${q.x + tk}" y2="${by}"/><line x1="${q.x - cr}" y1="${cy}" x2="${q.x + cr}" y2="${cy}"/><line x1="${q.x}" y1="${cy - cr}" x2="${q.x}" y2="${cy + cr}"/></g>`;
        const my = (by + cy) / 2, txt = fmt(yb) + (unit || '');
        s += `<text x="${q.x + fs * 0.25}" y="${my + fs * 0.3}" font-size="${fs * 0.78}" fill="var(--acc-text)" stroke="var(--panel2)" stroke-width="${fs / 5}" paint-order="stroke" font-weight="700">${txt}</text>`;
      });
      s += `<text x="0" y="${ph / 2 + pad * .7}" font-size="${fs}" text-anchor="middle" fill="var(--mut)">${fmt(pw)}</text><text x="${-pw / 2 - pad * .35}" y="0" font-size="${fs}" text-anchor="middle" fill="var(--mut)" transform="rotate(-90 ${-pw / 2 - pad * .35} 0)">${fmt(ph)}</text></svg>`;
      out.push(`<figure><figcaption><b>${title}</b> · ${qty}× · ${fmt(pw)} × ${fmt(ph)} · ${fmt(t)} thick${note ? ' · ' + note : ''}</figcaption>${s}${centres.length ? '<div class="cc">' + centres.join('<br>') + '</div>' : ''}</figure>`);
    };
    const tag = (arr, kind) => arr.map((q) => ({ ...q, kind }));
    const bp = g.Eng.isBP(S.type), dp = lay.drvPanel || (bp ? null : 'front');
    const P = (id) => (lay.panels && lay.panels[id]) || { drivers: id === 'front' ? lay.drivers : [], ports: id === 'front' ? lay.ports : id === 'rear' ? lay.rear : id === lay.sideFace ? lay.side : [] };
    // holes of one panel, moved from the outer-face centre to the centre of the cut piece (top, bottom and sides sit between front and back)
    const shiftOf = { front: [0, 0], rear: [0, 0], top: [0, (tf - t) / 2], bottom: [0, (t - tf) / 2], left: [(t - tf) / 2, 0], right: [(tf - t) / 2, 0] };
    const holes = (id) => tag(bp ? [] : P(id).drivers, 'drv').concat(tag(P(id).ports, 'port')).map((q) => ({ ...q, x: q.x - shiftOf[id][0], y: q.y - shiftOf[id][1] }));
    const what = (id) => { const d = P(id).drivers.length && !bp, pt = P(id).ports.length; return d && pt ? 'driver & port cut-outs' : d ? 'driver cut-outs' : pt ? 'port cut-out' : ''; };
    const LAB = { front: null, rear: ['up from the bottom', 'from the left (seen from behind)'], top: ['from the front edge', 'from the left'], bottom: ['from the back edge', 'from the left'], left: ['up from the bottom', 'from the back edge'], right: ['up from the bottom', 'from the front edge'] };
    const VIEW = { rear: 'seen from behind', top: 'seen from above, front edge at the bottom', bottom: 'seen from below, back edge at the bottom', left: 'seen from the left, front edge on the right', right: 'seen from the right, front edge on the left' };
    const noteOf = (id) => [what(id), what(id) ? VIEW[id] : ''].filter(Boolean).join(' · ');
    panel((dp === 'front' || bp ? 'Front baffle' : 'Front') + (S.dbl ? ' (2 layers)' : ''), W, H, S.dbl ? 2 : 1, holes('front'), S.dbl ? 'cut both layers the same' : '');
    panel('Back', W, H, 1, holes('rear'), noteOf('rear'), LAB.rear);
    const pair = (a, b, nameA, nameB, both, pw, ph) => {
      const ha = holes(a), hb = holes(b);
      if (!ha.length && !hb.length) { panel(both, pw, ph, 2, [], ''); return; }
      const first = ha.length || !hb.length ? [a, nameA, ha] : [b, nameB, hb], second = first[0] === a ? [b, nameB, hb] : [a, nameA, ha];
      [first, second].forEach(([id, nm, h]) => panel(nm, pw, ph, 1, h, noteOf(id), LAB[id]));
    };
    pair('top', 'bottom', 'Top', 'Bottom', 'Top / bottom', W, dIn);
    pair('left', 'right', 'Left side', 'Right side', 'Sides', dIn, H - 2 * t);
    // extra outside layers cover the whole face of the box, so their cut-outs sit where the face's own are (no shift)
    const face = { front: [W, H], rear: [W, H], top: [W, D], bottom: [W, D], left: [D, H], right: [D, H] };
    const LN = { front: 'Front', rear: 'Back', top: 'Top', bottom: 'Bottom', left: 'Left side', right: 'Right side' };
    g.Eng.PANELS.forEach((id) => {
      const n = g.Eng.layerCount(S, id); if (!n) return;
      const h = tag(bp ? [] : P(id).drivers, 'drv').concat(tag(P(id).ports, 'port'));
      panel(LN[id] + ' outer layer', face[id][0], face[id][1], n, h, ['glued on the outside', h.length ? 'same cut-outs as the panel under it' : '', VIEW[id] && h.length ? VIEW[id] : ''].filter(Boolean).join(' · '), LAB[id]);
    });
    if (g.Eng.isBP(S.type)) panel('Chamber divider', geo.Wi, geo.Hi, 1, tag(lay.divDrivers, 'drv'), 'driver mounts here');
    (geo.xwalls || []).forEach((w) => panel('Extra wall ' + (w.i + 1), w.s1, w.s2, 1, [], g.Eng.xwallWhere(w, (v) => fmt(v) + (unit || ''))));
    geo.portList.forEach(({ label, port }) => {
      if (port.kind !== 'slot') return;
      if (port.slots) {
        port.slots.forEach((s, i) => {
          const tg = port.slots.length > 1 ? ' ' + (i + 1) : '', segs = s.nSeg, plen = segs > 1 ? s.segLen : port.L, ch = (s.cheekLo ? 1 : 0) + (s.cheekHi ? 1 : 0);
          panel(label + ' slot wall' + tg, s.span, plen, segs, [], (segs > 1 ? 'folded: leave a turn gap of ' + fmt(s.gap) + ' at alternating ends' : 'forms the port channel') + ' · stands ' + fmt(s.gap) + (unit || '') + ' from the ' + PNAME[s.along] + ' panel');
          if (ch) panel(label + ' slot cheeks' + tg, s.gap, plen, ch * segs, [], 'close the ends of the slot');
        });
        return;
      }
      const segs = port.nSeg, plen = segs > 1 ? port.segLen : port.L;
      panel(label + ' slot wall', port.wSlot, plen, segs, [], segs > 1 ? 'folded: leave a turn gap of ' + fmt(port.hSlot) + ' at alternating ends' : 'forms the port channel');
      const longSide = port.vertical ? port.PH : port.PW;
      if (port.wSlot < longSide - 1) panel(label + ' slot cheeks', port.hSlot, plen, 2 * segs, [], '');
    });
    return out.join('');
  }
  g.View = { Chart, draw3d, baffleLayout, baffleSVG, sheetsSVG, planSVG, niceTicks, PNAME };
})(window);
