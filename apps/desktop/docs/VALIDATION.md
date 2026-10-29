# Desktop validation — 0.5.1

The Apache-2.0 alpha preparation passes TypeScript checking, build and 86 automated tests. All 32 extracted payload files match the tested inputs, and targeted Linux Electron archive acceptance passed (1 test). Evidence is tracked in [the 0.5.1 report](validation/release-0.5.1/RESULTS.md). Native Windows acceptance and public release are pending. [Launch kit](launch/README.md).

# Prior desktop validation — 0.5.0

The new personal Windows installer includes managed llama.cpp evaluation and an installed command requiring no separate Node/npm. The current run passed 86 unit/process/integration tests, all 13 real Electron scenarios (including the installer-extracted archive), TypeScript checking and the production build. Installer extraction verified all 29 application and fixture payload files against the tested build.

Live evaluation from the actual installer archive passed 12/14 llama cases and 4/5 held-out cases: all lifecycle and infrastructure cases passed, while the model gave correct arithmetic values in a format outside the strict fixture requirements. Those outcomes remain failures. Native Windows installation/runtime and GPU execution are not validated here.

See [the complete 0.5.0 release evidence](validation/release-0.5.0/RESULTS.md), [the evaluator guide](LOCAL-EVALUATION.md) and [Windows acceptance steps](WINDOWS-RELEASE.md). Historical 0.4.0 findings follow without being treated as new-release results.

# Prior desktop validation — 0.4.0

**Subsequent release retest:** 77 unit/integration tests and all 13 distinct real Electron scenarios passed after correcting one test locator. This adds authenticated attached-server GUI/lifecycle/key checks and real inference from the installer-extracted archive. No application or installer change was needed. [Full retest evidence and initial failure history](validation/retest-0.4.0/RESULTS.md).

The llama.cpp/provider and bounded KiCad tool-loop increment was built and exercised in the Linux cloud environment. Windows packaging and native Windows acceptance are separate outcomes.

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript strict checking | Passed | `npm run typecheck` |
| Unit, process and real KiCad integration tests | 77 passed, 0 failed | [JSON report](validation/unit-tests-0.4.0.json) |
| Real Electron end-to-end suite | 11 passed, 0 failed, 0 skipped; 60.3 seconds | [Results](validation/electron-0.4.0/RESULTS.md), [HTML report](validation/electron-0.4.0/playwright-report/index.html) |
| Renderer/main/preload/coordinator/supervisor build | Passed | [Seven tested output hashes](validation/electron-0.4.0/validated-build.sha256) |
| Interface finish review | Manual `ship`; no material visual fixes within supplied evidence | [Fresh review](../.impeccable/review/0.4.0/finish-review.md) |
| Windows installer | Unsigned x64 package, extracted archive compared with tested outputs | [Package verification](validation/windows-package-verification-0.4.0.json) |
| Native Windows install/upgrade/uninstall, runtime/GPU/KiCad | Not executed here | [Acceptance checklist](WINDOWS-RELEASE.md) |

## What was actually exercised

The unit/process suite used Node 24.19.0. Real Electron 44.7.0 uses Node 24.21.0 and built-in SQLite/FTS5. Actual KiCad CLI 9.0.2 and Ollama 0.40.3 / `qwen3:0.6b` supplied existing checks and inference. New managed tests used the Ollama-bundled Linux llama-server reporting `0.5.0-dev (build 1, commit 631109b34)`, with Qwen GGUF SHA-256 `7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa`. Execution was CPU-only; the GGUF is retained separately and not bundled in source/installer.

Tests launched actual Electron under Xvfb, its narrow preload and separate utility-process coordinator. No fake renderer API replaced the app. Linux test launches disable Chromium's sandbox for this restricted worker; the distributed app retains sandboxing, context isolation and no renderer Node access.

New live checks establish native-selected GGUF configuration, 4,096-token effective context, supported thinking with separate reasoning/final output, usage and runtime-source metadata, cancellation, coordinator-crash cleanup of the owned server/key directory, reconnect persistence, 8,192-token reload and idle unload. The application archive itself loads and unloads the GGUF through its included supervisor. A real local model selected `project_run` DRC against a deliberately faulty fixture; real KiCad returned three findings, and the failed result/receipt survived restart.

New controlled tests cover fragmented/malformed/truncated SSE, completed tool-call parsing, cancellation and redirect rejection, provider/profile separation, session credential boundaries, attached-server protocol, invalid configuration/GGUF/path patch rejection, tool intent persistence before execution, stage/argument policy, duplicate IDs, incomplete tool requests, operation/context/output/time limits and cancellation. The subsequent release retest adds attached-server GUI acceptance against a separately running real llama-server on Linux; its report records authentication, inference, process ownership and session-key persistence checks.

The existing checks still establish SQLite JSON migration/search/backup restoration, task/event/command admission, duplicate/conflicting commands, process crash reconciliation, tray continuation, Ollama thinking/profiles/residency, persistent conversations/Daily state, real clean and faulty ERC/DRC, source preservation/staleness, SVG previews and manufacturing/evidence export integrity.

## Reproduction

Use the locked dependencies, KiCad on PATH or its explicit path, a running Ollama with the selected model, and a compatible llama-server/GGUF:

```sh
npm ci
npm run typecheck
npm test
npm run build
JAXOS_LIVE_MODEL_TEST=1 JAXOS_TEST_MODEL=qwen3:0.6b \
JAXOS_LIVE_LLAMA_TEST=1 \
JAXOS_TEST_LLAMA_BIN=/workspace/.tools/ollama/lib/ollama/llama-server \
JAXOS_TEST_LLAMA_MODEL=/workspace/.cache/jaxos-model/model.gguf \
JAXOS_TEST_KICAD_PATH=/usr/bin/kicad-cli npm run test:e2e
```

On Windows set the same variables through PowerShell `$env:NAME='value'`, using actual Windows executable/weight paths. Test overrides are ignored by packaged production builds. Missing prerequisites must be reported as skipped, not passed. See [cloud setup](CLOUD-ENVIRONMENT.md).

## Evidence limits

The fresh visual reviewer inspected eight actual captures and bounded source, and issued `ship` at that scope. The automated design detector was unavailable; keyboard/screen-reader execution, expanded processor/attached-mode visual states and native Windows rendering were not independently certified. Existing design files were preserved by the documentation handoff.

No native Windows installation, standalone Windows llama.cpp/GPU compatibility, maximum-memory capacity, generic model-template compatibility, model-quality benchmark, software editing/build/deployment, Blueprint parity, Android connection, live CAD editing, simulation or physical board validation is implied. Message provenance stores model path/version, not a GGUF content hash. A crash in the narrow interval between KiCad admission and transcript run-ID persistence can leave evidence in run/task history without its transcript link; uncertain operations are not replayed.

No dependencies changed in this increment. Historical October 11 dependency-audit reports remain under `validation/`; they are not a fresh audit or security certification. Prior 0.3.0 [Electron](validation/electron-0.3.0/RESULTS.md), [unit](validation/unit-tests-0.3.0.json) and package evidence remain intact, as do 0.2.0 and original 0.1.0 evidence.
