# Actual Electron validation — 0.3.0

Result: **9 end-to-end tests passed, 0 failed, 0 skipped in 35.9 seconds**, 20 October 2026. See `run-summary.json`, the portable HTML report/attachments, and `validated-build.sha256` for the six tested output files.

Real Electron 44.7.0 used its sandboxed preload and utility-process coordinator under Xvfb. Electron's Node 24.21.0 / SQLite 3.53.4 supports built-in SQLite and FTS5. KiCad CLI 9.0.2 and Ollama 0.40.3 / local `qwen3:0.6b` supplied actual checks and inference. The app was not replaced by a mocked browser service.

The suite retains the seven 0.2.0 scenarios: archived application boot/restart, genuine passing/failing KiCad checks and manufacturing/evidence integrity, desktop layouts, real thinking/model profiles/residency, coordinator failure/tray continuation, persistent Daily items, and persistent real model conversation.

Two new scenarios verify:

- Import a 38-message labeled fixture through the actual coordinator, preserve original JSON bytes, search saved final/user text, exclude reasoning, reveal an earlier message, show empty results, use minimum-width navigation, export/reopen a database backup, rebuild the index and restart without reimporting. The restored backup retains 19 historical task snapshots.
- Kill the actual coordinator, deliberately block its replacement with a live-owner lock, show a readable search error, remove the test lock and retry to a healthy query. This is a real service/lock failure, not an overridden renderer API.

The new UI has seven named captures in `.impeccable/review/0.3.0/`: search/empty/error at 1440, sidebar search at 740, storage controls at 1440 and 740, and exploratory search at 390. The 740×560 view is the Windows minimum; 390×844 is an inspection only and does not establish an Android client. Root inspected a complete batch, then confirmed the same set after error-message cleanup and correcting the scrolled storage capture.

Initial storage-test failures were fixture/harness assumptions: the legacy fixture was placed above the actual workspace child directory, and the 390px backdrop's center was covered by navigation. Both tests were corrected to use the real data location and an unobstructed pointer location. The final assertions still require unchanged legacy bytes, a revealed match, actual backup restoration and accessible controls.

```sh
npm run typecheck
npm test
npm run build
JAXOS_LIVE_MODEL_TEST=1 JAXOS_TEST_MODEL=qwen3:0.6b JAXOS_TEST_KICAD_PATH=/usr/bin/kicad-cli npm run test:e2e
```

Linux launch disables Chromium's sandbox for this restricted test worker only. The distributed application retains its sandbox. No Windows installer execution, native Windows SQLite/tray/dialog/KiCad acceptance, GPU benchmark, autonomous coding harness or physical circuit result is implied.
