# Peiranava PDF compared with the JaxOS architecture plan

**Implementation status:** Desktop 0.4.0 implements the first llama.cpp/provider and bounded KiCad stage-tool increment. The research, optimizer, general coding, networking and Android proposals below remain planned. See [current architecture](ARCHITECTURE.md) and [validation](VALIDATION.md).

Reviewed 20 October 2026. User request: compare the uploaded document with the architecture plan and identify changes. The document's implementation instructions are treated as proposals to assess, not commands to execute or authorization to rename/rewrite the application.

Input: **peiranava.pdf**, titled **PEIRANAVA: Master Architecture & Implementation Plan**, six pages. SHA-256: `aa94afcaf1bb365e197e15ad079367ccadb5bb3e53a0beddd2b2bd53eb7f2d27`. All six rendered pages were visually inspected; the PDF has no extractable text layer. Page numbers below refer to PDF pages. Its section 1 architecture diagram appears as an empty box on page 1; no diagram content was inferred.

Comparison baseline: [HYBRID-HARNESS-PLAN.md](HYBRID-HARNESS-PLAN.md), the [implemented desktop architecture](ARCHITECTURE.md), and the original `/workspace/JaxOS` repository at `1b1a352befe2692fd78a3286bf1cbe998d2a1d9c`. The original repository and JaxOS Desktop are separate applications. Research features present in the former are not automatically integrated into the latter.

**Source update:** The upstream Harness² repository is now identified and assessed in [Harness² source assessment](research/HARNESS2-ASSESSMENT.md). Its README confirms the eight surfaces; the paper itself remains inaccessible from this environment. Earlier statements about the missing source are historical.

## Recommendation

Keep the existing Electron/React/TypeScript coordinator and the llama.cpp-first delivery sequence. Adopt Peiranava's Scientist and Optimizer as proposed modules around that foundation. They expand the product's capability, but require explicit evidence contracts and their own validation. A Go/Rust rewrite, automatic policy modification, default parallel swarms and a new visual design are not justified by the supplied evidence.

Retain the five user-facing stages: **Analysis → Plan → Design (including implementation) → Test → Launch**. Scientist supplies research evidence during Analysis and Plan. Engineer produces candidates during Design. Deterministic workers establish Test results. Optimizer proposes measured improvements between tasks. Workbench is the interface for all stages. These four modules are not four separate task databases or necessarily four simultaneous models.

## What matches, what changes

| PDF proposal | Comparison | Recommended treatment |
| --- | --- | --- |
| Electron + React workbench; separate daemon (pp. 1–3, 5) | Matches the existing desktop/service boundary. | Keep the current shell and TypeScript coordinator. Add capabilities through existing contracts. |
| SQLite WAL, FTS5, durable sessions (pp. 1, 3–4) | Already implemented for desktop history and task records. Current FTS indexes messages, not every project note/document. | Extend through migrations for research and optimizer records. Define document/note indexing explicitly and measure search latency. |
| Literature search, knowledge graph, hypothesis synthesis (pp. 1, 4) | Adds a substantial research module absent from the latest desktop roadmap. Original JaxOS contains prototypes. | Add a sourced research workflow after the first runtime/tool slice; begin with documents and claim citations, then graph exploration. |
| Mandatory Reality Gate (pp. 1–2, 4, 6) | Consistent with the intent to require evidence, but the current prototype is not mandatory or independently verified. | Implement an application-level evidence gate; model critique is an input to the gate. Unknown or unavailable evidence stays unverified. |
| Harness² optimizer and eight editable surfaces (pp. 1–2, 4–5) | Much broader than the current plan's versioned reusable skills. | Add an opt-in, budgeted experiment system after deterministic evaluation works. Keep execution policy and acceptance checks protected from candidate modification. |
| Worktrees, diff review, ConPTY, MCP (pp. 2, 4–5) | Largely matches the software-builder direction and later terminal/MCP work. | Retain candidate fingerprints and deterministic checks; validate native Windows lifecycle. Worktrees are not OS sandboxes. |
| llama.cpp | Missing from the PDF's provider table, which names Ollama, LM Studio and Unsloth plus cloud providers (p. 3). | Add managed GGUF and attached llama.cpp as the next explicit runtime, with lifecycle/context/GPU/thinking controls from the current plan. |
| MessagePort as required transport (pp. 1, 3, 5) | The existing typed IPC is already sufficient for the current UI. | Adopt only for measured streaming needs. Preserve method validation, request IDs, ordering, cancellation and durable replay. |
| Graph inspector, command palette, richer diffs (pp. 2–3, 5) | Useful future UI features; not all are needed for a first working harness. | Add task-specific inspector tabs and command search when their underlying operations exist. Start with a readable 2D graph/table, not mandatory 3D. |
| Bento layout, elevated cards, acrylic HUD (pp. 3, 5) | Changes the user-approved calm, flat conversation/workbench design. | Preserve the approved visual system. Treat HUD and an alternative visual design as optional later concepts requiring their own mockups. |
| Windows/macOS/Linux installers and self-updates (pp. 5–6) | Expands the current personal Windows installer goal. | Windows acceptance first; add verified update manifests/signatures, rollback and other desktop platforms as separate releases. |
| Android companion, KiCad and electronics roadmap | Android is absent; KiCad appears only as an MCP example on p. 2. | Preserve Android-first Windows-companion planning and the concrete KiCad/simulation/wiring/PCB/physical-test milestones already requested. |
| Peiranava product identity | A name in the supplied proposal; no explicit rename request. | Keep it as a proposed product name until selected. Do not change app IDs, data paths or installer identity during this comparison. |

