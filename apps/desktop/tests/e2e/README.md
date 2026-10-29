# Desktop end-to-end checks

These tests launch the built Electron application, use its real preload bridge and service, and write to temporary application data. They do not substitute browser mocks for desktop behavior. KiCad fixture projects are copied before use.

```sh
npm run build
npm run test:e2e
```

Prerequisites: KiCad 9 or later on `PATH` (or `JAXOS_TEST_KICAD_PATH`), the Electron runtime installed by npm, and Xvfb for a headless Linux machine. `JAXOS_XVFB_BIN` may point to a portable Xvfb executable. On Windows a normal interactive desktop is sufficient.

To include actual Ollama inference, start Ollama with an installed model and run:

```sh
JAXOS_LIVE_MODEL_TEST=1 JAXOS_TEST_MODEL=qwen3:0.6b npm run test:e2e
```

PowerShell equivalent:

```powershell
$env:JAXOS_LIVE_MODEL_TEST = '1'
$env:JAXOS_TEST_MODEL = 'qwen3:0.6b'
npm run test:e2e
```

The test harness passes `--no-sandbox` only on Linux because restricted cloud workers cannot start Chromium's setuid sandbox. This is a test launch option, not an application or installer default. Linux tests establish the Electron application/IPC workflow; they do not substitute for installing and launching the Windows installer on a Windows machine.

Covered flows: persisted daily priorities, optional persisted real model response, clean ERC/DRC, rendered KiCad preview with zoom/pan/fit, fabrication/evidence export with intact Gerber-job references and matching output hashes, original-file preservation, stale evidence after file changes, and a genuine failed PCB check.


Version 0.2.0 also verifies per-model profile persistence, effective context and loaded-model state, actual separate reasoning/final text and usage, unload verification, utility-process crash/reconnect, tray hide/restore with ongoing service work, and startup/persistence from a real application archive. The two model-dependent tests require `JAXOS_LIVE_MODEL_TEST=1`; without it they are skipped and must not be reported as passes. Model download progress/error/cancellation is covered through controlled HTTP in the unit suite. GPU execution and native Windows tray/installer behavior require their own platform checks.

Version 0.3.0 adds two real Electron scenarios: read-only legacy import, message search/empty/reveal at desktop/minimum widths, online database export/reopen, index rebuild, persistence after restart, and search error/retry with a deliberately blocked coordinator. Unit/process tests verify transactional rollback, preserved legacy files, FTS repair, command conflict/concurrent duplicate handling and no replay after a forced process crash.
