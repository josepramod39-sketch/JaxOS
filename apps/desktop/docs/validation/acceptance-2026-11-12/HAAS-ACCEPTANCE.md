# HaaS acceptance criteria mapped to current code

Scope: the local-experiment-records increment and later priorities from the accepted architecture review/plan. This is a source-based capability assessment alongside the executed baseline tests. A source-review finding is not an automated test pass. The published release is 0.5.1 alpha; the proposed HaaS expansion has not shipped.

| Criterion | Current evidence | Acceptance state |
| --- | --- | --- |
| Freeze the actual runtime/model/input baseline and preserve failures | Release/source/payload digests and per-case reports retained; all three live runs keep nonzero outcomes. | Baseline captured; model-quality gates fail. |
| Validated experiment/dataset/scorer/run contracts | Inline `Case`/`Report` types and fixed fixture dispatch in [runner](../../../evaluation/runner.ts); no independent `ExperimentSpec`, `DatasetManifest` or `ScorerRef` contract. | Not implemented. |
| Durable run/trial progress and restart reconciliation | Application SQLite/task recovery tests pass; evaluation has no separate experiment index/journal and writes JSON at the end. | Not implemented for evaluation. Application recovery does not satisfy this criterion. |
| Retain and verify full selected evaluation artifacts | JSON retains summaries and observations; temporary evaluation projects/reports are deleted in runner cleanup. | Partial; no retained experiment artifact repository/retention lifecycle. |
| Serialize evaluation leases with foreground inference | Managed-model load/cancel/recovery/unload passes; the independent CLI has no shared foreground/evaluation lease authority. | Partial; global coordination not implemented. |
| Run listing, import/export, deletion and replay identity | CLI has `run` and `compare`; no experiment repository list/show/import/export/deletion contract. | Not implemented. |
| Immutable independently versioned scorer/rubric identities | Suite/source hashes exist, but scorers and case dispatch remain in the runner. | Partial. |
| Repeated-trial comparison with declared variable axes and uncertainty | Strict comparator and malformed-report tests pass; no repeated-trial aggregation or declared model/profile axes. | Not implemented. |
| Dedicated evaluation PR quality gate | Packaging/build CI exists; it does not provide the proposed evaluation-specific prerequisite/gate policy. | Not implemented. |
| Calibrated model judge and opt-in redacted trace export | No judge calibration, span export or OTLP pipeline in current evaluation code. | Not implemented. |
| Team/hosted governance and isolated remote worker admission | Local single-user application; no hosted HaaS control plane, tenant/RBAC or remote worker protocol. | Not implemented; later scope. |

Runtime evidence: [main report](RESULTS.md), [summary](summary.json), [native Windows report](native-windows.json). Code reviewed: [evaluation runner](../../../evaluation/runner.ts), [model adapter](../../../evaluation/model.ts), [coordinator probes](../../../evaluation/coordinator.ts), [application SQLite store](../../../electron/sqlite-store.ts), [stage harness](../../../electron/harness.ts).

Next implementation remains durable local experiment records with protected acceptance/scorer rules, artifact retention and interruption handling. Those features must exist before their acceptance tests can run. The current test results do not authorize claiming HaaS, model-quality, regulatory or physical-hardware acceptance.
