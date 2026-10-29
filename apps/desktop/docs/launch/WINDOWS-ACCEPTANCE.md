# Windows alpha acceptance — evidence form

Status: NOT RUN. Fill from an actual Windows 10/11 x64 test account or VM. Do not infer acceptance from the Linux package receipt or a workflow that has not run.

Version: 0.5.1
Installer SHA-256: copy from the new versioned build receipt and verify locally.
Windows build/runtime/GGUF/KiCad versions: pending.

Run `scripts/collect-windows-alpha.ps1` with explicit installer, receipt, package-verification and output paths. It checks artifact identity and, if installed, the authentic installed executable/archive/wrapper and its help command. This is partial evidence; it does not automate installer or project acceptance.

| Scenario | Result: pass/fail/not run | Sanitized evidence |
| --- | --- | --- |
| Fresh non-admin installation, launch and shortcuts | not run | |
| Actual installed evaluator from an unrelated folder without system Node | not run | |
| Model load, context, real response, cancel, unload | not run | |
| Import project and actual ERC/DRC/findings | not run | |
| Save in KiCad, refresh, stale evidence and rerun | not run | |
| Restart retains history/project evidence | not run | |
| Upgrade from 0.5.0 preserves workspace/backup | not run | |
| Close-app/update handling | not run | |
| Uninstall/reinstall preserves user data | not run | |
| GPU path, if advertised as tested | not run | |

After installing in a dedicated Windows test account, run this from the source directory, using the matching new receipts (or the files produced by the CI template):

```powershell
.\scripts\collect-windows-alpha.ps1 `
  -InstallerPath .\release\JaxOS-Setup-0.5.1-win-x64.exe `
  -ReceiptPath .\release\windows-build-receipt-0.5.1.json `
  -VerificationPath .\docs\validation\release-0.5.1\package-verification.json `
  -OutputPath .\windows-alpha-evidence.json
```

Use a new output filename for every run. Exit 0 establishes only the listed artifact/installed-wrapper checks; installation absent or a failed check returns 1. The manual acceptance and GPU fields remain `not-run` even after the collector succeeds. Review before sharing.

Use [the full procedure](../WINDOWS-RELEASE.md). Keep backups and test fixtures outside installation folders. Public acceptance should identify tested combinations and remaining failures without exposing user data. The release can describe CPU-only acceptance if that is all that passed; do not claim untested GPU compatibility.
