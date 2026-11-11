# JaxOS acceptance — 12 November 2026

**Application baseline checks passed. Model-quality gates did not all pass. Full HaaS feature acceptance is not met because the proposed experiment-management features are not implemented.** This run tested the actual public 0.5.1 alpha installer, not a newly rebuilt substitute. Machine-readable results are in [summary.json](summary.json).

## Exact revision and artifact

Release: `desktop-v0.5.1-alpha.1`; application source commit `8d44727d2342f97dd1ab3a79df59c5bdeef0d20f`.

Public installer: 113,296,488 bytes; SHA-256 `8529cf081e964c714e3a2fbcddee4f178c8c7f79e56942fff886d9961dd4a114`.

The restored checkout was initially at an earlier revision. The release tag was fetched into an isolated acceptance worktree, leaving the original checkout unchanged. Downloaded installer/source matched the published checksums; all 470 tracked desktop source files matched the complete source ZIP. All 32 extracted payload files matched both published payload hashes and the fresh build. The application is PE x64, and its Apache-2.0 license, NOTICE, manifest and installed evaluator were verified. See [source/download evidence](download-and-source-check.json) and [payload evidence](payload-check.json). These integrity checks are not code signing or a security audit.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript and production build | Passed | [typecheck](typecheck.log), [build](build.log) |
| Unit/process/real KiCad integration | 86 passed; no failed or skipped tests in final run | [JSON](unit-tests.json), [log](unit-tests.log) |
| Real Linux Electron scenarios | 13 passed; no failed or skipped scenarios | [log](electron.log), [HTML](electron-report/index.html) |
| Exact public installer on native Windows | 8 passed | [native report](native-windows.json), [Windows workflow](https://github.com/josepramod39-sketch/JaxOS/actions/runs/43080574831) |
| Packaged llama.cpp development/lifecycle suite | 12 passed, 2 failed, 0 unscored | [report](llama-development.json), [log](llama-development.log) |
| Packaged llama.cpp held-out suite | 4 passed, 1 failed, 0 unscored | [report](llama-heldout.json), [log](llama-heldout.log) |
| Packaged Ollama development suite | 11 passed, 2 failed, 0 unscored | [report](ollama-development.json), [log](ollama-development.log) |

The Linux Electron suite used the real app/preload/coordinator under Xvfb, actual Ollama and managed/attached llama.cpp, and actual KiCad. It exercised persistence/search/backup, tray continuation and coordinator recovery, provider authentication/ownership, context/thinking/cancellation/cleanup, real model-selected faulty-board DRC evidence, previews, fabrication exports and source staleness. Its release-specific scenario launched the archive extracted from the downloaded public installer.

The separate native Windows runner installed that same checksum-verified public installer and launched **its packaged executable**, checking a real GUI/coordinator bridge and absence of renderer page errors. It verified saved Daily state across app restart, the installed CLI from another working directory, same-version in-place upgrade with unchanged database bytes, uninstall retaining the database, and reinstall recovering the saved item. It then removed the synthetic item. A native screenshot is available in the workflow artifact `exact-public-installer-acceptance`.

## Recorded failures and corrections

The initial automated run passed 84 tests, but the packaged-evaluation suite could not load because the restored environment was missing Electron's executable. The official installer restored pinned Electron 44.7.0 from its verified cache; the complete suite then passed 86/86. [Initial JSON](unit-tests-initial.json), [initial log](unit-tests-initial.log), [setup log](electron-setup.log) remain retained. This was an environment prerequisite failure, not an application pass or a silently omitted test.

The initial Windows run sampled file removal immediately after NSIS's launcher returned and failed the uninstall assertion. The corrected test waits up to 30 seconds for the temporary uninstaller's cleanup, still requiring removal and byte-preserved data. The successful run observed removal 110 ms after launcher exit, then passed reinstall recovery. [Initial Windows report](native-windows-initial.json) and [final report](native-windows.json) are both retained. No application/uninstaller behavior was changed to obtain this result.

All three live evaluation commands returned exit code 1, correctly preserving failed criteria. In llama.cpp development, responses were `2 + 2 = 4` and a numbered explanation containing `4`; held-out returned `3 + 4 = 7`. These have correct arithmetic values but fail the unchanged exact-numeral format. Ollama's direct response was `2`, which is an arithmetic error; its coordinator response contained the correct answer but failed format. No rubric or expected answer was relaxed. These few public synthetic cases are smoke tests, not a model-quality benchmark.

## HaaS acceptance boundary

The accepted plan's next increment requires durable experiment/run/trial records, versioned dataset/scorer contracts and retained evaluation artifacts. The current CLI still executes fixed suites, reserves a JSON output and writes its report at completion; its temporary evaluation workspaces are removed. Existing application SQLite recovery does not implement an experiment repository.

See [the HaaS criteria matrix](HAAS-ACCEPTANCE.md) for the criteria not met. They are recorded as unimplemented/partial rather than fabricated passes or skipped tests claimed as successes. No cloud HaaS service, automatic judge, experiment promotion or external telemetry was introduced during acceptance.

## Practical limits

Linux execution used Node 24.19.0, Electron 44.7.0 / Node 24.21.0 / SQLite 3.53.4, KiCad 9.0.2, local Qwen weights and the retained Ollama-bundled llama-server. Exact provider/runtime/weight identities are in the evaluation reports. GPU execution and Windows live inference/KiCad were not tested. Requested processor/context values do not prove GPU placement or memory capacity.

Native Windows checks used a disposable hosted CI account. The installer was invoked without an explicit elevation request; ordinary non-admin/UAC behavior was not separately certified. Upgrade coverage is same-version reinstall, not cross-version migration. No private user project or saved personal workspace was used. Physical boards, wiring and instrument testing are outside these checks.

The current alpha's functional baseline is supported by these results. Accepting the HaaS expansion requires implementation and new evidence; the small model also does not satisfy every existing quality fixture. No new product release was published by this test run.
