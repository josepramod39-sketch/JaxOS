# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The product spans a Windows desktop workspace and an Android-first mobile companion, as confirmed by the user. The desktop interface runs inside Electron. A responsive React web app, installable as a PWA where supported, is the proposed first mobile delivery. Keep the API and design system compatible with a later iPhone client. Native mobile delivery is a later option if device integrations justify it.

## Stack

User selected Electron + React for Windows and requested mobile planning. Desktop 0.4.0 runs its coordinator in a separate utility process behind private typed IPC and a narrow Electron bridge. It supports explicit tray background mode, crash reconciliation and per-model inference profiles. SQLite WAL/FTS5 now provides history persistence/search, transactional task/event records and idempotent admission for chat/KiCad/model jobs. Legacy JSON files are preserved during import. A shared authenticated network API and separately deployed execution worker remain future work; no phone endpoint is exposed. Mobile technology is a recommendation, not a user-confirmed choice. Blueprint integration and the validated minimum Windows version remain open.

## Users

The user wants a personal assistant for brainstorming, daily work, building software and electronics, and testing results. Electronics includes schematics, supported simulations, wiring, PCB design, firmware, and eventual physical testing.

## Product Purpose

Keep project context across four modes and support a traceable path from an idea to verified work.

Build should also target the verified capabilities of the public Blueprint.io product. That comparison is pending website access; the public site and the user's local Blueprint backend are separate references with an unconfirmed relationship. The future electronics workflow is captured in ELECTRONICS-PLAN.md.

Let the user capture an idea on a phone, continue on Windows, and inspect the same task results on either device. Mobile execution depends on an available worker; the phone is not assumed to run the Windows toolchain.

The user selected Windows companion first for the future mobile release. Its planned live conversation, synchronization, builds, and tests require that PC to be awake and reachable; cached reading and local drafts are the intended offline behavior. Android and independent hosting are outside this MVP.

## Operating Context

The user works on Windows and has a local project at E:\blueprint-backend. That code is not available to this cloud task. JaxOS exists separately in /workspace/JaxOS and was prepared for local-model development. Hermes Agent and OpenCode are separate open-source inspirations.

## Capabilities and Constraints

Implemented desktop modes: Brainstorm with persistent local-model chat, explicit load/unload/download controls, validated context/output/thinking profiles and separate reasoning; Daily priorities; Build with project briefs, KiCad previews and fabrication exports; Test with real ERC/DRC reports, source fingerprints and stale evidence. Ollama and llama.cpp adapters now share a bounded tool loop: Analysis/Plan inspect attached KiCad projects, Design previews them, Test runs ERC/DRC, and Launch exports checked fabrication files. Managed llama.cpp owns one GGUF server with context, layer/CPU requests and idle unloading; attached mode leaves process control to its owner. These stages do not yet implement general software editing/build/deployment, Scientist research or Harness² optimization. The mobile client remains planned. Mockups contain labeled illustrative data; actual validation evidence is recorded separately in docs/VALIDATION.md. Blueprint is not connected.

Software, electronics, and combined hardware/firmware projects share the same project and evidence model. Electrical-rule checks, board-rule checks, simulations, firmware tests, and physical measurements are distinct outcomes. Physical results belong to an identified board/unit and configuration; generated design files do not establish that hardware works.

The user explicitly selected visual mockups before screen implementation, then approved the conversation composition for the shell and the workbench composition for Build/Test. Mobile should inherit this visual system and use its own touch-oriented composition. JaxOS is a provisional working name inherited from the current project context, not a final branding decision.

## Brand Commitments

The user chose Hermes Desktop as the interface and experience reference. Use its calm, flat, conversation-oriented desktop grammar, original branding, and Windows window controls. The reference is inspiration, not a claim of affiliation.

## Evidence on Hand

Official Hermes Desktop screenshot: /workspace/.analysis/hermes-desktop-reference/official-hermes-desktop-session-sidebar.png. Official source and design guide: NousResearch/hermes-agent/apps/desktop. Source inspected at 97a9ae8ee55d31bebce49f1fb6b5ef775323976a.

Hermes phone-access research is recorded in docs/research/HERMES-MOBILE.md. It confirms messaging access, a responsive browser dashboard, and best-effort Android/Termux support whose guide currently warns it is broken. It does not establish a native Hermes phone GUI or installable/offline PWA.

## Product Principles

- Preserve conversation and project context when switching modes.
- Make progress and task results visible without stealing focus.
- Keep project facts separate from tentative model suggestions.
- Tie completion to actual acceptance checks and recorded evidence.
- Preserve drafts and communicate offline, queued, running, and stale states clearly on every device.
- Make device access revocable and keep provider credentials and execution privileges on the service/worker side.
- Preserve editable engineering artifacts and source provenance; mark dependent results stale when their design inputs change.

## Planning Documents

- [Adopted desktop architecture](docs/ARCHITECTURE.md)
- [Desktop concept and implementation outline](DESKTOP-PLAN.md)
- [Mobile companion and shared architecture](MOBILE-PLAN.md)
- [Electronics workflow and future Build/Test capabilities](ELECTRONICS-PLAN.md)
- [KiCad project, command-line and editor interface](KICAD-INTEGRATION.md)
