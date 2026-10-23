# Offline diagram pipeline — v7 import integration

The internal manifest protocol is `diagram-pipeline-v1`; this implements the v7
PNG/import workflow without changing the existing Import-v2 public format.

Creates **real PNG files** from immutable PDF/photo evidence and an explicit reviewed
manifest. It does not OCR equations, infer geometry, call an AI API, or prove that
a supplied diagram specification matches an exam. All generated candidates remain
`needs_review` when imported. The installed app does not execute Python. A separate, non-release portable runtime probe is available for deployment validation.

## Reproducible Windows installation

Supported/locked environment: **Windows x64, CPython 3.12**. Create a separate venv:

```powershell
py -3.12 -m venv .venv-diagrams
./.venv-diagrams/Scripts/python.exe -m pip install --require-hashes --only-binary=:all: -r tools/diagram_pipeline/requirements.lock
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline --help
```

The lock includes runtime and verification tools and every transitive dependency.
`wheels-windows-py312.json` identifies the exact wheels and SHA-256 values. Do not
use this platform lock for another OS/architecture. No packages are installed at
app startup. Once dependencies are installed, generation requires no network/key.

## Run a complete synthetic example

From the repository root (use a new output directory for each changed input):

```powershell
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline.examples.create_demo --out-dir build/diagram-pipeline/demo
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline render --manifest build/diagram-pipeline/demo/inspected/reviewed.json --out-dir build/diagram-pipeline/demo/rendered
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline verify --manifest build/diagram-pipeline/demo/rendered/manifest.json
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline package --manifest build/diagram-pipeline/demo/rendered/manifest.json --output build/diagram-pipeline/demo/import-v2.zip
```

The example contains a number line, a triangle and a function graph. Import the
ZIP through **파일 / ZIP / JSON**, open review, compare original/candidate, and
explicitly choose **정리본 사용**. The sample repeats a figure in a choice on
purpose; that occurrence must remain. It is synthetic evidence, not an extraction
or independent verification of a real exam.

## Real input and manifest contract

```powershell
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline inspect --input input.pdf --out-dir build/diagram-pipeline/inspection
```

`inspect` copies the original bytes under a content hash and records displayed page
dimensions/rotation and bounded PDF page-object counts. It writes an **empty**
entry/figure list: automatically inventing question numbers, crops or equations
would be unsafe. Copy `manifest.json` to `reviewed.json` and fill these fields;
`examples/create_demo.py` is an executable complete example of the contract:

- `schemaVersion: "diagram-pipeline-v1"`, `sources`, `entries`, `figures`.
- Each source has `id`, relative `path`, SHA-256, `kind`, and inspected `pages`.
- Each entry has a unique `id`, title/subject, and `questions`. A question has an
  entry-local stable `key`, display `number`, `questionText`, ordered
  `contentSegments`, and `choices`. Optional `template` preserves supported entry
  fields such as `answerKey`, `audit`, and learning blocks; declared assets must
  exist in the generated package. This is not a generic existing-ZIP rewriter.
- Optional question `source: {sourceId, page, crop?}` preserves source pages for
  questions without figures. Here `page` is the input file's physical 1-based
  page. The **exported** `source.page` is remapped to the output entry's
  `sourcePageImages` array, not the printed page label.
- Each figure has a unique internal `id`, `entryId`, `questionKey`, `sourceId`,
  physical `page`, displayed-orientation normalized `crop: {x,y,width,height}`,
  optional larger `questionCrop`, and `method`. Ratios must fit inside the page.
  JPEG EXIF orientation is applied before cropping. Original bytes remain intact.
- Use a figure segment or `[FIGURE:internal-id]` in text/choices to specify its
  reading position. IDs are namespaced by entry + question key during packaging;
  a display number alone never identifies a source. Unplaced figures block
  packaging. Repeated explicit references are retained.

### Methods and reviewed specifications

- `auto`: PDF page with observed paths → direct PDF-region render; otherwise
  raster cleanup. Counts do not prove that the whole crop is vector artwork.
- `pdf_vector_render`: render the actual source PDF region (including source text
  and any raster objects) at 300DPI. It does not invent a new semantic model.
- `raster_cleanup`: grayscale/Otsu threshold, with optional explicit
  `parameters.deskewDegrees` between -5 and 5. No tiny-component deletion.
- `raster_tracing`: bounded observed contour tracing retaining hole hierarchy.
  Thresholding/tracing can damage open points, labels or fine lines; review them.
