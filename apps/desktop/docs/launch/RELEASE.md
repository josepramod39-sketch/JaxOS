# JaxOS Desktop 0.5.1 — Windows alpha

DRAFT: publish as a prerelease after Windows acceptance. Replace markers before publishing.

JaxOS brings local-model conversations and KiCad project checks into one Windows workspace. Use Ollama or a managed llama.cpp GGUF, attach an existing KiCad project, and inspect real electrical/board-check findings with saved evidence.

## Try it

1. Download `JaxOS-Setup-0.5.1-win-x64.exe` from this release. Compare its SHA-256 with `SHA256SUMS-0.5.1`.
2. Install separately: KiCad 9 and either Ollama with a local model, or a compatible Windows llama-server build with its libraries and a text GGUF.
3. Follow {{QUICKSTART_URL}} to load a model, connect a project and complete your first check.

Demo: {{DEMO_URL}} · Feedback: {{ISSUE_URL}}

## What is included

Persistent conversations and daily priorities; provider-specific generation profiles; managed model loading/unloading; KiCad previews, ERC/DRC findings and manufacturing-file export; a standalone `evaluate.cmd` command using the bundled runtime.

The desktop source is Apache-2.0. See LICENSE, NOTICE and THIRD-PARTY-NOTICES.md; dependencies and sample KiCad libraries retain their licenses.

## Alpha limits

Windows x64 only; installer unsigned. Models, inference runtimes and KiCad are separate downloads. Model answers may be wrong and do not certify electrical safety. Circuit edits stay in KiCad. Android, automatic schematic/PCB design, generic software building and deployment are future work. Requested GPU layers do not prove actual GPU placement.

Windows acceptance: {{WINDOWS_ACCEPTANCE_URL}}. Record actual tested OS/runtime/model combinations; do not replace this with Linux results. Existing Linux model smoke-test format failures remain in the validation report.

Quit JaxOS and any evaluator before updating. Back up your workspace before alpha upgrades. Uninstall preserves workspace data. We are looking for the first ten testers; tell us where setup or your first check becomes confusing.
