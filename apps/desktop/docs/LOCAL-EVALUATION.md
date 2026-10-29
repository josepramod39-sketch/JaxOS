# Local evaluation runner — 0.5.1

JaxOS includes a command-line evaluator for Ollama and managed llama.cpp. It runs versioned synthetic fixtures, writes a new JSON report, and uses temporary workspaces rather than your saved conversations or CAD projects. The Windows installer includes `evaluate.cmd`; it uses JaxOS's bundled runtime and requires no separate Node or npm installation. The inference runtime, model weights and KiCad remain separate prerequisites.

## Run the installed Windows evaluator

In PowerShell, replace the executable and GGUF paths with your local files:

```powershell
$evalCommand = "$env:LOCALAPPDATA\Programs\JaxOS\evaluate.cmd"
$evalOutput = Join-Path $PWD 'evaluation-results'
New-Item -ItemType Directory -Force $evalOutput | Out-Null
& $evalCommand run --provider llama.cpp --live-model `
  --executable 'C:\AI\llama.cpp\llama-server.exe' `
  --model-path 'C:\AI\models\model.gguf' `
  --gpu-layers 0 --threads 4 --context 4096 --output-tokens 256 --thinking off `
  --kicad 'C:\Program Files\KiCad\9.0\bin\kicad-cli.exe' `
  --output (Join-Path $evalOutput 'llama-baseline.json')
```

The evaluator starts and stops its own authenticated loopback server through the same provider and supervisor used by the application. It selects a private port automatically. Supply absolute local paths for `--executable` and `--model-path`; do not supply `--url` for managed llama.cpp. Its model alias is `jaxos-gguf`. Attached llama.cpp servers remain supported in the desktop, but are outside this evaluator's scope.

Defaults are 4,096 context tokens, 256 output tokens, temperature zero, thinking off, four CPU threads and zero GPU layers. `--gpu-layers -1` requests automatic placement; positive values request that number of layers. These are requests, not measurements of GPU placement or VRAM. `--thinking on` requires advertised model support; `auto` is also accepted. Requested context must fit the model's reported limit and the machine's available memory. Keep runtime and weight files unchanged throughout a run.

For Ollama, start its local server and use:

```powershell
& $evalCommand run --provider ollama --live-model --model qwen3:0.6b `
  --url http://127.0.0.1:11434 `
  --output (Join-Path $evalOutput 'ollama-baseline.json')
```

Add `--kicad` if KiCad is not detected. Ollama URLs must be loopback origins without credentials, paths or query parameters. Ollama residency is shared with other clients; its suite does not unload their models.

## Suites and results

| Suite | Cases | Coverage |
| --- | --- | --- |
| `development` | 13 | Stage/tool policy, context selection, pre-cancellation, clean/faulty DRC, stale evidence, active KiCad cancellation, controlled coordinator cancellation/crash recovery, and two live response fixtures |
| `llama` | 14 | Development cases plus real managed loading, effective context, cancellation after streamed output, recovery inference, and unloading |
| `heldout` | 5 | Different policy cases, faulty ERC, and a live coordinator response |

The default suite is `llama` for the llama.cpp provider and `development` for Ollama. Select `--suite heldout` explicitly, retaining the same provider and runtime arguments. The llama suite requires `--provider llama.cpp`.

Without `--live-model`, live cases are unscored. Missing KiCad or unavailable inference also produces unscored cases. Exit code `0` means every case passed, `1` means at least one case failed or was unscored, and `2` indicates invalid arguments, an incompatible comparison or another runner-level error. Existing output files are rejected before model loading; create the parent directory and choose a fresh filename for every run.

KiCad fixtures are copied into temporary directories, including when read from the installed application archive. Source fingerprints, findings, tool versions and exit codes are recorded. Temporary workspaces and KiCad artifacts are deleted afterwards; the JSON retains result summaries, model text/reasoning, usage and elapsed time. Controlled coordinator cases use a synthetic streaming server; the separate live cases use the selected real runtime. Coordinator cases exercise a child process and SQLite, not the desktop UI.

## Compare and reproduce

Repeat the same command with a new output filename, then compare matching suites:

```powershell
& $evalCommand compare `
  --baseline (Join-Path $evalOutput 'llama-baseline.json') `
  --candidate (Join-Path $evalOutput 'llama-candidate.json')
```

Reports record fixture and KiCad-tree hashes, platform/runtime details, provider configuration and the requested profile. Managed llama.cpp also records executable/GGUF paths, sizes and SHA-256 digests, runtime version and effective context. The executable digest does not pin its linked libraries or GPU drivers. Random server ports and process IDs are excluded from comparison identity.

Source runs hash `package.json` and the files under `electron`, `shared`, `evaluation` and `scripts`. Installed runs hash `package.json` and the compiled files under `dist-electron`. The retained `sourceSha256` report field carries either identity, with `environment.identityKind` distinguishing them. These are evaluation-code identities, not whole-installer hashes. Source and installed reports are deliberately incompatible. The comparator also rejects differing suites, fixture hashes, case order or recorded environments, and rejects malformed reports. Code hashes may differ to permit baseline/candidate comparison. Both reports must have every case passing before comparison reports a pass; it makes no automatic promotion decision.

From a source checkout with Node 24 and dependencies installed, replace the installed command with `npm run eval --`:

```sh
mkdir -p .runtime/evaluations
npm run eval -- run --provider llama.cpp --live-model \
  --executable /absolute/path/to/llama-server --model-path /absolute/path/to/model.gguf \
  --gpu-layers 0 --threads 4 --kicad /usr/bin/kicad-cli \
  --output .runtime/evaluations/llama-baseline.json
npm run eval -- compare --baseline .runtime/evaluations/llama-baseline.json \
  --candidate .runtime/evaluations/llama-candidate.json
```

## Evidence and limits

See [0.5.0 release results](validation/release-0.5.0/RESULTS.md) for executed checks and observed responses. Linux live checks use the Ollama-bundled llama-server reporting `0.5.0-dev (build 1, commit 631109b34)`. Native Windows installation/runtime and GPU execution require separate acceptance; this does not certify every standalone llama.cpp build or model template.

Historical pre-0.5 Ollama runs remain in `.runtime/evaluations/` in the development workspace: the expanded development run passed 11/13 and held-out run 4/5. The direct two-plus-two response was `2`; coordinator responses had correct values but failed the exact-numeral format. Those observations remain failures and are not rewritten as passing results.

These small public fixtures are regression smoke tests, not a statistically representative model-quality benchmark. Output can vary at temperature zero. Elapsed times are observations, not controlled performance measurements. Repeat runs and use held-out cases without tuning against them. Arbitrary prompts, model judges, automatic optimization, telemetry, candidate isolation and cloud evaluation services are not implemented.
