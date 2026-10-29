---
name: "JaxOS Desktop"
description: "One place to think, build, and verify."
colors:
  blue: "#0053fd"
  blue-faint: "#eef4ff"
  blue-hover: "#0043d3"
  ink: "#1b263b"
  muted: "#5b6b83"
  paper: "#f8faff"
  chrome: "#f3f7ff"
  sidebar: "#f3f7ff"
  panel: "#f8faff"
  hover: "#e8effb"
  line: "#e3eaf5"
  line-strong: "#d5dfef"
  white: "#ffffff"
typography:
  display:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif"
    fontSize: "clamp(29px, 2.8vw, 42px)"
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: "-.04em"
  headline:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif"
    fontSize: "clamp(28px, 3vw, 40px)"
    fontWeight: 600
    lineHeight: 1.17
    letterSpacing: "-.04em"
  title:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.015em"
  body:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  conversation:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  code:
    fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  tag: "4px"
  icon: "5px"
  control: "6px"
  message: "8px"
  surface: "11px"
spacing:
  gap-small: "7px"
  gap-control: "8px"
  gap-medium: "12px"
  section-inset: "20px"
  workspace-inset: "24px"
  chat-inset: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.blue}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.blue-faint}"
  button-quiet:
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-quiet-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  button-text:
    textColor: "{colors.blue}"
    typography: "{typography.button}"
    padding: "5px 0"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.icon}"
    width: "32px"
    height: "32px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation-item:
    rounded: "{rounded.icon}"
    padding: "10px 11px"
  run-badge:
    textColor: "{colors.muted}"
    rounded: "{rounded.tag}"
    padding: "4px 7px"
  artifact-row:
    rounded: "{rounded.icon}"
    padding: "10px 12px"
  composer:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.surface}"
    padding: "12px 12px 9px"
---

# Design System: JaxOS Desktop

## Overview

**Creative North Star: "One place to think, build, and verify."**

The existing welcome phrase describes this working environment: calm, pale, and conversation oriented. White content sits alongside icy blue chrome and quieter context surfaces. Restrained functional blue directs attention to actions, selection, and focus. The user selected Hermes Desktop as an interface reference; the Windows controls and provisional JaxOS identity remain original.

This documents the implemented Windows desktop visual system, including its narrower responsive layouts. Generous central whitespace coexists with compact navigation and evidence metadata. Flat panes, quiet hairlines, and consistent line icons keep conversation, project context, and verification readable. The approved conversation and workbench compositions share this grammar; the future phone client is not yet an approved visual surface.

**Key Characteristics:**
- Pale opaque surfaces, functional blue, and quiet hairline separation.
- Segoe UI typography with a distinct monospace voice for technical evidence.
- Flat navigation, conversation, context, and workbench regions.
- Visible keyboard focus and state labels alongside status color.

This is an extraction from `src/tokens.css`, `src/styles.css`, and the implemented components after the manual finish review's `ship` disposition on 2026-10-11. The selected world and scope were already approved; this record adds no new brand commitment. No Impeccable launcher, detector, or automated comp-diff was available or run. Review was explicitly manual. No raster plates ship as interface elements. Mockups and review captures are evidence, not product artwork.

## Colors

The palette is cool and low contrast between surfaces, with stronger text and a concentrated action accent. Frontmatter records actual implementation values; the earlier concept ink is superseded here by the shipped `ink` token.

### Primary

- **Functional blue** (`blue`): primary actions, links, selected navigation, send controls, and keyboard focus.
- **Deep action blue** (`blue-hover`): primary and send-button hover.
- **Pale focus blue** (`blue-faint`): secondary hover and field focus halo.

### Neutral

- **Deep blue-black** (`ink`): ordinary content and headings.
- **Slate text** (`muted`): supporting copy, labels, timestamps, and quiet controls.
- **White canvas** (`white`): central content, controls, and modal surfaces.
- **Cool paper** (`paper`, `panel`): supporting surfaces and context pane.
- **Icy chrome** (`chrome`, `sidebar`): title/status bars and persistent sidebar.
- **Hover wash** (`hover`): quiet interactive surfaces.
- **Hairline** (`line`) and **field edge** (`line-strong`): structural separators and control borders.

Success, failure, and warning treatments are functional status variants, not additional brand accents. Their actual local CSS appears in component snippets where relevant. The sidecar's eight-step OKLCH ramps are derived swatch metadata only: they are not implementation tokens or a license to introduce new surface colors.

**The Functional Accent Rule.** Use blue to identify an action, selection, or focus state. Keep the surrounding workspace pale and quiet.

## Typography

Segoe UI Variable, Segoe UI, and the system fallbacks in the frontmatter carry all interface text. Cascadia Code, Consolas, and Courier New carry paths and technical output. There is no imported display font and no imposed mathematical type scale.

- **Display:** the conversation welcome; its fluid desktop size is recorded in frontmatter. Compact assistant panels use a smaller welcome (26px).
- **Headline:** the Daily page introduction; workbench headings use their observed denser variants (29px at the base layout).
- **Title:** section headings; compact context headings use a smaller size (14px).
- **Body:** ordinary interface copy. Conversation text uses its own more open line height and a message-list maximum width (720px).
- **Label:** section labels. Dense timestamps and evidence metadata use local sizes (10–11px).
- **Button:** medium-weight action labels, sentence case.
- **Code:** paths, command output, and artifact text. Preserve wrapping where long paths or evidence require it.

Use the frontmatter roles as extracted defaults, not as claims that every screen has identical typography. Narrow and compact overrides are already implemented in the stylesheet.

## Layout

