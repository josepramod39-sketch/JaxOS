# JaxOS Desktop

A personal Windows workspace for local-model conversations, daily priorities, project briefs, and evidence-based KiCad checks. Version 0.5.1 uses Electron + React, a separate workspace coordinator and a narrow native bridge. Project files stay editable in KiCad.

## Alpha release preparation

The desktop source is licensed under Apache-2.0; bundled components keep their own licenses. Version 0.5.1 packages that license. Native Windows acceptance remains pending before announcing download availability. See [the alpha launch kit](docs/launch/README.md) for release copy, onboarding, demo and tester feedback.

## Personal Windows build

The release target is an **unsigned Windows x64 installer**. Packaging and Linux-based validation are separate from native Windows installation/runtime validation; see [the Windows release checklist](docs/WINDOWS-RELEASE.md) and the generated build receipt. This is a personal MVP, not a public production release.

KiCad and inference runtimes/weights are separate prerequisites, not bundled dependencies. Choose Ollama or llama.cpp:

1. Install [Ollama for Windows](https://ollama.com/download/windows), then download a model, for example `ollama pull qwen3:0.6b`. Keep Ollama running. JaxOS connects to its local API at `http://127.0.0.1:11434`; choose any installed model in Settings. The small default model is suitable for validating the workflow and has limited reasoning quality.
   Alternatively, select llama.cpp in Settings, choose a compatible Windows `llama-server.exe` and a local GGUF file, then Save and connect and Load model. Managed mode exposes requested GPU layers/CPU threads and context; attached mode connects to an existing loopback server without controlling its lifecycle. See [llama.cpp and workflows](docs/LLAMA-AND-WORKFLOW.md).
2. Install [KiCad](https://www.kicad.org/download/windows/). KiCad 9 is the initial tested CLI baseline. JaxOS detects the CLI or lets you locate `kicad-cli.exe` in Settings.
3. Install JaxOS using the release installer, then start a conversation or connect an existing `.kicad_pro` project.

The installer is unsigned, so Windows may show an unknown-publisher warning. Verify the provided SHA-256 before deciding whether to run it; no code-signing or native Windows validation is implied by the artifact existing.

## What the MVP does

- Brainstorm: persistent local Ollama or llama.cpp conversations, queued generation and cancellation, separate thinking/final answers, and usage/finish metadata.
- Model management: inspect local capabilities/residency; load/unload managed models; download through Ollama; save provider/model-specific context/output, thinking, temperature and residency profiles. Managed llama.cpp adds requested GPU layers and CPU threads. Unknown VRAM is shown as unknown.
- Evaluation: an installed command-line runner for Ollama and managed llama.cpp, with versioned fixtures, runtime/GGUF hashes, context and lifecycle checks, and JSON reports. See [evaluation commands](docs/LOCAL-EVALUATION.md).
- History: full-text saved-message search, selection/reveal, SQLite migration and online database backup.
- Daily: persistent priorities and completion state.
- Build: a connected KiCad project, editable goal/notes/checks, schematic/board previews, native KiCad launch and saved-file refresh.
- Test: real ERC/DRC runs, separate findings and logs, source fingerprints, stale-state indicators, and exportable run evidence.
- Fabrication export: checked, versioned manufacturing artifacts from the selected project. Exported files are not a manufactured or physically tested board.

Analysis and Plan can inspect an attached project; Design can generate previews; Test can run ERC/DRC; Launch can request checked fabrication exports. These are bounded, named tools with durable receipts and real KiCad evidence. Chat cannot execute arbitrary shell commands, edit source code or modify circuits. Full CAD editing stays in KiCad; save there and refresh the project in JaxOS before checking the new revision.

Android pairing, live PCB APIs, automatic circuit generation, cloud-provider integration, software deployment, and physical instrument control are deferred. The responsive layout is not an implemented Android connection.

## Data and recovery

JaxOS stores workspace data under Electron's per-user application-data directory, in its `workspace` child directory. On Windows this is normally `%APPDATA%\JaxOS\workspace`. Settings includes an action to open that directory. The SQLite store introduced in 0.3.0 imports existing JSON history into `workspace.sqlite` without changing the original files. Settings can export a consistent database backup while running. Copy the `runs` folder and external KiCad sources separately for artifact/source recovery; see [storage and restoration](docs/STORAGE.md). The uninstaller preserves user data.

The coordinator runs separately from Electron main. After a service interruption, reconnect loads saved state without replaying uncertain actions. Optional Settings tray mode keeps work running when the window is hidden; choose Quit from the tray to stop it. The PC must remain awake. Streaming text is periodically saved, so a hard crash may lose its last unsaved fragment. Context budgeting preserves complete exchanges and reports omitted older context; it does not create automatic summaries.

Checks and exports run on bounded project snapshots and put evidence in application data. JaxOS does not overwrite the user's CAD source files. A saved source change makes previous results stale. Restarting after an interrupted job must show interruption, never a fabricated success.

## Development

Use Node.js 24 and npm. From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm start
```

`npm run dev` starts Vite on loopback and Electron. The renderer has no Node access; the preload exposes only the application's typed operations. No browser-accessible application server is started in production.

If the environment disables dependency install scripts, run Electron's official installer explicitly after `npm ci`:

```sh
node node_modules/electron/install.js
```

`npm run test:e2e` exercises the real Electron application. Linux cloud runs need an X display; the test harness may disable Chromium's sandbox only for that test environment. The distributed Windows application does not disable its sandbox. Real KiCad tests require a compatible `kicad-cli`; local-model integration tests require a responding Ollama instance and, for llama.cpp checks, a compatible server executable and GGUF. See the exact live-test flags in [validation](docs/VALIDATION.md).

Build the personal Windows installer after the application build:

```sh
npm run package:win
```

The packaging script stages Electron for Windows and uses a pinned NSIS compiler. It includes `evaluate.cmd` beside `JaxOS.exe`, allowing evaluations without a separate Node/npm installation. It writes installer hashes and a receipt recording that packaging alone does not validate native Windows behavior. Nothing is published automatically.

## Project references

- [Adopted architecture and next increments](docs/ARCHITECTURE.md)
- [Local evaluation runner](docs/LOCAL-EVALUATION.md)
- [llama.cpp setup and bounded workflows](docs/LLAMA-AND-WORKFLOW.md)
- [Peiranava comparison](docs/PEIRANAVA-COMPARISON.md)
- [Confirmed product scope](PRODUCT.md)
- [Executed validation and limits](docs/VALIDATION.md)
- [Retained cloud setup](docs/CLOUD-ENVIRONMENT.md)
- [SQLite migration, task ledger and backups](docs/STORAGE.md)
- [Interface design system](DESIGN.md)
- [Hermes and OpenCode research](docs/research/HERMES-OPENCODE-ASSESSMENT.md)
- [Desktop composition](DESKTOP-PLAN.md)
- [KiCad interface](KICAD-INTEGRATION.md)
- [Electronics roadmap](ELECTRONICS-PLAN.md)
- [Deferred Android companion](MOBILE-PLAN.md)
- [Third-party notices](THIRD-PARTY-NOTICES.md)

Hermes inspired the interface direction; this project is not affiliated with Hermes. The original `/workspace/JaxOS` checkout and the inaccessible Windows Blueprint backend are separate projects.