## Corrections before adoption

1. **OpenCode core language (pp. 1, 3).** The inspected OpenCode 2.1.0 desktop uses Electron/Effect/SolidJS, and its CLI source path uses TypeScript/Bun. The claim that its daemon is Go/Rust is not supported by that source. A compiled `.exe` does not establish its source language. See the [pinned upstream comparison](research/OPENCODE-DESKTOP-ADOPTION.md).

2. **Unmeasured performance promises (p. 3).** `<50ms` startup, `30MB` daemon RAM, sub-millisecond search and a serialization bottleneck bypass are not demonstrated by the PDF. MessagePort still transports serialized/structured-clone data. Record cold/warm startup, idle/active RSS, IPC throughput/latency and search p50/p95 on representative data before setting targets. Measure inference memory separately from the coordinator.

3. **Runtime versions (p. 3).** `Electron 34+ (Node.js 24)` is not a reliable version pairing specification. Pin the exact Electron release and inspect its bundled Node version. Current desktop validation uses Electron 44.7.0, rather than adopting a loose minimum from the table. Verify the selected PTY library's actual Windows ConPTY support; the suggested library name alone is not evidence of a working Windows terminal implementation.

4. **Reality Checker behavior (pp. 1–2, 4, 6).** Original JaxOS loads a persona and runs critique only if its file exists: [swarm.ts](/workspace/JaxOS/src/tools/swarm.ts:81). It does not fail closed when that persona is absent, and the critique labels are model output. Its specialist loop is sequential, not evidence of parallel sandbox execution. `/research` and `/synthesize` also bypass the ordinary command handler at [App.tsx](/workspace/JaxOS/src/tui/App.tsx:373). The PDF's research acceptance example therefore cannot be presumed to pass through the intended dedicated workflow.

5. **Graph confidence (pp. 1, 4).** Original [graph.ts](/workspace/JaxOS/src/tools/graph.ts:39) computes incident-edge counts. Degree indicates connectivity, not truth, citation quality or independent confirmation. Its conflict rule marks different targets for one source/relation as disputed, which can falsely flag legitimate multi-valued relations. Add per-claim provenance and relation cardinality/qualifiers before relying on conflict detection.

6. **Isolation and persistence (pp. 2–3, 6).** Worktrees share Git metadata and host privileges. A popup-blocked Electron webview does not by itself prove safe execution of generated content. Window reload, hidden-to-tray, coordinator crash, app Quit and machine reboot are distinct lifecycle cases. A persistent terminal can survive renderer loss if its owner lives; survival of daemon death is a separate design and test, not an assumed feature.

7. **Reasoning protocol (pp. 2, 4–5).** `<thought>` is not a universal Hermes/Ollama/llama.cpp interchange format. Normalize the selected provider's tested reasoning fields and chat template. Unsupported thinking controls remain unavailable. Never parse apparent XML tool instructions from ordinary model text into executable actions without the typed tool boundary.

8. **Harness² attribution and evaluation (pp. 1–2, 4–5).** The PDF supplies no repository URL, pinned revision or source citation establishing the eight-surface contract and optimizer implementation. Treat those as a proposed design until its source is supplied or independently identified. Blind model preference can rank candidates, but it cannot replace correctness tests or justify modifying the criteria used to judge the same candidate.

9. **Provider compatibility and local-first behavior (pp. 3–4).** A port number and an OpenAI-compatible endpoint do not establish lifecycle, tools, context allocation, reasoning or local execution. Verify each concrete runtime/version. Literature search makes external network requests even when inference is local; document that distinction and support cached reading. Cloud inference would be a separate explicitly selected provider, never an automatic fallback.

## Proposed architecture additions

