'use strict';
/* Isometric line drawings for the FIG strip (clicking a figure picks that box type), and the left pane that never scrolls on its own. */
(function () {
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  // x to the right-back, z to the left-front (the "front" face of a box), y up
  const P = (x, y, z) => [(x - z) * C30, (x + z) * S30 - y];
  const pts = (a) => a.map((p) => P(...p).map((v) => v.toFixed(1)).join(',')).join(' ');
  const poly = (a, cls) => `<polygon class="${cls || 'f'}" points="${pts(a)}"/>`;
  const line = (a, cls) => `<polyline class="${cls || 's'}" points="${pts(a)}"/>`;
  // a solid box: the three faces that point at the viewer (top, right side, front)
  const box = (x0, y0, z0, w, h, d) => {
    const x1 = x0 + w, y1 = y0 + h, z1 = z0 + d;
    return poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]) + poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) + poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
  };
  // a circle lying on the front face (z = const) becomes an ellipse
  const ring = (cx, cy, z, r, cls) => line(Array.from({ length: 49 }, (_, i) => { const t = i / 48 * 2 * Math.PI; return [cx + r * Math.cos(t), cy + r * Math.sin(t), z]; }), cls);
  const rectF = (x0, y0, x1, y1, z, cls) => line([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z]], cls);
  const driver = (cx, cy, z, r) => ring(cx, cy, z, r) + ring(cx, cy, z, r * 0.78) + ring(cx, cy, z, r * 0.3) + ring(cx, cy, z, r, 'hl');
  const svg = (body, vb) => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

  const FIGS = [
    { type: 'sealed', title: 'Sealed', text: 'Tight, accurate bass from the smallest box. Tolerates small build errors.',
      draw: () => svg(
        // exploded: the box, and its top panel lifted off with guide lines
        box(0, 0, 0, 120, 92, 92) + driver(60, 46, 92, 30)
        + line([[0, 92, 92], [0, 112, 92]], 'd') + line([[120, 92, 92], [120, 112, 92]], 'd') + line([[120, 92, 0], [120, 112, 0]], 'd')
        + box(0, 112, 0, 120, 8, 92), '-110 -150 230 210') },
    { type: 'ported', title: 'Ported', text: 'A tuned port adds output near the tuning and digs deeper for the size.',
      draw: () => svg(
        box(0, 0, 0, 120, 100, 96) + driver(64, 58, 96, 30)
        + rectF(10, 8, 110, 20, 96) + rectF(10, 8, 110, 20, 96, 'hl')
        // the slot channel and its wall, seen through the top
        + line([[10, 100, 96], [10, 100, 20]], 'd') + line([[110, 100, 20], [10, 100, 20]], 'd'), '-110 -150 230 210') },
    { type: 'bandpass', title: 'Band-pass', text: 'Two chambers, output through the port only. Narrow and very efficient.',
      draw: () => svg(
        // rear chamber, divider with the driver, front chamber pulled forward
        box(0, 0, 0, 120, 96, 44) + box(0, 0, 54, 120, 96, 6) + driver(60, 48, 60, 28)
        + box(0, 0, 76, 120, 96, 40) + ring(84, 30, 116, 11) + ring(84, 30, 116, 11, 'hl') + ring(84, 30, 116, 7)
        + line([[0, 96, 44], [0, 96, 54]], 'd') + line([[0, 96, 60], [0, 96, 76]], 'd'), '-125 -160 250 225') },
    { type: null, title: 'Cut list & plans', text: 'Every panel to scale, with cut-outs, sheet nesting and a printable sheet.', href: '#sec-cut',
      draw: () => {
        // panels standing in a row, tallest at the back, like boards waiting to be cut
        let s = '';
        for (let i = 0; i < 9; i++) { const h = 30 + i * 9, z = 90 - i * 10; s += box(0, 0, z, 110 - i * 2, h, 3); }
        return svg(s + line([[0, 102, 10], [108, 102, 10]], 'hl'), '-115 -150 235 205');
      } },
  ];

  const host = document.getElementById('figs');
  if (!host) return;
  host.innerHTML = FIGS.map((f, i) => `<button type="button" class="fig" data-fig="${f.type || ''}" ${f.href ? `data-href="${f.href}"` : ''}><small>FIG 0.${i + 1}</small>${f.draw()}<b>${f.title}</b><span>${f.text}</span></button>`).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('.fig'); if (!b) return;
    if (b.dataset.href) { document.querySelector(b.dataset.href).scrollIntoView({ behavior: 'smooth' }); return; }
    const seg = document.querySelector(`[data-seg="type"][data-v="${b.dataset.fig}"]`);
    if (seg) seg.click();
  });
  // keep the highlighted figure in step with the box type chosen in the inputs
  const sync = () => {
    const on = document.querySelector('[data-seg="type"].on'), t = on ? on.dataset.v : '';
    host.querySelectorAll('.fig').forEach((b) => b.classList.toggle('on', !!b.dataset.fig && (b.dataset.fig === t || (b.dataset.fig === 'bandpass' && t === 'bandpass6'))));
  };
  new MutationObserver(sync).observe(document.getElementById('side'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();

  /* left pane without its own scrollbar: it stays beside the charts while it fits the window, otherwise it scrolls with the page */
  const side = document.getElementById('side'), top = () => document.querySelector('.top').offsetHeight;
  const fit = () => { const f = side.scrollHeight <= window.innerHeight - top(); if (side.classList.contains('fits') !== f) side.classList.toggle('fits', f); };
  // opening or closing a group: keep its title where it was clicked, even when the pane switches between the two modes
  side.addEventListener('click', (e) => {
    const btn = e.target.closest('.ch-btn'); if (!btn) return;
    const card = btn.closest('.card'), before = card.getBoundingClientRect().top, key = card.dataset.card;
    requestAnimationFrame(() => {
      fit();
      const now = side.querySelector(`.card[data-card="${CSS.escape(key)}"]`);
      if (now) { const d = now.getBoundingClientRect().top - before; if (Math.abs(d) > 1) window.scrollBy(0, d); }
    });
  }, true);
  new MutationObserver(() => requestAnimationFrame(fit)).observe(side, { childList: true, subtree: true });
  window.addEventListener('resize', fit);
  fit();
})();