- `computational_redraw`: requires `spec.confirmed: true`. This means the CLI input
  was reviewed; **it is not app approval**. Supported `spec.type` values:
  - `number_line`: `points` (id/x/y/label/open), shaded `intervals`.
  - `plane_geometry`: points, solid/dashed `segments`, `circles`, polygon `regions`,
    right-angle `marks`, parallel/equal-length `relations` using explicit points.
    Coordinates contradicting a declared relation fail rather than moving points.
  - `function_graph`: explicit `curves[].expression` and finite `intervals`, bounds,
    ticks, endpoint points, labels and `functionRegions`. Split domains at poles;
    undefined samples/large jumps are never connected. No extrema are inferred.
  - `table`: ordinary data belongs in a `table` contentSegment. PNG requires
    `pngRequired: true` and explicit rectangular `rows`; merged/uncertain tables
    must retain the original.
- `original`: retain evidence without generating a candidate.

Expressions allow `x`, `pi`, `e`, numeric literals, arithmetic, and one-argument
`sin/cos/tan/exp/log/sqrt/abs`. AST length/depth, exponent and result limits apply.
No Python evaluation, external TeX, arbitrary XML, OCR or model execution. The bounded SVG subset below is supported.
Mathtext uses bundled DejaVu Sans; missing glyphs/clipped labels fail and preserve
originals. Environment reports include font/code hashes, versions, DPI and seed.

## Trust, artifacts and failure handling

Source pages/crops, original crops and candidates are separate real files. `verify`
re-renders the preserved source file and checks page/crop pixels against the
declared displayed ROI, including source-page identity. SHA-256 checks prove byte
identity, not mathematical meaning. `verify` always returns
`mathematicalEquivalence: "not_proven"`. Wrong labels in an explicit spec do not
magically become a mathematical PASS. There is no similarity-score approval.

The generated ZIP is **external input**, even on the same PC. Producer labels,
model self-checks, `second_pass_model`, user/local approval claims and deterministic
generation claims cannot create app approval. Only actual app comparison actions
store a user representation choice. Both images remain referenced/protected.

Generation uses one isolated worker at a time: 60s wall limit and 1GiB process
commit limit via Windows Job Objects (plus no child processes). POSIX resource
limits are implemented but that environment is not covered by this Windows lock.
Windows cancellation terminates the entire launcher/worker process tree using
the system taskkill utility; killing only a virtual-environment launcher PID
would leave its actual Python child alive. Cleanup errors are reported.
The memory limit applies to the worker, not the whole app/system. Input image
limits match the app: 25MiB, 16,384px per edge, 64MP, RGBA estimate ≤256MiB. PDF
input ≤500MiB/300 pages; object/contour counts are bounded. ZIP creation streams
individual assets to disk and validates the reopened ZIP before publishing it.

Paths are relative to the manifest and must not contain traversal, absolute/drive
paths, symlinks or reparse points. Existing different files and existing output
ZIPs are never replaced. SHA mismatches, damaged images and invalid references
block packaging. Failed redraws leave original evidence and a failed report;
correct the spec and render to a new directory. Interrupted jobs do not publish a
ZIP. Identical completed render runs can reuse only hash-verified cached output.
Worker stderr is drained with a bounded final 64KiB diagnostic tail.

Exit codes: `0` command complete (review may still be required), `2` invalid input /
processing failure, `3` missing Python dependency, `130` user interruption. Progress
and errors use stderr; stdout is JSON, while manifest/reports are separate files.

## Verification

```powershell
./.venv-diagrams/Scripts/python.exe -m pytest tools/diagram_pipeline/tests
./.venv-diagrams/Scripts/python.exe -m ruff check tools/diagram_pipeline
```

The app regression fixture `e2e/fixtures/diagram-pipeline-v7.zip` was generated by
the commands above. Public fixtures contain only synthetic material. Real user
exam files, derived crops and private reports must not be committed.

## Licensing / distribution

pypdfium2: Apache-2.0/BSD-3-Clause; PDFium and bundled components have separate
notices. Exact Windows-wheel notices are retained under `notices/pdfium/`.
Pillow 13: MIT-CMU; NumPy: BSD with bundled-library notices; Matplotlib: PSF-style with
font notices; OpenCV: Apache-2.0 plus wheel components (including FFmpeg LGPL).
Inspect the actual wheel's complete license set before binary redistribution.
Source and locks add PyMuPDF 1.28.2 (AGPL-3.0 / Artifex commercial). No commercial license is assumed or purchased. The runtime builder emits a **non-release probe**, marked releaseApproved:false. Do not put it in an official installer until the project distribution, complete component notices and AGPL/commercial terms have been reviewed. See https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright.

