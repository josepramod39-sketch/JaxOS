# Bounded release code review

Reviewed on 2026-10-11 for the personal Windows Electron MVP. No unresolved finding remains from this review after checking the three fixes below.

The initial review covered `shared/types.ts`, Electron main/preload/service/store/Ollama/KiCad code, and the Windows packaging script and installer. It focused on material correctness, security boundaries, data loss, and misleading success results. No application source was changed by the reviewer.

| Confirmed finding | Verified correction |
| --- | --- |
| Selecting a second named KiCad project in the same directory returned the first project. | `electron/service.ts` now matches named projects by their canonical project-file path and uses directory identity only for fileless projects. The regression checks separate Alpha/Beta identities, correct reimport, preserved goals, and fileless reimport. |
| UUID-prefixed export filenames broke the unchanged Gerber job's relative layer references. | `electron/main.ts` now preserves verified artifacts at `output/<original relative path>` inside a fresh export directory. Gerber jobs and their layers remain together, the original output manifest is preserved, and the separate root summary uses portable artifact paths. Exclusive copies and output-containment checks remain in place. |
| Failed refresh after source deletion left earlier passed evidence marked current. | `electron/service.ts` now observes the remaining source fingerprint, or marks evidence stale when it cannot be read, and persists that observation before returning the inspection error. Regressions cover deleting the last board and deleting the entire source directory, including restart persistence. |

Verification: the reviewer initially reproduced the import and stale-state failures directly and reproduced the export failure using real KiCad 9.0.2 fabrication output. After the fixes, an independent `npm test -- tests/service.test.ts` run passed all 11 tests. The saved `unit-tests.json` receipt records 39/39 passing tests. The reviewed Electron E2E assertions check exported artifact byte identity, portable paths, every Gerber job reference, and manifest output sizes and SHA-256 hashes; the release owner's separate E2E run reports 4/4 passed and was not rerun during this follow-up review.

Limits: this was a bounded source review and targeted regression verification, not a complete security audit. Native Windows installation, upgrade, uninstall, and application execution were not exercised by this reviewer. The unsigned installer still requires the documented Windows acceptance checks. KiCad rule checks and exports validate saved snapshots; they do not establish simulation results, physical circuit behavior, or manufacturer acceptance. Visual review was handled separately.
