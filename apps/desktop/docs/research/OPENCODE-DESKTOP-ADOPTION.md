# OpenCode Desktop 2.1.0: adoption into JaxOS

Reviewed 20 October 2026. The supplied Windows unpacking report is useful evidence, but its installer, extracted files and full report at `C:\Users\HP\...` are unavailable in this cloud workspace. This review independently inspected selected official upstream source. It did not run OpenCode or verify that the user's executable matches upstream.

The upstream `v2.1.0` tag resolved to `60c68d145a14127ce633e26aa5fdfb882a7baa6d`. This supersedes the earlier 2.0.26 development snapshot for the specific desktop findings below. Preserve that older research as historical evidence; do not mix its generated client/API examples with a 2.1.0 integration.

## Settled JaxOS choices

Continue **Electron + React + TypeScript/Node**. The 0.3.0 application already has a separate coordinator, typed private IPC, SQLite WAL/FTS5, model lifecycle/profiles, reasoning, task/event records, admission receipts and tray lifecycle. No new scaffold or language migration is needed to adopt the useful patterns.

OpenCode's inspected desktop manifest declares Electron, Effect and SolidJS dependencies. Its CLI development resolution invokes Bun on `src/index.ts`. A bundled `.exe` does not establish a Go/Rust implementation. Neither its framework choice nor its MessagePort transport requires changing JaxOS's React renderer or its existing application contract.

## Independently corroborated source

| Finding | Evidence inspected | Interpretation |
| --- | --- | --- |
| Desktop/bootstrap and core-service separation | Desktop entry imports lifecycle, snapshot, renderer protocol and sidecar discovery; the later desktop layer provides BackgroundService/DesktopCli separately. | Keep native hosting distinct from task/model execution. |
| Three named native transport channels | `shared/ipc-transport.ts` defines `desktop-window-snapshot`, `desktop-rpc-port`, `opencode:drag-cancel`; preload invokes/forwards them and exposes bootstrap/snapshot helpers. | A small native bootstrap can carry a much larger logical RPC surface; channel counts are not feature counts. |
| Effect RPC over transferred ports | `main/ipc.ts` creates `MessageChannelMain`, binds one end to a window-scoped handoff, transfers the other on load and mounts `RpcServer` over `DesktopRpcs`. | Ownership, decoding and lifecycle matter more than the choice between ports and invoke handlers. |
| Version-aware core discovery/start/reconnect | BackgroundService resolves a CLI, invokes `Service.ensure` with `serve --service`, probes compatible versions and returns URL/password from a Basic-auth endpoint. | Adopt explicit engine identity, compatibility checks, readiness and reconnect. The inspected development-isolation branch can bind `0.0.0.0`; do not copy that branch into a default desktop listener. |
| CLI/service version staging | DesktopCli resolves/stages a packaged executable by version and architecture, with a neighboring version file and development Bun command. | Keep engine version and architecture visible in job evidence; never replace a busy engine merely because its GUI reopened. |
| Worktree API | Protocol source defines `/api/worktree` endpoints and typed create/remove inputs. | This establishes an integration surface, not a runtime worktree/persistence acceptance result. |
| Core serving flag | CLI command specification declares the v2 API/web server and `--service`. | A transport-compatible CLI adapter must pin and test the selected release. |

The report's full RPC catalog, `drafts.sqlite` details, capability-token implementation, ConPTY handoff behavior, Shiki review implementation, forms, extensions and MCP execution were not exhaustively traced in this corroboration. Treat their reported schemas as leads until the selected feature is implemented and its actual behavior tested. In particular, a PTY handoff method name does not alone prove persistence across daemon restart.

## Patterns to adopt

