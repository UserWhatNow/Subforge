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
  function portCalc(S, p, fbT, VnetL, Wi, Hi, Di, vertical) {
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
    if (custom) L = Math.max(p.len, 10);
    else { L = (LeffT - corr) * 1000; if (L < 10) { L = 10; tooShort = true; } }
    const Leff = L / 1000 + corr;
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
  function solvePort(S, p, fb, base, Wi, Hi, avail, vertical) {
    let Vp = 0, port;
    for (let i = 0; i < 14; i++) { port = portCalc(S, p, fb, base - Vp, Wi, Hi, avail, vertical); if (Math.abs(port.vol - Vp) < 1e-4) { Vp = port.vol; break; } Vp = port.vol; }
    return { port, Vp };
  }
  function geometry(S) {
    const t = S.t, W = S.dims.w, H = S.dims.h, D = S.dims.d;
    const tf = S.dbl ? 2 * t : t; // front baffle thickness (double layer = 2 x panel)
    const Wi = Math.max(W - 2 * t, 1), Hi = Math.max(H - 2 * t, 1), Di = Math.max(D - t - tf, 1);
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
    const geo = { tf, Wi, Hi, Di, Vint, Vdr, Vbr, nb, autoB, bracesList, braceParts, braceSize: size, braceShape: shape, Vext: W * H * D / 1e6, port: null, port2: null, portList: [], Vport: 0 };
    const vMain = slotVertical(S, S.port, true);
    if (isBP(S.type)) {
      const Dr = clamp(S.bp.rear, 0.1, 0.9) * Math.max(Di - t, 1), Df = Math.max(Di - t - Dr, 1);
      const VrInt = Wi * Hi * Dr / 1e6, VfInt = Wi * Hi * Df / 1e6, sh = Dr / Di;
      geo.Dr = Dr; geo.Df = Df;
      let rearV = 0, frontV = 0; const glue = 0.004 * Vint;
      bracesList.forEach((b) => { if (b.axis === 'depth') { rearV += b.vol * Dr / Di; frontV += b.vol * Df / Di; } else if (b.z > Df) rearV += b.vol; else frontV += b.vol; });
      const VbrR = rearV + glue * sh, VbrF = frontV + glue * (1 - sh);
      let baseR = VrInt - 0.6 * Vdr - VbrR, Vp2 = 0;
      if (S.type === 'bandpass6') {
        const r = solvePort(S, S.port2, S.fb2 * Math.sqrt(dampFactors(S).rear), baseR, Wi, Hi, Dr, false);
        geo.port2 = r.port; Vp2 = r.Vp; geo.portList.push({ label: 'Rear-chamber port', port: r.port });
      }
      geo.Vr = Math.max(0.3, baseR - Vp2);
      const baseF = VfInt - 0.4 * Vdr - VbrF;
      const r1 = solvePort(S, S.port, S.fb * Math.sqrt(dampFactors(S).front), baseF, Wi, Hi, Df, vMain);
      geo.port = r1.port; geo.Vport = r1.Vp + Vp2; geo.Vf = Math.max(0.3, baseF - r1.Vp); geo.Vnet = geo.Vr + geo.Vf;
      geo.portList.unshift({ label: S.type === 'bandpass6' ? 'Front-chamber port' : 'Port', port: r1.port });
    } else if (S.type === 'ported') {
      const base = Vint - Vdr - Vbr;
      const sidePort = S.port.pos === 'left' || S.port.pos === 'right';
      geo.sidePort = sidePort ? S.port.pos : null;
      const fbG = S.fb * Math.sqrt(dampFactors(S).ported);
      const r = sidePort ? solvePort(S, S.port, fbG, base, Di, Hi, Wi, vMain) : solvePort(S, S.port, fbG, base, Wi, Hi, Di, vMain);
      geo.port = r.port; geo.Vport = r.Vp; geo.Vnet = Math.max(0.3, base - r.Vp); geo.portList.push({ label: 'Port', port: r.port });
    } else geo.Vnet = Math.max(0.3, Vint - Vdr - Vbr);
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
    const kf = dampFactors(S);
    if (isBP(S.type)) {
      m.Vr1 = geo.Vr * kf.rear / 1000 / n; m.Vf1 = geo.Vf * kf.front / 1000 / n; m.fb = geo.port.fbAct / Math.sqrt(kf.front); m.Sp1 = geo.port.SpTot / n;
      if (S.type === 'bandpass6') { m.fb2 = geo.port2.fbAct / Math.sqrt(kf.rear); m.Sp2 = geo.port2.SpTot / n; }
    } else { m.Vb1 = geo.Vnet * (S.type === 'sealed' ? kf.sealed : kf.ported) / 1000 / n; if (S.type === 'ported') { m.fb = geo.port.fbAct / Math.sqrt(kf.ported); m.Sp1 = geo.port.SpTot / n; } }
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
    const dimsAt = (k) => ({ w: Math.max(r[0] * k, minWH), h: Math.max(r[1] * k, minWH), d: Math.max(r[2] * k, minD) });
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
    const dIn = D - t - geo.tf;
    P.push(S.dbl ? { name: 'Front baffle (2 layers)', qty: 2, w: r(W), h: r(H), note: 'glue the two layers together; same cut-outs in both' } : { name: 'Front baffle', qty: 1, w: r(W), h: r(H), note: 'driver & port cut-outs' });
    P.push({ name: 'Back', qty: 1, w: r(W), h: r(H), note: '' });
    P.push({ name: 'Top / bottom', qty: 2, w: r(W), h: r(dIn), note: '' });
    P.push({ name: 'Sides', qty: 2, w: r(H - 2 * t), h: r(dIn), note: '' });
    if (isBP(S.type)) P.push({ name: 'Chamber divider', qty: 1, w: r(geo.Wi), h: r(geo.Hi), note: 'driver mounts here' });
    const long = (pt) => (pt.vertical ? pt.PH : pt.PW);
    geo.portList.forEach(({ label, port }) => {
      if (port.kind !== 'slot') return;
      const nm = label.replace('Port', 'port'), segs = port.nSeg, len = port.nSeg > 1 ? port.segLen : port.L;
      P.push({ name: nm + ' slot wall', qty: segs, w: r(port.wSlot), h: r(len), note: segs > 1 ? 'folded: one wall per segment; leave a turn gap of ' + r(port.hSlot) + ' at alternating ends' : 'forms the port channel' });
      if (port.wSlot < long(port) - 1) P.push({ name: nm + ' slot cheeks', qty: 2 * segs, w: r(port.hSlot), h: r(len), note: '' });
    });    return P;
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

  g.Eng = { RHO, C, cx, grid, clamp, validDriver, makeDriver, simulate, evalPoint, dbPorted, dbSealed, sealedParams, crossing, ripple, alignPorted, f3Sealed, AL_FR, geometry, modelFromState, fitDims, RATIOS, panels, weightKg, nest, portCalc, isBP, slotVertical, dampFactors, coilFactors };
})(window);