The desktop shell fills the viewport. A title bar (38px) and status bar (29px) frame a flexible workspace. The base sidebar is fixed-width (234px); central content flexes with `min-width: 0`. The context pane is fixed-width (296px), while the assistant pane in Build/Test is slightly wider (316px). Internal regions scroll independently. Main content is white and the surrounding regions use the named cool surfaces.

Conversation welcomes stop at a comfortable width (650px), message lists at 720px, and context controls stay compact. The workbench makes artifacts and evidence dominant while retaining the narrow assistant. Use the extracted spacing values for common insets and control gaps; they describe reused measurements, not a fabricated universal spacing scale.

The actual CSS thresholds are:

- At a minimum width of 1600px, the sidebar and support panes widen, and content insets increase.
- At a maximum width of 1230px, the sidebar, support panes, and header spacing compress.
- At a maximum width of 1090px, the support pane becomes a right-hand overlay opened by a visible toggle.
- At a maximum width of 850px, navigation becomes a left-hand overlay with a menu control.
- At a maximum width of 610px, modes occupy a second header row, content insets narrow, metadata simplifies, and evidence facts wrap into two columns.

These are responsive desktop behaviors. The separate Android companion remains planned.

## Elevation & Depth

Persistent regions are flat and separated by tone and single-pixel rules. The composer has only a faint resting shadow. Dialogs and responsive drawers use larger shadows to establish their temporary position above the workspace. Field focus is a small halo, not structural elevation.

The sidecar preserves the exact composer, modal, drawer, and focus-shadow values. Modal backdrops use a translucent cool veil and a small blur (3px). The visual system does not require shadows around ordinary sections or evidence rows.

**The Flat Workspace Rule.** Separate persistent work regions with surface tone, whitespace, and hairlines. Reserve pronounced shadows for temporary overlays.

## Shapes

Controls are gently rounded, with the extracted `control` radius. Small tags use `tag`, icon buttons and navigation rows use `icon`, user messages use `message`, and the base composer/dialog use `surface`. The user-message bubble has a square upper-left corner and three rounded corners. Dots and avatars are circular. Large welcome symbols use their local larger radii; do not promote those decorative exceptions into every component.

Borders are generally single-pixel. Keep icons in the existing consistent outline family, with compact control-sized marks. The Windows minimize, maximize, and close controls retain their familiar positions and rectangular hit regions.

## Components

### Buttons

Calm and direct. Primary actions use blue with white text; secondary actions use blue text on white with a pale border; quiet actions use muted text; text actions use blue and underline on hover. The base button has a minimum height (38px). Primary hover deepens the fill, secondary hover adds a pale wash, and quiet/icon hover uses the shared hover surface. All keyboard-operable actions retain a visible blue outline (2px, offset 3px). Disabled buttons use the implemented reduced opacity unless a specific component supplies its own disabled treatment.

Background and border transitions are brief (0.14s, browser-default ease). Busy indicators use the observed spin (1.2s linear) or status pulse (1.4s ease-in-out); there is no decorative entrance animation. Reduced motion collapses animation and transition durations and disables smooth scrolling.

### Chips

Run badges are small, gently rounded status labels with an icon. Queued/running uses blue; passed uses green; failed/error uses warm red-brown. Preserve the written state and icon, including stale evidence messaging elsewhere in the run details. These badges are informational, so they do not acquire invented hover or focus behavior.

### Cards / Containers

Ordinary sections are open rows and panes. The closest reusable compact container is an artifact row: a hairline outline, small radius, filename, quiet metadata, and a trailing disclosure icon. Its hover changes the edge and background. Modal containers are temporary surfaces, with a separated heading and independently scrollable content; do not reuse modal elevation for page sections.

### Inputs / Fields

White fields use the stronger hairline and control radius, with ink text and muted placeholders. Focus changes the edge to blue and adds the pale halo. Disabled inputs use the paper surface. Project-brief fields use a quieter translucent-white surface on the context pane. Labels remain outside inputs; errors and stale states are written explicitly.

### Navigation

Sidebar items are flat, left-aligned rows with outline icons. Hover adds the shared wash; selection uses a pale blue fill and blue text. Header mode controls use a compact outlined selected treatment, becoming a bottom-rule treatment on the narrowest layout. Drawer controls remain available when the associated pane is hidden.

### Conversation Composer

The composer is the signature low-profile input surface: gently rounded white container, faint edge/shadow, roomy multiline field, quiet model control, and a square blue send button. Focus affects the container. Streaming replaces send with stop, and unavailable send uses the implemented disabled colors. Conversation messages remain readable text with metadata; user messages use a pale, asymmetrically rounded bubble.

### Evidence Preview

Artifact preview retains the filename and close control above a persistent zoom toolbar. Zoom out/in, percentage, Fit preview, and a keyboard-focusable scroll region support practical inspection. The implemented zoom range is 25–800%; large drawings must remain inspectable without losing the surrounding controls.

## Do's and Don'ts

### Do:
- **Do** preserve the pale, flat desktop grammar across modes.
- **Do** use the implemented CSS tokens when extending the interface.
- **Do** pair status color with readable labels and recognizable icons.
- **Do** retain visible focus, disabled states, and reduced motion support.
- **Do** preserve readable artifact inspection with persistent zoom, fit, and close controls.

### Don't:
- **Don't** turn the workspace into a nested card dashboard.
- **Don't** use the blue accent as broad decorative wallpaper.
- **Don't** replace the Segoe UI hierarchy with an unrelated display face.
- **Don't** show an invented passing result, connected project, or model state.
- **Don't** treat the narrow desktop layout as an approved Android design.
