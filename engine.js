'use strict';
/* SubForge engine: lumped-parameter loudspeaker/enclosure model, geometry, alignment search, sheet nesting.
   Pure functions, no DOM. Units: SI inside the model (m, m^3, Pa), mm / litres at the interface. */
(function (g) {
  const RHO = 1.204, C = 343.2, TAU = 2 * Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- tiny complex helpers ---------- */
  const cx = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    inv: (a) => { const d = a[0] * a[0] + a[1] * a[1]; return [a[0] / d, -a[1] / d]; },
    neg: (a) => [-a[0], -a[1]],
    abs: (a) => Math.hypot(a[0], a[1]),
    arg: (a) => Math.atan2(a[1], a[0]),
  };

  const grid = (f0, f1, n) => Array.from({ length: n }, (_, i) => f0 * Math.pow(f1 / f0, i / (n - 1)));

  /* ---------- driver ---------- */
  function validDriver(d) {
    return d.fs > 0 && d.qes > 0 && (d.qms > 0 || (d.qts > 0 && d.qts < d.qes)) && d.vas > 0 && d.sd > 0 && d.re > 0 && d.xmax > 0 && d.pe > 0;
  }
  // dual voice coil: re / le are per coil. Series = 2x R and 4x L (coupled coils), parallel = R/2 and L. Qes, Qts, Vas, Fs and Sd do not depend on the wiring.
  function coilFactors(d) {
    if (d.vc !== 'dual') return { r: 1, l: 1 };
    return d.wire === 'parallel' ? { r: 0.5, l: 1 } : { r: 2, l: 4 };
  }
  function makeDriver(d) {
    const kf = coilFactors(d), reE = d.re * kf.r, leE = (d.le || 0) * kf.l;
    const ws = TAU * d.fs, Sd = d.sd * 1e-4;
    const Cms = (d.vas / 1000) / (RHO * C * C * Sd * Sd);
    const Mms = 1 / (ws * ws * Cms);
    // Qms entered directly is more accurate than deriving it from the rounded Qes/Qts on datasheets; Qts then follows from Qes and Qms
    const hasQms = d.qms > 0, Qms = hasQms ? d.qms : d.qes * d.qts / Math.max(1e-6, d.qes - d.qts), qtsUsed = hasQms ? 1 / (1 / d.qes + 1 / Qms) : d.qts;
    const Rms = ws * Mms / Qms;
    const Bl = Math.sqrt(ws * Mms * reE / d.qes);
    return {
      fs: d.fs, ws, qes: d.qes, qts: qtsUsed, qms: Qms, vasL: d.vas, Sd, Cms, Mms, Rms, Bl,
      re: reE, rg: d.rg || 0, qesE: d.qes * (reE + (d.rg || 0)) / reE, qtsE: 1 / (1 / (d.qes * (reE + (d.rg || 0)) / reE) + 1 / Qms), depth: d.depth || 0, le: leE, xmax: d.xmax, pe: d.pe, Znom: reE * 1.2, ebp: d.fs / d.qes, coil: kf,
      vd: Sd * d.xmax / 1e3 * 1000, // litres of one-way displacement
    };
  }

  /* ---------- filters / environment ---------- */
  function hpf(f, h) {
    if (!h || !h.f) return [1, 0];
    const s = [0, f / h.f], s2 = cx.mul(s, s);
    const Qs = h.order === 4 ? [0.5412, 1.3066] : [0.7071];
    let H = [1, 0];
    for (const q of Qs) H = cx.mul(H, cx.div(s2, cx.add(cx.add(s2, [s[0] / q, s[1] / q]), [1, 0])));
    return H;
  }
  function envGain(env, f) {
    if (!env || env.type === 'free') return 0;
    return Math.min(env.cap, 10 * Math.log10(1 + Math.pow(env.fc / f, 4)));
  }

  /* ---------- full circuit model (used for plots) ---------- */
  function evalPoint(D, m, f, Ec) {
    const w = TAU * f;
    const Ze = [D.re + D.rg, w * D.le * 1e-3];
    const Zm = [D.Rms, w * D.Mms - 1 / (w * D.Cms)];
    const Zad = cx.div(cx.add(Zm, cx.div([D.Bl * D.Bl, 0], Ze)), [D.Sd * D.Sd, 0]);
    const Pg = cx.div(cx.mul([D.Bl / D.Sd, 0], Ec), Ze);
    let Ud, Up = [0, 0], Ut;
    if (m.type === 'sealed') {
      const Cab = m.Vb1 / (RHO * C * C);
      const wc = D.ws * Math.sqrt(1 + D.vasL / (m.Vb1 * 1000));
      const Ral = m.ql / (wc * Cab);
      const Zl = cx.inv([1 / Ral, w * Cab]);
      Ud = cx.div(Pg, cx.add(Zad, Zl)); Ut = Ud;
    } else if (m.type === 'ported') {
      const Cab = m.Vb1 / (RHO * C * C), wb = TAU * m.fb;
      const Map = 1 / (wb * wb * Cab), Ral = m.ql / (wb * Cab);
      const Zp = [0, w * Map], Z1 = cx.inv([1 / Ral, w * Cab]);
      const Zpar = cx.div(cx.mul(Z1, Zp), cx.add(Z1, Zp));
      Ud = cx.div(Pg, cx.add(Zad, Zpar));
      Up = cx.neg(cx.mul(Ud, cx.div(Z1, cx.add(Zp, Z1))));
      Ut = cx.add(Ud, Up);
    } else {
      // 4th-order (sealed rear chamber) or 6th-order (vented rear chamber) bandpass; output only from the ports
      const C1 = m.Vr1 / (RHO * C * C), C2 = m.Vf1 / (RHO * C * C), wb = TAU * m.fb;
      const Zp = [0, w * (1 / (wb * wb * C2))];
      let Zr, Zp1 = null;
      if (m.type === 'bandpass6') {
        const wb1 = TAU * m.fb2;
        Zp1 = [0, w * (1 / (wb1 * wb1 * C1))];
        Zr = cx.inv(cx.add([1 / (m.ql / (wb1 * C1)), w * C1], cx.inv(Zp1)));
      } else Zr = cx.inv([1 / (m.ql / (wb * C1)), w * C1]);
      const Zf = cx.inv(cx.add([1 / (m.ql / (wb * C2)), w * C2], cx.inv(Zp)));
      Ud = cx.div(Pg, cx.add(cx.add(Zad, Zr), Zf));
      Up = cx.mul(Ud, cx.div(Zf, Zp));
      var Upr = Zp1 ? cx.neg(cx.mul(Ud, cx.div(Zr, Zp1))) : [0, 0];
      Ut = cx.add(Up, Upr);
    }
    const I = cx.div(cx.sub(Ec, cx.mul([D.Bl / D.Sd, 0], Ud)), Ze);
    return { Ud, Up, Upr: Upr || [0, 0], Ut, I };
  }

  /* o = {power (W total), env, hp:{f,order}} ; returns curves per frequency */
  function simulate(D, m, fr, o) {
    const n = m.n, E = Math.sqrt(Math.max(o.power, 1e-6) / n * D.Znom), Eth = Math.sqrt(D.pe * D.Znom);
    const Sp1 = m.Sp1 || 0.01;
    const out = { f: fr, spl: [], splMax: [], x: [], vp: [], vpr: [], z: [], gd: [], ph: [] };
    let prev = null;
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i], w = TAU * f;
      const H = hpf(f, o.hp), Hm = Math.max(cx.abs(H), 1e-9);
      const Ec = cx.mul([E, 0], H);
      const r = evalPoint(D, m, f, Ec);
      const pOut = RHO * w * cx.abs(r.Ut) * n / TAU;
      const gain = envGain(o.env, f);
      const spl0 = 20 * Math.log10(Math.max(pOut, 1e-9) / 20e-6);
      const x = Math.SQRT2 * cx.abs(r.Ud) / (w * D.Sd) * 1000;
      const s = Math.min(D.xmax / Math.max(x / Hm, 1e-12), Eth / E);
      out.spl.push(spl0 + gain);
      out.splMax.push(spl0 - 20 * Math.log10(Hm) + 20 * Math.log10(s) + gain);
      out.x.push(x);
      out.vp.push(m.type === 'sealed' ? 0 : Math.SQRT2 * cx.abs(r.Up) / Sp1);
      out.vpr.push(m.Sp2 ? Math.SQRT2 * cx.abs(r.Upr) / m.Sp2 : 0);
      const Z = cx.div(Ec, r.I); out.z.push(cx.abs(Z));
      let p = cx.arg(r.Ut);
      if (prev !== null) { while (p - prev > Math.PI) p -= TAU; while (p - prev < -Math.PI) p += TAU; }
      prev = p; out.ph.push(p);
    }
    for (let i = 0; i < fr.length; i++) {
      const a = Math.max(0, i - 1), b = Math.min(fr.length - 1, i + 1);
      out.gd.push(-(out.ph[b] - out.ph[a]) / (TAU * (fr[b] - fr[a])) * 1000);
    }
    out.ph = out.ph.map((p) => ((p * 180 / Math.PI + 180) % 360 + 360) % 360 - 180);
    return out;
  }

  /* ---------- fast closed-form responses (relative dB) for alignment & explorer ---------- */
  function dbPorted(D, VbL, fb, ql, f) {
    const wb = TAU * fb, Ts = 1 / D.ws, Tb = 1 / wb, a = D.vasL / VbL, Qt = D.qtsE, w = TAU * f;
    const a4 = Tb * Tb * Ts * Ts, a3 = Tb * Tb * Ts / Qt + Tb * Ts * Ts / ql;
    const a2 = (a + 1) * Tb * Tb + Tb * Ts / (ql * Qt) + Ts * Ts, a1 = Tb / ql + Ts / Qt;
    const w2 = w * w, w4 = w2 * w2;
    const dr = a4 * w4 - a2 * w2 + 1, di = -a3 * w * w2 + a1 * w, num = a4 * w4;
    return 10 * Math.log10(num * num / (dr * dr + di * di));
  }
  function sealedParams(D, VbL, ql) {
    const a = D.vasL / VbL, k = Math.sqrt(1 + a);
    return { fc: D.fs * k, qtc: 1 / (1 / (D.qtsE * k) + 1 / ql), alpha: a };
  }
  function dbSealed(D, VbL, ql, f) {
    const p = sealedParams(D, VbL, ql), x = f / p.fc;
    const re = 1 - x * x, im = x / p.qtc;
    return 10 * Math.log10(Math.pow(x, 4) / (re * re + im * im));
  }
  function crossing(fr, db, drop) { // highest frequency (scanning down from the top) where level < -drop
    let i = fr.length - 1;
    while (i >= 0 && db[i] >= -drop) i--;
    if (i < 0) return fr[0];
    if (i === fr.length - 1) return fr[i];
    const t = (-drop - db[i]) / (db[i + 1] - db[i]);
    return fr[i] * Math.pow(fr[i + 1] / fr[i], clamp(t, 0, 1));
  }
  function ripple(fr, db, f3) {
    let r = 0; for (let i = 0; i < fr.length; i++) if (fr[i] >= f3) r = Math.max(r, db[i]);
    return r;
  }
  const AL_FR = grid(8, 300, 90);
  function alignPorted(D, VbL, ql, maxRip) {
    let best = null, low = null;
    for (let k = 0; k <= 80; k++) {
      const fb = D.fs * (0.45 + 1.35 * k / 80);
      const db = AL_FR.map((f) => dbPorted(D, VbL, fb, ql, f));
      const f3 = crossing(AL_FR, db, 3), rp = ripple(AL_FR, db, f3);
      const r = { fb, f3, ripple: rp };
      if (rp <= maxRip && (!best || f3 < best.f3)) best = r;
      if (!low || rp < low.ripple) low = r;
    }
    return best || low;
  }
  function f3Sealed(D, VbL, ql) { return crossing(AL_FR, AL_FR.map((f) => dbSealed(D, VbL, ql, f)), 3); }

  /* ---------- geometry ---------- */
  function autoBraces(Wi, Hi, Di) {
    // one window brace per ~350 mm of unsupported depth, only when panels are large
    if (Math.max(Wi, Hi) < 280 && Di < 400) return 0;
    return Math.max(0, Math.ceil(Di / 350) - 1);
  }
  const isBP = (t) => t === 'bandpass' || t === 'bandpass6';
  // damping material (polyester wool): effective ("virtual") volume rises with the fill; sealed chambers gain most.
  function dampFactors(S) {
    const f = clamp((S.damp && S.damp.fill) || 0, 0, 100) / 100;
    return { sealed: 1 + 0.20 * f, ported: 1 + 0.05 * f, front: 1 + 0.05 * f, rear: 1 + (S.type === 'bandpass6' ? 0.10 : 0.20) * f };
  }
  function slotVertical(S, p, front) {
    if (p.kind !== 'slot') return false;
    if (p.slotDir === 'vertical') return true;
    if (p.slotDir === 'horizontal') return false;
    return !!front && !isBP(S.type) && S.port.pos === 'front' && (p.place === 'auto' || p.place === 'left' || p.place === 'right');
  }
  /* ---------- panels ---------- */
  // 'rear' is the back panel. Each panel is seen from outside: a = to the right, b = up, measured from the centre of its outer face.
  const PANELS = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
  // the box wall next to each edge of a panel (as seen from outside)
  const NEIGH = {
    front: { left: 'left', right: 'right', top: 'top', bottom: 'bottom' }, rear: { left: 'right', right: 'left', top: 'top', bottom: 'bottom' },
    left: { left: 'rear', right: 'front', top: 'top', bottom: 'bottom' }, right: { left: 'front', right: 'rear', top: 'top', bottom: 'bottom' },
    top: { left: 'left', right: 'right', top: 'rear', bottom: 'front' }, bottom: { left: 'left', right: 'right', top: 'front', bottom: 'rear' },
  };
  const panelId = (v) => (PANELS.includes(v) ? v : 'front');
  const sideOf = (pid, along) => { const nb = NEIGH[panelId(pid)]; return Object.keys(nb).find((k) => nb[k] === along) || null; };
  // outer size (PW x PH), inside opening (a0..a1, b0..b1), inside size (iw x ih), panel thickness and the inside depth behind it
  /* extra layers: boards glued onto the OUTSIDE of a panel, each covering that whole face of the box. The inside (and the volume)
     does not change; the box gets bigger outside. (The old "double front baffle" switch is an inside layer and is kept as it was.) */
  const layerCount = (S, id) => Math.max(0, Math.min(4, Math.round(+((S.layers || {})[id]) || 0)));
  const layerT = (S) => { const o = {}; PANELS.forEach((id) => { o[id] = S.t * layerCount(S, id); }); return o; };
  function panelFrame(S, geo, id) {
    const t = S.t, tf = geo.tf, W = S.dims.w, H = S.dims.h, D = S.dims.d, zf = D / 2 - tf, zb = -D / 2 + t, ex = (geo.ext || {})[panelId(id)] || 0;
    const f = { front: { PW: W, PH: H, a0: -geo.Wi / 2, b0: -geo.Hi / 2, iw: geo.Wi, ih: geo.Hi, th: tf, depth: geo.Di },
      rear: { PW: W, PH: H, a0: -geo.Wi / 2, b0: -geo.Hi / 2, iw: geo.Wi, ih: geo.Hi, th: t, depth: geo.Di },
      left: { PW: D, PH: H, a0: zb, b0: -geo.Hi / 2, iw: geo.Di, ih: geo.Hi, th: t, depth: geo.Wi },
      right: { PW: D, PH: H, a0: -zf, b0: -geo.Hi / 2, iw: geo.Di, ih: geo.Hi, th: t, depth: geo.Wi },
      top: { PW: W, PH: D, a0: -geo.Wi / 2, b0: -zf, iw: geo.Wi, ih: geo.Di, th: t, depth: geo.Hi },
      bottom: { PW: W, PH: D, a0: -geo.Wi / 2, b0: zb, iw: geo.Wi, ih: geo.Di, th: t, depth: geo.Hi } }[panelId(id)];
    // th counts from the outermost face (extra layers included), ex is the extra-layer part of it
    return { id: panelId(id), ...f, th: f.th + ex, ex, a1: f.a0 + f.iw, b1: f.b0 + f.ih };
  }
  // a single slot from the older slot fields (width/height as seen on the panel, placed beside the drivers)
  function legacyWalls(p, pid, place) {
    const w = p.slotW > 0 ? p.slotW : 0, h = p.slotH > 0 ? p.slotH : 0, nb = NEIGH[panelId(pid)];
    if (!w && !h) return [{ along: nb.bottom, gap: 60, span: 0, pos: null }];
    if (h > 0 && (!w || w >= h)) return [{ along: nb[place === 'above' ? 'top' : 'bottom'], gap: h, span: w, pos: null }];
    return [{ along: nb[place === 'left' ? 'left' : 'right'], gap: w, span: h, pos: null }];
  }
  /* slot port walls: each wall runs parallel to one inside wall of the box, gap mm away from it, and forms one slot with it.
     Positions are inside the panel opening, origin at its lower-left corner (seen from outside). span 0 = the whole wall;
     a full wall is shortened where an earlier full wall on a neighbouring box wall already takes the corner. */
  function wallSlots(p, fr, t) {
    const out = [], IW = fr.iw, IH = fr.ih, offA = fr.a0 + fr.PW / 2, offB = fr.b0 + fr.PH / 2;
    (p.walls || []).forEach((w) => {
      const side = sideOf(fr.id, w.along) || 'bottom', vert = side === 'left' || side === 'right', ext = vert ? IH : IW, across = vert ? IW : IH;
      let s0 = 0, s1 = ext;
      out.forEach((o) => {
        if (o.vert === vert || !o.full) return;
        const strip = o.gap + t;
        if (o.side === (vert ? 'bottom' : 'left')) s0 = Math.max(s0, strip); else s1 = Math.min(s1, ext - strip);
      });
      const room = Math.max(s1 - s0, 5), full = !(w.span > 0) || w.span >= room - 0.5, span = full ? room : clamp(w.span, 5, room);
      const gap = clamp(w.gap > 0 ? w.gap : 5, 5, Math.max(5, across - t - 10));
      const c = full || w.pos == null ? (s0 + s1) / 2 : clamp(w.pos - (vert ? offB : offA), s0 + span / 2, s1 - span / 2);
      const lo = c - span / 2, hi = c + span / 2, near = 0, far = across;
      const r = vert ? { x0: side === 'left' ? near : far - gap, y0: lo, y1: hi } : { y0: side === 'bottom' ? near : far - gap, x0: lo, x1: hi };
      if (vert) r.x1 = r.x0 + gap; else r.y1 = r.y0 + gap;
      out.push({ side, along: NEIGH[fr.id][side], vert, full, gap, span, ...r, w: r.x1 - r.x0, h: r.y1 - r.y0, area: gap * span * 1e-6, cheekLo: lo > s0 + 0.5, cheekHi: hi < s1 - 0.5 });
    });
    return out;
  }
  // footprint of a slot (opening plus its wall or folded stack) across the panel, for clash checks
  function slotFoot(s, stack) {
    const k = stack;
    if (s.side === 'left') return [s.x0, s.x0 + k, s.y0, s.y1];
    if (s.side === 'right') return [s.x1 - k, s.x1, s.y0, s.y1];
    if (s.side === 'bottom') return [s.x0, s.x1, s.y0, s.y0 + k];
    return [s.x0, s.x1, s.y1 - k, s.y1];
  }
  function wallPortCalc(S, p, fbT, VnetL, Di, fr) {
    const t = S.t, slots = wallSlots(p, fr, t), np = slots.length, Vm3 = Math.max(VnetL, 0.3) / 1000, k0 = p.flare ? 1.70 : 1.46;
    slots.forEach((s) => { s.corr = k0 * Math.sqrt(s.area / Math.PI); });
    const SpTot = slots.reduce((a, s) => a + s.area, 0), G = (Lm) => slots.reduce((a, s) => a + s.area / (Lm + s.corr), 0);
    const K = Math.pow(TAU * fbT, 2) * Vm3 / (C * C), custom = p.lenMode === 'custom' && p.len > 0;
    let L, tooShort = false;
    const ex = fr.ex || 0; // the hole through extra outside layers is part of the port: L is the length inside the box
    if (custom) L = Math.max(p.len, 10);
    else if (np === 1) { L = (C * C * SpTot / Math.pow(TAU * fbT, 2) / Vm3 - slots[0].corr) * 1000 - ex; if (L < 10) { L = 10; tooShort = true; } }
    else if (G(0.01 + ex / 1000) <= K) { L = 10; tooShort = true; }
    else { let lo = 0.01 + ex / 1000, hi = 100; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (G(mid) > K) lo = mid; else hi = mid; } L = (lo + hi) / 2 * 1000 - ex; }
    const g = G((L + ex) / 1000), fbAct = C / TAU * Math.sqrt(g / Vm3);
    slots.forEach((s) => { s.Leff = L + ex + s.corr * 1000; });
    // the slot with the shortest effective length carries the fastest air: velocity = U / (Leff_min * sum(S/Leff))
    const LeffMin = Math.min(...slots.map((s) => s.Leff)) / 1000, SpVel = np === 1 ? SpTot : LeffMin * g;
    const avail = Math.max(Di - 30, 10), foldOn = p.fold !== false;
    slots.forEach((s) => {
      s.pitch = s.gap + t; s.nSeg = 1; s.segLen = L;
      if (foldOn && L > avail) { s.nSeg = Math.ceil((L + s.pitch) / (avail + s.pitch)); s.segLen = (L - (s.nSeg - 1) * s.pitch) / s.nSeg; }
      s.stack = s.nSeg * s.pitch; s.stackAvail = (s.vert ? fr.iw : fr.ih) - 10;
    });
    let clash = false;
    for (let i = 0; i < np; i++) for (let j = i + 1; j < np; j++) {
      const A = slotFoot(slots[i], Math.max(slots[i].stack, slots[i].gap + t)), B = slotFoot(slots[j], Math.max(slots[j].stack, slots[j].gap + t));
      if (A[0] < B[1] - 0.5 && B[0] < A[1] - 0.5 && A[2] < B[3] - 0.5 && B[2] < A[3] - 0.5) clash = true;
    }
    const big = slots.reduce((b, s) => (s.nSeg > b.nSeg ? s : b), slots[0]), s0 = slots[0];
    const vol = slots.reduce((a, s) => a + (s.gap * s.span * L + t * s.span * L) / 1e6, 0);
    return { walls: true, slots, clash, nSeg: big.nSeg, segLen: big.segLen, pitch: big.pitch, stack: big.stack, stackAvail: big.stackAvail, foldFits: !clash && slots.every((s) => s.nSeg === 1 || s.stack <= s.stackAvail), folded: slots.some((s) => s.nSeg > 1), foldOn, kind: 'slot', n: np, L, Leff: s0.Leff, fbAct, fbTarget: fbT, tooShort, custom, SpTot, SpVel, areaEachCm2: s0.area * 1e4, dia: p.dia, outD: 0, wSlot: Math.max(s0.w, s0.h), hSlot: Math.min(s0.w, s0.h), wOpen: s0.w, hOpen: s0.h, PW: fr.iw, PH: fr.ih, vertical: s0.vert, vol, avail, folds: foldOn ? big.nSeg - 1 : Math.max(0, Math.ceil(L / avail) - 1), a: Math.sqrt(s0.area / Math.PI), panel: fr.id };
  }
  function portCalc(S, p, fbT, VnetL, Wi, Hi, Di, vertical, fr) {
    if (p.kind === 'slot' && fr && Array.isArray(p.walls) && p.walls.length) return wallPortCalc(S, p, fbT, VnetL, Di, fr);
    const np = p.kind === 'slot' ? 1 : Math.max(1, Math.round(p.n));
    let areaEach, outD = 0, wSlot = 0, hSlot = 0, wOpen = 0, hOpen = 0;
    if (p.kind === 'slot') {
      // opening as seen on the panel: width (left-right) x height (up-down); 0 = fill the inside dimension
      wOpen = p.slotW > 0 ? clamp(p.slotW, 5, Wi) : Wi; hOpen = p.slotH > 0 ? clamp(p.slotH, 5, Hi) : Hi;
      vertical = hOpen > wOpen;
      wSlot = Math.max(wOpen, hOpen); hSlot = Math.min(wOpen, hOpen); // long / short side
      areaEach = wSlot * hSlot * 1e-6;
    } else { areaEach = Math.PI * Math.pow(p.dia / 2000, 2); outD = p.dia + 2 * 3; }
    const SpTot = areaEach * np, a = Math.sqrt(areaEach / Math.PI);
    const corr = (p.flare ? 1.70 : 1.46) * a;
    const Vm3 = Math.max(VnetL, 0.3) / 1000;
    const LeffT = C * C * SpTot / Math.pow(TAU * fbT, 2) / Vm3;
    const custom = p.lenMode === 'custom' && p.len > 0;
    let L, tooShort = false;
    const ex = (fr && fr.ex) || 0; // hole through extra outside layers (part of the port; L is the part inside the box)
    if (custom) L = Math.max(p.len, 10);
    else { L = (LeffT - corr) * 1000 - ex; if (L < 10) { L = 10; tooShort = true; } }
    const Leff = (L + ex) / 1000 + corr;
    const fbAct = C / TAU * Math.sqrt(SpTot / (Vm3 * Leff));
    let vol;
    if (p.kind === 'slot') vol = (wSlot * hSlot * L + S.t * wSlot * L) / 1e6;
    else vol = np * Math.PI / 4 * outD * outD * L / 1e6;
    const avail = Math.max(Di - 30, 10);
    // folding: a serpentine of nSeg straight segments joined by U-turns; the turns add (pitch) of path length each
    const foldOn = p.fold !== false, shortSide = p.kind === 'slot' ? hSlot : outD, pitch = shortSide + (p.kind === 'slot' ? S.t : 4);
    let nSeg = 1, segLen = L;
    if (foldOn && L > avail) { nSeg = Math.ceil((L + pitch) / (avail + pitch)); segLen = (L - (nSeg - 1) * pitch) / nSeg; }
    const stack = nSeg * pitch, stackAvail = (p.kind === 'slot' && vertical ? Wi : Hi) - 10;
    return { nSeg, segLen, pitch, stack, stackAvail, foldFits: nSeg === 1 || stack <= stackAvail, folded: nSeg > 1, foldOn, kind: p.kind, n: np, L, Leff: Leff * 1000, fbAct, fbTarget: fbT, tooShort, custom, SpTot, areaEachCm2: areaEach * 1e4, dia: p.dia, outD, wSlot, hSlot, wOpen, hOpen, PW: Wi, PH: Hi, vertical: !!vertical, vol, avail, folds: foldOn ? nSeg - 1 : Math.max(0, Math.ceil(L / avail) - 1), a };
  }
  function solvePort(S, p, fb, base, Wi, Hi, avail, vertical, fr) {
    let Vp = 0, port;
    for (let i = 0; i < 14; i++) { port = portCalc(S, p, fb, base - Vp, Wi, Hi, avail, vertical, fr); if (Math.abs(port.vol - Vp) < 1e-4) { Vp = port.vol; break; } Vp = port.vol; }
    return { port, Vp };
  }
  const drvPanel = (S) => (isBP(S.type) ? null : panelId(S.layout && S.layout.panel));
  const portPanel = (S) => (isBP(S.type) ? 'front' : panelId(S.port && S.port.pos));
  /* extra walls: free panels anywhere inside the box. Inside coordinates: x from the left inside face, y from the bottom, z from the
     inside of the front baffle. dir 'across' stands parallel to the front (pos = z), 'side' parallel to the side panels (pos = x),
     'flat' lies parallel to the top (pos = y). s1 / s2 are its two sizes (0 = wall to wall), o1 / o2 where its edges start (null = centred). */
  const XW_AXES = { across: ['z', 'x', 'y'], side: ['x', 'z', 'y'], flat: ['y', 'x', 'z'] };
  function extraWalls(S, Wi, Hi, Di) {
    const t = S.t, dim = { x: Wi, y: Hi, z: Di };
    return (Array.isArray(S.xwalls) ? S.xwalls : []).map((w, i) => {
      const dir = XW_AXES[w.dir] ? w.dir : 'across', [an, a1, a2] = XW_AXES[dir], r = {};
      r[an] = [clamp(+w.pos || 0, 0, Math.max(dim[an] - t, 0))]; r[an].push(r[an][0] + t);
      [[a1, w.s1, w.o1], [a2, w.s2, w.o2]].forEach(([ax, s, o]) => {
        const len = s > 0 ? clamp(s, 5, dim[ax]) : dim[ax], st = o == null || !isFinite(o) ? (dim[ax] - len) / 2 : clamp(+o, 0, dim[ax] - len);
        r[ax] = [st, st + len];
      });
      return { i, dir, x0: r.x[0], x1: r.x[1], y0: r.y[0], y1: r.y[1], z0: r.z[0], z1: r.z[1], s1: r[a1][1] - r[a1][0], s2: r[a2][1] - r[a2][0], vol: (r.x[1] - r.x[0]) * (r.y[1] - r.y[0]) * (r.z[1] - r.z[0]) / 1e6 };
    });
  }
  // a rectangle on a panel (a, b from the centre of its outer face, d into the box from the outer face) as an inside-coordinate box
  const FRV = { front: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], rear: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], right: [[0, 0, -1], [0, 1, 0], [-1, 0, 0]], left: [[0, 0, 1], [0, 1, 0], [1, 0, 0]], top: [[1, 0, 0], [0, 0, -1], [0, -1, 0]], bottom: [[1, 0, 0], [0, 0, 1], [0, 1, 0]] };
  function panelBox(S, geo, id, a0, a1, b0, b1, d0, d1) {
    const pid = panelId(id), [u, v, n] = FRV[pid], hx = S.dims.w / 2, hy = S.dims.h / 2, hz = S.dims.d / 2;
    const o = { front: [0, 0, hz], rear: [0, 0, -hz], right: [hx, 0, 0], left: [-hx, 0, 0], top: [0, hy, 0], bottom: [0, -hy, 0] }[pid];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], ex = (geo.ext || {})[pid] || 0; // d counts from the outermost layer
    [a0, a1].forEach((a) => [b0, b1].forEach((b) => [d0, d1].forEach((d) => {
      const p = [0, 1, 2].map((k) => o[k] + u[k] * a + v[k] * b + n[k] * (d - ex)), q = [p[0] + geo.Wi / 2, p[1] + geo.Hi / 2, hz - geo.tf - p[2]];
      q.forEach((x, k) => { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); });
    })));
    return { x0: lo[0], x1: hi[0], y0: lo[1], y1: hi[1], z0: lo[2], z1: hi[2] };
  }
  const boxHit = (A, B, gap) => A.x0 < B.x1 + (gap || 0) && B.x0 < A.x1 + (gap || 0) && A.y0 < B.y1 + (gap || 0) && B.y0 < A.y1 + (gap || 0) && A.z0 < B.z1 + (gap || 0) && B.z0 < A.z1 + (gap || 0);
  function geometry(S) {
    const t = S.t, W = S.dims.w, H = S.dims.h, D = S.dims.d;
    const tf = S.dbl ? 2 * t : t; // front baffle thickness (old inside double layer = 2 x panel)
    const Wi = Math.max(W - 2 * t, 1), Hi = Math.max(H - 2 * t, 1), Di = Math.max(D - t - tf, 1);
    const ext = layerT(S), outer = { w: W + ext.left + ext.right, h: H + ext.top + ext.bottom, d: D + ext.front + ext.rear };
    const Vint = Wi * Hi * Di / 1e6, Vdr = S.n * S.driver.disp;
    const autoB = autoBraces(Wi, Hi, Di), B = S.brace || {};
    const size = clamp(B.size || 25, 5, 100), shape = B.shape === 'square' ? 'square' : 'round', half = size / 2;
    // auto layout: bars alternate side-to-side (mid-height) and top-to-bottom (mid-width), spread evenly along the depth
    const autoN = S.braces == null ? autoB : Math.round(S.braces);
    const raw = B.mode === 'custom' ? (B.items || []) : Array.from({ length: autoN }, (_, i) => (i % 2 === 0 ? { axis: 'side', a: Hi / 2, b: Di * (i + 1) / (autoN + 1) } : { axis: 'vertical', a: Wi / 2, b: Di * (i + 1) / (autoN + 1) }));
    const bracesList = raw.map((it) => {
      const axis = it.axis === 'side' || it.axis === 'depth' ? it.axis : 'vertical';
      let x, y, z, len;
      if (axis === 'vertical') { x = clamp(it.a, half, Math.max(Wi - half, half)); z = clamp(it.b, half, Math.max(Di - half, half)); y = Hi / 2; len = Hi; }
      else if (axis === 'side') { y = clamp(it.a, half, Math.max(Hi - half, half)); z = clamp(it.b, half, Math.max(Di - half, half)); x = Wi / 2; len = Wi; }
      else { x = clamp(it.a, half, Math.max(Wi - half, half)); y = clamp(it.b, half, Math.max(Hi - half, half)); z = Di / 2; len = Di; }
      const vol = (shape === 'round' ? Math.PI / 4 * size * size : size * size) * len / 1e6;
      return { axis, x, y, z, len, size, shape, vol };
    });
    const nb = bracesList.length;
    const Vbr = bracesList.reduce((s, b) => s + b.vol, 0) + 0.004 * Vint;
    const stock = {}; bracesList.forEach((b) => { const k = Math.round(b.len); stock[k] = stock[k] || { qty: 0, len: Math.round(b.len * 10) / 10 }; stock[k].qty++; });
    const braceParts = Object.values(stock).map((q) => ({ name: shape === 'round' ? `Round brace Ø${size} mm` : `Square brace ${size} × ${size} mm`, qty: q.qty, len: q.len }));
    const geo = { tf, Wi, Hi, Di, Vint, Vdr, Vbr, nb, autoB, bracesList, braceParts, braceSize: size, braceShape: shape, Vext: outer.w * outer.h * outer.d / 1e6, port: null, port2: null, portList: [], Vport: 0 };
    if (PANELS.some((id) => ext[id] > 0)) { geo.ext = ext; geo.outer = outer; }
    // extra walls take up volume like any panel; the tuning then follows from the smaller net volume
    const xw = extraWalls(S, Wi, Hi, Di), Vxw = xw.reduce((s, w) => s + w.vol, 0);
    if (xw.length) { geo.xwalls = xw; geo.Vxw = Vxw; }
    const vMain = slotVertical(S, S.port, true);
    if (isBP(S.type)) {
      const Dr = clamp(S.bp.rear, 0.1, 0.9) * Math.max(Di - t, 1), Df = Math.max(Di - t - Dr, 1);
      const VrInt = Wi * Hi * Dr / 1e6, VfInt = Wi * Hi * Df / 1e6, sh = Dr / Di;
      geo.Dr = Dr; geo.Df = Df;
      let rearV = 0, frontV = 0; const glue = 0.004 * Vint;
      bracesList.forEach((b) => { if (b.axis === 'depth') { rearV += b.vol * Dr / Di; frontV += b.vol * Df / Di; } else if (b.z > Df) rearV += b.vol; else frontV += b.vol; });
      // an extra wall counts in each chamber by the part of its depth that lies there (the part inside the divider is already solid)
      const part = (w, a, b) => Math.max(0, Math.min(w.z1, b) - Math.max(w.z0, a)) / Math.max(w.z1 - w.z0, 1e-9);
      xw.forEach((w) => { frontV += w.vol * part(w, 0, Df); rearV += w.vol * part(w, Df + t, Di); });
      const VbrR = rearV + glue * sh, VbrF = frontV + glue * (1 - sh);
      let baseR = VrInt - 0.6 * Vdr - VbrR, Vp2 = 0;
      if (S.type === 'bandpass6') {
        const r = solvePort(S, S.port2, S.fb2 * Math.sqrt(dampFactors(S).rear), baseR, Wi, Hi, Dr, false, panelFrame(S, geo, 'rear'));
        geo.port2 = r.port; Vp2 = r.Vp; geo.portList.push({ label: 'Rear-chamber port', port: r.port });
      }
      geo.Vr = Math.max(0.3, baseR - Vp2);
      const baseF = VfInt - 0.4 * Vdr - VbrF;
      const r1 = solvePort(S, S.port, S.fb * Math.sqrt(dampFactors(S).front), baseF, Wi, Hi, Df, vMain, panelFrame(S, geo, 'front'));
      geo.port = r1.port; geo.Vport = r1.Vp + Vp2; geo.Vf = Math.max(0.3, baseF - r1.Vp); geo.Vnet = geo.Vr + geo.Vf;
      geo.portList.unshift({ label: S.type === 'bandpass6' ? 'Front-chamber port' : 'Port', port: r1.port });
    } else if (S.type === 'ported') {
      const base = Vint - Vdr - Vbr - Vxw, pid = portPanel(S), fr = panelFrame(S, geo, pid);
      geo.sidePort = pid === 'left' || pid === 'right' ? pid : null; geo.portPanel = pid;
      const fbG = S.fb * Math.sqrt(dampFactors(S).ported);
      const r = solvePort(S, S.port, fbG, base, fr.iw, fr.ih, fr.depth, vMain, fr);
      geo.port = r.port; geo.Vport = r.Vp; geo.Vnet = Math.max(0.3, base - r.Vp); geo.portList.push({ label: 'Port', port: r.port });
    } else geo.Vnet = Math.max(0.3, Vint - Vdr - Vbr - Vxw);
    geo.portParts = [];
    geo.portList.forEach(({ label, port }) => {
      if (port.kind !== 'pipe') return;
      geo.portParts.push({ name: `${label} tube Ø${port.dia} mm`, qty: port.n * port.nSeg, len: Math.round(port.segLen * 10) / 10, note: port.nSeg > 1 ? `folded: ${port.nSeg} straight pieces per port` : 'cut length (flange to end)' });
      if (port.nSeg > 1) geo.portParts.push({ name: `${label} 90° elbow Ø${port.dia} mm`, qty: 2 * port.n * (port.nSeg - 1), len: null, note: 'two per U-turn (centre-to-centre ' + Math.round(port.pitch) + ' mm)' });
    });
    return geo;
  }
  function modelFromState(S, geo) {
    const n = S.n, m = { type: S.type, n, ql: S.ql };
    const kf = dampFactors(S), sp = (pt) => (pt.SpVel || pt.SpTot) / n; // several slots of different size: the fastest one sets the air speed
    if (isBP(S.type)) {
      m.Vr1 = geo.Vr * kf.rear / 1000 / n; m.Vf1 = geo.Vf * kf.front / 1000 / n; m.fb = geo.port.fbAct / Math.sqrt(kf.front); m.Sp1 = sp(geo.port);
      if (S.type === 'bandpass6') { m.fb2 = geo.port2.fbAct / Math.sqrt(kf.rear); m.Sp2 = sp(geo.port2); }
    } else { m.Vb1 = geo.Vnet * (S.type === 'sealed' ? kf.sealed : kf.ported) / 1000 / n; if (S.type === 'ported') { m.fb = geo.port.fbAct / Math.sqrt(kf.ported); m.Sp1 = sp(geo.port); } }
    return m;
  }

  const RATIOS = { deep: [1.3, 1, 1.5], golden: [1.618, 1, 0.618], cube: [1, 1, 1], wide: [1.9, 1, 1.1], tall: [1, 1.9, 1.2] };
  function fitDims(S, targetL, ratioKey) {
    const r = RATIOS[ratioKey] || (() => { const d = S.dims, m = Math.min(d.w, d.h, d.d); return [d.w / m, d.h / m, d.d / m]; })();
    const T = JSON.parse(JSON.stringify(S));
    // the box may never be smaller than what the driver physically needs: cut-out with a 25 mm rim, and mounting depth + clearance
    const cut = S.driver.cut || 0, dep = S.driver.depth || 0, t = S.t;
    const minWH = cut > 0 ? cut + 50 + 2 * 0 : 0;
    const minD = dep > 0 ? (isBP(S.type) ? (dep + 40) / clamp(S.bp.rear, 0.1, 0.9) + 3 * t : dep + 40 + 2 * t) : 0;
    // the driver panel needs room for the cut-out; the box dimension behind it needs room for the mounting depth
    const dp = drvPanel(S) || 'front', deepAx = dp === 'left' || dp === 'right' ? 'w' : dp === 'top' || dp === 'bottom' ? 'h' : 'd';
    const minOf = (ax) => (ax === deepAx ? minD : minWH);
    const dimsAt = (k) => ({ w: Math.max(r[0] * k, minOf('w')), h: Math.max(r[1] * k, minOf('h')), d: Math.max(r[2] * k, minOf('d')) });
    let lo = 40, hi = 4000;
    for (let i = 0; i < 50; i++) {
      const k = (lo + hi) / 2; T.dims = dimsAt(k);
      if (geometry(T).Vnet < targetL) lo = k; else hi = k;
    }
    const dd = dimsAt((lo + hi) / 2);
    return { w: Math.round(dd.w), h: Math.round(dd.h), d: Math.round(dd.d) };
  }
  /* ---------- panels, cut list, weight ---------- */
  function panels(S, geo) {
    const t = S.t, W = S.dims.w, H = S.dims.h, D = S.dims.d, P = [];
    const r = (x) => Math.round(x * 10) / 10;
    const dIn = D - t - geo.tf, dp = drvPanel(S) || 'front', onFront = dp === 'front' || isBP(S.type);
    const holes = (id) => [dp === id && !isBP(S.type) ? 'driver' : '', geo.port && portPanel(S) === id && id !== 'front' ? 'port' : ''].filter(Boolean).join(' & ');
    const note = (id) => (holes(id) ? holes(id) + ' cut-outs' : '');
    if (onFront) P.push(S.dbl ? { name: 'Front baffle (2 layers)', qty: 2, w: r(W), h: r(H), note: 'glue the two layers together; same cut-outs in both' } : { name: 'Front baffle', qty: 1, w: r(W), h: r(H), note: 'driver & port cut-outs' });
    else P.push(S.dbl ? { name: 'Front (2 layers)', qty: 2, w: r(W), h: r(H), note: 'glue the two layers together' + (geo.port && portPanel(S) === 'front' ? '; same port cut-outs in both' : '') } : { name: 'Front', qty: 1, w: r(W), h: r(H), note: geo.port && portPanel(S) === 'front' ? 'port cut-outs' : '' });
    P.push({ name: 'Back', qty: 1, w: r(W), h: r(H), note: dp === 'rear' ? note('rear') : '' });
    // a pair is split when the drivers sit on one of its panels, so the cut list says which one gets the holes
    if (dp === 'top' || dp === 'bottom') { P.push({ name: 'Top', qty: 1, w: r(W), h: r(dIn), note: note('top') }); P.push({ name: 'Bottom', qty: 1, w: r(W), h: r(dIn), note: note('bottom') }); }
    else P.push({ name: 'Top / bottom', qty: 2, w: r(W), h: r(dIn), note: '' });
    if (dp === 'left' || dp === 'right') { P.push({ name: 'Left side', qty: 1, w: r(H - 2 * t), h: r(dIn), note: note('left') }); P.push({ name: 'Right side', qty: 1, w: r(H - 2 * t), h: r(dIn), note: note('right') }); }
    else P.push({ name: 'Sides', qty: 2, w: r(H - 2 * t), h: r(dIn), note: '' });
    // extra outside layers: each covers that whole face of the box and gets the same cut-outs as the panel under it
    const face = { front: [W, H], rear: [W, H], top: [W, D], bottom: [W, D], left: [D, H], right: [D, H] };
    const LNAME = { front: 'Front', rear: 'Back', top: 'Top', bottom: 'Bottom', left: 'Left side', right: 'Right side' };
    PANELS.forEach((id) => {
      const n = layerCount(S, id), hl = id === 'front' ? [dp === 'front' && !isBP(S.type) ? 'driver' : '', geo.port && portPanel(S) === 'front' ? 'port' : ''].filter(Boolean).join(' & ') : holes(id);
      if (n) P.push({ name: LNAME[id] + ' outer layer', qty: n, w: r(face[id][0]), h: r(face[id][1]), note: 'glued on the outside' + (hl ? '; same ' + hl + ' cut-outs' : '') });
    });
    if (isBP(S.type)) P.push({ name: 'Chamber divider', qty: 1, w: r(geo.Wi), h: r(geo.Hi), note: 'driver mounts here' });
    (geo.xwalls || []).forEach((w) => P.push({ name: 'Extra wall ' + (w.i + 1), qty: 1, w: r(w.s1), h: r(w.s2), note: xwallWhere(w) }));
    const long = (pt) => (pt.vertical ? pt.PH : pt.PW);
    geo.portList.forEach(({ label, port }) => {
      if (port.kind !== 'slot') return;
      const nm = label.replace('Port', 'port');
      if (port.slots) {
        port.slots.forEach((s, i) => {
          const tag = port.slots.length > 1 ? ' ' + (i + 1) : '', segs = s.nSeg, len = segs > 1 ? s.segLen : port.L, ch = (s.cheekLo ? 1 : 0) + (s.cheekHi ? 1 : 0);
          P.push({ name: nm + ' slot wall' + tag, qty: segs, w: r(s.span), h: r(len), note: (segs > 1 ? 'folded: one wall per segment; leave a turn gap of ' + r(s.gap) + ' at alternating ends' : 'forms the port channel') + ' · ' + r(s.gap) + ' from the ' + (s.along === 'rear' ? 'back' : s.along) + ' panel' });
          if (ch) P.push({ name: nm + ' slot cheeks' + tag, qty: ch * segs, w: r(s.gap), h: r(len), note: 'close the ends of the slot' });
        });
        return;
      }
      const segs = port.nSeg, len = port.nSeg > 1 ? port.segLen : port.L;
      P.push({ name: nm + ' slot wall', qty: segs, w: r(port.wSlot), h: r(len), note: segs > 1 ? 'folded: one wall per segment; leave a turn gap of ' + r(port.hSlot) + ' at alternating ends' : 'forms the port channel' });
      if (port.wSlot < long(port) - 1) P.push({ name: nm + ' slot cheeks', qty: 2 * segs, w: r(port.hSlot), h: r(len), note: '' });
    });    return P;
  }
  // where an extra wall sits, in words, measured from the inside faces
  function xwallWhere(w, fmt) {
    const r = fmt || ((x) => Math.round(x));
    if (w.dir === 'across') return `parallel to the front, ${r(w.z0)} behind the baffle; ${r(w.x0)} from the left, ${r(w.y0)} up`;
    if (w.dir === 'side') return `parallel to the sides, ${r(w.x0)} from the left; ${r(w.z0)} behind the baffle, ${r(w.y0)} up`;
    return `lying flat, ${r(w.y0)} up from the bottom; ${r(w.x0)} from the left, ${r(w.z0)} behind the baffle`;
  }
  function weightKg(S, parts) { // MDF ~ 750 kg/m3
    return parts.reduce((s, p) => s + p.qty * p.w * p.h * (p.t || S.t) / 1e9 * 750, 0);
  }

  /* ---------- sheet nesting (shelf algorithm) ---------- */
  function nest(parts, sw, sh, kerf) {
    const items = [];
    parts.forEach((p) => { for (let i = 0; i < p.qty; i++) items.push({ name: p.name, w: p.w, h: p.h }); });
    items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
    const sheets = [], oversize = [];
    const tryPlace = (sheet, it) => {
      const ors = [[it.w, it.h], [it.h, it.w]];
      for (const sf of sheet.shelves) {
        let best = null;
        for (const [w, h] of ors) if (h + kerf <= sf.h && sf.x + w + kerf <= sw && (!best || sf.h - h < sf.h - best[1])) best = [w, h];
        if (best) { sheet.placed.push({ name: it.name, x: sf.x, y: sf.y, w: best[0], h: best[1] }); sf.x += best[0] + kerf; return true; }
      }
      const cands = ors.filter(([w, h]) => w + kerf <= sw && sheet.y + h + kerf <= sh).sort((a, b) => a[1] - b[1]);
      if (!cands.length) return false;
      const [w, h] = cands[0];
      const sf = { y: sheet.y, h: h + kerf, x: w + kerf };
      sheet.shelves.push(sf); sheet.y += h + kerf;
      sheet.placed.push({ name: it.name, x: 0, y: sf.y, w, h });
      return true;
    };
    for (const it of items) {
      if (Math.min(it.w, it.h) + kerf > Math.min(sw, sh) || Math.max(it.w, it.h) + kerf > Math.max(sw, sh)) { oversize.push(it); continue; }
      let done = false;
      for (const s of sheets) if (tryPlace(s, it)) { done = true; break; }
      if (!done) { const s = { shelves: [], placed: [], y: 0 }; sheets.push(s); tryPlace(s, it); }
    }
    const used = items.filter((i) => !oversize.includes(i)).reduce((a, i) => a + i.w * i.h, 0);
    return { sheets, oversize, waste: sheets.length ? 1 - used / (sheets.length * sw * sh) : 0 };
  }

  g.Eng = { RHO, C, cx, grid, clamp, validDriver, makeDriver, simulate, evalPoint, dbPorted, dbSealed, sealedParams, crossing, ripple, alignPorted, f3Sealed, AL_FR, geometry, modelFromState, fitDims, RATIOS, panels, weightKg, nest, portCalc, isBP, slotVertical, dampFactors, coilFactors, PANELS, NEIGH, panelFrame, sideOf, legacyWalls, drvPanel, portPanel, panelBox, boxHit, xwallWhere, layerCount, layerT };
})(window);