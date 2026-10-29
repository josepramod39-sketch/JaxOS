# JaxOS 0.5.0 release validation

Built on 2026-10-28; installer extraction and live packaged checks ran on 2026-10-29 in Linux. This release adds managed llama.cpp to the evaluation runner and ships an installed `evaluate.cmd` command that uses Electron's bundled Node runtime. It does not require a system Node/npm installation.

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript and production build | Passed | `npm run typecheck`, `npm run build` |
| Unit/process/integration suite | 86 passed, 0 failed | [JSON](unit-tests.json), [log](unit-tests.log) |
| Real Electron regression suite | 13 passed, 0 failed, 0 skipped (1.8 minutes) | [log](electron.log), [HTML report](electron-report/index.html) |
| Packaged llama evaluation | 12 passed, 2 failed, 0 unscored | [report](llama-packaged-development.json) |
| Packaged held-out evaluation | 4 passed, 1 failed, 0 unscored | [report](llama-packaged-heldout.json) |
| Windows installer/archive verification | Passed; 29 payload files matched | [verification](package-verification.json), [build log](package.log) |
| Native Windows install/upgrade/uninstall, cmd.exe and GPU | Not executed | [Acceptance procedure](../../WINDOWS-RELEASE.md) |

The automated tests include actual ASAR evaluation from an unrelated working directory after deleting loose staging, coordinator cancellation/crash recovery, and real KiCad clean/fault/stale/cancellation checks. Additional coverage validates managed runtime cleanup on success/failure, authenticated supervisor traffic, file hashes, comparison integrity, invalid arguments and refusal to overwrite an existing output before contacting inference.

The real Electron suite additionally passed managed GGUF thinking/context/reload/cancellation/orphan cleanup, stage-tool execution against real KiCad failure evidence, authenticated attached-server ownership, and real boot/persistence/load/unload from the installer-extracted application. SQLite recovery/search/backup, Ollama lifecycle, tray continuation and workspace persistence passed. Linux test launches use Xvfb and disable Chromium sandboxing only for this restricted worker; distributed application settings remain unchanged.

## Actual model outcomes

Both live suites executed `resources/app.asar/dist-electron/eval.cjs` extracted from the new installer, using Electron 44.7.0 in Node mode from `/tmp`. They used the retained Qwen GGUF, the Ollama-bundled Linux llama-server reporting `0.5.0-dev (build 1, commit 631109b34)`, CPU layers zero, two threads, 4,096 context tokens, 256 output tokens, temperature zero and thinking off. KiCad was 9.0.2.

The llama lifecycle fixture passed real loading, observed 4,096-token effective context, cancellation after a streamed token, usable inference after cancellation, and unloading with no owned running server or loaded models. The other infrastructure/policy/context/KiCad cases passed. This does not prove GPU acceleration or maximum supported memory/context.

All three failing cases were exact-format failures: the direct response was `2 + 2 = 4`; the coordinator returned a numbered explanation containing the answer `4`; the held-out coordinator returned `3 + 4 = 7`. Each criterion requires only the numeral (optionally punctuation). The correct arithmetic values do not make these exact-format fixtures pass. Both commands returned exit code 1. No criteria were loosened and no model promotion is claimed. These public arithmetic fixtures are narrow smoke tests, not a general model-quality benchmark.

The earlier [source run](llama-source-initial.json) also recorded 12/14, including a passing lifecycle case. It preceded final report-configuration metadata changes and is retained as intermediate evidence; the packaged reports are the final release evidence. Their `sourceSha256` identifies compiled evaluation/host bundles and the package manifest. Model and executable file digests are in each report; linked runtime libraries and GPU drivers are not fully pinned by that identity.

## Artifact identity and limits

Installer: `JaxOS-Setup-0.5.0-win-x64.exe`, 113,284,850 bytes.

SHA-256: `029b875624a207b3dd9e146db606d890c76778c1efa328fe26f3ef55954f9ff5`.

The extracted ASAR equals the staged archive and receipt hash, all renderer/desktop bundles and evaluation/KiCad fixture bytes match the tested inputs, the extracted application is PE x64, and `evaluate.cmd` matches its source and receipt. The NSIS installer stub is x86, containing the x64 application. Packaging was unsigned and nothing was published.

Linux execution of extracted JavaScript is not execution of the Windows executable or installer. Windows DLL compatibility, actual command-wrapper execution, install/upgrade/uninstall and GPU behavior remain for native acceptance. The installer excludes llama-server, GGUF weights and KiCad; install compatible Windows versions separately. Existing personal workspace data was not used by evaluation.

See the [evaluation guide](../../LOCAL-EVALUATION.md) for installed/source commands, suite selection, exit codes and comparison rules. Previous 0.4.0 artifacts and evidence remain intact.
