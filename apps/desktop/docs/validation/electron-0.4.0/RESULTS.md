# Actual Electron validation — 0.4.0

**11 passed, 0 failed, 0 skipped in 60.278 seconds.** `run-summary.json` is extracted from the retained Playwright HTML report, not inferred from enabled flags. `validated-build.sha256` identifies the seven exact built files later compared with the installer archive.

Real Electron 44.7.0 runs with its preload, coordinator utility process, SQLite/FTS5 and llama.cpp supervisor under Xvfb. Inference used actual Ollama 0.40.3 (`qwen3:0.6b`) and its bundled llama-server (`0.5.0-dev`, build 1, commit 631109b34), CPU only. KiCad CLI 9.0.2 performed the checks.

The nine prior scenarios passed again: archive boot/restart; real KiCad clean/fault checks, SVGs and manufacturing/evidence exports; actual layouts; Ollama lifecycle/context/thinking; coordinator failure/tray continuation; legacy migration/search/backup; search recovery; Daily persistence; real chat/history persistence.

Two new scenarios passed:

- Managed GGUF setup through actual Settings, requested CPU/two threads, 4,096 context and 512 output, load/capability inspection, supported thinking with real reasoning/final text and usage/source/version/effective-context fields, cancellation during reasoning, coordinator SIGKILL, supervisor/model/key-directory cleanup, reconnect with preserved conversation/provider, reload at 8,192 context, and one-second idle unloading.
- Real GGUF-selected DRC in Test stage on the fault fixture: model tool intent becomes a genuine KiCad run with three findings and failed status; the transcript receipt and run survive restart. Model prose does not determine the stored result.

The archive scenario additionally loads/unloads the actual GGUF from inside `app.asar`, exercising the archived supervisor path. This ran on Linux Electron; it is not Windows executable acceptance.

Eight current captures in `.impeccable/review/0.4.0` cover managed setup, loaded status and generation profile at desktop/minimum width, thinking/final output and a real failed DRC receipt. Minimum supported Windows layout is 740×560. At that size the failure capture is intentionally scrolled to the final answer; its receipt header is above the viewport. Settings runtime/profile captures are intentionally scrolled to their named sections. The fresh reviewer inspected all captures and returned `ship` with evidence limits.

Earlier iteration exposed a controlled number-input race that saved the previous GPU value. Input values are now captured before functional state updates and controls disable during async saves. Final tests explicitly require the persisted CPU request. These final results also include source/version/context assertions and the archive lifecycle addition.

Use the live flags in `docs/VALIDATION.md` to reproduce. No Windows installer execution, real attached-server GUI acceptance, GPU benchmark, general software coding harness, Android endpoint or physical circuit validation is implied.
