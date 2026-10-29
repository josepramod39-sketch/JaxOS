# Your first JaxOS check

For Windows x64 alpha testers. Use a copy of a non-sensitive KiCad project initially. Allow setup/download time separately; no RAM/VRAM minimum has been established by this release.

1. Install KiCad 9. For the simplest model setup, install Ollama for Windows and run `ollama pull qwen3:0.6b` in PowerShell. This small model is useful for exercising the workflow; its reasoning and instruction following are limited. Start Ollama.
2. Install the JaxOS prerelease after checking its release SHA-256. Open Settings, use the Ollama runtime, local address `http://127.0.0.1:11434`, and choose the installed model. Save and connect. For GGUF setup, follow [managed llama.cpp](../LLAMA-AND-WORKFLOW.md).
3. Send a short message and confirm a response appears. With a supported model, inspect its generation profile/effective context. Cancel and retry if needed.
4. In Build, connect an existing `.kicad_pro`. In Settings, locate `kicad-cli.exe` if detection fails. Start with a small project; retain its libraries and linked files.
5. In Test, run DRC and inspect findings and logs. A failed DRC is a valid completed check when the board has errors. Chat in Test stage can request the check when the model advertises tool support; the Test controls provide a direct path if it does not.
6. Edit and save the board in KiCad. Refresh the project in JaxOS and rerun DRC. Confirm that old evidence is marked stale and the new result describes the saved board revision. Digital checks do not replace design review or physical testing.
7. Close/reopen JaxOS and confirm conversation/check history remains. Report the first confusing or failing step with [this short form](FEEDBACK.md).

Troubleshooting: missing models → check Ollama's installed model list; GGUF startup error → check runtime DLLs/flags and model compatibility; missing KiCad → select its CLI executable; long response → cancel and use a smaller profile/model. Preserve exact error text, but remove credentials, personal paths and private project contents before sharing. Do not upload your workspace database by default.