| Pattern | JaxOS action | Stage |
| --- | --- | --- |
| Supervised core execution | Extend the existing coordinator with explicit execution-worker identity, readiness, cancellation and interruption recovery. Keep task truth in its current ledger. | Builder/tester foundation. |
| Git worktree per candidate | Record the accepted base, create an owned task worktree and preserve the user's checkout. Fix a candidate fingerprint before verification. | Next software slice. |
| Native file capabilities | Keep native picking in Electron; resolve authorized project/artifact IDs in the coordinator. New tools must not accept unrestricted renderer-supplied host paths. | With scoped file tools. |
| Structured input | Reuse typed task fields for objectives/acceptance; add targeted forms when a running task needs a concrete answer. | As task ambiguity requires it. |
| Diff/review | Preserve a reviewable patch and show the tested candidate, changed files and actual results. Select an editor/highlighter when its UX is needed. | Software slice; richer hunk editing later. |
| PTY ownership outside React | Put interactive sessions under a managed worker, with attach/resize/input/exit semantics and Windows ConPTY validation. Keep deterministic test execution separate. | Follow-on terminal slice; not a prerequisite for noninteractive checks. |
| Versioned OpenCode adapter | Translate one pinned engine API into coordinator task operations and reconcile engine sessions/results. | Optional engine integration after a compatibility spike. |
| MCP catalog | Normalize discovery/tool calls into the same schemas, policy and evidence records as built-in tools. | After the bounded tool loop works. |

The current narrow preload and private coordinator IPC remain. Introduce a MessagePort stream if measured terminal/log throughput or new window requirements justify it. Effect, Zod and TypeBox are library choices, not replacements for runtime validation and operation ownership. A custom `app://` scheme can be evaluated separately; keep the current production CSP/sandbox/origin controls working during any change.

Keep engine credentials on the trusted coordinator/native side for the proposed adapter. React submits task IDs and receives application results; it does not need the engine's reusable password. A future Android client connects through the authenticated application API, with project authorization and device revocation. Loopback HTTP plus Basic auth is distinct from phone pairing, transport encryption or an OS execution sandbox.

## Provider errors in the supplied transcript

The Gemini 503 explicitly reports unavailable model capacity. The 500 reports a generic internal server error. These occurred in the supplied analysis transcript; they do not diagnose the JaxOS 0.3.0 application, whose current model adapter is Ollama.

The future harness should classify provider failures, preserve partial output and apply bounded retries/backoff only where a request can be safely retried. A failed inference request and an uncertain tool write have different recovery rules. Keep existing command IDs for admitted work, reconcile before resubmission and record retry/budget outcomes. Additional providers or automatic model fallback are not implemented by this research.

## Next concrete slice

The [builder/tester implementation plan](../BUILDER-TESTER-PLAN.md) defines the next increment: a registered software repository, task-owned worktree, bounded typed tools, deterministic checks against a fixed candidate, and inspectable patch/evidence. It extends 0.3.0 rather than replacing its shell, store or coordinator.

No runtime application code or release artifact changed in this research update. Native Windows acceptance of the current installer remains pending.

## Sources

All following source links use the resolved commit:

- [Desktop package manifest](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/package.json).
- [Main entry](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/main/index.ts), [desktop layers](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/main/desktop.ts), [preload](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/preload/index.ts).
- [Transport constants/bootstrap shapes](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/shared/ipc-transport.ts), [RPC server and port handoff](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/main/ipc.ts).
- [Background service](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/main/service/background-service.ts), [CLI staging](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/main/service/desktop-cli.ts), [early sidecar probe](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/desktop/src/main/service/sidecar-probe.ts).
- [Worktree contract](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/protocol/src/groups/worktree.ts), [CLI command definitions](https://github.com/anomalyco/opencode/blob/60c68d145a14127ce633e26aa5fdfb882a7baa6d/packages/cli/src/commands/commands.ts).

Fetch URLs, digests and unsuccessful path probes are retained in [OPENCODE-DESKTOP-SOURCES.json](OPENCODE-DESKTOP-SOURCES.json). Source inspection establishes the selected structures, not binary equivalence or runtime acceptance.
