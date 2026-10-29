# SQLite workspace storage — 0.3.0

The coordinator now uses `WorkspaceRepository` and a SQLite implementation. Electron's bundled `node:sqlite` supplies the driver, avoiding a separate native addon or database process. The real Linux Electron utility process and archived app have been exercised; the corresponding Windows acceptance remains required.

## Canonical data and migration

`workspace.sqlite` lives in the existing workspace directory, normally `%APPDATA%\JaxOS\workspace`. Local SQLite uses WAL, foreign keys, FULL synchronous commits, an application ID and schema version 1. Conversations/messages, projects, runs, Daily items and model operations have canonical tables; remaining workspace settings/selection live in metadata. Large KiCad artifacts remain files. The existing 32 MB workspace-state and record-count limits remain in place; this increment does not introduce unbounded/paged history.

On first use, valid `workspace.json` is imported. If it is unreadable, a valid `workspace.json.bak` can supply the import, with a visible notice. Both legacy files are read without repair, rename or overwrite. If neither exists, the database starts empty. If files exist but neither is valid, startup stops and preserves them.

Schema creation, imported records, task snapshots, source digest/count metadata and the migration marker commit together. Record counts and references are checked. A rolled-back import can be retried without duplicates. An initialized database is authoritative; later legacy-file changes do not replace it. Corrupt, foreign or newer databases fail visibly instead of reverting to stale JSON. The JSON snapshot schema remains 1 independently of the database schema version.

The fault-injection suite verifies rollback during import and admission. Separate tests kill an actual coordinator during streamed work and recover committed state. An actual SIGKILL in the middle of migration has not been deterministically exercised; transaction rollback and restart are the demonstrated migration checks.

## Task ledger and events

The repository derives durable task records from assistant responses, KiCad runs and model operations. The ledger records stable IDs, source references, status and timestamps. It retains task records even after older model operations leave the recent-operation window. Imported historical work gets a current snapshot, without invented past execution events.

Task creation/transitions, state updates and command-admission receipts are transactional. Persisted transitions are published after commit. Live text/progress remains periodically saved; a hard crash can lose its latest unsaved fragment. On startup incomplete work becomes interrupted, with its transition recorded. No job is automatically resumed.

`listTasks` returns a bounded snapshot. `listEvents({after,limit})` returns ordered events with durable exclusive sequence cursors. This is a private typed application API; there is no Android/network event transport yet. No event-retention/archival UI is implemented, so the event ledger can grow independently of the workspace-state limit.

## Idempotent job admission

Chat, KiCad and model-operation submissions accept an optional `commandId`. Their input digest, admission result and initial state commit before execution starts. Concurrent or restarted retries with the same ID/input return the existing admission; a different input/kind with the same ID is rejected. The preload retains an admission ID after an uncertain reply while that renderer is alive. Successful replies clear its retry entry; callers can supply their own stable ID for longer-lived reconciliation.

This covers these three job-submission families. Daily CRUD, settings and other mutations do not yet have durable idempotency keys. A returned admission is not a terminal success; inspect task/run state after reconnect. IDs prevent duplicate admission, not a guarantee that an external side effect completed exactly once. Interrupted execution remains explicit, and a new deliberate task requires a new command ID. Failed admission rolls back both persistent and in-memory job creation.

## Message search

FTS5 indexes saved user/final-answer message content, not reasoning or project files. Queries are bounded literal terms with prefix matching, not arbitrary FTS syntax. The sidebar returns at most 30 excerpts and opens/reveals the selected message. New text becomes searchable after its storage commit.

FTS support is probed in the running coordinator. A basic literal-text search fallback exists for a runtime without FTS5, with a distinct UI status; the validated bundled runtime used FTS5. Canonical history loads before index checks. An inconsistent derived index can be rebuilt from messages; Settings also exposes explicit rebuilding. The tests verify index loss/rebuild and edit/delete synchronization. Basic-search behavior without FTS5 has not been tested on a separate runtime build.

## Backup and restore

Settings → Your workspace → **Export database backup** uses SQLite's online backup API and verifies the resulting database. It is safe to use while the application is open; it captures a consistent committed snapshot. Save it outside the active workspace folder. A temporary file is checked before replacing the chosen destination.

The database includes history, settings, task/event records, admission receipts and artifact references. **It does not contain run artifact bytes or external KiCad source projects.** Back up the workspace `runs` folder and the original project folders separately. A database-only backup cannot reconstruct missing artifact files.

For a complete offline copy, quit JaxOS fully (including tray mode), confirm its coordinator stopped, and copy the entire workspace directory plus project folders. Do not copy only a live `workspace.sqlite`: committed pages may still be in its WAL sidecar.

To restore an exported database manually: quit fully; preserve the current workspace directory; put the exported file in a new workspace directory as `workspace.sqlite`; copy the corresponding `runs` tree, preserving its original paths where stored references require them; then launch. Keep the old directory until history, profiles and artifact access have been checked. Restoration to a different data-root path does not automatically relocate stored artifact paths. There is no in-app restore or relocation wizard yet. Older JaxOS 0.1/0.2 builds cannot read this database and may show their older preserved JSON state, so retain database backups when changing versions.

See [architecture](ARCHITECTURE.md), [validation](VALIDATION.md) and [Windows acceptance](WINDOWS-RELEASE.md).
