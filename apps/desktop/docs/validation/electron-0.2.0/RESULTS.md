# Actual Electron validation — 0.2.0

Result: **7 end-to-end tests passed, 0 failed** on 20 October 2026. The six tested build files are identified in `validated-build.sha256`. Full report/attachments are retained in `playwright-report/` and `e2e/`.

Tests used real Electron 44.7.0 under Xvfb, its isolated preload and separate utility-process coordinator, KiCad CLI 9.0.2, and Ollama 0.40.3 / `qwen3:0.6b`. No fake renderer service replaced the application.

```sh
npm run typecheck
npm test
npm run build
JAXOS_LIVE_MODEL_TEST=1 JAXOS_TEST_MODEL=qwen3:0.6b JAXOS_TEST_KICAD_PATH=/usr/bin/kicad-cli npm run test:e2e
```

Executed scenarios:

1. Build/launch an actual application archive, use the coordinator bridge, restart and recover saved state.
2. Run actual ERC/DRC, render/zoom SVG, export manufacturing/evidence files and verify portable paths, hashes and Gerber references. Change source and observe stale evidence and a genuinely failing DRC.
3. Capture actual desktop conversation, Daily, Build and Settings layouts; the exploratory narrow capture does not establish a mobile client.
4. Save a profile (4096 context, 512 output, thinking On, CPU only, 60-second keep-alive), preload and verify runtime context, stream separate reasoning/final text, record usage, verify unload, then restart and recover profile/transcript.
5. Kill the actual named utility process, observe disconnection, reconnect to durable state, enable tray mode, close/hide the window, use the still-running coordinator and restore the window.
6. Persist Daily priorities and completion/deletion across restart; confirm renderer Node globals are unavailable.
7. Stream and persist a real local-model conversation across restart.

Both model-dependent scenarios ran with live prerequisites enabled. Download progress/failure/cancellation uses controlled HTTP in the 50-test unit/process/KiCad suite; no fresh-weight download over the user's Windows network is claimed.

The fresh interface reviewer opened all seven required captures in `.impeccable/review/0.2.0/` and returned **ship**, with no material fixes. This was a manual screenshot/source review, not an independent runtime rerun or automated pixel-diff gate.

Linux tests use `--no-sandbox` for the restricted worker; production does not. Windows installer execution, native Windows tray/process/dialog/KiCad acceptance, GPU benchmarks and physical circuit performance remain unverified.
