# JaxOS desktop and roadmap

Scope now includes an Android-first, Windows-companion mobile experience, as confirmed by the user. See [MOBILE-PLAN.md](MOBILE-PLAN.md) for the proposed shared service, phone workflows, availability choices, and staged delivery. Electron + React remains the confirmed Windows stack; a React PWA is the recommended initial mobile delivery.

Build/Test scope also extends to electronics and combined hardware/firmware projects. [ELECTRONICS-PLAN.md](ELECTRONICS-PLAN.md) defines a staged path from requirements and schematics to wiring, PCB files, and real test evidence. Blueprint.io feature parity remains an analysis target, not an established capability.

The requested [KiCad interface](KICAD-INTEGRATION.md) starts with linked native projects, opening KiCad, refreshed saved-file previews, and CLI checks/exports. A live editor connection is a later version-gated extension.

Electron + React and visual mockups first were explicitly selected by the user. The desktop MVP and unsigned x64 installer are implemented. Linux tests use actual Electron, Ollama and KiCad; native Windows installation and runtime acceptance remain outstanding. See [validation](docs/VALIDATION.md).

Three full-size compositions are saved in `.impeccable/mocks/`:

- `conversation.png`: A, conversation-first workspace with project context. Recommended foundation for the common shell and Brainstorm mode.
- `workbench.png`: B, plan/change/check viewer with an assistant pane. Recommended contextual workspace for Build and Test.
- `daily.png`: C, daily overview with next steps and remembered decisions. Recommended Today destination.

The proposed combination uses one consistent shell, icon family, typography, and persistent project/session state; these mockups are compositional alternatives, so their small chrome and logo differences should be normalized to the selected base during implementation. All illustrated content is sample data. Blueprint is shown unconnected and checks unrun.

The user approved the conversation shell and Build/Test workbench on 2026-10-11, then authorized the personal Windows installer scope. The implementation replaces illustrative content with real persistent state and available KiCad actions. Android and live PCB editing were explicitly deferred.

## Architecture and next stages

Version 0.2.0 moved `AppService`, persistent state, local-model streaming and scoped KiCad jobs into a separate coordinator utility process. Main retains native windows/dialogs, tray, editor launch, export selection and worker lifecycle. Private typed IPC provides readiness, state snapshots, request errors and reconnect without replay. Optional tray mode continues work after hiding the window; Quit aborts and flushes. Version 0.3.0 adds SQLite WAL/FTS5, preserved legacy import, task/event records, idempotent job admission, message search and database backup export. See [the implemented architecture](docs/ARCHITECTURE.md). Production has no network application API; the authenticated mobile API and independently deployed execution worker below remain future work.

1. Electron main owns native selection, window/tray behavior and coordinator lifecycle. The preload gives React named operations and no unrestricted Node access. The coordinator owns durable storage and currently executes scoped KiCad jobs; a separately deployed execution worker is a later boundary.
2. React owns the four modes, persistent conversation UI, project/task views, and inspectable results. It keeps the current conversation stable while background work progresses.
3. An application coordinator owns sessions, task status, accepted requirements, cancellation, and evidence. Model, Hermes, OpenCode, and Blueprint connections use adapters rather than duplicating the task ledger.
   Keep that coordinator and its worker independent of Electron so a mobile client can use the same state and a hosted worker can be introduced later. Desktop preload remains a narrow local-native bridge; mobile connects through an authenticated application API.
4. Begin with a working vertical slice: select a local model, send a conversation, retain it after restart, select a project, and show a task brief. Add builder execution and real test evidence as connected functions, with unavailable capabilities represented honestly.
5. Package and verify on Windows. Pin an Electron release and confirm its supported Windows versions before committing to a minimum OS. Windows installer execution, native permissions, process cleanup, and update behavior require Windows validation; a cloud browser check cannot establish those results.

Blueprint's source remains at `E:\blueprint-backend` on the user's computer. Its APIs, storage, and execution facilities have not been inspected, so integration details remain undecided.

## What the reference establishes

Hermes Desktop already supports Windows and uses Electron + React + TypeScript/Vite with a Python backend. Its official desktop source is in the main Hermes Agent repository. The published packaged Windows builds currently target Windows 11 22H2 and newer, with x64 and ARM64 MSIX packaging. That requirement belongs to Hermes's packaged application; it is not automatically this app's minimum OS.

Sources:
- https://github.com/NousResearch/hermes-agent/tree/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/apps/desktop
- https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/apps/desktop/DESIGN.md
- https://github.com/NousResearch/hermes-agent/blob/97a9ae8ee55d31bebce49f1fb6b5ef775323976a/apps/desktop/BUILDING.md

The source is MIT licensed. These concepts use original working branding and a similar interaction grammar; they do not establish affiliation with Hermes or reuse its logo.
