# Offline diagram pipeline v1

Creates **real PNG files** from immutable PDF/photo evidence and an explicit reviewed
manifest. It does not OCR equations, infer geometry, call an AI API, or prove that
a supplied diagram specification matches an exam. All generated candidates remain
`needs_review` when imported. Python is not bundled with or executed by the app.

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
No Python evaluation, external TeX, arbitrary SVG/XML, OCR or model execution.
Mathtext uses bundled DejaVu Sans; missing glyphs/clipped labels fail and preserve
originals. Environment reports include font/code hashes, versions, DPI and seed.

## Trust, artifacts and failure handling

Source pages/crops, original crops and candidates are separate real files. SHA-256
checks prove byte identity, not mathematical meaning. `verify` always returns
`mathematicalEquivalence: "not_proven"`. Wrong labels in an explicit spec do not
magically become a mathematical PASS. There is no similarity-score approval.

The generated ZIP is **external input**, even on the same PC. Producer labels,
model self-checks, `second_pass_model`, user/local approval claims and deterministic
generation claims cannot create app approval. Only actual app comparison actions
store a user representation choice. Both images remain referenced/protected.

Generation uses one isolated worker at a time: 60s wall limit and 1GiB process
commit limit via Windows Job Objects (plus no child processes). POSIX resource
limits are implemented but that environment is not covered by this Windows lock.
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
Pillow: HPND; NumPy: BSD with bundled-library notices; Matplotlib: PSF-style with
font notices; OpenCV: Apache-2.0 plus wheel components (including FFmpeg LGPL).
Inspect the actual wheel's complete license set before binary redistribution.
This PR distributes source/locks/notices, **not** a Python/PDFium runtime. No
PyMuPDF dependency or commercial-license assumption is introduced.
