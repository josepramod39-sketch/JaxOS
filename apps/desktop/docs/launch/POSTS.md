# Community posts

Drafts only. Check each community's self-promotion rules; ask moderators when required. Personalize the post around a useful workflow and respond to technical questions. Do not mass-post identical copy or claim affiliation with Hermes, OpenCode, KiCad or llama.cpp.

## Recruiting before download availability

I’m building JaxOS, a Windows workspace that combines local AI conversations with KiCad project checks. It supports Ollama and managed llama.cpp, with saved conversations and actual ERC/DRC evidence.

I’m looking for five Windows/KiCad users to help validate an early alpha. The first task is to connect a small project, run a check and review the findings. Installer and GPU compatibility still need native testing; I’ll help with setup and document the results.

Project details: {{PROJECT_URL}}

Which part of moving between a local assistant and KiCad currently takes the most effort for you?

## Download announcement — after acceptance and release

I built JaxOS, an Apache-2.0 Windows workspace for local AI and KiCad checks.

Here’s the actual workflow: load a local model, connect a KiCad project, request a board check and inspect KiCad's findings. Edits stay in KiCad; JaxOS keeps the conversation and check evidence together.

The alpha supports Ollama and managed llama.cpp. It is an unsigned Windows x64 prerelease; you install KiCad, model runtime and weights separately. The model can make mistakes, so the recorded tool results matter.

90-second demo: {{DEMO_URL}}
Download/setup: {{RELEASE_URL}}
Source and known limitations: {{PROJECT_URL}}

I’m looking for the first ten testers. If you try it, tell me whether you got through your first project check and what slowed you down.

## Short progress post

JaxOS alpha progress: local GGUF loading and context controls, saved conversations, and real KiCad check receipts are working in our Linux validation. We’re now checking the Windows installation path with early testers.

I’m documenting setup problems and the fixes as we go. Looking for Windows users who already work with KiCad: {{PROJECT_URL}}

## First two weeks

Days 1–3: finish Windows acceptance and setup fixes; recruit up to five testers. Days 4–7: publish one real workflow video and a technical explanation in one relevant community. Days 8–14: write up the most common setup issue and its fix, recruit five more testers, ask earlier testers about return use. Delay broad Product Hunt/Show HN promotion until the first users can reliably complete the task. No fixed conversion rate is assumed.
