JaxOS Desktop combines local-model conversations with KiCad project checks in a Windows workspace. This is an **unsigned experimental prerelease** for early testers.

**Native Windows acceptance remains incomplete. The earlier packaging failure came from two omitted packaging-source files; this release includes those files and checks for them before building.** This installer is cross-built on Linux; successful packaging and archive verification do not establish that it installs or runs correctly on your Windows machine. Use a dedicated test account or VM and a copy of a non-sensitive project initially.

### Download and try

1. Download `JaxOS-Setup-0.5.1-win-x64.exe` and verify it against the release's `SHA256SUMS-0.5.1` using PowerShell `Get-FileHash`.
2. Install KiCad 9 separately. Install either Ollama with a local model, or a compatible Windows llama-server build with its libraries and a text GGUF. These are not bundled.
3. Follow the [tester quickstart](https://github.com/josepramod39-sketch/JaxOS/blob/desktop-v0.5.1-alpha.1/apps/desktop/docs/launch/QUICKSTART.md). Connect a project, run a check, inspect findings, and edit/save in KiCad before refreshing and rerunning.

### Included

Persistent local-model conversations and daily priorities; Ollama/llama.cpp profiles and managed GGUF loading/unloading; KiCad previews, real ERC/DRC findings and saved evidence; manufacturing-file export; an installed `evaluate.cmd` requiring no separate Node/npm installation.

Source is Apache-2.0. See LICENSE, NOTICE and THIRD-PARTY-NOTICES.md. Dependencies and sample libraries retain their licenses.

### Evidence and limits

Prior Linux validation passed 86 automated tests and targeted installer-archive boot/persistence/GGUF checks. The small model failed exact-answer formatting fixtures despite correct arithmetic values; these remain failures. GPU execution, native install/upgrade/uninstall and the Windows CLI wrapper are unverified. Requested GPU layers do not establish actual acceleration. Model output can be wrong; saved KiCad results do not certify electrical safety or physical hardware.

Android, automatic circuit generation, generic software editing/building and software deployment are future work. Circuit edits remain in KiCad. Quit JaxOS and its evaluator before updating, and back up your workspace before alpha upgrades. Uninstall is designed to preserve user data; native acceptance is pending.

[Validation details](https://github.com/josepramod39-sketch/JaxOS/blob/desktop-v0.5.1-alpha.1/apps/desktop/docs/VALIDATION.md) · [Windows acceptance form](https://github.com/josepramod39-sketch/JaxOS/blob/desktop-v0.5.1-alpha.1/apps/desktop/docs/launch/WINDOWS-ACCEPTANCE.md) · [Feedback/issues](https://github.com/josepramod39-sketch/JaxOS/issues)

We are recruiting the first ten testers. Tell us whether you reached your first project check and where setup became confusing. Issue reports are public; remove credentials, personal paths and proprietary project data. No Windows demo video is available yet.
