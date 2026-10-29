# JaxOS desktop Electron validation

Result: **4 end-to-end tests passed in 17.4 seconds** on 2026-10-11, after the interface contrast/copy batch, manufacturing-export path correction, and schematic-preview zoom/fit controls.

The tests launched the real built Electron 44.7.0 application on Debian 13 using Xvfb. The renderer used its actual isolated preload bridge, main process, persistence service, KiCad 9.0.2 executable, and Ollama with the installed `qwen3:0.6b` model. No fake renderer service was used.

```sh
npm run build
JAXOS_LIVE_MODEL_TEST=1 JAXOS_TEST_MODEL=qwen3:0.6b JAXOS_TEST_KICAD_PATH=/usr/bin/kicad-cli npm run test:e2e
```

Verified flows:

- Real ERC and DRC passes, preserved command/exit-code/revision evidence, an SVG that actually decodes in the interface, Gerber/drill/BOM/placement exports copied to the selected destination, and source-board preservation. Every exported artifact matches its original SHA-256; every Gerber job reference resolves to a nonempty exported file; every output-manifest relative path, size, and SHA-256 agrees with the exported tree.
- Preview zoom reaches 400%, grows the image beyond the real viewport, supports wheel panning to readable J1/J2 connector and pin labels, reduces size with Zoom out, and restores the original fitted size with Fit preview. Both fitted and zoomed SVG screenshots are preserved.
- A removed copper trace invalidates previous evidence; the next real DRC fails with exit code 5 and visible findings.
- Daily priority creation, completion, deletion, and persistence after closing/reopening Electron. Renderer Node globals are unavailable.
- A real local-model response and conversation content survive application restart.
- Project brief editing/persistence; actual 1440px conversation and Settings layouts; 1280px Daily and Build layouts; a 390px exploratory responsive image. The 390px inspection does not claim an Android implementation or alter the production Windows minimum size.

`playwright-report/index.html` contains the complete report, screenshots, and real KiCad run/evidence JSON attachments. Named PNGs also appear under `e2e/`. `validated-build.sha256` identifies the tested renderer assets and Electron bundles.

An earlier test incorrectly expected every Gerber to end in `.gbr`. KiCad produces supported Protel layer extensions such as `.gtl` and `.gbl`; the test was corrected to recognize these. This was a test assumption, not a manufacturing-output failure. The original failure report is preserved separately at `/workspace/.analysis/jaxos-validation-first-pass`.

Subsequent main-process code review found that prefixing exported artifact filenames broke internal `.gbrjob` file references. Export now preserves the verified output directory tree and uses relative paths in the root run metadata. The final end-to-end run includes explicit regression assertions for job references, exported paths, bytes, and hashes.

Linux test launches explicitly use `--no-sandbox` because this cloud worker cannot initialize Chromium's setuid sandbox; production application configuration does not include that flag. This run does not establish native Windows installer, Windows file-dialog, or Windows KiCad runtime behavior, nor physical circuit performance.
