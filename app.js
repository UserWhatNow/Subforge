'use strict';
(function () {
  const E = window.Eng, V = window.View;
  const $ = (s, r) => (r || document).querySelector(s);
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const set = (o, p, v) => { const ks = p.split('.'), l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const LEN = { mm: 1, cm: 10, in: 25.4 };
  const L2FT3 = 0.0353147;

  /* ---------------- driver presets (generic examples – replace with datasheet values) ---------------- */
  const PRESETS = [
    { name: 'Generic 6.5" subwoofer', fs: 42, qes: 0.55, qts: 0.48, vas: 12, sd: 135, xmax: 7, re: 3.6, le: 0.6, pe: 150, disp: 0.3, cut: 145, depth: 85, rg: 0 },
    { name: 'Generic 8" subwoofer', fs: 38, qes: 0.52, qts: 0.45, vas: 22, sd: 215, xmax: 9, re: 3.6, le: 0.7, pe: 200, disp: 0.6, cut: 175, depth: 100, rg: 0 },
    { name: 'Generic 10" subwoofer', fs: 32, qes: 0.46, qts: 0.40, vas: 45, sd: 330, xmax: 12, re: 3.6, le: 1.0, pe: 400, disp: 1.0, cut: 235, depth: 115, rg: 0 },
    { name: 'Generic 12" subwoofer', fs: 28, qes: 0.46, qts: 0.40, vas: 85, sd: 530, xmax: 15, re: 3.5, le: 1.5, pe: 600, disp: 1.5, cut: 285, depth: 140, rg: 0 },
    { name: 'Generic 12" high-excursion', fs: 24, qes: 0.55, qts: 0.48, vas: 95, sd: 510, xmax: 25, re: 3.4, le: 2.2, pe: 1000, disp: 2.0, cut: 290, depth: 160, rg: 0 },
    { name: 'Generic 15" subwoofer', fs: 26, qes: 0.50, qts: 0.44, vas: 190, sd: 850, xmax: 18, re: 3.5, le: 2.5, pe: 1000, disp: 2.6, cut: 365, depth: 170, rg: 0 },
    { name: 'Generic 18" subwoofer', fs: 22, qes: 0.42, qts: 0.37, vas: 330, sd: 1230, xmax: 22, re: 3.6, le: 3.0, pe: 1800, disp: 4.0, cut: 445, depth: 200, rg: 0 },
  ];  const userDrivers = () => { try { return JSON.parse(localStorage.getItem('sf_drivers') || '[]'); } catch (e) { return []; } };

  function defaultState() {
    return {
      v: 1, unit: 'mm', type: 'ported', n: 1, driver: Object.assign({ vc: 'single', wire: 'series' }, clone(PRESETS[3])),
      dims: { w: 460, h: 356, d: 534 }, t: 19, dbl: false, braces: null, brace: { mode: 'auto', shape: 'round', size: 25, items: [] }, ql: 7,
      fb: 29, port: { kind: 'pipe', n: 2, dia: 70, slotH: 60, slotW: 0, flare: false, pos: 'front', place: 'auto', slotDir: 'auto', lenMode: 'auto', len: 300, fold: true, walls: [{ along: 'bottom', gap: 60, span: 0, pos: null }] },
      fb2: 36, port2: { kind: 'pipe', n: 1, dia: 75, slotH: 50, slotW: 0, flare: false, lenMode: 'auto', len: 200, fold: true, walls: [{ along: 'bottom', gap: 50, span: 0, pos: null }] }, bp: { rear: 0.45 }, damp: { fill: 0 }, amp: { minOhm: 1 }, wiring: 'parallel',
      layout: { gap: 20, align: 50, dir: 'auto', px: null, py: null, panel: 'front', cols: 2, dx: null, dy: null },
      env: { type: 'free', fc: 50, cap: 12 }, power: 300, hp: { f: 20, order: 4 },
      fit: { vol: 60, ratio: 'deep' }, sheet: { w: 2440, h: 1220, kerf: 3 }, pins: [], xwalls: [],
      layers: { front: 0, rear: 0, left: 0, right: 0, top: 0, bottom: 0 }, // extra layers glued onto each panel
    };
  }
  function merge(dst, src) { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]); else dst[k] = src[k]; } return dst; }

  const MAX_WALLS = 1, MAX_XWALLS = 8; // one slot wall per port; extra walls are separate panels
  let S = defaultState();
  /* Anything that comes from outside (share link, saved design, imported file) is rebuilt from the known fields only:
     numbers must be numbers, flags booleans, choices one of the allowed values. Nothing else is ever kept or shown as HTML. */
  const ENUMS = {
    type: ['sealed', 'ported', 'bandpass', 'bandpass6'], unit: ['mm', 'cm', 'in'], wiring: ['parallel', 'series'],
    'driver.vc': ['single', 'dual'], 'driver.wire': ['series', 'parallel'],
    'port.kind': ['pipe', 'slot'], 'port.pos': ['front', 'rear', 'left', 'right', 'top', 'bottom'], 'layout.panel': ['front', 'rear', 'left', 'right', 'top', 'bottom'], 'port.place': ['auto', 'right', 'left', 'below', 'above', 'custom'], 'port.slotDir': ['auto', 'horizontal', 'vertical'], 'port.lenMode': ['auto', 'custom'],
    'port2.kind': ['pipe', 'slot'], 'port2.lenMode': ['auto', 'custom'],
    'env.type': ['free', 'room', 'car'], 'layout.dir': ['auto', 'row', 'col', 'grid'], 'brace.mode': ['auto', 'custom'], 'brace.shape': ['round', 'square'], 'fit.ratio': ['current', 'deep', 'golden', 'cube', 'wide', 'tall'],
  };
  const isNum = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && isFinite(Number(v));
  function normalize(src, def, prefix) {
    const out = {};
    if (!src || typeof src !== 'object' || Array.isArray(src)) src = {};
    for (const k of Object.keys(def)) {
      const d = def[k], v = src[k], p = (prefix || '') + k;
      if (k === 'pins') out[k] = [];
      else if (k === 'items') out[k] = (Array.isArray(v) ? v : []).slice(0, 12).map((it) => ({ axis: it && ['vertical', 'side', 'depth'].includes(it.axis) ? it.axis : 'vertical', a: it && isNum(it.a) ? Number(it.a) : 0, b: it && isNum(it.b) ? Number(it.b) : 0 }));
      // slot port walls; a design saved before walls existed has none and gets them from its old slot size in sanitize()
      else if (k === 'xwalls') out[k] = (Array.isArray(v) ? v : []).filter((w) => w && typeof w === 'object').slice(0, MAX_XWALLS).map((w) => ({ dir: ['across', 'side', 'flat'].includes(w.dir) ? w.dir : 'across', pos: isNum(w.pos) ? Number(w.pos) : 0, s1: isNum(w.s1) ? Number(w.s1) : 0, s2: isNum(w.s2) ? Number(w.s2) : 0, o1: isNum(w.o1) ? Number(w.o1) : null, o2: isNum(w.o2) ? Number(w.o2) : null }));
      else if (k === 'walls') out[k] = Array.isArray(v) ? v.slice(0, MAX_WALLS).map((w) => ({ along: w && E.PANELS.includes(w.along) ? w.along : 'bottom', gap: w && isNum(w.gap) ? Number(w.gap) : 60, span: w && isNum(w.span) ? Number(w.span) : 0, pos: w && isNum(w.pos) ? Number(w.pos) : null })) : null;
      else if (d === null) out[k] = isNum(v) ? Number(v) : null;
      else if (typeof d === 'number') out[k] = isNum(v) ? Number(v) : d;
      else if (typeof d === 'boolean') out[k] = typeof v === 'boolean' ? v : d;
      else if (typeof d === 'string') out[k] = ENUMS[p] ? (ENUMS[p].includes(v) ? v : d) : (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, 80) : d);
      else if (d && typeof d === 'object') out[k] = normalize(v, d, p + '.');
    }
    if (!prefix && src.driver && typeof src.driver === 'object') ['mms', 'cms', 'zn', 'qms'].forEach((k) => { if (isNum(src.driver[k]) && Number(src.driver[k]) > 0) out.driver[k] = Number(src.driver[k]); });
    return out;
  }
  (function load() {
    try {
      const h = location.hash.match(/d=([^&]+)/);
      if (h) { S = normalize(JSON.parse(decodeURIComponent(escape(atob(h[1].replace(/-/g, '+').replace(/_/g, '/'))))), defaultState()); return; }
      const raw = localStorage.getItem('sf_state'); if (raw) S = normalize(JSON.parse(raw), defaultState());
    } catch (e) { S = defaultState(); }
  })();
  const save = () => { try { localStorage.setItem('sf_state', JSON.stringify(S)); } catch (e) { /* ignore */ } };

  /* ---------------- realistic input limits (nothing can be negative or zero where it is physically meaningless) ---------------- */
  const LIM = {
    'driver.fs': [5, 300], 'driver.qes': [0.05, 5], 'driver.qts': [0.05, 5], 'driver.vas': [0.5, 5000], 'driver.sd': [10, 6000],
    'driver.xmax': [0.5, 100], 'driver.re': [0.5, 64], 'driver.le': [0, 30], 'driver.pe': [1, 20000], 'driver.disp': [0, 60], 'driver.rg': [0, 3], 'driver.qms': [0.3, 200], 'driver.zn': [0.25, 32], 'damp.fill': [0, 100], 'amp.minOhm': [0.25, 16], 'driver.depth': [0, 400], 'driver.mms': [0.1, 5000], 'driver.cms': [0.001, 5], 'driver.cut': [50, 650],
    'layers.front': [0, 4, 1], 'layers.rear': [0, 4, 1], 'layers.left': [0, 4, 1], 'layers.right': [0, 4, 1], 'layers.top': [0, 4, 1], 'layers.bottom': [0, 4, 1],
    n: [1, 12, 1], 'layout.cols': [1, 12, 1], 'layout.dx': [0, 3000], 'layout.dy': [0, 3000], 'dims.w': [60, 3000], 'dims.h': [60, 3000], 'dims.d': [60, 3000], t: [6, 60], braces: [0, 12, 1], 'brace.size': [5, 100], 'port.len': [10, 3000], 'port2.len': [10, 3000], ql: [1, 100],
    'bp.rear': [0.1, 0.9], 'fit.vol': [1, 3000], fb: [8, 250], fb2: [8, 250],
    'port.dia': [10, 400], 'port.n': [1, 8, 1], 'port.slotH': [0, 3000], 'port.slotW': [0, 3000],
    'port2.dia': [10, 400], 'port2.n': [1, 8, 1], 'port2.slotH': [0, 3000], 'port2.slotW': [0, 3000],
    power: [1, 30000], 'env.fc': [10, 200], 'env.cap': [0, 24], 'hp.f': [0, 120],
    'sheet.w': [200, 6000], 'sheet.h': [200, 6000], 'sheet.kerf': [0, 10],
    'layout.gap': [10, 400], 'layout.align': [0, 100], 'layout.px': [0, 3000], 'layout.py': [0, 3000],
  };
  const lim = (v, a, b) => Math.min(b, Math.max(a, v));
  function fixWall(w, pid) {
    const nb = E.NEIGH[pid] || E.NEIGH.front, ok = Object.values(nb);
    return { along: ok.includes(w.along) ? w.along : nb.bottom, gap: lim(+w.gap || 5, 5, 1000), span: lim(+w.span || 0, 0, 3000), pos: w.pos == null || !isFinite(+w.pos) ? null : lim(+w.pos, 0, 3000) };
  }
  function sanitize(s) {
    if (s.port.slotDir === 'vertical') { const w = s.port.slotH; s.port.slotH = s.port.slotW; s.port.slotW = w; } s.port.slotDir = 'auto';
    for (const k in LIM) {
      let v = get(s, k); if (v == null) continue;
      if (typeof v !== 'number' || isNaN(v)) v = LIM[k][0];
      v = Math.min(LIM[k][1], Math.max(LIM[k][0], v)); if (LIM[k][2]) v = Math.round(v);
      set(s, k, v);
    }
    s.layout.gap = Math.max(10, s.layout.gap);
    // the old "double front baffle" was a second layer inside the box: it becomes one outside layer on a box one board shallower,
    // so the outside size, the inside and the cut pieces stay exactly as they were
    if (s.dbl) { s.layers.front = Math.min(4, s.layers.front + 1); s.dims.d = Math.max(60, s.dims.d - s.t); s.dbl = false; }
    // slot walls: older designs get one wall from their slot size; every wall must run along a box wall next to the port's panel
    [['port', E.isBP(s.type) ? 'front' : s.port.pos], ['port2', 'rear']].forEach(([pk, pid]) => {
      const P = s[pk];
      if (!Array.isArray(P.walls)) P.walls = E.legacyWalls(P, pid, pk === 'port' ? P.place : 'auto');
      if (!P.walls.length && P.kind === 'slot') P.walls = E.legacyWalls({}, pid);
      P.walls = P.walls.slice(0, MAX_WALLS).map((w) => fixWall(w, pid));
    });
    if (!Array.isArray(s.xwalls)) s.xwalls = [];
    s.xwalls = s.xwalls.slice(0, MAX_XWALLS).map((w) => ({ dir: ['across', 'side', 'flat'].includes(w.dir) ? w.dir : 'across', pos: lim(+w.pos || 0, 0, 3000), s1: lim(+w.s1 || 0, 0, 3000), s2: lim(+w.s2 || 0, 0, 3000), o1: w.o1 == null || !isFinite(+w.o1) ? null : lim(+w.o1, 0, 3000), o2: w.o2 == null || !isFinite(+w.o2) ? null : lim(+w.o2, 0, 3000) }));
    if (!Array.isArray(s.brace.items)) s.brace.items = [];
    s.brace.items = s.brace.items.slice(0, 12).map((it) => ({ axis: ['vertical', 'side', 'depth'].includes(it.axis) ? it.axis : 'vertical', a: Math.max(0, +it.a || 0), b: Math.max(0, +it.b || 0) }));
  }
  sanitize(S);

  /* ---------------- formatting ---------------- */
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  const fmtLen = (mm) => S.unit === 'in' ? f2(mm / 25.4) + '"' : S.unit === 'cm' ? f1(mm / 10) + ' cm' : Math.round(mm) + ' mm';
  const fmtLenBare = (mm) => S.unit === 'in' ? f2(mm / 25.4) : S.unit === 'cm' ? f1(mm / 10) : Math.round(mm);
  const fmtVol = (l) => `${f1(l)} L (${f2(l * L2FT3)} ft³)`;
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200); };

  /* ---------------- sidebar ---------------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* ---------------- hover help ---------------- */
  const TIPS = {
    'driver.fs': 'Fs: the driver\'s free-air resonance. Lower Fs generally means deeper bass potential.',
    'driver.qes': 'Qes: electrical damping of the driver. Low Qes (under ~0.4) suits ported boxes, higher suits sealed.',
    'driver.qms': 'Mechanical Q. If you enter it, Qts is calculated from Qes and Qms, which is more accurate than the rounded Qts printed on datasheets.',
    'driver.qts': 'Qts: total damping (electrical + mechanical). Must be lower than Qes. Below ~0.4 favours ported, 0.4–0.7 sealed or ported.',
    'driver.vas': 'Vas: volume of air with the same stiffness as the suspension. Large Vas drivers need bigger boxes.',
    'driver.sd': 'Sd: effective cone area. More area moves more air at the same excursion.',
    'driver.xmax': 'Xmax: the LINEAR one-way cone travel. Some datasheets also list a larger "effective" value; use the linear figure.',
    'driver.re': 'Re: DC resistance of the voice coil(s) as you will wire them (e.g. a 2 × 2 Ω dual coil wired in series: use the series value). Nominal impedance is about 1.2 × Re.',
    'driver.le': 'Le: voice-coil inductance. Affects impedance and response above the bass range.',
    'driver.pe': 'Rated continuous (RMS) power handling of one driver.',
    'driver.disp': 'Air volume taken up by the driver\'s motor and basket inside the box. It is subtracted from the net volume.',
    'driver.cut': 'Diameter of the hole to cut in the baffle for the driver (the datasheet "mounting diameter").',
    'driver.depth': 'How far the driver reaches into the box from the baffle (the datasheet "mounting depth"). The box must be deeper than this.',
    'driver.rg': 'Series resistance of the speaker cable and amplifier output. It raises the effective Qes and Qts. 0.1–0.3 Ω is realistic in a car.',
    'driver.mms': 'Moving mass from the datasheet. With Fs it gives Cms, which together with Vas gives the cone area Sd.',
    'driver.cms': 'Suspension compliance from the datasheet. With Vas it gives the cone area Sd.',
    'layers.front': 'Extra boards glued onto the outside of the front (1 = double baffle). Stiffer; the inside stays the same and the box gets deeper. A port through it gets longer by the layers.',
    'layers.rear': 'Extra boards glued onto the back panel.', 'layers.left': 'Extra boards glued onto the left side.', 'layers.right': 'Extra boards glued onto the right side.',
    'layers.top': 'Extra boards glued onto the top.', 'layers.bottom': 'Extra boards glued onto the bottom.',
    'port.pos:front': 'Port opens through the front baffle.', 'port.pos:rear': 'Port opens through the back panel.',
    'port.pos:left': 'Port opens through the left side panel.', 'port.pos:right': 'Port opens through the right side panel.',
    'port.pos:top': 'Port opens through the top panel.', 'port.pos:bottom': 'Port opens through the bottom panel (stand the box on feet so it can breathe).',
    'layout.panel': 'Which panel the drivers are mounted on. The box dimension behind that panel must be larger than the mounting depth.',
    'layout.panel:bottom': 'Drivers fire downwards: keep a gap of at least a quarter of the cut-out under the box.',
    'layout.cols': 'How many drivers sit side by side in each row. 4 drivers with 2 per row = 2 on 2; 6 with 3 per row = 3 on 3.',
    'layout.dx': 'Centre of the driver group, measured from the left edge of the panel as seen from outside. Empty = automatic.',
    'layout.dy': 'Centre of the driver group, measured from the bottom edge of the panel as seen from outside. Empty = automatic.',
    'port.fold': 'If the port is longer than the box is deep, build it as a serpentine of straight segments joined by U-turns. Each turn adds a little path length.',
    'port2.fold': 'Fold the rear-chamber port into a serpentine when it is longer than the chamber is deep.',
    'damp.fill': 'How full the box is with polyester wool or similar. It makes the box act larger (most in sealed chambers) and tames internal reflections. The effect shown is an estimate.',
    'amp.minOhm': 'The lowest load your amplifier is stable at. The wiring table shows which options are safe.',
    'driver.vc': 'Dual voice-coil drivers can be wired in series or parallel to give different loads. Qes, Qts and Vas do not change with the wiring.',
    'driver.wire': 'Series doubles the coil resistance; parallel halves it.',
    wiring: 'How the drivers are connected to each other when you use more than one.',
    'driver.zn': 'Nominal impedance from the datasheet (per voice coil for dual-coil drivers). Leave empty to estimate it from Re.',
    'act:tunebp-wide': 'Search the chamber split and tunings for the widest flat passband (no more than 2 dB dip).',
    'act:tunebp-spl': 'Search for the highest output with a passband at least half an octave wide.',
    'act:addxwall': 'Add a panel anywhere inside the box. It takes up volume, so the net volume and the tuning follow.',
    'act:derivesd': 'Work out the cone area Sd from Vas and Mms (or Cms).', 'act:addbrace': 'Add another brace bar.',
    n: 'Number of identical drivers sharing the box. Volume and ports are shared equally between them.',
    type: 'Box alignment. Sealed: tight and compact. Ported: louder and deeper for the size. Band-pass: narrow, very efficient output through ports only.',
    'type:sealed': 'Sealed: tight, accurate bass; needs the least tuning and tolerates small errors.',
    'type:ported': 'Ported: a tuned port adds output near the tuning frequency and extends the bass lower.',
    'type:bandpass': '4th-order band-pass: sealed rear chamber, ported front chamber. Narrow passband, high efficiency.',
    'type:bandpass6': '6th-order band-pass: both chambers vented, each with its own port and tuning. Wider, more complex.',
    'dims.w': 'Outside width of the box, without extra outside layers.', 'dims.h': 'Outside height of the box, without extra outside layers.', 'dims.d': 'Outside depth of the box (front to back), without extra outside layers.',
    t: 'Panel thickness. Internal volume is calculated with this wall thickness on all sides.',
    braces: 'Number of round or square brace bars in automatic mode. Empty = automatic suggestion.',
    'brace.mode': 'Automatic spreads the bars evenly along the depth. Custom lets you choose the direction and position of every bar.',
    'brace.shape': 'Round dowels are easy to fit with a drilled hole; square bars glue flat against the walls.',
    'brace.size': 'Diameter of a round bar, or side length of a square bar.',
    'port.lenMode': 'Auto calculates the port length that gives your tuning frequency. Custom lets you set the length and the tuning follows.',
    'port.len': 'Length of the port (and of the slot port wall). The real tuning frequency then follows from this length.',
    'port2.lenMode': 'Auto calculates the port length that gives the rear tuning. Custom lets you set the length yourself.',
    'port2.len': 'Length of the rear-chamber port.',    ql: 'Box leakage loss. 7 is typical for a well-built box; 20 or more is very well sealed.',
    'bp.rear': 'Share of the internal depth used by the rear chamber. The driver sits on the divider between the chambers.',
    'fit.vol': 'Target net (usable) air volume. "Fit box to volume" resizes the box to reach it.',
    'fit.ratio': 'Proportions of the box when it is resized to a target volume.',
    fb: 'Port tuning frequency. Usually 0.8–1.2 × Fs. The port length is calculated to reach it.',
    fb2: 'Tuning frequency of the rear-chamber port in a 6th-order band-pass.',
    'port.kind': 'Round pipes or a rectangular slot port.',
    'port.dia': 'Inner diameter of each round port.', 'port.n': 'Number of identical round ports. More ports add area, which makes each one longer.',
    'port.slotW': 'Width of the slot opening as seen from the front. 0 = the full inside width.',
    'port.slotH': 'Height of the slot opening as seen from the front. 0 = the full inside height.',
    'port.pos': 'Which panel the port opens through. It can be a different panel from the drivers.', 'port.flare': 'Flared ends reduce air noise and let the port be slightly shorter.',
    'port.place': 'Which side of the drivers the port sits on, or place it yourself.',
    'layout.px': 'Horizontal position of the port centre, measured from the left edge of the panel.',
    'layout.py': 'Vertical position of the port centre, measured from the bottom edge of the panel.',
    'layout.gap': 'Edge-to-edge distance between driver cut-outs. Minimum 10 mm to keep the baffle strong.',
    'layout.align': 'Moves the driver group inside the free space: left, centre or right.',
    'layout.dir': 'Side by side, stacked, or in rows (2 on 2, 3 on 3 ...), for more than one driver.',
    power: 'Amplifier RMS power sent to all drivers together.',
    'env.type': 'Free field has no room gain. Rooms and cars boost the lowest bass.',
    'env.fc': 'Below this frequency the room or cabin gain rises at about 12 dB per octave.', 'env.cap': 'Maximum gain the room or cabin can add.',
    'hp.f': 'Subsonic (high-pass) filter frequency. Protects the driver from excursion below the tuning. 0 = off.',
    'hp.order': 'Steepness of the subsonic filter.',
    'sheet.w': 'Length of one sheet of board.', 'sheet.h': 'Width of one sheet of board.', 'sheet.kerf': 'Material lost to the saw blade at every cut.',
    'act:fit': 'Resize the box to the target net volume using the chosen proportions.',
    'act:qb3': 'Jump to a textbook alignment for this driver: maximally flat.',
    'act:q09': 'Sealed box with Qtc 0.9: slightly warm, a little more bass output.',
    'act:q05': 'Sealed box with Qtc 0.5: very tight and dry.',
    'act:compact': 'Smaller ported box (60 % of the flat volume) with the best tuning that keeps ripple under 3 dB.',
    'act:autofb': 'Find the tuning with the lowest F3 and at most 1 dB of ripple for the current volume.',
    'act:autofb3': 'Find the tuning with the lowest F3 allowing up to 3 dB of ripple (more output, less flat).',
    'act:sizeport': 'Set the port area so the peak air speed at your amplifier power is about 15 m/s.',
    'act:savedrv': 'Save this driver in your browser for next time.', 'act:deldrv': 'Remove this saved driver.',
    'act:setenv': 'Load typical gain values for the selected room or car.',
    'stat:Net volume': 'Usable air volume after subtracting driver, bracing and port.',
    'stat:External size': 'Outside dimensions of the finished box.',
    'stat:Fc': 'Resonance frequency of the driver in the sealed box.', 'stat:Qtc': 'Total damping of the sealed system. 0.707 is maximally flat.',
    'stat:Tuning Fb': 'Actual port tuning after rounding the port length.', 'stat:Ripple': 'Largest rise in the response above the passband level.',
    'stat:F3': 'Frequency where output falls 3 dB below the passband.', 'stat:F10': 'Frequency where output is 10 dB down: a practical measure of extension.',
    'stat:Passband −3 dB': 'Frequency range within 3 dB of the peak output.',
    'stat:Port air speed': 'Peak air speed in the port at your amplifier power. Above ~17 m/s the port may chuff.',
    'stat:Peak excursion': 'Largest cone movement (above 15 Hz) at your amplifier power, compared with Xmax.',
    'stat:Sensitivity': 'Modeled output with 1 W at 1 m (half-space) in the passband.',
    'stat:Load': 'Approximate impedance the amplifier sees with the drivers wired in parallel.',
    'stat:Weight (panels)': 'Estimated weight of the board material only.',
    'stat:Max SPL @ 40 Hz': 'Loudest output at 40 Hz before hitting Xmax or the thermal limit.',
    'tab:spl': 'Output level versus frequency, with the loudest possible level dashed.', 'tab:exc': 'How far the cone moves at your amplifier power.',
    'tab:vel': 'Air speed in the port. Keep it below the yellow line.', 'tab:imp': 'Impedance the amplifier sees.',
    'tab:gd': 'Timing delay of the bass versus frequency.', 'tab:exp': 'How deep each box volume can go, for sealed and ported.',
  };
  const tipOf = (k) => (TIPS[k] ? ` data-tip="${esc(TIPS[k])}"` : '');

  function num(k, label, unit, o) {
    o = o || {};
    let v = get(S, k);
    if (o.len && v != null) v = S.unit === 'in' ? Math.round(v / 25.4 * 1000) / 1000 : S.unit === 'cm' ? Math.round(v) / 10 : Math.round(v * 10) / 10;
    if (v == null) v = '';
    const u = o.len ? S.unit : unit || '';
    const lim = LIM[k], cv = (x) => (o.len ? (S.unit === 'in' ? x / 25.4 : S.unit === 'cm' ? x / 10 : x) : x);
    const mm = lim ? `min="${cv(lim[0])}" max="${cv(lim[1])}"` : (o.min != null ? `min="${o.min}"` : '');
    return `<label class="fld"${tipOf(k)}><span>${label}</span><div class="inp"><input type="number" ${mm} data-k="${k}" ${o.len ? 'data-len="1"' : ''} step="${o.len ? (S.unit === 'in' ? 0.05 : S.unit === 'cm' ? 0.1 : 1) : o.step || 'any'}" ${o.ph ? `placeholder="${o.ph}"` : ''} value="${v}"><em>${u}</em></div></label>`;
  }
  function sel(k, label, opts, rebuild, aria) {
    const v = get(S, k);
    return `<label class="fld"${tipOf(k)}><span>${label}</span><select ${aria ? 'aria-label="' + aria + '"' : ''} data-k="${k}" ${rebuild ? 'data-rebuild="1"' : ''}>${opts.map(([val, txt]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${txt}</option>`).join('')}</select></label>`;
  }
  function seg(k, opts) {
    const v = get(S, k);
    return `<div class="seg" role="group"${tipOf(k)}>${opts.map(([val, txt]) => `<button aria-pressed="${String(v) === String(val)}"${tipOf(k + ':' + val)} data-seg="${k}" data-v="${val}" class="${String(v) === String(val) ? 'on' : ''}">${txt}</button>`).join('')}</div>`;
  }
  const chk = (k, label, rebuild) => `<label class="chk"${tipOf(k)}><input type="checkbox" data-k="${k}" ${rebuild ? 'data-rebuild="1"' : ''} ${get(S, k) ? 'checked' : ''}>${label}</label>`;
  const act = (a, txt, cls) => `<button${tipOf('act:' + a)} class="btn ${cls || ''}" data-act="${a}">${txt}</button>`;

  function portFields(pk) {
    const P = S[pk], pc = last && last.geo && (pk === 'port' ? last.geo.port : last.geo.port2);
    const lenUi = seg(pk + '.lenMode', [['auto', 'Length: auto'], ['custom', 'Length: custom']]) + (P.lenMode === 'custom' ? num(pk + '.len', P.kind === 'slot' ? 'Port / slot-wall length' : 'Port length', 'mm', { step: 1 }) + '<p class="note" style="margin:2px 0 6px">Tuning follows from this length.</p>' : (pc ? '<p class="note" style="margin:2px 0 6px">Calculated length: ' + Math.round(pc.L) + ' mm</p>' : ''));
    return seg(pk + '.kind', [['pipe', 'Round pipe'], ['slot', 'Slot']]) + (P.kind === 'pipe'
      ? num(pk + '.dia', 'Port diameter', 'mm', { step: 1 }) + num(pk + '.n', 'Number of ports', '×', { step: 1 })
      : wallFields(pk)) + lenUi + chk(pk + '.fold', 'Fold the port to fit (serpentine)');
  }
  const portPanelOf = (pk) => (pk === 'port2' ? 'rear' : E.portPanel(S));
  // the slot wall: which box wall it runs along, how far from it (= slot width), how wide, and where along that wall
  function wallFields(pk) {
    const P = S[pk], pid = portPanelOf(pk), nb = E.NEIGH[pid], pc = last && last.geo && (pk === 'port' ? last.geo.port : last.geo.port2);
    const opts = ['bottom', 'top', 'left', 'right'].map((sd) => [nb[sd], 'Along the ' + V.PNAME[nb[sd]] + ' panel']);
    const w = P.walls[0], k = pk + '.walls.0', side = E.sideOf(pid, w.along), vert = side === 'left' || side === 'right', sl = pc && pc.slots && pc.slots[0];
    return `<div class="sub"><h3>Slot wall</h3><p class="note" style="margin:0 0 6px">The slot opens through the ${V.PNAME[pid]} panel, between this wall and the box wall it runs along. Extra walls elsewhere in the box are under Enclosure.</p>`
      + `<div class="bar">${sel(k + '.along', 'Runs along', opts, true)}`
      + `<div class="bar-row">${num(k + '.gap', 'Distance from the box wall (slot width)', '', { len: 1, min: 5 })}${nudgeW(k, 'gap', 5, ['narrower', 'wider'])}</div>`
      + num(k + '.span', 'Wall width across (0 = full)', '', { len: 1, min: 0 })
      + (w.span > 0 ? `<div class="bar-row">${num(k + '.pos', 'Slot centre from the ' + (vert ? 'bottom' : 'left') + ' edge', '', { len: 1, ph: 'centre' })}${nudgeW(k, 'pos', 10, vert ? ['↓', '↑'] : ['←', '→'])}</div>` : '')
      + (sl ? `<p class="note" style="margin:2px 0 0">Slot ${fmtLen(sl.w)} × ${fmtLen(sl.h)} · ${f1(sl.area * 1e4)} cm²${sl.nSeg > 1 ? ' · folded ×' + sl.nSeg : ''}</p>` : '') + '</div>'
      + '<p class="note" style="margin:4px 0 0">Sizes are seen from outside the panel.</p></div>';
  }
  // extra walls: free panels anywhere inside the box (labels per direction: [position, size 1, size 2, start 1, start 2])
  const XW_DIRS = [['across', 'Standing, parallel to the front'], ['side', 'Standing, parallel to the sides'], ['flat', 'Lying flat, parallel to the top']];
  const XW_LAB = {
    across: ['Distance behind the baffle', 'Width (0 = wall to wall)', 'Height (0 = full)', 'Left edge from the left side', 'Bottom edge from the bottom'],
    side: ['Distance from the left side', 'Depth (0 = front to back)', 'Height (0 = full)', 'Front edge behind the baffle', 'Bottom edge from the bottom'],
    flat: ['Height above the bottom', 'Width (0 = wall to wall)', 'Depth (0 = front to back)', 'Left edge from the left side', 'Front edge behind the baffle'],
  };
  const XW_NUDGE = { across: ['front', 'back'], side: ['←', '→'], flat: ['↓', '↑'] };
  // extra layers per panel (0 = single board); each adds one board on the outside of that face
  function layerFields() {
    const sum = E.PANELS.reduce((a, id) => a + S.layers[id], 0);
    return `<div class="sub"><h3>Extra outside layers</h3><div class="layers">${PANEL_OPTS.map(([id, txt]) => num('layers.' + id, txt, '', { step: 1 })).join('')}</div>`
      + `<p class="note" style="margin:4px 0 0">${sum ? `${sum} extra board${sum > 1 ? 's' : ''} in total. ` : ''}Each layer is a board glued onto the outside of that face and covers all of it. The inside and the volume stay the same; the box grows ${fmtLen(S.t)} per layer on that side. Cut-outs go through every layer, and a port through them gets longer (the tuning includes it).</p></div>`;
  }
  function xwallFields() {
    let h = '<div class="sub"><h3>Extra walls</h3>';
    S.xwalls.forEach((w, i) => {
      const k = 'xwalls.' + i, L = XW_LAB[w.dir];
      h += `<div class="bar"><div class="bar-h"><b>Wall ${i + 1}</b>${sel(k + '.dir', '', XW_DIRS, true, 'Extra wall ' + (i + 1) + ' direction')}<button class="btn sm ghost" data-act="delxwall:${i}" title="Remove this wall">✕</button></div>`
        + `<div class="bar-row">${num(k + '.pos', L[0], '', { len: 1, min: 0 })}${nudgeW(k, 'pos', 10, XW_NUDGE[w.dir])}</div>`
        + num(k + '.s1', L[1], '', { len: 1, min: 0 }) + num(k + '.s2', L[2], '', { len: 1, min: 0 })
        + num(k + '.o1', L[3], '', { len: 1, ph: 'centred' }) + num(k + '.o2', L[4], '', { len: 1, ph: 'centred' }) + '</div>';
    });
    if (S.xwalls.length < MAX_XWALLS) h += `<div class="mini">${act('addxwall', '+ Add wall')}</div>`;
    return h + '<p class="note" style="margin:4px 0 0">Panels you place anywhere inside the box, at the material thickness. They take up volume, so the net volume and the port tuning follow; they do not change the port opening. Positions are measured from the inside faces.</p></div>';
  }
  const nudgeW = (k, f, step, pair) => `<span class="nudge"><button data-wnudge="${k}.${f},${-step}" title="${pair[0]} ${step} mm">${pair[0]}</button><button data-wnudge="${k}.${f},${step}" title="${pair[1]} ${step} mm">${pair[1]}</button></span>`;

  const PANEL_OPTS = [['front', 'Front'], ['rear', 'Back'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom']];
  // "3 on 3", "3 on 2" ... read from the top row down
  const gridText = (n, cols) => { const c = Math.max(1, Math.min(n, Math.round(cols) || 1)), rows = []; for (let left = n; left > 0; left -= c) rows.push(Math.min(c, left)); return rows.length === 1 ? 'one row of ' + n : rows.length + ' rows, ' + rows.join(' on '); };
  const AXES = [['vertical', 'Top ↕ bottom'], ['side', 'Left ↔ right'], ['depth', 'Front ↔ back']];
  const AX_LABELS = { vertical: ['From left', 'From front'], side: ['From bottom', 'From front'], depth: ['From left', 'From bottom'] };
  // [minus, plus] nudge labels for the two position fields of each axis
  const AX_NUDGE = { vertical: [['←', '→'], ['front', 'back']], side: [['↓', '↑'], ['front', 'back']], depth: [['←', '→'], ['↓', '↑']] };
  function bracingFields() {
    let h = `<div class="sub"><h3>Bracing</h3>${seg('brace.mode', [['auto', 'Automatic'], ['custom', 'Custom']])}${seg('brace.shape', [['round', 'Round'], ['square', 'Square']])}${num('brace.size', S.brace.shape === 'round' ? 'Bar diameter' : 'Bar size', '', { len: 1 })}`;
    if (S.brace.mode === 'custom') {
      S.brace.items.forEach((it, i) => {
        const lb = AX_LABELS[it.axis], nd = AX_NUDGE[it.axis];
        const nudge = (f, pair) => `<span class="nudge"><button data-nudge="${i},${f},-10" title="Move ${pair[0]} 10 mm">${pair[0]}</button><button data-nudge="${i},${f},10" title="Move ${pair[1]} 10 mm">${pair[1]}</button></span>`;
        h += `<div class="bar"><div class="bar-h"><b>Brace ${i + 1}</b>${sel('brace.items.' + i + '.axis', '', AXES, true, 'Brace ' + (i + 1) + ' direction')}<button class="btn sm ghost" data-act="delbrace:${i}" title="Remove this brace">✕</button></div>`
          + `<div class="bar-row">${num('brace.items.' + i + '.a', lb[0], '', { len: 1, min: 0 })}${nudge('a', nd[0])}</div>`
          + `<div class="bar-row">${num('brace.items.' + i + '.b', lb[1], '', { len: 1, min: 0 })}${nudge('b', nd[1])}</div></div>`;
      });
      if (S.brace.items.length < 12) h += `<div class="mini">${act('addbrace', '+ Add brace')}</div>`;
      h += '<p class="note" style="margin:4px 0 0">Every bar runs wall to wall in its direction. Use the fields or the arrow buttons to move it (10 mm per click). Positions are measured from the inside of the box.</p>';
    } else h += '<p class="note" style="margin:4px 0 0">Bars alternate between side-to-side and top-to-bottom, spread evenly along the depth.</p>';
    return h + '</div>';
  }
  // open input groups (by title); the driver group starts open
  const openCards = new Set((() => { try { const v = JSON.parse(localStorage.getItem('sf_open')); if (Array.isArray(v)) return v.filter((x) => typeof x === 'string'); } catch (e) { /* ignore */ } return ['Driver']; })());
  function renderSide() {
    sanitize(S); // e.g. a slot wall that no longer fits the new port panel is moved before the fields are drawn
    const all = PRESETS.concat(userDrivers());
    const cur = all.findIndex((p) => p.name === S.driver.name);
    let h = '<div class="drawer-head"><b>Design inputs</b><button class="btn sm" type="button" data-act="closedrawer">Done ✕</button></div>';
    h += `<div class="card"><h3>Driver</h3>
      <label class="fld"><span>Preset</span><select data-act="preset"><option value="-1">— custom —</option>${all.map((p, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Name</span><input type="text" data-k="driver.name" value="${esc(S.driver.name)}"></label>
      ${num('driver.fs', 'Fs', 'Hz')}${num('driver.qes', 'Qes', '')}${num('driver.qts', 'Qts', '')}${num('driver.qms', 'Qms', '', { step: 0.1, ph: 'optional' })}${num('driver.vas', 'Vas', 'L')}
      ${num('driver.sd', 'Sd', 'cm²')}${num('driver.xmax', 'Xmax (one-way)', 'mm')}${seg('driver.vc', [['single', 'Single coil'], ['dual', 'Dual coil']])}${S.driver.vc === 'dual' ? seg('driver.wire', [['series', 'Coils in series'], ['parallel', 'Coils in parallel']]) : ''}${num('driver.re', S.driver.vc === 'dual' ? 'Re per voice coil' : 'Re (DC)', 'Ω')}${num('driver.le', S.driver.vc === 'dual' ? 'Le per voice coil' : 'Le', 'mH')}
      ${num('driver.pe', 'Power (RMS)', 'W')}${num('driver.disp', 'Displacement', 'L')}${num('driver.cut', 'Cut-out Ø', 'mm')}${num('driver.zn', S.driver.vc === 'dual' ? 'Nominal Ω per coil' : 'Nominal impedance', 'Ω', { step: 0.5, ph: 'estimate' })}${num('driver.depth', 'Mounting depth', 'mm')}${num('driver.rg', 'Cable + amp resistance', 'Ω', { step: 0.05 })}
      ${num('n', 'Drivers', '×', { step: 1 })}
      ${S.n > 1 ? seg('wiring', [['parallel', 'Drivers in parallel'], ['series', 'Drivers in series']]) : ''}
      <div class="sub"><h3>Sd not on the datasheet?</h3>${num('driver.mms', 'Mms', 'g', { step: 0.1, ph: 'optional' })}${num('driver.cms', 'or Cms', 'mm/N', { step: 0.001, ph: 'optional' })}<div class="mini">${act('derivesd', 'Calculate Sd from Vas')}</div></div>
      <div id="derived" class="derived"></div>
      <div class="mini">${act('savedrv', 'Save driver')}${userDrivers().some((p) => p.name === S.driver.name) ? act('deldrv', 'Delete saved') : ''}</div>
      <p class="note">Presets are generic examples. Enter the T/S values from your driver's datasheet.</p></div>`;
    h += `<div class="card"><h3>Enclosure</h3>
      ${seg('type', [['sealed', 'Sealed'], ['ported', 'Ported'], ['bandpass', '4th BP'], ['bandpass6', '6th BP']])}
      ${num('dims.w', 'Width', '', { len: 1 })}${num('dims.h', 'Height', '', { len: 1 })}${num('dims.d', 'Depth', '', { len: 1 })}
      ${num('t', 'Material thickness', '', { len: 1 })}
      ${layerFields()}
      ${S.brace.mode === 'custom' ? '' : num('braces', 'Braces', '×', { step: 1, ph: 'auto' })}
      ${bracingFields()}
      ${xwallFields()}
      ${num('ql', 'Leakage Q (QL)', '', { step: 0.5 })}
      ${num('damp.fill', 'Damping material fill', '%', { step: 5 })}
      ${E.isBP(S.type) ? num('bp.rear', 'Rear chamber share', '×', { step: 0.05 }) : ''}
      <h3 style="margin-top:10px">Size to a target volume</h3>
      ${num('fit.vol', 'Net volume', 'L')}${sel('fit.ratio', 'Proportions', [['current', 'Keep current'], ['deep', 'Deep 1.3 : 1 : 1.5'], ['golden', 'Golden'], ['cube', 'Cube'], ['wide', 'Wide'], ['tall', 'Tall']])}
      <div class="mini">${act('fit', 'Fit box to volume', 'acc')}${act('qb3', S.type === 'sealed' ? 'Qtc 0.707' : S.type === 'ported' ? 'Flat (QB3)' : 'Suggest')}${S.type === 'sealed' ? act('q09', 'Qtc 0.9') + act('q05', 'Qtc 0.5') : ''}${S.type === 'ported' ? act('compact', 'Compact') : ''}</div></div>`;
    if (S.type !== 'sealed') {
      h += `<div class="card"><h3>Port &amp; tuning</h3>
      ${num('fb', 'Tuning Fb', 'Hz', { step: 0.5 })}
      <div class="mini">${S.type === 'ported' ? act('autofb', 'Auto Fb (flat)') + act('autofb3', 'Auto Fb (extended)') : ''}${act('sizeport', 'Size port for airspeed')}${E.isBP(S.type) ? act('tunebp-wide', 'Auto-tune: wide') + act('tunebp-spl', 'Auto-tune: high output') : ''}</div>
      <h3 style="margin-top:8px">${S.type === 'bandpass6' ? 'Front-chamber port' : 'Port shape'}</h3>
      ${portFields('port')}
      ${S.type === 'ported' ? `<h3 style="margin-top:8px">Port opens through</h3>${seg('port.pos', PANEL_OPTS)}` : ''}
      ${chk('port.flare', 'Flared port ends')}
      ${S.type === 'bandpass6' ? `<h3 style="margin-top:12px">Rear-chamber port (on back panel)</h3>${num('fb2', 'Tuning Fb (rear)', 'Hz', { step: 0.5 })}${portFields('port2')}${chk('port2.flare', 'Flared port ends')}` : ''}`;
      const pp = E.portPanel(S), dp = E.drvPanel(S), withDrivers = E.isBP(S.type) ? pp === 'front' : pp === dp;
      const pl = S.port.place, slot = S.port.kind === 'slot';
      // placement is part of the port section (one drop-down), under its own sub-heading
      h += `<h3 style="margin-top:12px">Port placement</h3>
      <p class="note" style="margin-top:0">${slot ? 'The slot sits where its walls are (see "Slot wall" above).' + (withDrivers || E.isBP(S.type) ? ' The drivers use the space that is left.' : '') : withDrivers ? 'Choose which side of the drivers the port sits on, or place it yourself.' : 'The port is on the ' + V.PNAME[pp] + ' panel' + (dp ? ', the drivers on the ' + V.PNAME[dp] + ' panel.' : '.')}</p>
      ${slot ? '' : withDrivers ? sel('port.place', 'Port position', [['auto', 'Automatic (best fit)'], ['right', 'Right of drivers'], ['left', 'Left of drivers'], ['below', 'Below drivers'], ['above', 'Above drivers'], ['custom', 'Custom – I choose']], true) : sel('port.place', 'Port position', [['auto', 'Centred on the panel'], ['custom', 'Custom – I choose']], true)}
      ${!slot && pl === 'custom' ? num('layout.px', 'Centre from left', '', { len: 1, ph: 'centre' }) + num('layout.py', 'Centre from bottom', '', { len: 1, ph: 'centre' }) : ''}
      <div id="place-note" class="note"></div></div>`;
    }
    const bpType = E.isBP(S.type), dpan = E.drvPanel(S), grid = S.n > 1 && S.layout.dir === 'grid';
    h += `<div class="card"><h3>Driver layout</h3>
      ${bpType ? '<p class="note" style="margin-top:0">In a band-pass box the drivers sit on the internal divider.</p>' : `<h3 style="margin-top:0">Drivers mounted on</h3>${seg('layout.panel', PANEL_OPTS)}`}
      ${S.n > 1 ? sel('layout.dir', 'Arrangement', [['auto', 'Automatic'], ['row', 'Side by side'], ['col', 'Stacked'], ['grid', 'Rows (e.g. 2 on 2, 3 on 3)']], true) : ''}
      ${grid ? num('layout.cols', 'Drivers per row', '×', { step: 1 }) + `<p class="note" style="margin:2px 0 6px">${S.n} drivers: ${gridText(S.n, S.layout.cols)}.</p>` : ''}
      ${num('layout.gap', 'Gap between drivers', '', { len: 1 })}
      <label class="fld"><span>Position in free area</span><div class="inp"><input type="range" data-k="layout.align" min="0" max="100" step="1" value="${S.layout.align}" style="margin:6px 0"><em id="align-v">${S.layout.align}%</em></div></label>
      <div class="rng-l"><span>towards left</span><span>centre</span><span>towards right</span></div>
      ${bpType ? '' : `<h3 style="margin-top:8px">Exact position (optional)</h3>${num('layout.dx', 'Group centre from left edge', '', { len: 1, ph: 'auto' })}${num('layout.dy', 'Group centre from bottom edge', '', { len: 1, ph: 'auto' })}<p class="note" style="margin:2px 0 6px">Measured on the ${V.PNAME[dpan]} panel seen from outside${dpan === 'top' ? ' (front edge at the bottom)' : dpan === 'bottom' ? ' (back edge at the bottom)' : ''}. Leave empty to place the group automatically.</p>`}
      <p class="note">Edge-to-edge distance between cut-outs (minimum 10 mm so the baffle keeps its strength). The position slider moves the driver group within the space left beside the port, e.g. to the left when the port is on the right.</p></div>`;
    h += `<div class="card"><h3>Use &amp; environment</h3>
      ${num('power', 'Amplifier power (RMS)', 'W', { step: 10 })}
      ${num('amp.minOhm', 'Amp stable down to', 'Ω', { step: 0.25 })}
      ${sel('env.type', 'Environment', [['free', 'Free field (2π)'], ['room', 'Home room'], ['car', 'Car cabin']], true)}
      ${S.env.type !== 'free' ? num('env.fc', 'Gain starts below', 'Hz', { step: 1 }) + num('env.cap', 'Max gain', 'dB', { step: 1 }) : ''}
      ${num('hp.f', 'Subsonic filter (0 = off)', 'Hz', { step: 1 })}${sel('hp.order', 'Filter slope', [[2, '12 dB/oct'], [4, '24 dB/oct']])}
      <div class="mini">${act('setenv', 'Apply env. defaults')}</div></div>`;
    h += '<div class="card"><h3>Wiring options</h3><div id="wiring"></div></div>';
    h += `<div class="card"><h3>Sheet material</h3>${num('sheet.w', 'Sheet length', 'mm', { step: 1 })}${num('sheet.h', 'Sheet width', 'mm', { step: 1 })}${num('sheet.kerf', 'Saw kerf', 'mm', { step: 0.5 })}</div>`;
    const sideEl = $('#side'), keep = sideEl.scrollTop, winY = window.scrollY, ae = document.activeElement;
    let sel2 = null;
    if (ae && sideEl.contains(ae)) {
      if (ae.dataset.nudge) sel2 = `[data-nudge="${ae.dataset.nudge}"]`;
      else if (ae.dataset.act) sel2 = `[data-act="${ae.dataset.act}"]`;
      else if (ae.dataset.seg) sel2 = `[data-seg="${ae.dataset.seg}"][data-v="${ae.dataset.v}"]`;
      else if (ae.dataset.k) sel2 = `[data-k="${ae.dataset.k}"]`;
    }
    // every input group is a drop-down: the title is the toggle, and which ones are open survives the redraw
    sideEl.innerHTML = h.replace(/<div class="card"><h3>(.*?)<\/h3>/g, (m, x) => { const on = openCards.has(x.replace(/&amp;/g, '&')); return `<div class="card${on ? ' open' : ''}" data-card="${x}"><h2 class="ch"><button type="button" class="ch-btn" aria-expanded="${on}">${x}</button></h2>`; });
    sideEl.scrollTop = keep;
    if (sel2) { const n = sideEl.querySelector(sel2); if (n) n.focus({ preventScroll: true }); }
    if (window.scrollY !== winY) window.scrollTo({ top: winY, behavior: 'instant' });
    $('#btn-unit').textContent = S.unit;
  }

  let pending = false;
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; recalc(); }); };

  $('#side').addEventListener('input', (e) => {
    const el = e.target, k = el.dataset.k; if (!k || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    if (el.type === 'text') set(S, k, el.value);
    else {
      if (el.value === '') {
        if (k === 'braces' || k === 'layout.px' || k === 'layout.py' || k === 'layout.dx' || k === 'layout.dy' || k === 'driver.mms' || k === 'driver.cms' || k === 'driver.zn' || k === 'driver.qms' || /\.walls\.\d+\.pos$|^xwalls\.\d+\.o[12]$/.test(k)) { set(S, k, null); schedule(); }
        else if (/\.walls\.\d+\.span$|^xwalls\.\d+\.(s[12]|pos)$/.test(k)) { set(S, k, 0); schedule(); }
        return;
      }
      let v = parseFloat(el.value); if (isNaN(v)) return;
      if (el.dataset.len) v *= LEN[S.unit];
      if (k === 'n' || k === 'port.n' || k === 'port2.n' || k === 'layout.cols') v = Math.max(1, Math.round(v));
      if (k === 'layout.align') { const a = $('#align-v'); if (a) a.textContent = Math.round(v) + '%'; }
      // a wall that stops being full width gets a position field (and the reverse), so the panel is redrawn on that change
      const flip = /\.walls\.\d+\.span$/.test(k) && (get(S, k) > 0) !== (v > 0);
      set(S, k, v);
      if (flip) renderSide();
    }
    schedule();
  });
  $('#side').addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'preset') { const all = PRESETS.concat(userDrivers()); const p = all[+el.value]; if (p) { S.driver = Object.assign({ vc: 'single', wire: 'series' }, clone(p)); schedule(); renderSide(); } return; }
    const k = el.dataset.k; if (!k || (el.type !== 'checkbox' && el.tagName !== 'SELECT')) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'hp.order') v = +v;
    const am = k.match(/^brace\.items\.(\d+)\.axis$/);
    if (am) { set(S, k, v); centerBrace(+am[1]); renderSide(); schedule(); return; }
    set(S, k, v); if (k === 'type' || el.dataset.rebuild) renderSide(); schedule();
  });
  $('#side').addEventListener('click', (e) => {
    const cb = e.target.closest('.ch-btn');
    if (cb) {
      const card = cb.closest('.card'), k = card.dataset.card, on = !card.classList.contains('open');
      card.classList.toggle('open', on); cb.setAttribute('aria-expanded', on);
      if (on) openCards.add(k); else openCards.delete(k);
      try { localStorage.setItem('sf_open', JSON.stringify([...openCards])); } catch (err) { /* only remembered for this visit */ }
      return;
    }
    const nu = e.target.closest('[data-nudge]'); if (nu) { nudgeBrace(nu.dataset.nudge); return; }
    const wn = e.target.closest('[data-wnudge]'); if (wn) { nudgeWall(wn.dataset.wnudge); return; }
    const sg = e.target.closest('[data-seg]'); if (sg) { const v = sg.dataset.v; if (sg.dataset.seg === 'brace.mode' && v === 'custom' && S.brace.mode !== 'custom') seedBraces(); set(S, sg.dataset.seg, v); if (sg.dataset.seg === 'type') { if (v === 'bandpass' && S.port.kind === 'slot') { /* ok */ } } renderSide(); schedule(); return; }
    const a = e.target.closest('[data-act]'); if (a && a.tagName === 'BUTTON') action(a.dataset.act);
  });

  function setDimsFor(vol) {
    const nd = E.fitDims(S, vol, S.fit.ratio); S.dims = nd; S.fit.vol = Math.round(vol * 10) / 10;
  }
  /* ---------------- brace helpers ---------------- */
  function seedBraces() { // copy the current automatic layout into editable items
    const g = last && last.geo; if (!g) return;
    S.brace.items = g.bracesList.map((b) => (b.axis === 'vertical' ? { axis: 'vertical', a: b.x, b: b.z } : b.axis === 'side' ? { axis: 'side', a: b.y, b: b.z } : { axis: 'depth', a: b.x, b: b.y })).map((it) => ({ axis: it.axis, a: Math.round(it.a), b: Math.round(it.b) }));
  }
  function centerBrace(i) {
    const g = last && last.geo, it = S.brace.items[i]; if (!g || !it) return;
    if (it.axis === 'vertical') { it.a = Math.round(g.Wi / 2); it.b = Math.round(g.Di / 2); }
    else if (it.axis === 'side') { it.a = Math.round(g.Hi / 2); it.b = Math.round(g.Di / 2); }
    else { it.a = Math.round(g.Wi / 2); it.b = Math.round(g.Hi / 2); }
  }
  function nudgeBrace(spec) {
    const [i, f, d] = spec.split(','), it = S.brace.items[+i], g = last && last.geo; if (!it || !g) return;
    const lim = it.axis === 'vertical' ? { a: g.Wi, b: g.Di } : it.axis === 'side' ? { a: g.Hi, b: g.Di } : { a: g.Wi, b: g.Hi };
    const half = S.brace.size / 2;
    it[f] = Math.round(Math.min(Math.max(it[f] + +d, half), Math.max(lim[f] - half, half)));
    const inp = $(`#side input[data-k="brace.items.${i}.${f}"]`);
    if (inp) inp.value = S.unit === 'in' ? Math.round(it[f] / 25.4 * 1000) / 1000 : S.unit === 'cm' ? it[f] / 10 : it[f];
    schedule();
  }

  /* ---------------- slot wall helpers ---------------- */
  // centre of slot i as the user measures it: from the panel's left edge (walls along top/bottom) or bottom edge (along left/right)
  function slotCentre(pk, i) {
    const g = last && last.geo, pt = g && (pk === 'port' ? g.port : g.port2), s = pt && pt.slots && pt.slots[i]; if (!s) return null;
    const fr = E.panelFrame(S, g, portPanelOf(pk));
    return s.vert ? fr.b0 + fr.PH / 2 + (s.y0 + s.y1) / 2 : fr.a0 + fr.PW / 2 + (s.x0 + s.x1) / 2;
  }
  function nudgeWall(spec) {
    const [path, d] = spec.split(','), m = path.match(/^(?:(port2?)\.walls|xwalls)\.(\d+)\.(gap|pos)$/); if (!m) return;
    const w = m[1] ? S[m[1]].walls[+m[2]] : S.xwalls[+m[2]]; if (!w) return;
    if (m[1] && m[3] === 'pos' && w.pos == null) w.pos = slotCentre(m[1], +m[2]) || 0;
    w[m[3]] = Math.max(m[3] === 'gap' ? 5 : 0, Math.round(w[m[3]] + +d));
    const inp = $(`#side input[data-k="${path}"]`);
    if (inp) inp.value = S.unit === 'in' ? Math.round(w[m[3]] / 25.4 * 1000) / 1000 : S.unit === 'cm' ? w[m[3]] / 10 : w[m[3]];
    schedule();
  }
  // a new extra wall starts across the middle of the box, standing parallel to the front
  function addXwall() {
    const g = last && last.geo; if (S.xwalls.length >= MAX_XWALLS) return;
    S.xwalls.push({ dir: 'across', pos: g ? Math.round(g.Di / 2) : 100, s1: 0, s2: 0, o1: null, o2: null });
  }
  function sizePortsNow(target) {
    const D = E.makeDriver(S.driver), geo = E.geometry(S), m = E.modelFromState(S, geo), sim = E.simulate(D, m, E.grid(10, 200, 120), simOpts(S));
    const size = (P, port, vmax) => {
      const need = port.SpTot * vmax / (target || 15);
      if (P.kind === 'pipe') P.dia = Math.min(400, Math.max(10, Math.round(Math.sqrt(4 * need / P.n / Math.PI) * 1000)));
      else if (port.slots) { const k = need / port.SpTot; P.walls.forEach((w, i) => { const s = port.slots[i]; if (s) w.gap = Math.max(5, Math.round(s.gap * k)); }); }
      else { const shortSide = Math.max(5, Math.round(need * 1e6 / port.wSlot)); if (port.vertical) { P.slotW = shortSide; P.slotH = 0; } else { P.slotH = shortSide; P.slotW = 0; } }
    };
    size(S.port, geo.port, Math.max(...sim.vp));
    if (S.type === 'bandpass6') size(S.port2, geo.port2, Math.max(...sim.vpr));
  }
  function deriveSd() {
    const d = S.driver; let cms = null; // m/N
    if (d.cms > 0) cms = d.cms * 1e-3; else if (d.mms > 0 && d.fs > 0) cms = 1 / (Math.pow(2 * Math.PI * d.fs, 2) * d.mms * 1e-3);
    if (!cms || !(d.vas > 0)) { toast('Enter Mms (g) or Cms (mm/N) first'); return false; }
    d.sd = Math.round(Math.sqrt((d.vas / 1000) / (E.RHO * E.C * E.C * cms)) * 1e4); return true;
  }

  /* ---------------- impedance / wiring ---------------- */
  const STD_OHM = [0.5, 1, 2, 3, 4, 6, 8, 12, 16];
  const stdOhm = (re) => STD_OHM.reduce((b, z) => (Math.abs(Math.log(re / z / 0.85)) < Math.abs(Math.log(re / b / 0.85)) ? z : b), STD_OHM[0]);
  // nominal impedance of one driver: datasheet value if given (per coil for dual-coil drivers), otherwise an estimate from Re
  function nominalDriver(d, coilWire) {
    const base = d.zn > 0 ? d.zn : stdOhm(d.re);
    if (d.vc !== 'dual') return base;
    return (coilWire || d.wire) === 'parallel' ? base / 2 : base * 2;
  }
  const nominalLoad = (s, coilWire, arrWire) => { const z = nominalDriver(s.driver, coilWire); return (arrWire || s.wiring) === 'series' ? z * s.n : z / s.n; };
  function renderWiring(R) {
    const el = $('#wiring'); if (!el || !R.ok) return;
    const s = R.s, d = s.driver, dual = d.vc === 'dual';
    const coils = dual ? ['series', 'parallel'] : [null], arrs = s.n > 1 ? ['parallel', 'series'] : [null];
    let h = '<table><thead><tr><th>Wiring</th><th class="n">Load</th><th><span class="sr">Choose</span></th></tr></thead><tbody>';
    coils.forEach((c) => arrs.forEach((a) => {
      const z = nominalLoad(s, c, a), cur = (!dual || d.wire === c) && (s.n === 1 || s.wiring === a), ok = z >= s.amp.minOhm - 1e-6;
      const name = [dual ? 'coils ' + c : null, s.n > 1 ? 'drivers ' + a : null].filter(Boolean).join(', ') || 'single driver';
      h += `<tr><td>${name}${cur ? ' <b>(current)</b>' : ''}</td><td class="n" style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${f2(z)} Ω</td><td>${cur ? '' : `<button class="btn sm" data-act="wire:${c || ''},${a || ''}">Use</button>`}</td></tr>`;
    }));
    h += '</tbody></table><p class="note" style="margin:0">Nominal loads are estimated from Re (enter the datasheet impedance as "Nominal impedance" to be exact). Green = within your amplifier\'s stable range.</p>';
    el.innerHTML = h;
  }

  /* ---------------- band-pass auto-tune ---------------- */
  function bandMetrics(fr, db) {
    let ip = 0; db.forEach((v, i) => { if (v > db[ip]) ip = i; });
    const P = db[ip]; let lo = ip, hi = ip;
    while (lo > 0 && db[lo] > P - 3) lo--; while (hi < db.length - 1 && db[hi] > P - 3) hi++;
    const fl = fr[lo], fu = fr[hi], peaks = [];
    for (let i = Math.max(1, lo); i < Math.min(db.length - 1, hi); i++) if (db[i] > db[i - 1] && db[i] >= db[i + 1]) peaks.push(i);
    let dip = 0;
    if (peaks.length >= 2) { peaks.sort((x, y) => db[y] - db[x]); const a = Math.min(peaks[0], peaks[1]), b = Math.max(peaks[0], peaks[1]); let vmin = 1e9; for (let i = a; i <= b; i++) vmin = Math.min(vmin, db[i]); dip = Math.min(db[peaks[0]], db[peaks[1]]) - vmin; }
    return { P, fl, fu, oct: Math.log2(fu / fl), dip };
  }
  function autoTuneBP(mode) {
    if (!E.isBP(S.type)) return null;
    const D = E.makeDriver(S.driver), D0 = { ...D, le: 0 }, six = S.type === 'bandpass6', n = S.n, kf = E.dampFactors(S);
    const ref = E.simulate(D0, { type: 'sealed', n: 1, ql: 1e9, Vb1: 50 }, [3000], { power: 1 }).spl[0];
    const fr = E.grid(15, 220, 64), opts = simOpts(S);
    // port length that the airspeed rule (15 m/s at the amplifier power) would need for a chamber of volume V (litres) tuned to f
    const needLen = (vpk, V, f, Dc) => { const A = n * vpk * 0.01 / 20, Leff = E.C * E.C * A / Math.pow(2 * Math.PI * f, 2) / (V / 1000), L = (Leff - 1.46 * Math.sqrt(A / Math.PI)) * 1000; return { L, over: Math.max(0, L / (2.1 * Math.max(Dc - 30, 20)) - 1) }; };
    let best = null;
    for (let pass = 0; pass < 2; pass++) {
      const geo = E.geometry(S), Vtot = geo.Vnet, dep = geo.Di - S.t; best = null;
      for (const r of [0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.68]) {
        const Vr = Vtot * r, Vf = Vtot * (1 - r), Df = dep * (1 - r), Dr = dep * r;
        for (let i = 0; i < 12; i++) {
          const fb = D.fs * (0.8 + 1.4 * i / 11);
          for (let j = 0; j < (six ? 10 : 1); j++) {
            const fb2 = six ? D.fs * (0.6 + 1.2 * j / 9) : 0;
            const m = { type: S.type, n, ql: S.ql, Vr1: Vr * kf.rear / 1000 / n, Vf1: Vf * kf.front / 1000 / n, fb, fb2, Sp1: 0.01, Sp2: 0.01 };
            const mt = bandMetrics(fr, E.simulate(D0, m, fr, { power: n }).spl.map((v) => v - ref));
            const hot = E.simulate(D, m, fr, opts);
            const lf = needLen(Math.max(...hot.vp), Vf, fb, Df), lr = six ? needLen(Math.max(...hot.vpr), Vr, fb2, Dr) : { over: 0 };
            const pen = Math.max(0, mt.dip - 2) * 5 + Math.max(0, -mt.P) * 2 + lf.over * 10 + lr.over * 10;
            let score;
            if (pen > 0) score = -100 - pen;
            else score = mode === 'spl' ? (mt.oct >= 0.45 ? mt.P : -50 + mt.oct) : mt.oct + 0.05 * mt.P;
            if (!best || score > best.score) best = { score, r, fb, fb2, mt };
          }
        }
      }
      // set the rear/front split to the chosen volume ratio and the tunings (effective values), then size the ports and repeat once
      let lo = 0.1, hi = 0.9; const T = clone(S);
      for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; T.bp.rear = mid; const g = E.geometry(T); if (g.Vr / (g.Vr + g.Vf) < best.r) lo = mid; else hi = mid; }
      S.bp.rear = Math.round((lo + hi) / 2 * 1000) / 1000; S.fb = Math.round(best.fb * 2) / 2; if (six) S.fb2 = Math.round(best.fb2 * 2) / 2;
      S.port.lenMode = 'auto'; S.port2.lenMode = 'auto'; sizePortsNow(20);
    }
    return best.mt;
  }
  function action(a) {
    if (a === 'closedrawer') { document.body.classList.remove('drawer-open'); return; }
    if (a === 'tunebp-wide' || a === 'tunebp-spl') { const mt = autoTuneBP(a === 'tunebp-spl' ? 'spl' : 'wide'); renderSide(); schedule(); if (mt) toast(`Tuned: ${f1(mt.fl)}–${f1(mt.fu)} Hz (−3 dB), ${f1(mt.oct)} octaves, peak ${mt.P >= 0 ? '+' : ''}${f1(mt.P)} dB`); return; }
    if (a.indexOf('wire:') === 0) { const [c, ar] = a.slice(5).split(','); if (c) S.driver.wire = c; if (ar) S.wiring = ar; renderSide(); schedule(); return; }
    if (a === 'derivesd') { if (deriveSd()) { renderSide(); schedule(); toast('Sd = ' + S.driver.sd + ' cm² (from Vas and ' + (S.driver.cms > 0 ? 'Cms' : 'Mms and Fs') + ')'); } return; }
    if (a === 'addbrace') { if (S.brace.items.length < 12) { S.brace.items.push({ axis: 'vertical', a: 0, b: 0 }); centerBrace(S.brace.items.length - 1); } renderSide(); schedule(); return; }
    if (a.indexOf('delbrace:') === 0) { S.brace.items.splice(+a.split(':')[1], 1); renderSide(); schedule(); return; }
    if (a === 'addxwall') { addXwall(); renderSide(); schedule(); return; }
    if (a.indexOf('delxwall:') === 0) { S.xwalls.splice(+a.split(':')[1], 1); renderSide(); schedule(); return; }
    const D = E.makeDriver(S.driver), ok = E.validDriver(S.driver);
    if (a === 'savedrv') { const l = userDrivers().filter((p) => p.name !== S.driver.name); l.push(clone(S.driver)); localStorage.setItem('sf_drivers', JSON.stringify(l)); renderSide(); toast('Driver saved in this browser'); return; }
    if (a === 'deldrv') { localStorage.setItem('sf_drivers', JSON.stringify(userDrivers().filter((p) => p.name !== S.driver.name))); renderSide(); return; }
    if (a === 'setenv') { S.env = S.env.type === 'car' ? { type: 'car', fc: 50, cap: 12 } : S.env.type === 'room' ? { type: 'room', fc: 40, cap: 6 } : S.env; renderSide(); schedule(); return; }
    if (!ok) { toast('Fix the driver T/S values first (Qts must be below Qes).'); return; }
    if (a === 'fit') { setDimsFor(S.fit.vol); }
    else if (a === 'qb3') {
      if (S.type === 'sealed') setDimsFor(D.vasL / (Math.pow(0.7071 / D.qts, 2) - 1));
      else if (S.type === 'ported') { S.port.lenMode = 'auto'; setDimsFor(15 * Math.pow(D.qts, 3.3) * D.vasL); S.fb = Math.round(0.42 * D.fs * Math.pow(D.qts, -0.96) * 2) / 2; }
      else { setDimsFor(D.vasL * 1.2); S.fb = Math.round(D.fs * 1.4); S.fb2 = Math.round(D.fs * 1.15); S.bp.rear = 0.45; }
    } else if (a === 'q09' || a === 'q05') { const q = a === 'q09' ? 0.9 : 0.5; const v = q > D.qts ? D.vasL / (Math.pow(q / D.qts, 2) - 1) : D.vasL * 2; setDimsFor(v); }
    else if (a === 'compact') { S.port.lenMode = 'auto'; const v = 0.6 * 15 * Math.pow(D.qts, 3.3) * D.vasL; setDimsFor(v); const r = E.alignPorted(D, v * E.dampFactors(S).ported / S.n, S.ql, 3); S.fb = Math.round(r.fb * 2) / 2; }
    else if (a === 'autofb' || a === 'autofb3') { S.port.lenMode = 'auto'; const geo = E.geometry(S); const r = E.alignPorted(D, geo.Vnet * E.dampFactors(S).ported / S.n, S.ql, a === 'autofb' ? 1 : 3); S.fb = Math.round(r.fb * 2) / 2; }
    else if (a === 'sizeport') { sizePortsNow(); toast('Port area sized for about 15 m/s peak air speed'); }
    renderSide(); schedule();
  }

  /* ---------------- derived helpers ---------------- */
  const simOpts = (s) => ({ power: s.power, env: s.env, hp: s.hp.f ? s.hp : null });
  const FR = E.grid(8, 400, 260);
  function at(arr, fr, f) {
    if (f <= fr[0]) return arr[0]; if (f >= fr[fr.length - 1]) return arr[arr.length - 1];
    let i = 0; while (fr[i + 1] < f) i++;
    const t = Math.log(f / fr[i]) / Math.log(fr[i + 1] / fr[i]); return arr[i] + (arr[i + 1] - arr[i]) * t;
  }
  function analyze(s) {
    const ok = E.validDriver(s.driver); if (!ok) return { ok };
    const D = E.makeDriver(s.driver), geo = E.geometry(s), m = E.modelFromState(s, geo);
    const sim = E.simulate(D, m, FR, simOpts(s));
    const R = { ok, s, D, geo, m, sim, fbEff: m.fb, fb2Eff: m.fb2 };
    const D0 = { ...D, le: 0 };
    if (s.type === 'sealed') {
      const VbL = m.Vb1 * 1000, sp = E.sealedParams(D, VbL, s.ql);
      const db = E.AL_FR.map((f) => E.dbSealed(D, VbL, s.ql, f));
      R.fc = sp.fc; R.qtc = sp.qtc; R.f3 = E.crossing(E.AL_FR, db, 3); R.f10 = E.crossing(E.AL_FR, db, 10); R.rip = E.ripple(E.AL_FR, db, R.f3);
    } else if (s.type === 'ported') {
      const VbL = m.Vb1 * 1000, db = E.AL_FR.map((f) => E.dbPorted(D, VbL, m.fb, s.ql, f));
      R.f3 = E.crossing(E.AL_FR, db, 3); R.f10 = E.crossing(E.AL_FR, db, 10); R.rip = E.ripple(E.AL_FR, db, R.f3);
    } else {
      const ref = E.simulate(D0, m, FR, { power: s.n });
      let pk = 0; ref.spl.forEach((v, i) => { if (v > ref.spl[pk]) pk = i; });
      const lv = ref.spl[pk] - 3; let lo = pk, hi = pk;
      while (lo > 0 && ref.spl[lo] > lv) lo--; while (hi < FR.length - 1 && ref.spl[hi] > lv) hi++;
      R.f3 = FR[lo]; R.fu = FR[hi]; R.fpk = FR[pk];
    }
    R.spl1 = E.simulate(D0, { type: 'sealed', n: 1, ql: 1e9, Vb1: 50 }, [1000], { power: 1 }).spl[0];
    R.xpk = Math.max(...sim.x.filter((_, i) => FR[i] >= 15)); R.xpkF = FR[sim.x.findIndex((v, i) => FR[i] >= 15 && v === R.xpk)];
    R.vpk = Math.max(...sim.vp, ...sim.vpr);
    R.parts = E.panels(s, geo); R.weight = E.weightKg(s, R.parts);
    return R;
  }

  /* ---------------- checks ---------------- */
  function checks(R) {
    const out = [], add = (lvl, txt) => out.push({ lvl, txt }), s = R.s;
    if (!R.ok) return [{ lvl: 'bad', txt: 'Driver parameters are invalid. Qts must be smaller than Qes, and all values must be positive.' }];
    const { D, geo } = R, hp = s.hp.f;
    if (geo.Vnet < 3) add('bad', 'Net volume is extremely small – the model is not meaningful.');
    if (s.type === 'sealed') {
      if (R.qtc < 0.5) add('warn', `Qtc ${f2(R.qtc)} is very low: thin, dry bass with a slow roll-off start.`);
      else if (R.qtc <= 0.8) add('ok', `Qtc ${f2(R.qtc)} gives a tight, well-damped response (0.707 is maximally flat).`);
      else if (R.qtc <= 1.1) add('ok', `Qtc ${f2(R.qtc)}: a little warm, with a mild bass hump – popular for music in cars.`);
      else add('warn', `Qtc ${f2(R.qtc)} is high: noticeable hump and longer ringing. Increase the volume for a tighter sound.`);
    } else if (s.type === 'ported') {
      const p = geo.port;
      if (p.tooShort) add('bad', `The port cannot be shorter than 10 mm, so the real tuning is ${f1(p.fbAct)} Hz instead of ${f1(s.fb)} Hz. Use a smaller port area, more volume, or a lower tuning.`);
      if (R.rip > 2) add('warn', `Response has a ${f1(R.rip)} dB peak above F3 – the alignment is peaky. Try "Auto Fb (flat)".`);
      else add('ok', `Passband ripple is only ${f1(R.rip)} dB – a well-behaved alignment.`);
      if (p.fbAct < 0.6 * D.fs) add('warn', 'Tuned far below Fs: output rolls off sharply and the cone is poorly controlled near and below Fb.');
      if (p.fbAct > 1.4 * D.fs) add('warn', 'Tuned well above Fs: expect a pronounced hump and poor transient response.');
    } else {
      add('ok', `${s.type === 'bandpass6' ? '6th' : '4th'}-order band-pass: main output ${f1(R.f3)}–${f1(R.fu)} Hz (−3 dB), peak near ${f1(R.fpk)} Hz. Narrow designs are very efficient but less accurate.`);
    }
    if (s.type !== 'sealed') {
      if (R.vpk > 34) add('bad', `Peak port air speed reaches ${f1(R.vpk)} m/s (${f1(R.vpk / 343 * 100)} % Mach) at ${s.power} W – expect audible chuffing. Use "Size port for airspeed".`);
      else if (R.vpk > 17) add('warn', `Peak port air speed ${f1(R.vpk)} m/s (${f1(R.vpk / 343 * 100)} % Mach) at ${s.power} W. Fine for music; port noise may appear on loud bass notes (limit ≈17 m/s).`);
      else add('ok', `Port air speed stays below ${f1(R.vpk)} m/s at ${s.power} W – no chuffing expected.`);
      geo.portList.forEach(({ label, port: p }) => {
        if (p.clash) add('bad', `${label}: the slot walls ${p.folded ? 'or their folded segments ' : ''}overlap or cross each other. Move a wall, make a slot narrower, ${p.folded ? 'turn off folding, ' : ''}or remove a wall.`);
        if (p.tooShort && s.type !== 'ported') add('bad', `${label}: cannot be shorter than 10 mm, so its real tuning is ${f1(p.fbAct)} Hz. Use a smaller port area or more chamber volume.`);
        if (p.folded && p.foldFits) add('ok', `${label} (${Math.round(p.L)} mm in total) is folded into ${p.nSeg} straight segments of ${Math.round(p.segLen)} mm and needs ${Math.round(p.stack)} mm across the box. Check clearance around the driver magnet.`);
        else if (p.folded) add('bad', `${label} needs ${p.nSeg} folded segments (${Math.round(p.stack)} mm across) but only ${Math.round(p.stackAvail)} mm is available. Use a smaller port area, a higher tuning, or a bigger box.`);
        else if (p.L > 4 * p.avail) add('bad', `${label} would need to be ${Math.round(p.L)} mm long – its area (${f1(p.SpTot * 1e4)} cm²) is far too large for this volume and tuning. Reduce the port area or slot height, raise Fb, or enlarge the box.`);
        else if (p.L > p.avail) add('warn', `${label} is ${Math.round(p.L)} mm long but only about ${Math.round(p.avail)} mm fits straight. Turn on "Fold the port to fit" or use a smaller port area.`);
        else add('ok', `${label} length ${Math.round(p.L)} mm fits straight inside the box.`);
      });
    }
    // excursion
    const over = R.sim.x.map((x, i) => (x > D.xmax * 1.0 ? FR[i] : 0));
    const highest = Math.max(0, ...over);
    if (highest > 0 && highest < 200) {
      const sub = Math.ceil(highest * 0.9);
      add(R.xpk > D.xmax * 1.5 ? 'bad' : 'warn', `At ${s.power} W the cone exceeds Xmax (${f1(D.xmax)} mm) up to ${f1(highest)} Hz (peak ${f1(R.xpk)} mm at ${f1(R.xpkF)} Hz). ${hp ? 'Raise the subsonic filter or reduce power.' : `A subsonic filter around ${sub} Hz, or less power, protects the driver.`}`);
    } else add('ok', `Peak cone excursion ${f1(R.xpk)} mm stays within Xmax (${f1(D.xmax)} mm) at ${s.power} W.`);
    const loadNow = nominalLoad(s);
    if (loadNow < s.amp.minOhm - 1e-6) add('bad', `The amplifier sees about ${f2(loadNow)} Ω but is only stable down to ${f2(s.amp.minOhm)} Ω. Re-wire the drivers or coils (see "Wiring options").`);
    else add('ok', `Amplifier load about ${f2(loadNow)} Ω (stable down to ${f2(s.amp.minOhm)} Ω).`);
    if (s.damp.fill > 0) add('ok', `Damping material at ${Math.round(s.damp.fill)} % fill: effective volume about ${f1(((s.type === 'sealed' ? E.dampFactors(s).sealed : s.type === 'ported' ? E.dampFactors(s).ported : E.dampFactors(s).rear) - 1) * 100)} % larger (approximate, depends on the material).`);
    const pw = s.power / s.n;
    if (pw > D.pe * 1.0) add('warn', `${Math.round(pw)} W per driver exceeds the ${D.pe} W rating.`);
    else if (pw < D.pe * 0.3) add('ok', `Amp power is well inside the driver's rating (${Math.round(pw)} W of ${D.pe} W per driver).`);
    // geometry
    const lay = R.lay;
    if (lay && lay.warn.length) lay.warn.forEach((w) => add('bad', w));
    else add('ok', 'Drivers and ports fit on the baffle with clearance.');
    if (lay && geo.xwalls) xwallChecks(R, add);
    const span = Math.max(geo.Wi, geo.Hi), unbraced = geo.nb ? geo.Di / (geo.nb + 1) : geo.Di;
    if ((span > 400 && geo.nb === 0) || span / s.t > 28 + geo.nb * 6) add('warn', `Large flat panels (${Math.round(span)} mm across, ${s.t} mm thick) may flex at high SPL. Add brace bars or thicker material; ${geo.autoB} brace${geo.autoB === 1 ? '' : 's'} recommended.`);
    else add('ok', 'Panel stiffness looks adequate for the size.');
    if (geo.Vnet > 3 * D.vasL && s.type === 'sealed') add('warn', 'Sealed volume is much larger than Vas – little effect from the box; the driver is almost in free air.');
    const dp = E.drvPanel(s), dfr = dp ? E.panelFrame(s, geo, dp) : null;
    if (dfr && Math.min(dfr.PW, dfr.PH) < s.driver.cut + 40) add('bad', dp === 'front' ? 'Baffle is too small for the driver cut-out.' : `The ${V.PNAME[dp]} panel is too small for the driver cut-out.`);
    if (s.driver.depth > 0 && s.type !== 'sealed' || s.driver.depth > 0) {
      const avail = E.isBP(s.type) ? geo.Dr : dfr.depth, need = s.driver.depth;
      const fix = dp === 'left' || dp === 'right' ? 'Make the box wider.' : dp === 'top' || dp === 'bottom' ? 'Make the box taller.' : 'Make the box deeper.';
      if (avail < need + 5) add('bad', `The driver is ${need} mm deep but only ${Math.round(avail)} mm is available behind ${E.isBP(s.type) ? 'the divider' : dp === 'front' ? 'the baffle' : 'the ' + V.PNAME[dp] + ' panel'}. ${fix}`);
      else if (avail < need + 35) add('warn', `Only ${Math.round(avail - need)} mm clearance behind the driver (mounting depth ${need} mm). Allow room for the magnet and wiring.`);
      else add('ok', `The driver (${need} mm deep) fits with ${Math.round(avail - need)} mm to spare.`);
    }
    return out;
  }

  /* extra walls against the port channel, the space just past the port's inner end, the drivers and the band-pass divider.
     Everything is compared as boxes in inside coordinates. The volume they take is in the tuning; blocking a port is not, so it is flagged. */
  function xwallChecks(R, add) {
    const s = R.s, geo = R.geo, lay = R.lay, bp = E.isBP(s.type);
    const rectOf = (q) => (q.foot ? q.foot : [q.x - (q.outD || q.d) / 2, q.x + (q.outD || q.d) / 2, q.y - (q.outD || q.d) / 2, q.y + (q.outD || q.d) / 2]);
    const ports = [];
    geo.portList.forEach(({ label, port }) => {
      const pid = port === geo.port2 ? 'rear' : bp ? 'front' : E.portPanel(s), fr = E.panelFrame(s, geo, pid);
      const depth = bp ? (pid === 'rear' ? geo.Dr : geo.Df) : fr.depth;
      lay.panels[pid].ports.forEach((q) => {
        const r = rectOf(q), folded = q.fold ? q.fold.nSeg > 1 : port.nSeg > 1, len = folded ? Math.max(depth - 30, 10) : Math.min(port.L, depth - 10);
        const clear = port.kind === 'slot' ? q.gap || port.hSlot : port.dia;
        ports.push({ label, box: E.panelBox(s, geo, pid, r[0], r[1], r[2], r[3], fr.th, fr.th + len), end: folded || port.L >= depth - 10 ? null : E.panelBox(s, geo, pid, r[0], r[1], r[2], r[3], fr.th + len, fr.th + len + clear), clear });
      });
    });
    const dp = E.drvPanel(s), drivers = [];
    if (dp) { const fr = E.panelFrame(s, geo, dp), dep = s.driver.depth > 0 ? s.driver.depth : 100; lay.panels[dp].drivers.forEach((q, i) => drivers.push({ i, box: E.panelBox(s, geo, dp, q.x - q.d / 2, q.x + q.d / 2, q.y - q.d / 2, q.y + q.d / 2, fr.th, fr.th + dep) })); }
    geo.xwalls.forEach((w) => {
      const n = 'Extra wall ' + (w.i + 1);
      ports.forEach((p) => {
        if (E.boxHit(w, p.box)) add('bad', `${n} cuts through the ${p.label.toLowerCase()}. Move or shrink it so the port channel stays open.`);
        else if (p.end && E.boxHit(w, p.end)) add('warn', `${n} is less than ${Math.round(p.clear)} mm from the inner end of the ${p.label.toLowerCase()}. Air cannot leave the port freely, which lowers the tuning in a way this model does not include; leave at least the port width clear.`);
      });
      drivers.forEach((d) => { if (E.boxHit(w, d.box)) add('bad', `${n} is in the way of driver ${d.i + 1} (its cut-out and mounting depth).`); });
      if (bp && w.z0 < geo.Df + s.t && w.z1 > geo.Df) add('warn', `${n} crosses the chamber divider; only the parts inside each chamber are counted.`);
    });
    add('ok', `Extra walls take up ${f2(geo.Vxw)} L. The net volume and the port tuning include it.`);
  }

  /* ---------------- rendering ---------------- */
  const stat = (label, val, unit, sub, cls) => `<div class="stat ${cls || ''} ${String(val).length > 9 ? 'long' : ''}"${tipOf('stat:' + label)}><small>${label}</small><b>${val}</b>${unit ? `<i>${unit}</i>` : ''}${sub ? `<span>${sub}</span>` : ''}</div>`;
  function renderCards(R) {
    if (!R.ok) { $('#cards').innerHTML = stat('Driver', 'Invalid', '', 'Check T/S values', 'bad'); return; }
    const { s, geo, D } = R, c = [];
    c.push(stat('Net volume', f1(geo.Vnet), 'L', `${f2(geo.Vnet * L2FT3)} ft³ · gross ${f1(geo.Vint)} L`));
    const ob = geo.outer || s.dims;
    c.push(stat('External size', `${fmtLenBare(ob.w)} × ${fmtLenBare(ob.h)} × ${fmtLenBare(ob.d)}`, S.unit, `${f1(geo.Vext)} L outside${geo.outer ? ' · incl. outer layers' : ''}`));
    if (s.type === 'sealed') { c.push(stat('Fc', f1(R.fc), 'Hz')); c.push(stat('Qtc', f2(R.qtc), '', R.qtc > 1.1 ? 'boomy' : R.qtc < 0.5 ? 'thin' : 'balanced', R.qtc > 1.1 || R.qtc < 0.5 ? 'warn' : '')); }
    else { c.push(stat('Tuning Fb', f1(R.m.fb), 'Hz', geo.port.tooShort ? 'port too short!' : geo.port.custom ? 'set by custom port length' : `target ${f1(s.fb)} Hz`, geo.port.tooShort ? 'bad' : '')); if (s.type === 'ported') c.push(stat('Ripple', f1(R.rip), 'dB', 'above F3', R.rip > 2 ? 'warn' : '')); }
    if (E.isBP(s.type)) c.push(stat('Passband −3 dB', `${f1(R.f3)}–${f1(R.fu)}`, 'Hz'));
    else { c.push(stat('F3', f1(R.f3), 'Hz', 'low −3 dB point')); c.push(stat('F10', f1(R.f10), 'Hz', 'usable extension')); }
    if (s.type !== 'sealed') { geo.portList.forEach(({ label, port: p }) => c.push(stat(label === 'Port' ? 'Port length' : label + ' length', Math.round(p.L), 'mm', `${p.slots && p.n > 1 ? p.n + ' slots' : p.n + '× ' + (p.kind === 'pipe' ? 'Ø' + p.dia + ' mm' : fmtLen(p.wOpen) + ' × ' + fmtLen(p.hOpen))} · ${f1(p.SpTot * 1e4)} cm² · Fb ${f1(label === 'Rear-chamber port' ? R.m.fb2 : R.m.fb)} Hz${p.folded ? ' · folded ×' + p.nSeg : ''}`, (p.L > p.avail && !p.folded) || !p.foldFits ? 'warn' : ''))); c.push(stat('Port air speed', f1(R.vpk), 'm/s', `${f1(R.vpk / 3.432)} % Mach at ${s.power} W`, R.vpk > 34 ? 'bad' : R.vpk > 17 ? 'warn' : '')); }
    const mx = (f) => at(R.sim.splMax, FR, f);
    c.push(stat('Max SPL @ 40 Hz', f1(mx(40)), 'dB', `${f1(mx(30))} dB @ 30 · ${f1(mx(60))} dB @ 60`));
    c.push(stat('Peak excursion', f1(R.xpk), 'mm', `Xmax ${f1(D.xmax)} mm at ${s.power} W`, R.xpk > D.xmax * 1.5 ? 'bad' : R.xpk > D.xmax ? 'warn' : ''));
    c.push(stat('Sensitivity', f1(R.spl1 + 10 * Math.log10(s.n)), 'dB', '1 W / 1 m, 2π, modeled'));
    const load = nominalLoad(s);
    c.push(stat('Load', f2(load), 'Ω', `${s.n > 1 ? s.n + ' drivers ' + s.wiring : '1 driver'}${s.driver.vc === 'dual' ? ', coils ' + s.driver.wire : ''} nominal`, load < s.amp.minOhm - 1e-6 ? 'bad' : ''));
    c.push(stat('Weight (panels)', f1(R.weight), 'kg', 'MDF estimate'));
    $('#cards').innerHTML = c.join('');
  }

  const PINCOL = ['#4cc9f0', '#b388ff', '#6ee7a1', '#ff7a90'];
  const UI = { tab: 'spl', showMax: true, xmax: 200, pins: [], view: { rx: 0.35, ry: -0.6, zoom: 1, xray: false, explode: false, dims: false, finish: 'carpet', bg: 'theme' } };
  const TABS = [['spl', 'Frequency response'], ['exc', 'Cone excursion'], ['vel', 'Port air speed'], ['imp', 'Impedance'], ['gd', 'Group delay'], ['exp', 'Volume explorer']];
  let chart;
  let expCache = { key: '', data: null };

  function explorer(R) {
    const s = R.s, D = R.D, key = JSON.stringify([s.driver, s.n, s.ql, s.damp.fill]);
    if (expCache.key !== key) {
      const kd = s.type === 'sealed' ? E.dampFactors(s).sealed : E.dampFactors(s).ported;
      const vols = Array.from({ length: 30 }, (_, i) => D.vasL * (0.08 + 1.7 * i / 29));
      const sealed = vols.map((v) => E.f3Sealed(D, v * E.dampFactors(s).sealed / s.n, s.ql));
      const p1 = vols.map((v) => E.alignPorted(D, v * E.dampFactors(s).ported / s.n, s.ql, 1).f3), p3 = vols.map((v) => E.alignPorted(D, v * E.dampFactors(s).ported / s.n, s.ql, 3).f3);
      expCache = { key, data: { vols, sealed, p1, p3 } };
    }
    return expCache.data;
  }

  function chartCfg(R) {
    const s = R.s, col = '#e8b04a', mut = getComputedStyle(document.documentElement).getPropertyValue('--mut').trim();
    const pinR = UI.pins.filter((p) => p.R && p.R.ok);
    const xmax = UI.xmax, base = { xlog: true, xmin: 10, xmax, xLabel: 'Frequency (Hz)', xfmt: (v) => f1(v) + ' Hz' };
    const vl = [];
    if (s.type === 'sealed') vl.push({ x: R.fc, label: 'Fc', color: mut }); else { vl.push({ x: R.m.fb, label: s.type === 'bandpass6' ? 'Fb front' : 'Fb', color: mut }); if (R.geo.port2) vl.push({ x: R.m.fb2, label: 'Fb rear', color: mut }); }
    vl.push({ x: s.driver.fs, label: 'Fs', color: '#4cc9f0' });
    const lines = (key, name) => [{ name: name || 'This design', color: col, x: FR, y: R.sim[key], width: 2.6 }].concat(pinR.map((p) => ({ name: p.name, color: p.color, x: FR, y: p.R.sim[key], width: 1.8 })));
    const range = (ser, pad, span, min0) => {
      let hi = -1e9, lo = 1e9; ser.forEach((q) => q.x.forEach((x, i) => { if (x >= 10 && x <= xmax) { hi = Math.max(hi, q.y[i]); lo = Math.min(lo, q.y[i]); } }));
      return [lo, hi];
    };
    if (UI.tab === 'spl') {
      const ser = lines('spl', 'Response @ ' + s.power + ' W');
      const all = ser.slice();
      if (UI.showMax) { ser.push({ name: 'Max SPL (Xmax / thermal)', color: col, dash: [6, 4], x: FR, y: R.sim.splMax, width: 1.6 }); pinR.forEach((p) => ser.push({ name: p.name + ' max', color: p.color, dash: [6, 4], x: FR, y: p.R.sim.splMax, width: 1.2, noTip: true })); }
      const [, hi] = range(UI.showMax ? ser : all);
      const top = Math.ceil((hi + 2) / 5) * 5;
      return { ...base, series: ser, vlines: vl, ymin: top - 50, ymax: top, yLabel: 'SPL (dB @ 1 m, 2π)', yfmt: (v) => f1(v) + ' dB' };
    }
    if (UI.tab === 'exc') {
      const ser = lines('x', 'Peak excursion');
      const hi = Math.max(range(ser)[1], s.driver.xmax * 1.3);
      return { ...base, series: ser, vlines: vl, refs: [{ y: s.driver.xmax, label: 'Xmax', color: '#fb7185' }], ymin: 0, ymax: Math.ceil(Math.min(hi * 1.1, s.driver.xmax * 6)), yLabel: 'Cone excursion (mm peak)', yfmt: (v) => f1(v) + ' mm' };
    }
    if (UI.tab === 'vel') {
      const ser = lines('vp', s.type === 'bandpass6' ? 'Front port air speed' : 'Port air speed');
      if (s.type === 'bandpass6') ser.push({ name: 'Rear port air speed', color: '#4cc9f0', x: FR, y: R.sim.vpr, width: 2.2 });
      const hi = Math.max(range(ser)[1], 40);
      return { ...base, series: ser, vlines: vl, refs: [{ y: 17, label: '5 % Mach – comfortable', color: '#fbbf24' }, { y: 34, label: '10 % Mach – audible noise', color: '#fb7185' }], ymin: 0, ymax: Math.ceil(hi * 1.1 / 10) * 10, yLabel: 'Peak air speed (m/s)', yfmt: (v) => f1(v) + ' m/s' };
    }
    if (UI.tab === 'imp') {
      const ser = lines('z', 'Impedance');
      const [, hi] = range(ser);
      return { ...base, series: ser, vlines: vl, ymin: 0, ymax: Math.ceil(Math.min(hi * 1.1, 80) / 5) * 5, yLabel: 'Impedance (Ω, per driver)', yfmt: (v) => f1(v) + ' Ω' };
    }
    if (UI.tab === 'gd') {
      const ser = lines('gd', 'Group delay');
      const [lo, hi] = range(ser);
      return { ...base, series: ser, vlines: vl, ymin: Math.min(0, Math.floor(lo)), ymax: Math.ceil(Math.min(hi * 1.1, 120) / 5) * 5, yLabel: 'Group delay (ms)', yfmt: (v) => f1(v) + ' ms' };
    }
    const ex = explorer(R), cur = R.geo.Vnet;
    const mk = (name, color, y, dash) => ({ name, color, dash, x: ex.vols, y, width: 2.2 });
    const all = ex.sealed.concat(ex.p1, ex.p3);
    return { xlog: false, xmin: 0, xmax: ex.vols[ex.vols.length - 1], xLabel: 'Net volume (L, all drivers)', xfmt: (v) => f1(v) + ' L',
      series: [mk('Sealed', '#4cc9f0', ex.sealed), mk('Ported – flat (≤1 dB)', col, ex.p1), mk('Ported – extended (≤3 dB)', '#ff7a90', ex.p3, [6, 4])],
      vlines: [{ x: cur, label: 'this design', color: mut }], ymin: 0, ymax: Math.ceil(Math.min(Math.max(...all) * 1.05, 120) / 10) * 10, yLabel: 'F3 (Hz) – lower is deeper', yfmt: (v) => f1(v) + ' Hz' };
  }

  const NOTES = {
    spl: 'Linear small-signal model incl. Le, leakage and port losses. Dashed line: loudest level the driver can reach at each frequency before hitting Xmax or its thermal rating.',
    exc: 'Peak cone excursion at the chosen amplifier power. Ported boxes unload below Fb – a subsonic filter keeps the cone in range.',
    vel: 'Peak air speed in the port (volume velocity ÷ port area). Keep below ~17 m/s for clean output.',
    imp: 'Electrical impedance seen by the amplifier for one driver. Peaks mark the system resonance(s).',
    gd: 'Group delay of the acoustic output including the subsonic filter. Large values near the cut-off are normal for ported systems.',
    exp: 'Net volume versus lowest −3 dB point for this driver, for sealed and two ported alignments that are optimised automatically at each volume.',
  };

  function renderChart(R) {
    if (!chart) chart = new V.Chart($('#chart'), $('#tip'));
    const tabs = TABS.filter(([k]) => !(k === 'vel' && R.s.type === 'sealed'));
    if (!tabs.some(([k]) => k === UI.tab)) UI.tab = 'spl';
    $('#tabs').innerHTML = tabs.map(([k, t]) => `<button role="tab" aria-selected="${UI.tab === k}"${tipOf('tab:' + k)} data-tab="${k}" class="${UI.tab === k ? 'on' : ''}">${t}</button>`).join('');
    $('#chart-tools').innerHTML = `${UI.tab === 'spl' ? `<label class="chk"><input type="checkbox" id="c-max" ${UI.showMax ? 'checked' : ''}>Show max SPL</label>` : ''}
      ${UI.tab !== 'exp' ? `<label class="chk">Range <select id="c-range" style="width:auto">${[100, 200, 400].map((v) => `<option ${v === UI.xmax ? 'selected' : ''}>${v}</option>`).join('')}</select> Hz</label>` : ''}
      <div class="pin-list">${UI.pins.map((p, i) => `<span class="pin" style="border-color:${p.color}">${esc(p.name)}<button data-unpin="${i}" title="Remove">✕</button></span>`).join('')}</div>`;
    const cfg = chartCfg(R);
    chart.set(cfg);
    const tl = TABS.find(([k]) => k === UI.tab);
    $('#chart').setAttribute('aria-label', (tl ? tl[1] : 'Simulation') + ': ' + cfg.series.filter((s) => !s.noTip).map((s) => s.name).join(', ') + '. ' + NOTES[UI.tab]);
    $('#legend').innerHTML = cfg.series.filter((s) => !s.noTip).map((s) => `<span><i style="background:${s.color}${s.dash ? ';opacity:.6' : ''}"></i>${esc(s.name)}</span>`).join('');
    $('#chart-note').textContent = NOTES[UI.tab];
  }

  function renderBuild(R) {
    const s = R.s, g = R.geo;
    const ob = g.outer || s.dims;
    UI.view.label = `${fmtLen(ob.w)} × ${fmtLen(ob.h)} × ${fmtLen(ob.d)}`;
    V.draw3d($('#view3d'), s, g, R.lay, UI.view);
    $('#baffle').innerHTML = V.baffleSVG(s, g, R.lay, fmtLenBare);
    $('#view-tools').innerHTML = `<button data-v3="xray" data-tip="See through the panels: bracing, slot walls, ports and drivers at real thickness." class="${UI.view.xray ? 'on' : ''}">X-ray</button><button data-v3="explode" data-tip="Take the box apart to see every panel." class="${UI.view.explode ? 'on' : ''}">Take apart</button><button data-v3="dims" data-tip="Show the outside dimensions on the model." class="${UI.view.dims ? 'on' : ''}">Dimensions</button><button data-v3="finish" data-tip="Change the material look.">Finish: ${UI.view.finish}</button><button data-v3="bg" data-tip="Change the background colour.">Bg: ${UI.view.bg}</button><button data-v3="front">Front</button><button data-v3="reset">Reset</button>`;
    UI.view.dimText = { w: fmtLen(ob.w), h: fmtLen(ob.h), d: fmtLen(ob.d) };
    V.draw3d($('#view3d'), s, g, R.lay, UI.view);
    const plan = $('#plan'); if (plan) plan.innerHTML = V.planSVG(s, g, R.lay, fmtLenBare, ' ' + S.unit);
    const kv = [['Internal size', `${fmtLenBare(g.Wi)} × ${fmtLenBare(g.Hi)} × ${fmtLenBare(g.Di)} ${S.unit}`], ['Gross internal volume', fmtVol(g.Vint)], ['− Driver displacement', fmtVol(g.Vdr)], ['− Bracing & glue blocks', fmtVol(g.Vbr)]];
    if (g.xwalls) kv.push(['− Extra walls', fmtVol(g.Vxw)]);
    if (g.port) kv.push(['− Port volume', fmtVol(g.Vport)]);
    kv.push(['= Net volume', fmtVol(g.Vnet)]);
    if (E.isBP(s.type)) { kv.push([s.type === 'bandpass6' ? 'Rear chamber (vented)' : 'Rear chamber (sealed)', fmtVol(g.Vr)]); kv.push(['Front chamber (ported)', fmtVol(g.Vf)]); }
    g.portList.forEach(({ label, port: p }) => {
      if (p.slots) p.slots.forEach((q, i) => kv.push([p.slots.length > 1 ? `${label}, slot ${i + 1}` : label, `${q.vert ? 'vertical' : 'horizontal'} slot ${fmtLen(q.w)} wide × ${fmtLen(q.h)} high, wall ${fmtLen(q.gap)} from the ${V.PNAME[q.along]} panel`]));
      else kv.push([label, p.kind === 'pipe' ? `${p.n}× Ø${p.dia} mm pipe` : `${p.vertical ? 'vertical' : 'horizontal'} slot ${fmtLen(p.wOpen)} wide × ${fmtLen(p.hOpen)} high`]);
      kv.push(['  length (cut)', `${Math.round(p.L)} mm (${f2(p.L / 25.4)}")`]); kv.push(['  effective length', `${Math.round(p.Leff)} mm`]);
      kv.push(['  area · tuning', `${f1(p.SpTot * 1e4)} cm² · ${f1(label === 'Rear-chamber port' ? R.m.fb2 : R.m.fb)} Hz`]);
      if (p.folded) kv.push(['  folded', `${p.nSeg} segments of ${Math.round(p.segLen)} mm`]);
    });
    const pn = $('#place-note');
    if (pn) pn.textContent = s.port.kind === 'slot' ? '' : R.lay.panels[E.portPanel(s)].ports.length && (E.isBP(s.type) || E.portPanel(s) === E.drvPanel(s)) ? `Port is placed: ${({ right: 'right of the drivers', left: 'left of the drivers', below: 'below the drivers', above: 'above the drivers', custom: 'at your custom position', auto: 'centred' })[R.lay.place] || R.lay.place}.` : '';
    $('#port-info').innerHTML = kv.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  function renderCut(R) {
    const s = R.s, parts = R.parts, u = S.unit === 'in' ? (v) => f2(v / 25.4) : S.unit === 'cm' ? (v) => f1(v / 10) : (v) => f1(v);
    let h = `<table><thead><tr><th>Part</th><th class="n">Qty</th><th class="n">Length (${S.unit})</th><th class="n">Width (${S.unit})</th><th class="n">Thick. (${S.unit})</th><th>Notes</th></tr></thead><tbody>`;
    parts.forEach((p) => { h += `<tr><td>${p.name}</td><td class="n">${p.qty}</td><td class="n">${u(p.w)}</td><td class="n">${u(p.h)}</td><td class="n">${u(p.t || s.t)}</td><td>${p.note}</td></tr>`; });
    R.geo.braceParts.forEach((b) => { h += `<tr><td>${b.name}</td><td class="n">${b.qty}</td><td class="n">${u(b.len)}</td><td class="n">—</td><td class="n">—</td><td>cut from dowel / bar stock (not in sheet nesting)</td></tr>`; });
    R.geo.portParts.forEach((p) => { h += `<tr><td>${p.name}</td><td class="n">${p.qty}</td><td class="n">${p.len == null ? '—' : u(p.len)}</td><td class="n">—</td><td class="n">—</td><td>${p.note}</td></tr>`; });
    h += `</tbody></table>`;
    const nest = E.nest(parts, s.sheet.w, s.sheet.h, s.sheet.kerf);
    R.nest = nest;
    h += `<p class="note">Joinery assumed: butt joints, front and back panels full size. Saw kerf ${s.sheet.kerf} mm is included in the nesting.</p>`;
    $('#cutlist').innerHTML = h;
    let sh = `<div class="kv"><div><span>Sheets needed (${s.sheet.w}×${s.sheet.h})</span><b>${nest.sheets.length}</b></div><div><span>Material waste</span><b>${Math.round(nest.waste * 100)} %</b></div><div><span>Oversize parts</span><b>${nest.oversize.length}</b></div></div>`;
    if (nest.oversize.length) sh += `<p class="note" style="color:var(--bad)">Some parts are larger than a sheet: ${nest.oversize.map((o) => o.name).join(', ')}.</p>`;
    sh += `<div class="sheet-row">${V.sheetsSVG(nest, s.sheet.w, s.sheet.h)}</div>`;
    $('#sheets').innerHTML = sh;
  }

  function renderChecks(R) {
    const items = checks(R);
    $('#checks').innerHTML = `<h2>Design review</h2><div class="chk-list">${items.map((c) => `<div class="chk-item ${c.lvl}"><b>${c.lvl === 'ok' ? 'Good' : c.lvl === 'warn' ? 'Caution' : 'Problem'}</b><span>${c.txt}</span></div>`).join('')}</div>`;
  }

  function renderDerived(R) {
    const el = $('#derived'); if (!el) return;
    if (!R.ok) { el.innerHTML = '<span style="grid-column:1/3;color:var(--bad)">Qts must be &lt; Qes</span>'; return; }
    const D = R.D;
    el.innerHTML = `<span>Qms</span><b>${f2(D.qms)}</b><span>Qts used</span><b>${f2(D.qts)}</b><span>Qts incl. cable</span><b>${f2(D.qtsE)}</b><span>EBP (Fs/Qes)</span><b>${Math.round(D.ebp)}</b><span>Mms</span><b>${f1(D.Mms * 1000)} g</b><span>Bl</span><b>${f1(D.Bl)} T·m</b><span>Vd (Sd·Xmax)</span><b>${f2(D.vd)} L</b><span>Suggests</span><b>${D.ebp > 90 ? 'ported' : D.ebp < 50 ? 'sealed' : 'either'}</b>`;
  }

  let last = null;
  function recalc() {
    sanitize(S);
    save();
    const R = analyze(S); last = R;
    renderDerived(R);
    if (!R.ok) { renderCards(R); $('#checks').innerHTML = '<h2>Design review</h2><div class="chk-list"><div class="chk-item bad"><b>Problem</b><span>Driver parameters are invalid: Qts must be smaller than Qes.</span></div></div>'; return; }
    UI.pins.forEach((p) => { p.R = analyze(p.s); });
    R.lay = V.baffleLayout(S, R.geo);
    renderCards(R); renderChart(R); renderChecks(R); renderBuild(R); renderCut(R); renderWiring(R);
    schedulePrint();
  }

  /* ---------------- header + chart + viewer events ---------------- */
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { UI.tab = b.dataset.tab; if (last && last.ok) renderChart(last); } });
  $('#chart-tools').addEventListener('change', (e) => {
    if (e.target.id === 'c-max') UI.showMax = e.target.checked; if (e.target.id === 'c-range') UI.xmax = +e.target.value;
    if (last && last.ok) renderChart(last);
  });
  $('#chart-tools').addEventListener('click', (e) => { const b = e.target.closest('[data-unpin]'); if (b) { UI.pins.splice(+b.dataset.unpin, 1); recalc(); } });
  $('#view-tools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v3]'); if (!b) return; const v = UI.view;
    const cyc = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
    if (b.dataset.v3 === 'xray') { v.xray = !v.xray; if (v.xray) v.explode = false; }
    else if (b.dataset.v3 === 'explode') { v.explode = !v.explode; if (v.explode) v.xray = false; }
    else if (b.dataset.v3 === 'dims') v.dims = !v.dims;
    else if (b.dataset.v3 === 'finish') v.finish = cyc(['carpet', 'mdf', 'plywood', 'wood', 'rosewood', 'white'], v.finish);
    else if (b.dataset.v3 === 'bg') v.bg = cyc(['theme', 'gray', 'green', 'white', 'black'], v.bg);
    else if (b.dataset.v3 === 'front') { v.rx = 0; v.ry = 0; } else { v.rx = 0.35; v.ry = -0.6; v.zoom = 1; }
    if (last && last.ok) renderBuild(last);
  });
  (function drag() {
    const cv = $('#view3d'), ptrs = new Map(); let pinch = null;
    const redraw = () => { if (last && last.ok) V.draw3d(cv, last.s, last.geo, last.lay, UI.view); };
    cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: UI.view.zoom }; } });
    cv.addEventListener('pointermove', (e) => {
      const prev = ptrs.get(e.pointerId); if (!prev) return;
      if (ptrs.size >= 2 && pinch) { ptrs.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...ptrs.values()]; UI.view.zoom = Math.max(0.4, Math.min(3, pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)); redraw(); return; }
      UI.view.ry += (e.clientX - prev[0]) * 0.008; UI.view.rx = Math.max(-1.45, Math.min(1.45, UI.view.rx + (e.clientY - prev[1]) * 0.008));
      ptrs.set(e.pointerId, [e.clientX, e.clientY]); redraw();
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); UI.view.zoom = Math.max(0.4, Math.min(3, UI.view.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); redraw(); }, { passive: false });
    new ResizeObserver(redraw).observe(cv);
  })();
  (function drawer() {
    const open = (on) => { document.body.classList.toggle('drawer-open', on); $('#btn-design').setAttribute('aria-expanded', on ? 'true' : 'false'); };
    $('#btn-design').addEventListener('click', () => open(true));
    $('#scrim').addEventListener('click', () => open(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  })();
  const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const themeNow = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; };
  const showTheme = () => { const t = themeNow(); $('#btn-theme').textContent = THEME_LABEL[t]; $('#btn-theme').setAttribute('aria-label', 'Colour theme: ' + THEME_LABEL[t] + '. Click to change.'); };
  $('#btn-theme').addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(themeNow()) + 1) % 3];
    if (next === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', next);
    try { if (next === 'auto') localStorage.removeItem('sf_theme'); else localStorage.setItem('sf_theme', next); } catch (e) { /* storage blocked: theme just lasts for this visit */ }
    showTheme(); recalc();
  });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (themeNow() === 'auto') recalc(); });
  showTheme();
  $('#btn-unit').addEventListener('click', () => { S.unit = S.unit === 'mm' ? 'cm' : S.unit === 'cm' ? 'in' : 'mm'; renderSide(); schedule(); });
  $('#btn-pin').addEventListener('click', () => {
    if (!last || !last.ok) return; if (UI.pins.length >= 4) { toast('Up to 4 designs can be compared'); return; }
    const s = clone(S); s.pins = [];
    const name = `${s.type === 'sealed' ? 'Sealed' : s.type === 'ported' ? 'Ported' : s.type === 'bandpass6' ? '6th BP' : '4th BP'} ${Math.round(last.geo.Vnet)} L${s.type === 'sealed' ? '' : ' @ ' + f1(last.geo.port.fbAct) + ' Hz'}`;
    UI.pins.push({ name, s, color: PINCOL[UI.pins.length % 4] }); recalc(); toast('Pinned – it is drawn on every chart');
  });
  const encode = () => { const c = clone(S); c.pins = []; return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, '-').replace(/\//g, '_'); };
  $('#btn-share').addEventListener('click', () => {
    const url = location.href.split('#')[0] + '#d=' + encode();
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copied'), () => { prompt('Copy this link', url); });
  });
  const errLog = []; window.addEventListener('error', (e) => { if (errLog.length < 5) errLog.push(String(e.message).slice(0, 200)); });
  $('#btn-bug').addEventListener('click', () => {
    const rep = ['SubForge ' + $('#ver').textContent, navigator.userAgent, 'Screen ' + innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio, 'Errors: ' + (errLog.join(' | ') || 'none'), 'Design link: ' + location.href.split('#')[0] + '#d=' + encode(), '', 'What happened / what I expected:', ''].join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(rep) : Promise.reject()).then(() => toast('Bug report copied - paste it to the developer'), () => { prompt('Copy this bug report', rep); });
  });
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#btn-json').addEventListener('click', () => { const c = clone(S); c.pins = []; download('subforge-design.json', JSON.stringify(c, null, 1)); });
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { try { S = normalize(JSON.parse(t), defaultState()); UI.pins = []; renderSide(); recalc(); toast('Design imported'); } catch (err) { toast('Not a valid SubForge file'); } });
    e.target.value = '';
  });
  /* ---- print / PDF: draw every simulation graph, in print-safe colours, into #print-charts */
  const PRINT_COLORS = { '#ffb000': '#b56a00', '#e8b04a': '#b56a00', '#4cc9f0': '#0b7fb0', '#b388ff': '#6b3fd0', '#6ee7a1': '#1a8f57', '#ff7a90': '#c2304f', '#fb7185': '#c2304f', '#fbbf24': '#a16207' };
  let printBuilt = false, printTimer = null;
  // a synchronous copy of the drawn chart: canvases always print, images loaded from data URLs may not be ready yet
  const snap = (src) => { const c2 = document.createElement('canvas'); c2.width = src.width; c2.height = src.height; c2.getContext('2d').drawImage(src, 0, 0); return c2; };
  const schedulePrint = () => { printBuilt = false; clearTimeout(printTimer); printTimer = setTimeout(buildPrintCharts, 500); };
  function buildPrintCharts() {
    const box = $('#print-charts'); if (!box || !last || !last.ok) return;
    const R = last, saveTab = UI.tab, saveMax = UI.showMax, saveRange = UI.xmax;
    const fix = (c) => PRINT_COLORS[c] || (c && c.indexOf('#') !== 0 ? '#666666' : c);
    const tabs = TABS.filter(([k]) => !(k === 'vel' && R.s.type === 'sealed'));
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:400px;pointer-events:none';
    const cv = document.createElement('canvas'); cv.style.cssText = 'width:1000px;height:400px;display:block'; stage.appendChild(cv);
    document.body.appendChild(stage);
    const ch = new V.Chart(cv, document.createElement('div'));
    let html = '<h2>Simulation graphs</h2>'; const copies = [];
    const descr = `${R.s.type === 'sealed' ? 'Sealed' : R.s.type === 'ported' ? 'Ported' : R.s.type === 'bandpass6' ? '6th-order band-pass' : '4th-order band-pass'} · ${f1(R.geo.Vnet)} L net · ${R.s.power} W · ${esc(R.s.driver.name)}`;
    try {
      UI.showMax = true; UI.xmax = Math.max(UI.xmax, 200);
      tabs.forEach(([k, title]) => {
        UI.tab = k;
        const cfg = chartCfg(R);
        cfg.theme = { line: '#d5d9e2', mut: '#555555', fg: '#111111', bg: '#ffffff' };
        cfg.series.forEach((s) => { s.color = fix(s.color); });
        (cfg.vlines || []).forEach((v) => { v.color = fix(v.color || '#666666'); if (v.color.indexOf('#') !== 0) v.color = '#666666'; });
        (cfg.refs || []).forEach((r) => { r.color = fix(r.color); });
        ch.set(cfg);
        html += `<figure><figcaption>${title}</figcaption><canvas data-ci="${copies.push(snap(cv)) - 1}"></canvas><div class="pl">${cfg.series.filter((s) => !s.noTip).map((s) => `<span><i style="border-color:${s.color}${s.dash ? ';border-top-style:dashed' : ''}"></i>${esc(s.name)}</span>`).join('')}</div><p>${NOTES[k]}</p></figure>`;
      });
    } finally { UI.tab = saveTab; UI.showMax = saveMax; UI.xmax = saveRange; stage.remove(); }
    box.innerHTML = html + `<p>${descr}. Linear small-signal model; verify with measurements.</p>`;
    box.querySelectorAll('canvas[data-ci]').forEach((ph) => ph.replaceWith(copies[+ph.dataset.ci]));
    printBuilt = true;
  }
  window.addEventListener('beforeprint', () => { if (!printBuilt) buildPrintCharts(); });
  $('#btn-print').addEventListener('click', () => { if (!printBuilt) buildPrintCharts(); window.print(); });
  $('#btn-reset').addEventListener('click', () => { if (confirm('Reset the design to defaults?')) { S = defaultState(); UI.pins = []; renderSide(); recalc(); } });
  $('#btn-csv').addEventListener('click', () => {
    if (!last || !last.ok) return;
    const rows = [['part', 'qty', 'length_mm', 'width_mm', 'thickness_mm', 'notes']].concat(last.parts.map((p) => [p.name, p.qty, p.w, p.h, S.t, p.note]));
    download('subforge-cutlist.csv', rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  });

  /* ---------------- tools ---------------- */
  (function tone() {
    let ctx, osc, gain, playing = false, sweepT = null;
    const fEl = $('#tone-f'), sl = $('#tone-slider'), vEl = $('#tone-v');
    const setF = (f) => { fEl.value = Math.round(f); sl.value = f; if (osc) osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.02); };
    const stop = () => { if (osc) { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03); const o = osc; setTimeout(() => o.stop(), 150); osc = null; } playing = false; clearInterval(sweepT); $('#tone-play').textContent = '▶ Play'; };
    const start = () => {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      osc = ctx.createOscillator(); gain = ctx.createGain(); gain.gain.value = 0; osc.frequency.value = +fEl.value; osc.connect(gain).connect(ctx.destination); osc.start();
      gain.gain.setTargetAtTime(Math.pow(vEl.value / 100, 2) * 0.6, ctx.currentTime, 0.05); playing = true; $('#tone-play').textContent = '■ Stop';
    };
    $('#tone-play').addEventListener('click', () => (playing ? stop() : start()));
    fEl.addEventListener('input', () => setF(+fEl.value || 40)); sl.addEventListener('input', () => setF(+sl.value));
    vEl.addEventListener('input', () => { if (gain) gain.gain.setTargetAtTime(Math.pow(vEl.value / 100, 2) * 0.6, ctx.currentTime, 0.05); });
    $('#tone-sweep').addEventListener('click', () => {
      if (playing) stop(); start(); let t = 0; const dur = 20;
      sweepT = setInterval(() => { t += 0.05; if (t >= dur) { stop(); return; } setF(15 * Math.pow(120 / 15, t / dur)); }, 50);
    });
  })();
  (function volcalc() {
    const st = { w: 500, h: 350, d: 400, t: 19 };
    const el = $('#volcalc');
    const draw = () => {
      el.innerHTML = ['w', 'h', 'd', 't'].map((k) => `<label class="fld"><span>${{ w: 'External width', h: 'External height', d: 'External depth', t: 'Thickness' }[k]}</span><div class="inp"><input type="number" data-vc="${k}" value="${f2(st[k] / LEN[S.unit])}"><em>${S.unit}</em></div></label>`).join('') + '<div class="kv" id="vc-out"></div>';
      out();
    };
    const out = () => { const i = (v) => Math.max(0, v - 2 * st.t); const L = i(st.w) * i(st.h) * i(st.d) / 1e6; $('#vc-out').innerHTML = `<div><span>Internal volume</span><b>${fmtVol(L)}</b></div>`; };
    el.addEventListener('input', (e) => { const k = e.target.dataset.vc; if (!k) return; st[k] = (parseFloat(e.target.value) || 0) * LEN[S.unit]; out(); });
    $('#btn-unit').addEventListener('click', () => setTimeout(draw, 0));
    draw();
  })();

  (function tooltip() {
    const tip = document.createElement('div'); tip.className = 'gtip'; tip.hidden = true; document.body.appendChild(tip);
    let cur = null;
    const show = (el, x, y) => {
      tip.textContent = el.dataset.tip; tip.hidden = false;
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      let left = Math.min(Math.max(8, r.left + 12), innerWidth - w - 8), top = r.bottom + 8;
      if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    };
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el === cur) return; cur = el;
      clearTimeout(tooltip.t);
      if (!el) { tip.hidden = true; return; }
      tooltip.t = setTimeout(() => show(el), 250);
    });
    document.addEventListener('mousedown', () => { tip.hidden = true; clearTimeout(tooltip.t); });
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) document.addEventListener('click', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (!el || e.target.closest('input')) return; show(el); clearTimeout(tooltip.t2); tooltip.t2 = setTimeout(() => { tip.hidden = true; }, 3500); });
    document.addEventListener('scroll', () => { tip.hidden = true; }, true);
  })();

  /* ---------------- boot ---------------- */
  window.addEventListener('hashchange', () => { if (/d=/.test(location.hash)) location.reload(); });
  try { renderSide(); } catch (e) { S = defaultState(); try { localStorage.removeItem('sf_state'); } catch (e2) { /* ignore */ } renderSide(); }
  if (!localStorage.getItem('sf_state') && !/d=/.test(location.hash)) { const D = E.makeDriver(S.driver); setDimsFor(15 * Math.pow(D.qts, 3.3) * D.vasL); S.fb = Math.round(0.42 * D.fs * Math.pow(D.qts, -0.96) * 2) / 2; renderSide(); }
  try { recalc(); } catch (e) { try { localStorage.removeItem('sf_state'); } catch (e2) { /* ignore */ } S = defaultState(); renderSide(); recalc(); toast('The saved design was not valid and has been reset.'); }
})();
