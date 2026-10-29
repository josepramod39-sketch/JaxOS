# JaxOS Desktop 0.4.0 release retest

**77 unit/integration tests passed. All 13 distinct Electron scenarios passed after correcting one new test locator. No unresolved application failure was found in these checks.** TypeScript and the production build also passed.

The first expanded Electron run passed 12 scenarios and stopped one on a selector error: the new attached-server test searched for a textbox, but the model-name input has a datalist and exposes a combobox role. After correcting only that test selector, the targeted attached-server scenario passed in 4.1 seconds (4.7-second run). Both reports are retained; this is not represented as a single 13/13 initial run. No application source or installer was changed.

- [Machine-readable results](run-summary.json)
- [Unit/integration report](unit-tests.json)
- [Initial expanded Electron report](playwright-report/index.html)
- [Corrected attached-server report](attached-server-report/index.html)
- [Installer and build comparison](package-check.json)
- [Added acceptance tests](../../../tests/e2e/release-acceptance.spec.ts)

## Live acceptance added

**Attached server:** Started a separate real llama.cpp process with local Qwen GGUF, CPU execution, 4,096 context and a random test-only API key. Unauthenticated model discovery returned HTTP 401. Through actual Settings, JaxOS connected with the key, discovered the local model, displayed effective context, disabled load/unload and keep-loaded controls, constrained profile context, and generated a real answer. The key input cleared after application. A direct unload request was rejected without stopping the server. The server stayed alive after JaxOS closed. The key was absent from exposed state and the closed SQLite database. After restart, unauthenticated discovery failed with 401, demonstrating the session key was not restored, while conversation history persisted. The test-owned server was then stopped.

**Actual installer archive:** Extracted `resources/app.asar` directly from the released Windows installer, launched that archive with Linux Electron, started its coordinator and managed llama.cpp supervisor, loaded the real GGUF, generated an answer, unloaded, restarted and verified saved Daily/conversation data. This exercises the actual shipped JavaScript archive, not just a separately assembled test archive. It does not execute the Windows launcher or NSIS installer.

The 11 previous real Electron scenarios also passed, covering Ollama and managed GGUF lifecycle/thinking/cancellation, crash cleanup/reconnect, idle unload, tray continuation, history migration/search/backup, Daily/conversation persistence, real failing model-selected DRC and deterministic KiCad checks/previews/fabrication evidence.

## Release identity

The released installer is unchanged:

`JaxOS-Setup-0.4.0-win-x64.exe`

SHA-256: `96addb85101c0acec51277e6af12f3c20ef03a283dd386a21127db49c1b297a9`

All seven rebuilt renderer/main/preload/coordinator/supervisor outputs match the original validated manifest and the archive extracted from that installer. The version is 0.4.0. Existing release and source archive checksums passed. The new tests and this supplemental evidence are in the workspace, separately from the unchanged original source ZIP. The original `/workspace/JaxOS` Git checkout remains clean.

## Reproduce

Set the live-test variables documented in [VALIDATION.md](../../VALIDATION.md), then additionally set `JAXOS_TEST_RELEASE_ASAR` to the absolute path of `resources/app.asar` extracted from the installer. Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e`. The release-archive test is skipped without that explicit artifact path. To run just the new attached-server case:

```sh
npm run test:e2e -- tests/e2e/release-acceptance.spec.ts --grep 'attached authenticated'
```

The run used Linux x64, Node 24.19.0, Electron 44.7.0, KiCad 9.0.2, Ollama 0.40.3 and its bundled llama-server 0.5.0-dev/build 1/commit 631109b34. The cloud test harness supplies Xvfb and uses isolated temporary user data; no user project was modified.

Native Windows installation/upgrade/uninstall, Windows runtime/DLL/process behavior, GPU execution and physical hardware validation remain untested. Follow [Windows acceptance](../../WINDOWS-RELEASE.md) on the target PC. Passing CPU/local-model checks does not establish model engineering accuracy or support for every llama.cpp build/template.
