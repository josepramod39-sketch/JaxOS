# Retained cloud development setup

The original `/workspace/JaxOS` checkout remains unchanged. The separately authorized desktop application is `/workspace/JaxOS-desktop`; its source is also delivered in the versioned source ZIP. No source was pushed and no release was published. Retaining this separate folder depends on the environment snapshot or source archive, not on cloning the original repository.

Node 24, the locked desktop dependencies, KiCad CLI 9.0.2, Electron 44.7.0, portable Xvfb and verified packaging caches were used for 0.4.0. Ollama 0.40.3 and the digest-verified `qwen3:0.6b` model are retained under `/workspace/.tools/ollama` and `/workspace/.jaxos-ollama`. Processes must restart after restoration. The SQLite driver ships inside Electron/Node; no database server or native addon installation is required. The suite now includes migration/search/backup and transactional admission checks.

```sh
bash /workspace/.setup/jaxos/start-ollama.sh
cd /workspace/JaxOS-desktop
npm run typecheck
npm test
npm run build
JAXOS_LIVE_MODEL_TEST=1 JAXOS_TEST_MODEL=qwen3:0.6b \
JAXOS_LIVE_LLAMA_TEST=1 \
JAXOS_TEST_LLAMA_BIN=/workspace/.tools/ollama/lib/ollama/llama-server \
JAXOS_TEST_LLAMA_MODEL=/workspace/.cache/jaxos-model/model.gguf \
JAXOS_TEST_KICAD_PATH=/usr/bin/kicad-cli npm run test:e2e
```

The llama.cpp checks use the retained Ollama-bundled `llama-server` (reported 0.5.0-dev, build 1, commit 631109b34) with the existing Qwen GGUF. They do not establish compatibility with every standalone upstream build. JaxOS starts and stops this server during tests; do not start another managed instance manually. Weights are retained in the environment cache, not in the source ZIP.

The E2E harness starts and stops its own Xvfb if `DISPLAY` is absent. The default portable executable is `/workspace/.tools/xvfb/root/usr/bin/Xvfb`; `JAXOS_XVFB_BIN` overrides it. Normal `npm run dev` needs an interactive display. No user-facing browser preview is configured.

If desktop dependencies are absent, run `npm ci --cache /workspace/.cache/npm` in the desktop directory. If dependency scripts were disabled and Electron is absent, run `node node_modules/electron/install.js`. The original project's saved installation instructions reconstruct its Ollama/model helpers with checksums; never change `HOME` or overwrite pre-existing data to start them.

Packaging in the prepared snapshot uses:

```sh
electron_config_cache=/workspace/.cache/electron ELECTRON_BUILDER_NSIS_DIR=/workspace/.tools/electron-builder/nsis-bundle ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder npm run package:win
```

The onboarding draft's `install_script` and `start_skill` were extended with the desktop commands while preserving the original project's setup, repository membership and network policy. Draft persistence does not execute scripts or publish the environment. Review and save the environment settings, then publish through the product if this snapshot should be reused. Fresh-task restoration has not been independently validated.

Actual checks and platform limits are in [VALIDATION.md](VALIDATION.md). Native Windows acceptance remains required even when packaging succeeds in Linux.
