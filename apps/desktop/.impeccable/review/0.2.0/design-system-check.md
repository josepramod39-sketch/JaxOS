# Design system check — 0.2.0

Date: 2026-10-20. Ordinary extension of the incumbent Windows desktop interface. The finish review's disposition remains **ship**, with no material fixes.

**Decision: `DESIGN.md` and `.impeccable/design.json` remain valid.** The completed model controls, reasoning disclosure and recovery state extend the existing pale, flat system without establishing a new palette, type hierarchy, material, component philosophy or visual world. Preserve both system files. This check adds evidence for the extension rather than regenerating the system documentation.

## Authority and evidence checked

Read `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surface-brief.md`, `.impeccable/model-controls-brief.md` and this directory's `finish-review.md`. The user-approved conversation/workbench compositions establish identity and topology; the model-controls brief authorizes this local extension. Product architecture statements do not establish new visual rules.

Opened the approved `.impeccable/mocks/conversation.png` and `workbench.png`, and the incumbent `.impeccable/review/actual-conversation-1440.png` and `actual-settings-1440.png`. The earlier actual Settings capture provides a direct comparison for modal width, white fields, external labels, section rules, action treatments and cool backdrop. The earlier conversation capture provides a direct comparison for the shell and composer.

Opened every supplied 0.2.0 capture individually:

| Capture | Dimensions | Evidence observed |
| --- | --- | --- |
| `actual-settings-1440.png` | 1440×960 | Existing white Settings dialog now contains capability and residency rows, load/unload actions and closed disclosures. Hairlines organize the added content. |
| `actual-model-manager.png` | 1440×960 | Expanded generation profile follows runtime status; compact numeric controls and a full-width Thinking selector continue the labeled form hierarchy. |
| `actual-model-profile.png` | 1440×960 | Scrolled profile retains the heading/close control; temperature, keep-loaded and processor controls lead to a restrained blue save action. Completed operation status uses an open row. |
| `actual-model-profile-740.png` | 740×560 | Minimum Windows viewport preserves readable field labels/values, the dialog heading/close control and a visible vertical scroll region. Lower content continues below the viewport. |
| `actual-model-reasoning.png` | 1440×960 | Muted expanded reasoning is separate from the final answer and quiet token/throughput metadata. The familiar shell and composer remain visible. |
| `actual-service-disconnected.png` | 1440×960 | Warm functional alert with icon, explicit state text and a secondary Reconnect service action sits below the workspace header. |
| `actual-recovered-workspace.png` | 1440×960 | Familiar Daily layout returns without the interruption banner; the two saved priorities remain visible. |

Bounded source inspected: `src/components/Settings.tsx`, `src/components/Chat.tsx`, `src/components/Modal.tsx`, `src/App.tsx`, `src/styles.css` and `src/tokens.css`.

## Comparison with the incumbent system

| System dimension | Finding |
| --- | --- |
| Color | All eleven color custom properties in `tokens.css` agree with the corresponding DESIGN frontmatter values. The documented white and blue-hover values remain component literals. Functional blue identifies actions, selection and focus; the new status/recovery treatments retain the existing functional-status role. No new brand accent is introduced. |
| Type | Segoe/system interface text and the technical monospace stack persist. New summaries use compact 12px text; supporting runtime, operation and usage metadata use the established 11px density. Section headings retain the incumbent hierarchy. |
| Layout and material | Settings reuses the 540px modal, 11px corners, white ground, cool blurred veil and existing temporary-overlay shadow. Longer content uses the existing scrollable body. New sections use spacing and single-pixel rules instead of elevated containers. The shell's flat navigation, dominant workspace and supporting pane remain recognizable. |
| Controls and state | Existing primary, secondary and quiet buttons, 6px fields and external labels carry the extension. Advanced settings use native details/summary; paired controls use a local two-column grid, not a new global layout rule. Load/unload and save remain explicit actions. |
| Reasoning and usage | Native disclosure, muted text, preserved wrapping and ordinary conversation metadata extend the existing message treatment. Final answers retain the established content styling. |
| Progress and tray preference | Source uses a labeled native progress element with functional blue, written operation state and a quiet cancellation action. The background preference uses a labeled checkbox and explanatory copy inside the existing workspace section. Neither requires a new reusable visual primitive. |
| Focus and motion | Existing blue focus outlines, field halos, disabled styling and reduced-motion rules remain applicable. Modal source includes Escape, focus containment and focus restoration, including summary controls. These are source observations, not a new runtime accessibility test. |

The sidecar remains schema version 2, with metadata for all thirteen documented colors, ten representative component snippets and the incumbent overlay/focus/motion/breakpoint extensions. It is a representative system catalog; this task does not require adding a specimen for every surface-specific disclosure, checkbox or progress element.

## Pre-existing reference differences

The older surface brief's OWN-WORLD line still names concept ink `#17171a`; the incumbent source and normative DESIGN frontmatter use `#1b263b`. DESIGN's Colors section already records that the shipped ink supersedes the earlier concept. This inherited difference does not originate in the model-controls extension. It is reported here and left untouched.

Approved mockups contain illustrative navigation, project content, branding geometry and provider labels that differ from the earlier shipped actual captures. They remain identity/topology references rather than a pixel contract for the new form. The current extension continues the implemented system recorded in DESIGN; no attempt was made to restore concept-only details.

## Limits and preservation

This was a manual document/source/capture comparison. No browser, runtime, detector, phase tool, automated comp-diff or new capture ran. The seven captures do not show an active model download/progress state or the tray-preference region; those findings are source-backed only. The finish review's supplied test/scenario counts were not independently rerun. The narrow capture establishes the declared Windows viewport, not an approved Android surface.

Only this check was created. `DESIGN.md`, `.impeccable/design.json`, application source, product documents and existing evidence were preserved. No shipping raster asset was added.
