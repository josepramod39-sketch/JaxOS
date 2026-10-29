# 0.5.1 Apache-2.0 alpha preparation

Version 0.5.1 packages the owner's approved Apache-2.0 license, NOTICE, matching package metadata and footer version. No inference, coordinator or KiCad behavior changed. It is an alpha release candidate; no GitHub release or outreach has been published.

- TypeScript checking and production build: passed.
- Unit/process/integration tests: 86 passed, 0 failed. [JSON](unit-tests.json), [log](unit-tests.log).
- License consistency: full Apache-2.0 LICENSE, NOTICE included by packaging configuration, package/lockfile metadata aligned.
- Package: passed; 32 extracted license/notice, application, evaluator and fixture files match the built inputs. [Verification](package-verification.json), [build log](package.log).
- Targeted installer-archive Electron acceptance: 1 passed (9.1 seconds), including real boot/persistence/GGUF loading and unloading on Linux. [Log](electron.log), [HTML](electron-report/index.html).
- The 13-scenario Linux Electron run and live llama evaluations belong to [0.5.0](../release-0.5.0/RESULTS.md); they are historical regression evidence, not a fresh native Windows pass. Exact-format model failures remain failures.
- Launch workflow and feedback-form YAML parse locally; verifier JavaScript passes syntax checking. The Windows PowerShell collector/workflow are prepared and have not run on native Windows.
- Native Windows install/upgrade/uninstall, Windows demo capture and GPU checks: not run. Use [the form](../../launch/WINDOWS-ACCEPTANCE.md) and [full procedure](../../WINDOWS-RELEASE.md).

Git read/write access is verified and the integration branch has been pushed for review. The plugin API tools are not exposed in this chat and the separate CLI API credential fails. A review-branch push trigger starts Windows validation; execution results remain unverified. Public release publication still requires reviewed native acceptance. No credentials are included in release files.

Installer: `JaxOS-Setup-0.5.1-win-x64.exe`, 113,312,988 bytes. SHA-256: `5d2a1ff6d6bb19f27a45731e6c6877846054a7e07fed2b46d123741261936cc4`. Unsigned; native Windows validation remains false.
