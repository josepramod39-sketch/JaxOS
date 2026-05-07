import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp } from "ink";
import { Header, type Mode } from "./components/Header.tsx";
import { Transcript, type Message } from "./components/Transcript.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { InputBar } from "./components/InputBar.tsx";
import { listAllModels, type Provider } from "../tools/llm.ts";
import { runAgentLoop, type AgentEvent } from "../tools/agent_loop.ts";
import { runSwarmSynthesis, type SwarmEvent } from "../tools/swarm.ts";
import { searchArxiv, fetchByArxivId } from "../tools/arxiv.ts";
import { savePaper, listPapers, makeSlug } from "../tools/journal.ts";
import { listSkills, loadSkill } from "../tools/skills.ts";
import { listPersonas, loadPersona } from "../tools/personas.ts";
import { loadGraph } from "../tools/graph.ts";
import { speak, transcribe } from "../tools/voice.ts";

const SYSTEMS: Record<Mode, string> = {
  research: `You are the Research Assistant to the Lead Scientist (the user) in the JaxOS Research Lab.
Your mission is to support the Lead Scientist's discoveries by handling the rigorous labor of research and synthesis.
You follow the Hermes XML protocol:
1. **Internal Reasoning**: Always start with a <thought> block to analyze the Lead Scientist's request.
2. **No-Code Workflow**: NEVER write large blocks of code yourself.
3. **Delegation**: If a task requires software or benchmarks, use <call:delegate_to_opencode>{"task_description": "..."}</call:delegate_to_opencode>.
4. **Feedback Loop**: After delegating, you MUST use <call:check_delegation_status>{"task_id": "..."}</call:check_delegation_status> in a subsequent turn. Do NOT synthesize results until the status is COMPLETED.
5. **Evidence-Based**: Extract core concepts as triples and use <call:update_graph> to save them.
6. **Truth Maintenance**: If query_graph returns a ⚠️ WARNING, analyze the conflicting evidence and report it to the Lead Scientist.`,
  code: `You are the Lab Engineering Liaison for the Lead Scientist.
Your goal is to translate research findings into technical specifications.
Use <call:delegate_to_opencode> for implementation and <call:check_delegation_status> to monitor progress.`,
  innovate: `You are the Innovation Strategist for the Lead Scientist.
Help the Lead Scientist brainstorm new possibilities and use <call:delegate_to_opencode> to request rapid prototyping of their experimental concepts.`,
  company: `You are the Lab Operations Manager for the Lead Scientist. 
Focus on high-level strategy and use the engineering team (OpenCode) for data analysis scripts via <call:delegate_to_opencode> as requested by the Lead Scientist.`,
  garage: `You are the Lab Workshop Manager for the Lead Scientist.
Help the Lead Scientist design new expert personas and use <call:delegate_to_opencode> if a persona requires custom tool implementations or complex logic scripts.`
};

function StatusLine({ label, value, color = "gray" }: { label: string, value: string | number, color?: string }) {
  return (
    <Box gap={1}>
      <Text color="gray" dimColor>{label}:</Text>
      <Text color={color as any}>{value}</Text>
    </Box>
  );
}

