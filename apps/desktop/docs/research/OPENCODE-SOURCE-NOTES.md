# OpenCode integration analysis

**20 October 2026 update:** selected desktop structures are now corroborated against upstream **v2.1.0**, pinned at `60c68d145a14127ce633e26aa5fdfb882a7baa6d`. See [desktop adoption](OPENCODE-DESKTOP-ADOPTION.md) and the [next builder/tester plan](../BUILDER-TESTER-PLAN.md). The earlier development-snapshot findings below remain historical; they are not assertions about the user's unpacked executable or a verified 2.1.0 runtime adapter.

Scope: read-only upstream inspection of `anomalyco/opencode`, provisional identity for the user's “opencode.” No installation or runtime execution. Branch references are mutable; these findings are a fetched-source snapshot, not proof of the user's installed version.

## Recommendation

Use OpenCode as the code execution engine behind a coordinator: builder and tester get separate sessions and separate permission profiles. Hand off a written specification, acceptance checks, exact repository revision, and a budget. After building, freeze the artifact/revision and run an independently orchestrated tester. Record actual commands, exit codes, reports, and artifact revision; model statements that tests passed are not test evidence. Use an isolated process/container and resource/network policy for enforcement because a tool permission profile is not a full operating-system sandbox.

OpenCode can implement all four conversational roles, but its strongest directly evidenced fit is repository planning, editing, command execution, and review. Its built-in General agent has write access; it must not be treated as an independent read-only verifier. Plan is a restricted planning agent, Explore is read-only repository exploration, and custom agents can set prompts, models, and tool permissions. Read-only tester permissions alone cannot safely allow arbitrary bash: tests/scripts can modify files and run arbitrary processes. A fresh fixed-artifact test environment should own test execution and evidence.

## Important version discrepancy

The web docs under `dev/packages/web/src/content/docs/` describe the older HTTP interface (`/session`, `/event`, `/doc`), `@opencode-ai/sdk`, and `opencode run --attach`.

However, the fetched dev `package.json` says **2.0.26**, and current implementation uses `@opencode/client`, `/api/session`, `/api/event`, `session.interrupt`, and `opencode run --server`. The old documented SDK source paths return 404. Even the new client README's `sessions.create` sample differs from generated client's `session.create`. Do not combine these examples. Pin the engine release and use that release's generated contract/API. No installed version or published npm version was verified.

Sources:
- https://github.com/anomalyco/opencode/blob/dev/package.json
- https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/server.mdx
- https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/sdk.mdx
- https://github.com/anomalyco/opencode/blob/dev/packages/client/package.json
- https://github.com/anomalyco/opencode/blob/dev/packages/client/README.md
- https://github.com/anomalyco/opencode/blob/dev/packages/client/src/promise/generated/client.ts

## Current dev source integration surface

- `@opencode/client` exports `OpenCode`; `OpenCode.make({ baseUrl, headers?, fetch? })` yields the Promise client. It includes `session.create`, `session.prompt`, `session.get`, `session.diff`, `session.interrupt`, `session.log`, and permissions endpoints. Client options accept request headers; service/auth details must be checked for the pinned version.
- `POST /api/session`: optional id, parentID, title, agent, model, location, metadata, permissions. The location enables associating work with a project directory; separate sessions are not evidence of filesystem isolation.
- `POST /api/session/:sessionID/prompt`: durably admits input and schedules execution unless resume=false. Success means accepted input, not finished code or passing tests.
- `GET /api/session/:sessionID/diff`: structured per-file diffs across turns, with defined snapshot boundaries.
- `POST /api/session/:sessionID/interrupt`: interruption support.
- `GET /api/event`: SSE global native/plugin events. Contract explicitly says it is **volatile**: slow-consumer overflow fails the stream, and disconnected events are missed.
- `GET /api/experimental/session/:sessionID/log?after=...&follow=true`: experimental durable session event log with exclusive aggregate sequence for replay. Treat it as version-specific; coordinator should persist its own job state and reconcile after reconnects.
- `GET /api/session/:sessionID/permission` lists pending requests; `POST /api/session/:sessionID/permission/:requestID/reply` responds with a decision. Routes call themselves experimental. A coordinator must handle waiting permissions explicitly so headless work does not hang.
- CLI currently declares `run --agent --model --session --format json --server` and `serve` as starting the v2 API/web server. This is a possible prototype adapter; HTTP/typed client is the stronger long-running integration.

Sources:
- https://github.com/anomalyco/opencode/blob/dev/packages/client/src/promise/index.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/client/src/promise/client.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/client/src/promise/generated/client.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/protocol/src/groups/session.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/protocol/src/groups/event.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/protocol/src/groups/permission.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/cli/src/commands/commands.ts

## Documented agent/permission concepts

The agent docs distinguish primary agents and subagents. Build is the full-tools primary; Plan is restricted; General is a full-tools subagent; Explore is read-only. The dev docs also list a Scout read-only external research agent, while CLI docs list its enablement as experimental. Custom agents can use primary/subagent/all mode, dedicated model, prompt, step cap, and permissions. Markdown configs are documented under `.opencode/agents/` or global config. The permissions docs describe allow/ask/deny, per-agent overrides, wildcard command rules, and external-directory guards. Their concrete config schemas must also be checked against the selected engine release because the current source has moved to v2.

Sources:
- https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/agents.mdx
- https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/permissions.mdx
- https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/cli.mdx

## Minimal coordinator contract (recommendation, not built-in OpenCode behavior)

`Job { id, role, repoRevision, workspace, specification, acceptanceChecks, allowedTools, budget, engineSessionId, status }`

`Result { changedFiles, patchOrCommit, commands, exitCodes, reports, evidencePaths, blockers, verificationRevision }`

Flow: brainstorm/specify → owner chooses scope → builder session → fixed candidate → tester session plus deterministic test runner → bounded repair loop or deliver result. Daily-driver memory and routing stay in the surrounding product; OpenCode session history alone is not a product-wide memory or job ledger.
