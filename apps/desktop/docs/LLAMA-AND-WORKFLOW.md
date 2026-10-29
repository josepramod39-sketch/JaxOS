# llama.cpp and the five-stage workspace — 0.5.0

JaxOS now has two inference adapters, Ollama and llama.cpp, behind one coordinator. A bounded tool loop can inspect an attached KiCad project and invoke the existing snapshot/check/export services. It borrows architectural patterns from Hermes and OpenCode; neither upstream agent engine is bundled or claimed equivalent.

## Managed GGUF setup

1. Install a compatible `llama-server.exe` build and its required libraries on Windows. Download a supported text GGUF separately. Keep these files outside the JaxOS installation directory.
2. In Settings → Local assistant, choose **llama.cpp** → **Manage a local GGUF model**. Select the executable and GGUF through the native pickers.
3. Open **Processor settings** if needed. GPU layers `-1` requests automatic placement, `0` requests CPU only, and a positive value requests that number of layers. CPU threads are explicit. These requests do not measure actual acceleration or available VRAM.
4. Save and connect. This saves configuration; **Load model** starts the process. In Generation profile, choose context/output limits, thinking, temperature and keep-loaded duration. Context/processor changes apply on the next load or message, restarting the owned process when necessary.
5. Check effective context and advertised capabilities after loading. Unknown VRAM is labeled unknown; the GGUF file size is not resident memory. Enable thinking only when supported. JaxOS separates returned reasoning from final answer text.

Managed mode starts one server on an ephemeral IPv4 loopback port with one parallel slot, a random session API key in an owned temporary file, no shell invocation, and a private supervisor. The key value is not placed in command arguments. No server endpoint or credential is exposed to the renderer. The supervisor stops its server when the coordinator disconnects. Quit and explicit unload stop only the owned process, preserving weights. Idle timeout starts when JaxOS releases the model; cancellation and unloading are separate operations. Keeping a model loaded does not keep Windows awake.

The initial alias is `jaxos-gguf`. Profiles distinguish the provider and canonical GGUF path; selecting another path keeps separate settings. A message records provider/model, requested profile, observed effective context, runtime version and model path when available. This is not a content hash of the model weights. Replacing weights at the same path does not create a new byte-identity profile.

## Attach to an existing server

Choose **Connect to an existing server**, enter its loopback root URL, and optionally enter an API key. The key is held by the coordinator for this session only; it is not saved in SQLite or backups. Entering an empty key and applying it clears that session credential. Re-enter it after a coordinator restart.

The server owner controls its model, context allocation, GPU placement, loading and shutdown. JaxOS discovers `/v1/models` and `/props`, validates local llama.cpp metadata, and streams `/v1/chat/completions`. Load/unload/download and processor controls are unavailable here. A chat-compatible endpoint without the required local metadata is not accepted as a proven local llama.cpp runtime. Context requests cannot exceed the attached server's reported effective allocation. Another client can change that server independently.

## Compatibility and evidence

Live cloud checks used the **Ollama-bundled** Linux llama-server reporting `0.5.0-dev (build 1, commit 631109b34)`, with the retained Qwen GGUF, CPU execution and 4,096/8,192-token contexts. This is not a certification of every standalone upstream build, model template or Windows GPU package. Managed startup requires the documented flags used in `electron/providers.ts`, including `--jinja`, `--reasoning-format deepseek` and `--api-key-file`. An incompatible executable fails visibly.

Thinking is capability-dependent and currently supports Auto/Off/On using the server's chat-template controls, not a universal adjustable thinking-effort slider. GPU cache precision, split-GPU policy, speculative decoding, multimodal loading, runtime downloads and model conversion are not implemented. The full metadata/context limit is not a claim that it fits the user's memory.

The managed runtime was exercised in real Electron, including an application archive, thinking, cancellation, restart, idle unloading and cleanup after a coordinator crash. Attached-server authentication/protocol and ownership boundaries have controlled HTTP coverage and a subsequent real Linux Electron GUI acceptance run, including authenticated inference, rejected unload, server survival after app exit and loss of the session key after restart. See the [release retest](validation/retest-0.4.0/RESULTS.md). Native Windows and GPU validation remain outstanding. See [validation](VALIDATION.md).

## Evaluate a managed model

Version 0.5.0 adds a command-line evaluation runner to the Windows installation. `evaluate.cmd` runs the same managed provider and supervisor without requiring Node/npm or using your saved workspace. Its llama suite checks real loading, effective context, cancellation after streamed output, successful subsequent inference and unloading, alongside policy, KiCad and coordinator fixtures. JSON reports include executable/GGUF SHA-256 digests; these evaluation identities are separate from the path/version metadata saved in ordinary chat messages.

Use the [evaluation guide](LOCAL-EVALUATION.md) for Windows and source commands, profile options, held-out cases and report comparison. The runtime executable, its libraries, GGUF weights and KiCad must be installed separately. Attached-server lifecycle evaluation is not included. See [0.5.0 results](validation/release-0.5.0/RESULTS.md) for the actual observations; native Windows and GPU behavior remain separate acceptance work.

## Stages and tools

Workflow stage is saved per conversation and appears above the composer. Navigation modes remain Brainstorm, Daily, Build and Test. Stages do not automatically advance or make the model an unrestricted agent.

| Stage | Tools offered for a connected KiCad project |
| --- | --- |
| Analysis | Inspect saved project state and recent run summaries |
| Plan | Inspect; produce proposed steps and acceptance checks in conversation |
| Design | Inspect and generate saved-file SVG previews |
| Test | Inspect and run ERC or DRC |
| Launch | Inspect and generate fabrication files after the existing deterministic checks |

Tools are offered only when a project is attached and the selected runtime/model advertises tool support. With no tools offered, chat remains conversational. The service validates the stage and exact argument schema independently of model output. A model cannot supply a filesystem path, shell command or arbitrary tool name to gain execution. All tools operate through the attached project's existing service boundary.

Each response allows at most seven generation turns, six tool operations, five minutes, an aggregate generation allowance of four times its output-token limit, and 100,000 output characters. Context estimation conservatively accounts for message/tool JSON and reserves generation space. On a limit, the app preserves evidence and reports the limit; it does not silently retry or compact history. These are containment limits, not a guarantee that every model completes a task.

A complete, parsed tool call is persisted before execution. Results are saved and returned to the model. Duplicate call IDs, partial/truncated requests and operations outside stage policy cannot execute. A completed tool invocation can report a **failed** KiCad check: the receipt shows that actual result and its run ID, with access to the Test workbench. Model prose never changes the saved check outcome. The workbench link opens the mode; use the receipt's run ID to identify the specific run.

On restart, unfinished messages and operations become interrupted; they are not automatically replayed. The existing KiCad command receipts prevent duplicate admissions. A crash between run admission and the transcript's run-ID save may leave the operation discoverable in the run/task history without a linked transcript receipt; automatic repair of that link is future work.

Launch currently means local manufacturing-file handoff. No software deployment, purchase, board manufacture, simulation or physical testing takes place. General software edits/build/test jobs, isolated Git worktrees, PTY sessions, MCP, reusable skills, Scientist research/graphs, Harness² optimization and Android pairing remain later increments in the [hybrid plan](HYBRID-HARNESS-PLAN.md) and [Peiranava comparison](PEIRANAVA-COMPARISON.md).