export function App() {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("research");
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: SYSTEMS["research"] },
  ]);
  const [streaming, setStreaming] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [model, setModel] = useState("unsloth/Qwen3.5-9B-GGUF");
  const [provider, setProvider] = useState<Provider>("unsloth");
  const [availableModels, setAvailableModels] = useState<{ id: string; provider: Provider }[]>([]);
  const [effort, setEffort] = useState<"low" | "medium" | "high" | "max">("medium");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [paperCount, setPaperCount] = useState(0);
  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [showBoot, setShowBoot] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowBoot(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      while (alive) {
        const models = await listAllModels();
        if (!alive) break;
        
        if (models.length > 0) {
          setAvailableModels(models);
          setModelReady(true);
          if (!models.find(m => m.id === model)) {
            const first = models[0];
            if (first) {
              setModel(first.id);
              setProvider(first.provider);
            }
          }
          break;
        }
        await Bun.sleep(3000);
      }
    };
    poll();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    listPapers().then((p) => setPaperCount(p.length));
  }, []);

  useEffect(() => {
    const total = messages.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0);
    setTokenEstimate(total);
  }, [messages]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleCommand = useCallback(async (input: string) => {
    const [cmd, ...rest] = input.trim().split(/\s+/);
    const arg = rest.join(" ");

    if (cmd === "/clear") {
      setMessages([{ role: "system", content: SYSTEMS[mode] }]);
      return;
    }

    if (cmd === "/mode" && rest[0]) {
      const modes: Mode[] = ["research", "code", "innovate", "company", "garage"];
      if (modes.includes(rest[0] as Mode)) {
        const newMode = rest[0] as Mode;
        setMode(newMode);
        setMessages([{ role: "system", content: SYSTEMS[newMode] }]);
      }
      return;
    }

    if (cmd === "/model") {
      if (!arg) {
        const list = availableModels.map((m, i) => `${i + 1}. ${m.id} (${m.provider})`).join("\n");
        addMessage({
          role: "assistant",
          content: `Available models:\n${list}\n\nUse /model <number> to switch.`,
        });
      } else {
        const idx = parseInt(arg) - 1;
        if (availableModels[idx]) {
          setModel(availableModels[idx].id);
          setProvider(availableModels[idx].provider);
          addMessage({
            role: "assistant",
            content: `Switched to **${availableModels[idx].id}** (${availableModels[idx].provider})`,
          });
        } else {
          addMessage({ role: "assistant", content: `Invalid model number: ${arg}` });
        }
      }
      return;
    }

    if (cmd === "/effort") {
      const levels = ["low", "medium", "high", "max"] as const;
      if (levels.includes(arg as any)) {
        setEffort(arg as any);
        addMessage({ role: "assistant", content: `Effort set to **${arg}**` });
      } else {
        addMessage({ role: "assistant", content: "Usage: /effort low|medium|high|max" });
      }
      return;
    }

    if (cmd === "/voice") {
      if (arg === "on") {
        setVoiceEnabled(true);
        addMessage({ role: "assistant", content: "Voice mode enabled. Use ctrl+v to speak." });
      } else if (arg === "off") {
        setVoiceEnabled(false);
        addMessage({ role: "assistant", content: "Voice mode disabled." });
      } else {
        addMessage({ role: "assistant", content: "Usage: /voice on|off" });
      }
      return;
    }

    if (cmd === "/research" && arg) {
      await handleSubmit(`Please conduct an autonomous research task on: ${arg}. 
        Find relevant papers, summarize them, check their citations, and save a knowledge map.`);
      return;
    }

    if (cmd === "/synthesize" && arg) {
      setBusy(true);
      addMessage({ role: "user", content: input });
      try {
        let finalSynthesis = "";
        setStreaming("");
        const temperature = effort === "low" ? 0.2 : effort === "medium" ? 0.5 : effort === "high" ? 0.8 : 1.0;
        
        const swarm = runSwarmSynthesis(arg, model, provider, { temperature });
        for await (const event of swarm) {
          if (event.type === "thinking") {
            addMessage({ 
              role: "assistant", 
              content: event.persona ? `*${event.persona}* is thinking...` : `*Synthesis Engine* is ${event.content.toLowerCase()}`,
              thinking: event.content 
            });
          } else if (event.type === "perspective") {
            addMessage({ role: "assistant", content: `**Perspective (${event.persona})**\n${event.content}` });
          } else if (event.type === "critique") {
            addMessage({ role: "assistant", content: `**Critique (${event.persona})**\n${event.content}` });
          } else if (event.type === "synthesis") {
            finalSynthesis += event.content;
            setStreaming(finalSynthesis);
          } else if (event.type === "error") {
            addMessage({ role: "assistant", content: `Error: ${event.content}` });
          }
        }
        setStreaming(undefined);
        if (finalSynthesis) {
          addMessage({ role: "assistant", content: `**Final Synthesis Report**\n\n${finalSynthesis}` });
          if (voiceEnabled) speak("Synthesis complete. I've compiled the expert perspectives into a final report.");
        }
      } finally {
        setBusy(false);
        setStreaming(undefined);
      }
      return;
    }

    if (cmd === "/graph") {
      const graph = await loadGraph();
      if (graph.nodes.length === 0) {
        addMessage({ role: "assistant", content: "The knowledge graph is empty. Start by researching or reading papers!" });
      } else {
        const topConcepts = graph.nodes
          .filter(n => n.type === "concept")
          .sort((a, b) => (b.degree || 0) - (a.degree || 0))
          .slice(0, 10);
        
        const summaryText = [
          `**Knowledge Graph Summary**`,
          `Nodes: ${graph.nodes.length} (${graph.nodes.filter(n => n.type === "paper").length} papers, ${graph.nodes.filter(n => n.type === "concept").length} concepts)`,
          `Edges: ${graph.edges.length}`,
          ``,
          `**Top Concepts:**`,
          ...topConcepts.map(c => `• ${c.id} (${c.degree} connections)`)
        ].join("\n");
        
        addMessage({ role: "assistant", content: summaryText });
      }
      return;
    }

    if (cmd === "/skills") {
      const skills = await listSkills();
      addMessage({
        role: "assistant",
        content: skills.length
          ? `Custom skills in the Garage (${skills.length}):\n${skills.map((s) => `• ${s}`).join("\n")}`
          : "No custom skills created yet. Switch to /mode garage to build one!",
      });
      return;
    }

    if (cmd === "/skill" && arg) {
      const content = await loadSkill(makeSlug(arg));
      if (content) {
        setMessages([{ role: "system", content }]);
        addMessage({ role: "assistant", content: `Skill **${arg}** loaded successfully. Jax is now following these custom instructions.` });
      } else {
        addMessage({ role: "assistant", content: `Skill not found: ${arg}. Use /skills to see available skills.` });
      }
      return;
    }

    if (cmd === "/personas") {
      const personas = await listPersonas();
      addMessage({
        role: "assistant",
        content: personas.length
          ? `Expert Personas in the Garage (${personas.length}):\n${personas.map((p) => `• ${p}`).join("\n")}`
          : "No expert personas created yet. Switch to /mode garage to build one!",
      });
      return;
    }

    if (cmd === "/persona" && arg) {
      const content = await loadPersona(makeSlug(arg));
      if (content) {
        setMessages([{ role: "system", content }]);
        addMessage({ role: "assistant", content: `Expert Persona **${arg}** loaded. Jax is now acting as this specialized expert.` });
      } else {
        addMessage({ role: "assistant", content: `Persona not found: ${arg}. Use /personas to see available experts.` });
      }
      return;
    }

    if (cmd === "/papers") {
      const papers = await listPapers();
      addMessage({
        role: "assistant",
        content: papers.length
          ? `Saved papers (${papers.length}):\n${papers.map((p) => `• ${p}`).join("\n")}`
          : "No papers saved yet. Use /read <arxiv-id> to get started.",
      });
      return;
    }

    if (cmd === "/search" && arg) {
      setBusy(true);
      addMessage({ role: "user", content: input });
      try {
        const results = await searchArxiv(arg, 5);
        if (!results.length) {
          addMessage({ role: "assistant", content: "No results found." });
        } else {
          const list = results
            .map((p, i) => `${i + 1}. **${p.title}** (${p.published})\n   ${p.authors.slice(0, 3).join(", ")}\n   arxiv:${p.id}`)
            .join("\n\n");
          addMessage({ role: "assistant", content: `Found ${results.length} papers:\n\n${list}\n\nUse /read <arxiv-id> to read one.` });
        }
      } finally {
        setBusy(false);
        listPapers().then((p) => setPaperCount(p.length));
      }
      return;
    }

    if (cmd === "/read" && arg) {
      setBusy(true);
      addMessage({ role: "user", content: input });
      try {
        const paper = await fetchByArxivId(arg);
        if (!paper) {
          addMessage({ role: "assistant", content: `Could not find paper: ${arg}` });
          return;
        }
        const paperContext = `Title: ${paper.title}\nAuthors: ${paper.authors.join(", ")}\nPublished: ${paper.published}\n\nAbstract:\n${paper.abstract}`;
        const chatMsgs: any[] = [
          { role: "system", content: SYSTEMS[mode] },
          { role: "user", content: `Please summarize this paper in the format: Problem → Method → Key Result → Why it matters.\n\n${paperContext}` },
        ];

        let summary = "";
        setStreaming("");
        const temperature = effort === "low" ? 0.2 : effort === "medium" ? 0.5 : effort === "high" ? 0.8 : 1.0;
        
        const loop = runAgentLoop(chatMsgs, model, provider, { temperature });
        for await (const event of loop) {
          if (event.type === "text") {
            summary += event.content;
            setStreaming(summary);
          } else if (event.type === "thought") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant" && last.thinking === "Internal Reasoning") {
                return [...prev.slice(0, -1), { ...last, content: event.content }];
              }
              return [...prev, { role: "assistant", content: event.content, thinking: "Internal Reasoning" }];
            });
          } else if (event.type === "tool_start") {
            addMessage({ role: "assistant", content: `→ ${event.content}` });
          }
        }
        setStreaming(undefined);

        const md = `# ${paper.title}\n\n**Authors:** ${paper.authors.join(", ")}  \n**Published:** ${paper.published}  \n**URL:** ${paper.url}\n\n## Abstract\n${paper.abstract}\n\n## Summary\n${summary}\n\n---\n*Saved: ${new Date().toISOString().slice(0, 10)}*\n`;
        await savePaper(makeSlug(paper.title), md);
        setPaperCount((n) => n + 1);

        const reply = `**${paper.title}**\n\n${summary}\n\n✓ Saved to ~/jaxos/research/`;
        addMessage({ role: "assistant", content: reply });
        if (voiceEnabled) speak(reply);
      } finally {
        setBusy(false);
        setStreaming(undefined);
      }
      return;
    }
  }, [addMessage, model, provider, effort, availableModels, voiceEnabled, mode]);

  const handleSubmit = useCallback(async (input: string) => {
    if (input.startsWith("/") && !input.startsWith("/research") && !input.startsWith("/synthesize")) {
      await handleCommand(input);
      return;
    }

    addMessage({ role: "user", content: input });
    if (!modelReady) {
      addMessage({ role: "assistant", content: "Local LLM is not running. Start Unsloth or Ollama." });
      return;
    }

    setBusy(true);
    try {
      const chatMsgs: any[] = messages
        .filter((m) => m.role !== "system" || messages.indexOf(m) === 0)
        .map((m) => ({ role: m.role as any, content: m.content }));
      chatMsgs.push({ role: "user", content: input });

      let reply = "";
      setStreaming("");
      const temperature = effort === "low" ? 0.2 : effort === "medium" ? 0.5 : effort === "high" ? 0.8 : 1.0;
      
      const loop = runAgentLoop(chatMsgs, model, provider, { temperature });
      for await (const event of loop) {
        if (event.type === "text") {
          reply += event.content;
          setStreaming(reply);
        } else if (event.type === "thought") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.thinking === "Internal Reasoning") {
              return [...prev.slice(0, -1), { ...last, content: event.content }];
            }
            return [...prev, { role: "assistant", content: event.content, thinking: "Internal Reasoning" }];
          });
        } else if (event.type === "tool_start") {
          addMessage({ role: "assistant", content: `→ ${event.content}` });
        } else if (event.type === "error") {
          addMessage({ role: "assistant", content: `Error: ${event.content}` });
        }
      }
      
      setStreaming(undefined);
      if (reply) {
        addMessage({ role: "assistant", content: reply });
        if (voiceEnabled) speak(reply);
      }
    } catch (e) {
      setStreaming(undefined);
      addMessage({ role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }, [messages, model, provider, effort, modelReady, voiceEnabled, addMessage, handleCommand]);

  const onVoiceRequest = useCallback(async () => {
    const text = await transcribe();
    return text;
  }, []);

  const tokenPct = Math.min(100, Math.round((tokenEstimate / 32768) * 100));

  if (showBoot) {
    return (
      <Box flexDirection="column" height="100%" justifyContent="center" alignItems="center">
        <Text bold color="cyan">JAXOS RESEARCH LAB v3.0</Text>
        <Text color="gray" dimColor>Industrial Agentic Core v3.0 Online</Text>
        <Text color="gray" dimColor>Initializing Digital Second Brain...</Text>
        <Text color="gray" dimColor>Connecting to local LLM swarms...</Text>
        <Text color="gray" dimColor>Ready.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%" paddingX={2} paddingY={1}>
      <Header
        mode={mode}
        modelReady={modelReady}
        model={model}
        tokenCount={tokenEstimate}
        tokenPct={tokenPct}
        effort={effort}
      />

      <Box flexGrow={1} gap={4} marginTop={1}>
        <Box flexDirection="column" flexGrow={1}>
          <Box marginBottom={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="gray" paddingBottom={0}>
             <Text bold color="cyan" dimColor>OBSERVATION DECK</Text>
          </Box>
          <Transcript messages={messages} streaming={streaming} busy={busy} />
        </Box>

        <Box flexDirection="column" width={28}>
          <Box marginBottom={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderColor="gray" paddingBottom={0}>
             <Text bold color="cyan" dimColor>LAB STATUS</Text>
          </Box>
          <Sidebar
            sessionName={mode}
            tokenCount={tokenEstimate}
            paperCount={paperCount}
            model={model}
            effort={effort}
          />
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1} paddingTop={1} borderStyle="single" borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray">
        <Box justifyContent="space-between" marginBottom={1}>
           <Box gap={2}>
              <StatusLine label="VOICE" value={voiceEnabled ? "ACTIVE" : "OFF"} color={voiceEnabled ? "green" : "gray"} />
              <StatusLine label="MEMORY" value={`${paperCount} PAPERS`} color="cyan" />
           </Box>
           <Box gap={2}>
              <StatusLine label="TASK" value={busy ? "PROCESSING..." : "IDLE"} color={busy ? "yellow" : "gray"} />
              <Text color="gray" dimColor>v3.0</Text>
           </Box>
        </Box>
        <InputBar 
          onSubmit={handleSubmit} 
          disabled={busy} 
          mode={mode} 
          voiceEnabled={voiceEnabled} 
          onVoiceRequest={onVoiceRequest}
        />
      </Box>
    </Box>
  );
}
