# Design system check — 0.3.0

Date: 2026-10-20. Ordinary extension of the incumbent Windows desktop workspace. The fresh finish review records **ship**, with no material fixes.

**Decision: `DESIGN.md` and `.impeccable/design.json` remain valid.** Inline saved-message search, message reveal and the storage controls continue the documented palette, type hierarchy, flat pane structure and existing control language. They do not establish a new visual world or require regeneration of the incumbent system files. Preserve both files.

## Authority and evidence checked

Read `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/history-storage-brief.md`, `.impeccable/surface-brief.md`, the document workflow reference and this directory's `finish-review.md`. The surface brief records the approved conversation shell and workbench composition; the history/storage brief authorizes these bounded additions to the existing sidebar and Settings. Product architecture does not establish new visual rules.

Opened all seven supplied 0.3.0 captures individually:

| Capture | Dimensions | Observed evidence |
| --- | --- | --- |
| `actual-history-search-1440.png` | 1440×960 | Search below Conversations, a written count, two compact title/speaker/date/excerpt results, and the revealed saved message in the familiar conversation shell. |
| `actual-history-empty-1440.png` | 1440×960 | Explicit no-match copy and the existing blue field-focus treatment; the workspace remains visible. |
| `actual-history-search-740.png` | 740×560 | Existing navigation drawer contains the query, count and a readable result; its visible scroll thumb indicates remaining result content. Settings and the local-save note retain their lower positions. |
| `exploratory-history-search-390.png` | 390×844 | Two readable search results in the existing drawer at an exploratory responsive width. This is not an approved or shipped Android surface. |
| `actual-storage-settings-1440.png` | 1440×960 | Existing Settings dialog is scrolled to SQLite/search/import status, explicit backup and index actions, backup-boundary copy, tray preference and data-folder action. |
| `actual-storage-settings-740.png` | 740×560 | The same workspace section fits beneath the persistent Settings heading; both storage actions, written rebuild confirmation, tray preference and data-folder action are visible in its scrollable body. |
| `actual-history-error-1440.png` | 1440×960 | Plain data-folder conflict text and a search retry action coexist with the workspace service interruption banner and reconnect action. |

For direct incumbent comparison, opened 0.2.0 `actual-settings-1440.png`, `actual-model-profile-740.png` and `actual-recovered-workspace.png`, and read the 0.2.0 design-system check. These establish the earlier modal size/material, minimum-window scrolling, and pale shell/navigation treatment. The approved mockups were referenced through the direction records and earlier check; they were not reopened in this pass.

Bounded source inspected: `src/components/HistorySearch.tsx`, `src/components/Settings.tsx`, `src/components/Chat.tsx`, relevant `src/App.tsx` integration, `src/styles.css` and `src/tokens.css`.

## Comparison with the incumbent system

| System dimension | Finding and evidence |
| --- | --- |
| Color | All eleven color custom properties in `tokens.css` agree with their corresponding normative DESIGN frontmatter entries. White and blue-hover remain the documented component literals. Search uses the existing surface, muted, ink, line, hover and functional-blue variables. Excerpt text uses `#44516a`, already used by incumbent conversation links. No new brand accent or tonal ground is introduced. |
| Typography | The Segoe/system and technical monospace stacks remain intact. Search titles use the established compact 12px level; speaker/date metadata is 10px; excerpts, status and storage copy are 11px. Settings headings retain the incumbent 14px hierarchy. These are local dense-sidebar/form variants, not new global roles. |
| Layout and material | Desktop captures retain icy sidebar/chrome, a white dominant conversation and a pale context pane. Search occupies the existing history region rather than adding another panel. Settings reuses the 540px white modal, 11px corners, cool blurred veil, soft overlay shadow, persistent heading and independently scrolling body seen in 0.2.0. Storage content uses open rows and whitespace. |
| Search field and results | `styles.css:86` onward uses the incumbent white field, 6px control radius and blue focus halo. Results are flat native button rows with 5px corners and the shared hover wash. Titles are bounded to one line, excerpts to three lines, and result content scrolls independently. The smaller clear control is a local fit within the compact field, not a replacement for the global icon-button primitive. |
| Reveal and state | `App.tsx:105` selects the conversation, returns to Brainstorm and closes the drawer; `Chat.tsx:34` locates the identified message and scrolls it into view. `message-found` uses the existing pale focus-blue token and control radius. The desktop capture shows the saved message in view; it does not independently prove the complete interaction sequence. |
| Empty, loading and error | `HistorySearch.tsx` provides a named field/clear action, status text for loading/count/empty, an alert for errors and a native retry button. The captured empty and error states stay quiet and explicit. Loading and stale-async-result suppression are source observations; there is no dedicated loading capture. |
| Storage controls | `Settings.tsx:104` onward extends the existing workspace section with compact SQLite/search/import status. Backup reuses the secondary button, index rebuild the quiet button and completion a written status. Copy clearly separates the database from external run artifacts and KiCad sources. No additional modal, card system or decorative asset is introduced. |
| Minimum window and responsive exploration | The supplied 740×560 captures preserve the incumbent navigation drawer and scrollable Settings model. Results can continue below the short available history viewport. The 390px image checks the existing responsive drawer only; PRODUCT and the briefs continue to defer phone delivery. |
| Focus and motion | The extension inherits blue keyboard outlines, field halos, disabled-button treatment and reduced-motion CSS. Field focus is visible in the empty-state capture. Result buttons and storage actions retain native semantics, and status/error roles are present. Keyboard, focus transfer, screen-reader and motion execution were not run. |

The sidecar parses as schema version 2, with metadata for all thirteen documented colors, ten representative component specimens, and the incumbent shadow/motion/breakpoint extensions. Its representative button, input, navigation and composer vocabulary remains applicable. These surface-specific result/status rows do not require separate catalog specimens or new global token families.

## Pre-existing reference differences

The earlier surface brief's OWN-WORLD line still names concept ink `#17171a`; current source and normative DESIGN frontmatter use `#1b263b`. DESIGN's Colors section already states that shipped ink supersedes the concept, and the 0.2.0 check reported the same difference. It is inherited reference drift, not caused by this increment. It is recorded here without repair.

The original brief retains its earlier three-composition exploration language and illustrative mockup context. The recorded user selection already resolves that exploration. It does not require new composition choices for search or storage controls. No additional visual-system drift was observed in the bounded source and captures.

## Limits and preservation

This was a manual document/source/static-capture comparison. No runtime, browser, detector, phase tool, automated comp-diff, new capture or test rerun was performed. The finish review and brief report 59 passing unit/integration tests and nine Electron scenarios; this check does not independently certify those results. Database correctness, backup integrity, private-reasoning indexing boundaries, native Windows rendering and interaction accessibility require their separate implementation evidence. No whole-application or mobile certification is implied.

No Git history was available in this project directory, so incumbent comparison uses the supplied 0.2.0 artifacts and its prior check rather than a commit diff. Only this check was created. `DESIGN.md`, `.impeccable/design.json`, application source, other documents and existing captures were preserved. No shipping raster was added.
