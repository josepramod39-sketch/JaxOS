# Windows personal release

Version 0.5.1 targets Windows x64 and is unsigned. Building an installer in Linux does not establish that it launches or installs correctly on Windows. This is a personal preview, not a publicly signed production release.

## Build

Use Node 24 and the committed lockfile. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run package:win`. Packaging uses pinned Electron 44.7.0 and electron-builder 26.15.3 to stage the app. A checksum-verified NSIS toolset 1.2.1 compiles `build/installer.nsi`; it does not need Wine. No release is published.

The installation also includes `evaluate.cmd`, which runs the bundled evaluator using Electron’s Node runtime. It requires no separate Node/npm installation; KiCad, llama-server and weights remain separate prerequisites.

The output is `release/JaxOS-Setup-0.5.1-win-x64.exe`, accompanied by `SHA256SUMS` and `windows-build-receipt.json`. The receipt deliberately says `nativeWindowsValidated: false`; update release evidence separately after real Windows acceptance checks, rather than treating package creation as runtime evidence.

The cloud workspace can reuse its verified compiler by setting `ELECTRON_BUILDER_NSIS_DIR=/workspace/.tools/electron-builder/nsis-bundle`. Set `ELECTRON_BUILDER_CACHE`, `electron_config_cache`, and `npm_config_cache` to writable workspace paths when the normal home cache is unavailable. The packaging script forwards `electron_config_cache` to electron-builder's separate download-cache configuration. The script otherwise downloads the compiler through the pinned packaging library with its built-in SHA-256 verification.

## Installation and updates

- Installs only for the current user, to `%LOCALAPPDATA%\Programs\JaxOS`, without administrator access.
- Creates Start menu and desktop shortcuts plus an Apps & Features uninstall entry.
- Finish any evaluation command and quit JaxOS fully from its tray menu before updating or uninstalling when background mode is enabled. The installer checks for a locked executable and asks the user to close it; silent mode exits with code 2.
- Run the next installer to update in place. Conversations and settings in Electron's separate user-data directory are preserved during upgrades and uninstall.
- The fixed installation folder is for application files. Keep your own projects and documents outside it.
- Windows may warn about an unrecognized publisher because this build is unsigned. Signing and public update distribution require a later release decision and signing identity.

## Required Windows acceptance evidence

Use an actual Windows 10/11 x64 account (Windows 11 preferred), record the installer SHA-256 and Windows build, and retain logs/screenshots with the result:

1. Verify the installer hash using `Get-FileHash .\JaxOS-Setup-0.5.1-win-x64.exe -Algorithm SHA256`.
2. Install without elevation; confirm shortcuts and the installed launch. Confirm the renderer receives only the intended preload bridge and native file selection works.
3. Upgrade an existing workspace and verify JSON/backup bytes remain unchanged while SQLite history, profiles, notes and evidence remain accessible. Search for an older message, open it, export/reopen a database backup, rebuild the index and restart. Verify FTS5 in the actual Windows coordinator. Test interruption/duplicate command admission separately from successful completion. Preserve data before testing corruption.
4. Inspect/load a local model, save context/output/thinking settings, verify effective context, generate a real response with separate reasoning when supported, then unload and confirm residency. Test missing/remote models separately. Record actual GPU/CPU placement rather than inferring it from Auto.
   For llama.cpp, select a Windows server executable and GGUF using native dialogs; check paths with spaces/non-ASCII names, missing DLLs, unsupported flags, CPU load, requested versus effective context, thinking, cancellation, idle unloading, restart and orphan cleanup. Validate a GPU-capable build on the actual GPU separately; layer requests are not placement measurements. Test attached-server authentication and verify JaxOS cannot unload or stop that external server. Models and runtimes are not included in the installer.
5. While a response runs, enable tray mode and close the window; restore it and confirm progress. Quit from the tray and confirm coordinator cleanup. Repeat with tray mode disabled. Kill the named coordinator during a response, reconnect and confirm an interrupted result without duplicate submission.
6. Select a real KiCad project and run electrical/board checks with the supported KiCad installation. Review exit codes, reports, paths with spaces, and the missing-tool case. Do not treat a skipped KiCad test as a pass.
   In Test stage, ask the model to run DRC on a known faulty fixture and verify the tool receipt retains failure after restart. Analysis/Plan must reject check/export tools. Launch exports manufacturing files only after the existing checks pass; it does not deploy software.
7. Start the installer while JaxOS is open; confirm the close-app prompt (silent installation must fail instead of hanging). Close the app and reinstall; saved data must survive.
8. From an unrelated folder, run the installed `evaluate.cmd --help`, then the managed llama.cpp and held-out evaluation commands in [the evaluation guide](LOCAL-EVALUATION.md). Confirm JSON output, meaningful exit status, real GGUF/server hashes, cancellation/recovery/unload and no modifications to the existing workspace. Repeat with paths containing spaces and verify the runner works without a system Node/npm installation.
9. Uninstall, verify application files/shortcuts are removed and saved data survives, then reinstall and verify it is recovered.

A Windows CI job can run the same locked install, type checking, unit tests, build and package commands on `windows-latest`, upload the unsigned installer as a private workflow artifact, and run an Electron smoke test that opens the first window and asserts the preload bridge. That validates the executable and bridge but does not replace the interactive install/upgrade/uninstall and KiCad checks above. Do not publish a public GitHub release automatically.
