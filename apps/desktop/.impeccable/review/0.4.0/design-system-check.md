# 0.4.0 design-system check

Disposition: preserve the incumbent design canon. The local-runtime and bounded-workflow additions fit the approved Hermes-inspired conversation/workbench grammar. No new visual world or system-wide token change is established by this extension. The finish review's `ship` disposition remains limited to its stated screenshot and source scope.

## Authority and method

Applied the Impeccable document workflow in scan mode to compare the finished extension with existing assets, without regenerating them. The authorized output is this handoff only. `DESIGN.md` and `.impeccable/design.json` remain the design authority; `PRODUCT.md` supplies current capabilities, and `.impeccable/llama-workflow-brief.md` supplies the task-local quality bar. The existing world and compositions were already approved, so no new qualitative workshop, canon replacement, or sidecar regeneration was warranted.

Read `src/tokens.css`, the relevant global and extension styles in `src/styles.css`, `src/components/Settings.tsx`, `src/components/Chat.tsx`, and shell integration in `src/App.tsx`. Read both canonical design files, the product/brief, and `finish-review.md`. Independently opened these supplied captures:

- `actual-llama-loaded-1440.png`
- `actual-llama-profile-740.png`
- `actual-stage-tool-failure-1440.png`

The other five captures are covered through the fresh finish review's explicit eight-image inventory; this document does not claim a second independent inspection of all eight. No browser, runtime interaction, tests, detector, computed-style sampling, or image diff was run for this documentation pass. The directory is not a Git checkout, so historical attribution is bounded by the incumbent documents and review evidence rather than a commit diff.

## Finished additions against the incumbent system

| Area | Evidence and relationship to canon |
| --- | --- |
| Palette | `src/tokens.css` matches the documented shared blue, ink, muted, paper, chrome/sidebar, panel, hover, and hairline colors. Runtime fields, stage controls, helper copy and receipts reuse these values through existing styles. The additions establish no new brand accent or surface palette. White and the primary hover blue are existing literal CSS values also captured in the canon. |
| Typography | Global Segoe/system and Cascadia/Consolas stacks remain. The Settings density continues its local 11px helper/action copy and 12px fields/disclosures; conversation final text remains 14px with 1.8 leading. Reasoning uses muted 12px text with 1.75 leading, and receipts use 12px with 1.7 leading. These are local evidence/control variants compatible with the canon's explicitly non-universal role defaults. Native Windows font rendering was not observed. |
| Form language | Provider, managed/attached choice, context, output, thinking and keep-loaded controls extend the same labeled native inputs/selects. Field edges use the stronger hairline and existing 6px control radius. Primary, secondary and quiet actions reuse existing button classes and disabled treatment. The loaded/profile captures show the same white fields and restrained functional-blue actions. |
| Settings composition | Setup remains inside the existing 540px modal with scrollable body, fixed heading, pale veil, 11px radius and existing shadow. File choices are open stacked groups; processor/version and generation options use native disclosures. The 740px profile capture retains paired fields, readable helper text and the save action without a new card system. |
| Shell and navigation | `App.tsx` retains the existing four modes, central content and context/assistant regions. The stage selector is beside the composer within `Chat.tsx`; it does not create a replacement navigation hierarchy. Shared Chat continues to serve the central conversation and compact workbench assistant. Compact rendering was source-reviewed here, not separately exercised. |
| Stage selector | The select uses the existing paper surface, ink, stronger edge, 6px radius, 12px label and visible blue focus. Its short supporting text uses muted 11px type. Analysis/Plan/Design/Test/Launch are task controls, not new global navigation primitives or a visual identity. |
| Evidence and reasoning | The receipt is an expandable text section between hairlines, with summary, run ID and existing blue text action. Its outcome comes from the structured result, including stale status. The desktop failure capture shows `KiCad DRC · failed` above the final answer. Reasoning is a quieter separate disclosure. Neither receives decorative elevation or a competing card background. |
| Runtime truth | Settings distinguishes model-file size, unknown VRAM, advertised/effective context and requested GPU placement; managed/attached copy states process ownership. Saved configuration is distinguished from loading. These are product-truth requirements expressed through the existing label/help/status hierarchy, not new palette or typography rules. |
| Responsive behavior | Existing width thresholds and drawer behavior remain. Paths, runtime output, reasoning and receipt paragraphs wrap through `overflow-wrap: anywhere`. A local maximum-height 650px rule reduces composer padding/height and stage-help spacing to preserve useful space. This is a bounded desktop adaptation, not an approved mobile composition. |
| Focus and motion | Existing global focus, field halo, disabled, scrollbar/selection and reduced-motion CSS remains available; the new selects add explicit blue focus outlines. No new decorative animation or shadow vocabulary appears. Source supports these treatments; actual focus order, announcements, native picker operation and motion were not tested in this pass. |

## Existing exceptions and documentation coverage

No material incumbent palette, font-family, depth or shell drift was found in the bounded comparison. The pre-existing documentation already describes extracted defaults and local exceptions rather than a universal spacing/type scale. In particular, the 10px technical path text and dense 11px Settings copy need not be forced to the frontmatter's default code/body sizes. Literal local status colors, the 7px send-button radius and other local control measurements likewise do not justify rewriting shared primitives. The existing sidecar records representative specimens, not every screen variant.

The canon and sidecar are dated 2026-10-11 and remain a prior system snapshot. They do not enumerate today's llama.cpp ownership/lifecycle controls, stage selector, tool receipt, reasoning disclosure or the short-window height adjustment. That is coverage lag at the feature level, recorded here without promoting task-local behavior into a new global standard. Historical source provenance is insufficient to date every incidental local value; no unsupported claim that such values were introduced by this increment is made.

The existing five width breakpoints still agree with the stylesheet. The additional height condition is not represented in the sidecar's breakpoint inventory. It is documented here as an extension-local implementation fact. Neither that omission nor the lack of new component specimens requires canon regeneration for the authorized ordinary extension.

No canonical token correction or visual repair was performed. No new color names, spacing scale, font roles, component specimen set, north star, or design prohibition was invented.

## Handoff and limits

Keep `DESIGN.md`, `.impeccable/design.json` and `PRODUCT.md` unchanged by this pass. Preserve the pale flat shell, inherited Settings form/disclosure hierarchy, explicit runtime facts, separate reasoning/final answer, and actual-result-derived receipt with its Test-workbench action. Future ordinary additions should continue using these existing primitives; a future authorized system-document refresh can incorporate reusable patterns once their broader role is established.

The finish reviewer found no material fixes within scope. Its eight screenshots include intentional scrolling: the 740px failed-tool capture does not independently show the failure header, while the desktop capture does. Attached-server rendering, expanded processor settings, long-string extremes, loading/unloading/interruption execution, keyboard/screen-reader behavior, native Windows and GPU behavior remain outside independent visual verification. Reported automated test results belong to the builder's validation record and were not rerun or certified by this document.

Only `.impeccable/review/0.4.0/design-system-check.md` was written for this handoff. No application source, product document, design canon, sidecar or screenshot was modified.
