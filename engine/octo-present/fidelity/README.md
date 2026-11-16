# Fidelity check

`index.html` renders every slide of a deck with the engine and compares it, pixel by
pixel, with a reference render (LibreOffice, from the OctoSlides sandbox:
`deck-render 100` writes `out/render/slide-N.png`). It reports the share of pixels that
differ by more than a tolerance and shows a heat map per slide.

Serve a folder that holds `octo-present/` (the built engine from `public/octo-present`),
`fidelity/index.html` and your data, then open either

- `/fidelity/` and pick a .pptx and its slide PNGs, or
- `/fidelity/?deck=/data/deck.pptx&refs=/data/` (loads `slide-1.png`, `slide-2.png` …)
  and read `window.fidelityResults` for automation.

Text anti-aliasing always differs a little (a few percent); use the heat map to find
layout drift. Last measured: composting deck (6 slides) 3.3% average, chart/table test
slide 8.5% (chart internals differ from LibreOffice's layout).