Pinned wheel metadata records the following primary license expressions/families.
Broad classifiers are kept broad; this table does not replace bundled component,
font, data or binary-library notices inside the actual wheels.

| Package | Locked version | Wheel license metadata |
|---|---|---|
| colorama | 0.4.6 | BSD |
| contourpy | 1.4.0 | BSD-3-Clause |
| cycler | 0.12.1 | BSD |
| fonttools | 4.67.0 | MIT |
| iniconfig | 2.3.1 | MIT |
| kiwisolver | 1.5.1 | BSD |
| matplotlib | 3.11.2 | PSF-style; font/component notices |
| numpy | 2.3.5 | BSD; bundled library notices |
| opencv-python-headless | 4.14.0.94 | Apache; wheel/component notices |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pillow | 13.0.0 | MIT-CMU |
| pluggy | 1.7.0 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| pyparsing | 3.3.3 | MIT |
| PyMuPDF | 1.28.2 | AGPL-3.0 / Artifex commercial; bundled MuPDF |
| pypdfium2 | 5.14.0 | BSD-3-Clause, Apache-2.0, dependency notices |
| pytest | 9.0.3 | MIT |
| python-dateutil | 3.0.0 | BSD/Apache metadata; see wheel notices |
| ruff | 0.14.14 | MIT |
| six | 1.17.0 | MIT |
| tzdata | 2026.5 | Apache-2.0; data notices |


## Windows SVG renderer (1.1)

CairoSVG, GTK/Cairo and scikit-image are not required or imported. PDFium PDF
rendering and Matplotlib Agg reconstruction remain unchanged. PyMuPDF is the
SVG renderer; there is no automatic resvg fallback. A reproducible native SVG
failure is required before considering another backend.

UTF-8 SVG supports paths, lines, polygons, circles, basic text, groups, clipping
and bounded non-recursive local use references. Absolute viewport units/viewBox
are required; percentages, DTD/entities, script/foreignObject/image/style elements,
external/data/file/network references and unsupported attributes are rejected.
Unsupported files retain their original bytes; they are not silently simplified.
Text and font declarations are preserved, not OCR-corrected. Compare actual label
glyphs on the target platform: raster ink tests are not proof of text or math identity.

`inspect --input source.svg` preserves SVG bytes and produces a PNG source page.
A figure with method `auto` uses direct SVG rasterization and preserves its crop.
For a PDF/photo crop with a separately authored candidate use:

```json
{"method":"svg_render","svg":{"path":"candidate.svg","sha256":"actual-file-sha256"},"parameters":{"dpi":96}}
```

The candidate is copied unchanged, byte-bound to the generation record, rendered
inside the 60s/1GiB worker and re-rendered during verify. DPI defaults to 96 and is
bounded to 36..1200. Viewport aspect ratio is retained; all existing pixel/file
limits apply. Neither the candidate nor its successful rendering approves math.
The internal manifest has optional SVG/renderer metadata; Import-v2 stays unchanged.

```powershell
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline.examples.create_svg_demo --out-dir build/diagram-pipeline/svg-demo
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline render --manifest build/diagram-pipeline/svg-demo/inspected/reviewed.json --out-dir build/diagram-pipeline/svg-demo/rendered
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline package --manifest build/diagram-pipeline/svg-demo/rendered/manifest.json --output build/diagram-pipeline/svg-demo/import-v2.zip
```

### Portable runtime probe (not a signed app release)

`requirements.runtime.lock` contains runtime-only wheels. `requirements.lock`
also includes development/test tools. Both are hash-pinned Windows x64 / Python3.12.
Python3.15 compatibility must be reported separately; the user's global packages
are never reused by the deployment probe and no source-build fallback is allowed.

```powershell
./.venv-diagrams/Scripts/python.exe -m tools.diagram_pipeline.build_runtime --python-home C:/path/to/base-python312 --out-dir build/diagram-runtime/probe
./build/diagram-runtime/probe/runtime/python.exe -I ./build/diagram-runtime/probe/run_pipeline.py --help
```

Use a new output directory. The builder copies the base stdlib/native runtime,
installs only locked binary wheels, retains wheel metadata/notices and writes a
hashed runtime-report.json. It performs no installer replacement. The launcher
uses an absolute packaged Python path, `-I`, fixed Python source and separate argv;
a future native caller must use Command directly, never cmd.exe or a shell string.
Workers use an absolute isolated bootstrap, independent of cwd/PYTHONPATH. Pass manifest paths as separate arguments and keep
stdout JSON and stderr diagnostics separate. Cancellation owns the entire
worker tree; the installed app must not install packages on first launch.
No runtime is committed or uploaded as a redistributable installer in this change.
