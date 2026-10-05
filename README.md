# SubForge

Subwoofer box designer and simulator that runs entirely in the browser: sealed, ported, 4th- and 6th-order band-pass enclosures, live frequency response / excursion / port velocity / impedance / group delay, 3D model, panel plans, cut list and sheet nesting. Version 0.9 beta. See [legal.html](legal.html) for the licence and disclaimer.

There is no build step and no runtime dependency: open `index.html` in a browser.

## Layout

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Page shell and theme (dark first, light via `prefers-color-scheme`, print rules) |
| `engine.js` | Pure calculation code (`window.Eng`): driver model, circuit simulation, port and box geometry, panels, nesting |
| `view.js` | Charts, software 3D renderer, SVG baffle / plan / sheet drawings |
| `app.js` | State, input panel, validation, sharing, print pipeline, tools |
| `legal.html` | Licence, disclaimer, privacy |
| `favicon.svg`, `manifest.webmanifest`, `*.png`, `favicon.ico` | Icons (generated from `favicon.svg`) |
| `scripts/` | `build-dist.js` (copies the deployable files to `dist/`), `make-icons.js` (regenerates every icon) |
| `tests/` | Playwright and plain-node test suites |

## Development

```
npm install                  # playwright + axe-core (dev only)
npx playwright install       # browsers (the tests use the Edge channel, plus Firefox and WebKit for the audit)
npm test                     # everything
npm run validate             # model checks against datasheet values only (fast, no browser)
npm run build                # creates dist/ for deployment
npm run icons                # regenerate icons from favicon.svg
```

`npm test` runs the formula checks (including a 3000-case fuzz), UI and feature tests, print and plan output, phone / tablet layouts, and the release audit (other browsers, hostile share links, axe accessibility, performance). The tests open `index.html` through `file://`; screenshots they produce go to `tests/` and are git-ignored.

## Deploying

Upload the contents of `dist/` to any static host with HTTPS (GitHub Pages, Netlify, Cloudflare Pages). GitHub Pages on a private repository needs a paid plan.

## Notes on the model

Linear small-signal, lumped-element. Validated closely against one manufacturer datasheet (port tuning, F3, band-pass peak) and consistency-checked against six more; 6th-order band-pass, folded ports and damping material are not validated against measurements. Results are estimates.
