# JaxOS v2.1: The Research Lab 🧪

Welcome to your autonomous Command Center. JaxOS v2.1 transforms your terminal into a high-density "Research Lab" where you act as the **Lead Scientist** and Jax acts as your elite **Lab Assistant**.

---

## 🚀 Lab Initialization

1. **Start your Backend**:
   - **Unsloth Studio**: `unsloth studio` (Port 8888) — *Recommended*
   - **LM Studio**: Start "Local Server" (Port 1234)
   - **Ollama**: `ollama serve` (Port 11434)
2. **Load a Model**:
   - Ensure a model is "Active" in your provider's UI.
3. **Launch the Command Center**:
   ```bash
   cd ~/Projects/jaxos_gem/JaxOS_v2.1
   bun start
   ```

---

## 🏢 The Bento HUD (Heads-Up Display)

JaxOS v2.1 features a three-pane "Bento" layout designed for maximum information density:

*   **Observation Deck (Center)**: Where you monitor Jax's `<thought>` streams, research findings, and agent debates.
*   **Lab Status (Right)**: Real-time monitoring of your **Knowledge Web** and active **Expert Swarm** personas.
*   **Lab Bench (Bottom Sticky)**: Your control anchor. Monitors Voice status, Memory health, and current active Tasks.

---

## 🔬 The "Lead Scientist" Workflow

In v2.1, the hierarchy is strictly enforced:
*   **Lead Scientist (You)**: Directs the research strategy and makes high-level decisions.
*   **Lab Assistant (Jax)**: Handles the rigorous labor of searching, reading, and synthesizing data.
*   **Engineering Team (OpenCode)**: A specialized outsourcing layer for all coding and benchmarking tasks.

### **The No-Code/Delegation Engine**
Jax understands he is a researcher, not a coder.
When a task requires software building or algorithmic implementation, Jax will autonomously use the **`delegate_to_opencode`** tool.

**The Bridge Workflow (v2.3 Upgraded)**:
1. **Request**: Jax sends a delegation request.
2. **Bridge**: In your **Watcher** terminal, you will see a green command appear.
3. **Execute**: Copy that command and paste it into your **OpenCode** terminal.
   - It will look like: `/read LAB_TASK.md then execute the task...`
4. **Handoff**: OpenCode reads the task (including the **Karpathy Guardrails**) and builds the code.
5. **Report**: Once finished, update the `Status` in `LAB_TASK.md` to `COMPLETED` and add your results.
6. **Synthesis**: Back in the Lab, Jax will see the completion and synthesize the results.

---

## ⌨️ Command Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| `/search` | `/search <query>` | Search arXiv for papers. |
| `/read` | `/read <id>` | Fetch, summarize, and **graph** a paper. |
| `/research` | `/research <topic>` | Autonomous research & mapping loop. |
| `/synthesize`| `/synthesize <topic>`| **Swarm Debate**: Deep reasoning & graph synthesis. |
| `/graph` | `/graph` | Show summary of your Digital Second Brain. |
| `/mode` | `/mode <name>` | Switch contexts: `research`, `code`, `innovate`, `garage`. |
| `/personas` | `/personas` | List specialized experts in your Lab. |
| `/persona` | `/persona <name>` | Load a specialized expert role. |
| `/skills` | `/skills` | List autonomous behaviors you've built. |
| `/voice` | `/voice on/off` | Toggle Push-to-Talk (Ctrl+V) mode. |

---

## 🧠 Memory & Knowledge

*   **Digital Second Brain**: Every discovery is saved as a triple (Source, Target, Relation) in `~/jaxos/knowledge_graph.json`.
*   **Lab Delegations**: Every task sent to the engineering team is logged in `~/jaxos/lab/delegations/`.
*   **Proactive Memory**: Jax tracks your long-term research goals in `~/jaxos/user_profile.json` and adjusts his behavior to suit your style.

---

## 📜 License

JaxOS v2.1 is licensed under the **Apache License 2.0**. It is open, modular, and built for privacy-first research.
