# Harness² source assessment and JaxOS adoption

Source inspected: [google-research/harness2](https://github.com/google-research/harness2), commit `1cfe254e8d25b15f37048c3730134686abe60335`, package 0.1.0. The repository is Apache 2.0; third-party assets have their own terms. The linked [paper](https://arxiv.org/abs/2610.14224) and [Google Research areas](https://research.google/research-areas/) returned network proxy 403, so their full contents were not independently reviewed. The repository README identifies the paper as *Harness²: Recursive Agent Harnessing for an Open World*. This is a source assessment, not a claim to have reviewed every file or the paper.

## Core idea

A harness is the instructions, tools, memory, execution and orchestration surrounding a model. Harness² keeps weights fixed and improves this surrounding system at two levels:

1. **Task-level:** execute a base harness; propose both general and domain-specific changes; probe candidates on the same task; compose a refined harness using behavioral contrasts. The improver does not receive ground-truth grader feedback.
2. **Across tasks:** select an existing final output and reflect on the chosen harness and its observed behavior. Save the full adopted harness and evidence-supported lesson in a per-domain library for later tasks in that domain.

The eight editable surfaces are system prompt, guardrails, memory, tool guidance, subagents, skills, scripts and plugins. This confirms the previously unverified attribution in the Peiranava comparison. It does not establish that all eight should be automatically mutable in JaxOS.

## How this release works

`harness2/core/tree.py` models and validates editable files as a surface, rejects path escapes and disallowed paths, and applies executor-specific rules. `recursion.py` creates invariant and domain proposals, checks trees, retries invalid proposals once, falls back to the current harness on failure, executes probes, and composes candidates. A ledger records stages and rollouts. It documents **4k rollouts and 3k improvement stages** per task for budget k, including shared base executions; selection/reflection and judging add work beyond that accounting. This is costly even at k=1.

Parallel mode probes k candidates in each of two categories and produces k independent compositions. Sequential mode runs k rounds, carrying the harness and accumulated evidence forward. Domains can run concurrently; tasks within each domain remain ordered. `library.py` stores full selected trees and cue/lesson/evidence, scoped by run/domain; only earlier entries are exposed. Selection compares anonymized final outputs; benchmark judging happens separately. Files, execution transcripts and model-generated explanations are evidence, but they are not independent proof of correctness.

Adapters in `substrate/` support OpenCode and Codex; `benchmarks/` contains JobBench, LAB and WorkBuddy adapters. Benchmarks, executor/improver/judge identity, task subset, mode, budget and seed must match across run and reporting; seed controls stream order, not stochastic model sampling. Judge failures remain unscored. JobBench's downloaded dataset revision must be recorded. The source warns that unrestricted web access can leak benchmark rubrics; its Codex executor disables its sandbox. Restrictions must be applied outside that executor. WorkBuddy has additional license terms; check them before use.

The README reports gains of up to 11.5 points on WorkBuddy, 4.5 points on JobBench and 11.8 percentage points on LAB partial pass rate across selected model/harness configurations. These are upstream claims, not independently reproduced here, and are not evidence for JaxOS, local GGUF models, electronics tasks or Windows. The unavailable paper may contain important baseline, uncertainty and methodology details.

## Local verification

Ran `python3 -m harness2.cli.demo --output /tmp/jaxos-harness2-demo --k 1` under Python 3.12.14: **two scripted ledger tasks completed, zero failed**. The demo uses a deterministic proposer and real Python subprocesses, not an LLM, external benchmark or model-based evaluation. No cloud credentials, benchmarks or production JaxOS data were used. Results: `/tmp/jaxos-harness2-demo/demo.json`.

## What JaxOS has and lacks

JaxOS Desktop 0.4 has Electron/React, a separate TypeScript coordinator, SQLite history/tasks, Ollama and managed/attached llama.cpp, model profiles, bounded typed KiCad tools and actual check receipts. It does **not** yet implement Harness² recursion, candidate harness trees, replayable isolated software workers, cross-task experiment libraries, OpenCode/Codex integration, Scientist research, or optimizer evaluation. Original JaxOS's research prototype is a separate application. An optimizer cannot make a missing editing, simulation or hardware-testing capability appear merely by changing prompts.

## Recommended integration

- Keep JaxOS as the user-facing authority and coordinator; introduce a separate optional experiment worker with a versioned job/result contract. Avoid embedding upstream CLI assumptions or making Windows depend on Python installation in the first slice.
- Represent baseline and candidate manifests with immutable IDs and content hashes. Include model/runtime versions, prompt and tool schemas, task input snapshot, resource limits, artifacts, timestamps, observed failures and token/time costs. Reproducibility is limited by nondeterministic models even with a fixed ordering seed.
- First create a small local evaluation suite: chat/context retention, correct rejection of invalid tools, KiCad fault detection/clean checks, cancellation and stale input cases. Hold out tasks and use deterministic checks where possible. Compare baseline and candidate under equal budgets and repeat model runs; distinguish unscored/error from failure and preserve uncertainty. Research claims require source-backed evidence; physical testing requires real measurements.
- Begin with k=1, serialized, opt-in, offline experiments against synthetic or user-authorized copies. Contrast base, general and task-specific prompts, then compose; show all candidate diffs and costs. Use disposable isolated workers for executable candidates. A Git worktree is not an OS sandbox.
- Treat task content, fetched papers, transcripts and model-produced proposals as untrusted data. Keep credentials, execution permissions, network policy, external side effects, verification rules and acceptance criteria outside optimizer control. Upstream exposes guardrails and executable scripts/plugins as editable surfaces; for JaxOS they must remain protected or require separately reviewed changes. Do not run upstream's unsandboxed Codex mode against the user's workspace.
- Admit a candidate only if independent checks pass and performance on held-out tasks justifies its cost. Promotion is explicit and reversible, with immutable baseline, versioned diff and rollback. A model-selected output or its self-reported confidence cannot override a failed DRC or missing evidence.
- Only after this local contract works, run a compatibility spike for pinned OpenCode and the chosen llama.cpp/Ollama model: structured tool calls, stream/cancellation, session recovery, project scope and output evidence. A compatible endpoint alone does not prove full agent compatibility.
- Add a research module with source versions, citations, quotes, uncertainty and network/cache controls. Google Research's area index could inform later discovery once accessible; it is not an inventory of integrations or an implementation specification.

## Open questions

The linked paper's methods, full results, ablations, exact model configurations and limitations remain unread. The research-area page contents remain unverified. Neither an upstream model-backed run nor native Windows/GPU validation was performed. To complete those parts, obtain accessible copies or allow network access to the two sites, then inspect the paper and page directly and update this assessment.
