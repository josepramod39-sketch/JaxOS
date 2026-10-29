# JaxOS v3.1: The Local-First Ambient AI OS 🦥

A Windows desktop alpha with local AI and KiCad checks is being prepared under [apps/desktop](apps/desktop/README.md). See its [launch readiness](apps/desktop/docs/launch/README.md); native Windows acceptance and public release availability are pending.

> "Cognition without Ecosystem Lock-in."

JaxOS is an open-source, high-fidelity research laboratory and autonomous reasoning engine. It transforms your terminal into a professional "Scientist's Desk," leveraging local LLMs to build a digital second brain that grows with you.

JaxOS is positioned as the **privacy-first alternative to closed-ecosystem agents** like Google's "Remy." It provides persistent, ambient cognition while keeping 100% of your data on your local machine.

---

## 🏛 Architecture: The Industrial Core

JaxOS v3.1 is built on a type-safe, industry-standard foundation:

- **Runtime**: [Bun](https://bun.sh) (High-performance JS/TS runtime)
- **Engine**: [Vercel AI SDK](https://sdk.vercel.ai) (Robust agentic primitives)
- **Validation**: [Zod](https://zod.dev) (Type-safe data & tool definitions)
- **UI**: [Ink](https://github.com/vadimdemedes/ink) (React-based Terminal UI)
- **Multi-Provider**: Unified interface for **Unsloth**, **Ollama**, and **LM Studio**.

### The Data Lifecycle
`User Intent` → `Vercel AI SDK Core` → `Hermes XML Agent Loop` → `Knowledge Graph (Triples)` → `Action / Synthesis`

---

## 🚀 Key Features

- **Bento HUD**: A multi-pane Research Lab dashboard featuring an Observation Deck, live Lab Status, and a sticky Lab Bench.
- **Digital Second Brain**: Autonomous extraction of "Knowledge Triples" from every paper you read, stored in a local graph.
- **Swarm Synthesis**: Multi-agent reasoning loops where specialized expert personas debate and critique findings.
- **Reality Gate**: Mandatory evidence verification by the "Reality Checker" persona to eliminate hallucinations.
- **OpenCode Delegation**: A "No-Code" workflow where you act as the Lead Scientist and outsource complex coding to an engineering team via an active bridge.

---

## ⌨️ Command Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| `/research` | `/research <topic>` | Autonomous search, read, and mapping loop. |
| `/synthesize`| `/synthesize <query>`| Swarm debate grounded in your Knowledge Graph. |
| `/graph` | `/graph` | Summary of your top concepts and connections. |
| `/read` | `/read <id>` | Fetch, summarize, and index an arXiv paper. |
| `/persona` | `/persona <name>` | Load a specialized expert role (e.g., Code_Auditor). |
| `/garage` | `/mode garage` | Build new Skills and Agency-Standard Experts. |

---

## 🛣 Roadmap

- **Phase 4: Vector Memory**: Integrate LanceDB for ambient semantic retrieval over your entire research library.
- **Phase 5: Managed Teammates**: Evolve the swarm into persistent background daemons for continuous monitoring.
- **Phase 6: Multi-Modal Bridge**: Adding Vision support for analyzing charts and diagrams in papers.

---

## 📜 License

Licensed under the **Apache License 2.0**.