Add a **Research service** behind the coordinator's tool registry. Its first workflow is query → fetch metadata/document → retain source → extract cited claims → review support/contradictions → save a research note linked to a task. Connect arXiv and Semantic Scholar as separate adapters with rate limits, retries, caching, deduplication and source-version handling. Distinguish abstracts from full text. Imported documents are evidence, not higher-priority task instructions.

Suggested new records:

| Record | Minimum content |
| --- | --- |
| Research document | Stable ID/DOI/arXiv version, title, authors, source URL, retrieval time, content hash, available text scope and parse status. |
| Claim/evidence link | Claim text, document ID, page/section/quoted span, extraction version, supported/contradicted/unverified status and review rationale. |
| Graph edge | Subject/relation/object, qualifiers, linked claims/sources, extraction version and dispute state; graph layout/degree stored separately. |
| Research assessment | Task/brief version, claims checked, evidence availability, unresolved questions and review outcome. |

The **Reality Gate** should enforce evidence availability and task acceptance rules outside the model prompt. Software uses deterministic check results for the exact candidate. Research requires traceable support and explicit unresolved claims; a source citation does not guarantee the paper's conclusion is scientifically correct. Electronics distinguishes rule checks, simulations and physical measurements. Do not let a persona's `[VERIFIED]` label overwrite these states.

Add an **Experiment service** for the optimizer only after evaluation infrastructure exists. A run snapshots a baseline harness version, task fixture, model/profile, tool versions, limits and scoring rules. It proposes bounded variants, probes each in a disposable execution environment, records task success/correctness alongside latency/token cost, and compares against a held-out regression set. Keep inference serialized by default on the local machine; parallel probes require measured capacity and actual worker isolation.

Represent the eight PDF surfaces as a versioned harness manifest. Persona wording, context selection, tool descriptions and candidate skills can be experiment inputs. Acceptance criteria, execution policy, credential access and evaluator rules remain outside autonomous mutation. Candidate scripts, plugins and sub-agents need the same tool validation, execution limits and review as other executable changes. Promotion produces an explicit version/diff with regression evidence and rollback; it does not overwrite the currently active harness during a task.

This extends the existing memory/skills plan without requiring model-weight retraining. Improvement must be measured across tasks; a model praising its own change is not an optimization result.

## Recommended delivery-order change

This is a recommendation from the comparison, not an implemented scope expansion:

1. Complete the existing **llama.cpp vertical slice** and validate it alongside Ollama, including Windows lifecycle and model controls.
2. Add the **five-stage bounded KiCad workflow** with real tool results and evidence gates.
3. Add a **small Scientist workflow**: literature retrieval, source-backed claim table and saved research note. This brings the most useful new PDF capability into Analysis before a large graph/swarm UI.
4. Complete the **software builder/tester** and pinned OpenCode adapter evaluation. Expose reviewable candidates and deterministic test results; then add ConPTY/MCP where needed.
5. Extend **memory and research graphs**, followed by a **budgeted optimizer experiment** using fixed evaluation/permission boundaries and versioned promotion. Benchmark sequential specialist reviews before adding parallel swarms.
6. Deliver the **Android companion** against the same coordinator API. HUD, 3D graph exploration, additional desktop targets and automatic updates remain independent enhancements.

Extend the PDF's four happy-path acceptance demonstrations with negative and recovery cases: unavailable/contradictory research sources; missing evidence gate; fabricated citations; malformed tool calls; duplicate task submission; changed candidate; failed tests; budget exhaustion; provider outage; cancelled process trees; renderer/coordinator loss; missing credentials; and optimizer regression/rollback. Each outcome must preserve enough evidence to explain what happened.

## Status after this comparison

The PDF was assessed, not executed. This report identifies recommended amendments and corrects source claims. It does not rename the app, select a new core language, activate cloud inference, install a research/optimizer dependency or claim a new release.

At the time of this document-only comparison, the development tree passed TypeScript checking and 59 existing unit/integration tests; llama.cpp was unfinished. The subsequent 0.4.0 increment implements the provider and bounded KiCad stage-tool slice, with 77 unit/integration and 11 real Electron tests passing. See [current validation](VALIDATION.md). Neither result validates the proposed Scientist or Optimizer. Native Windows and GPU validation gaps remain.

Related evidence: [original JaxOS assessment](research/HERMES-OPENCODE-ASSESSMENT.md), [OpenCode pinned-source findings](research/OPENCODE-DESKTOP-ADOPTION.md), [Hermes decisions](ADOPTION-DECISIONS.md), [software candidate/test contract](BUILDER-TESTER-PLAN.md), [electronics roadmap](../ELECTRONICS-PLAN.md), [mobile roadmap](../MOBILE-PLAN.md), and [approved product context](../PRODUCT.md).
