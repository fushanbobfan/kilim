# kilim

Wave function collapse in the browser. Paint a small sample, and a larger
picture is woven from it so that every small square window of the result is a
window that also occurs in the sample. The output starts with every cell
undecided; the most constrained cell is settled first, and each choice ripples
outward to rule out whatever can no longer sit beside it.

**Live demo:** https://fushanbobfan.github.io/kilim/

No build step and no dependencies. Pattern extraction, the model, rendering
and the share-link format are plain ES modules covered by a Node test suite;
only `src/main.js` touches the DOM.

## Quick start

Open `index.html` through any static server, or run:

```bash
npm run serve
# then visit http://localhost:8080
```

Run the tests with `npm test` (Node 20 or later). Weave a sample without a
browser, and optionally save it, with:

```bash
node scripts/probe.js --sample maze --size 64 --runs 10 --png maze.png
```

## How it works

This is the overlapping model from Maxim Gumin's
[WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse) (2016),
written from its description.

**Tiles.** Every N × N window of the sample becomes a tile, wrapping around
the sample's edges when it tiles. With symmetry switched on, each window's
rotations and mirror images are added too. A tile's weight is how often it
occurs, so common windows stay common in the output.

**Adjacency.** Tile B may sit one cell to the right of tile A when the two
overlap consistently: A's right N − 1 columns equal B's left N − 1 columns.
The same holds for the other three directions. These rules are worked out
once per sample.

**The wave.** Each output cell keeps a set of tiles it could still be. Its
Shannon entropy, weighted by tile frequency, measures how undecided it is.
Each step picks the cell with the lowest entropy (ties broken at random),
collapses it to one tile drawn by weight, and propagates: for every tile in
every neighbouring cell the model keeps a count of supporting tiles in each
direction (AC-4 arc consistency), and a tile whose support in any direction
drops to zero is banned, which may cascade further.

**Contradictions.** Propagation can empty a cell. The page then starts again
with the next seed, up to 200 attempts; the attempt count is shown. Seeds are
consecutive, so a shared link replays the same run.

**Edges.** A wrapping output joins its left edge to its right and its top to
its bottom, so the result tiles seamlessly; a sample with a fixed stripe
period only fits outputs whose size is a multiple of it. A non-wrapping output
leaves the last N − 1 rows and columns to the final full windows.

**What the views show.** The pattern view paints each pixel with the
weighted mean colour of the tiles still possible there, so the picture comes
into focus as cells collapse. The entropy view maps the remaining entropy of
each cell from bright (undecided) to dark (settled). A magenta cell is one
that ran out of tiles.

## Controls

| Control | Effect |
| --- | --- |
| Sample | Five built-in samples, or your own painted one |
| Sample editor | Click or drag to paint; change or add colours (up to 8); resize up to 24 × 24 |
| Window size | N = 2, 3 or 4; larger windows copy more of the sample's structure |
| Symmetry | As drawn, plus mirror, four or all eight rotations and mirrors |
| Sample wraps | Whether windows may run across the sample's edges |
| Output size, wraps | 8 to 96 cells per side; seamless tiling on or off |
| Steps per frame | Animation speed |
| Seed | Reproducible runs; New seed or `R` picks another |
| Keys | `Space` run or pause, `S` one step, `R` new seed, `E` entropy view |

Copy link writes every changed setting into the address, including a painted
sample. Save PNG exports the output scaled up without smoothing.

## Code layout

| File | Role |
| --- | --- |
| `src/samples.js` | Built-in samples as character rows, with suited settings |
| `src/patterns.js` | Window extraction, symmetries, overlap test and propagator |
| `src/model.js` | Wave, entropy, observation and AC-4 propagation |
| `src/render.js` | Sample, wave, entropy and tile atlas as RGBA buffers |
| `src/settings.js` | Ranges and the share-link format |
| `src/rng.js` | Seeded mulberry32 generator |
| `src/main.js` | Page wiring, animation and editor |
| `scripts/probe.js` | Headless runs with an optional PNG |

## Licence

MIT.
