import { streamText } from "ai";
import { getProvider, type Provider } from "./llm.ts";
import { loadPersona, listPersonas } from "./personas.ts";
import { loadGraph } from "./graph.ts";

export interface SwarmEvent {
  type: "thinking" | "perspective" | "critique" | "synthesis" | "error" | "done";
  persona?: string;
  content: string;
}

export async function* runSwarmSynthesis(
  query: string,
  modelId: string,
  provider: Provider,
  options: { temperature?: number; personaNames?: string[] } = {}
): AsyncGenerator<SwarmEvent> {
  const providerInstance = getProvider(provider);

  try {
    // 1. Prepare Personas (Orchestration Phase)
    let names = options.personaNames || [];
    if (names.length === 0) {
      const available = await listPersonas();
      // Remove infrastructure agents from the general pool
      names = available.filter(n => n !== "orchestrator" && n !== "reality-checker").slice(0, 2);
    }

    const personas: { name: string; instructions: string }[] = [];
    for (const name of names) {
      const instructions = await loadPersona(name);
      if (instructions) personas.push({ name, instructions });
    }

    if (personas.length === 0) {
      yield { type: "error", content: "No specialized personas available. Create some in /mode garage!" };
      return;
    }

    // Load Reality Checker (Mandatory for Agency Standard)
    const realityCheckerInstructions = await loadPersona("reality-checker");
    
    // 2. Query Knowledge Graph for context
    yield { type: "thinking", content: "Retrieving grounded context from Knowledge Graph..." };
    const graph = await loadGraph();
    const queryLower = query.toLowerCase();
    const contextEdges = graph.edges.filter(e => 
      e.source.toLowerCase().includes(queryLower) || 
      e.target.toLowerCase().includes(queryLower) ||
      e.relation.toLowerCase().includes(queryLower)
    );
    const graphContext = contextEdges.length > 0 
      ? `Research Library Connections:\n${JSON.stringify(contextEdges, null, 2)}`
      : "Knowledge Graph: No direct hits found. Proceed with general reasoning.";

    // 3. Round 1: Specialized Perspectives
    const perspectives: { name: string; content: string }[] = [];
    for (const persona of personas) {
      yield { type: "thinking", persona: persona.name, content: `Generating ${persona.name}'s specialized analysis...` };
      
      const messages: any[] = [
        { role: "system", content: persona.instructions },
        { role: "user", content: `CONTEXT:\n${graphContext}\n\nTASK: Provide your specialized perspective on: ${query}` }
      ];

      let content = "";
      const result = await streamText({
        model: providerInstance(modelId) as any,
        messages,
        temperature: options.temperature ?? 0.7,
      });

      for await (const chunk of result.textStream) {
        content += chunk;
      }
      perspectives.push({ name: persona.name, content });
      yield { type: "perspective", persona: persona.name, content };
    }

    // 4. Round 2: Mandatory Reality Check (The Agency Gate)
    let realityReport = "";
    if (realityCheckerInstructions) {
      yield { type: "thinking", persona: "Reality Checker", content: "Verifying claims against evidence..." };
      
      const debateHistory = perspectives.map(p => `${p.name}: ${p.content}`).join("\n\n");
      const messages: any[] = [
        { role: "system", content: realityCheckerInstructions },
        { role: "user", content: `DEBATE TO VERIFY:\n${debateHistory}\n\nEVIDENCE SOURCE:\n${graphContext}\n\nReview the expert perspectives. Mark every claim as [VERIFIED], [PROBABLE], or [UNSUBSTANTIATED]. Flag any hallucinations.` }
      ];

      const result = await streamText({
        model: providerInstance(modelId) as any,
        messages,
        temperature: 0.2,
      });

      for await (const chunk of result.textStream) {
        realityReport += chunk;
      }
      yield { type: "critique", persona: "Reality Checker", content: realityReport };
    }

    // 5. Final Synthesis
    yield { type: "thinking", content: "Compiling high-fidelity synthesis report..." };
    const finalMessages: any[] = [
      { role: "system", content: "You are the Jax Synthesis Engine. Consolidate expert perspectives and the Reality Checker's report into a final evidence-based conclusion." },
      { role: "user", content: `QUERY: ${query}\n\nEXPERT VIEWS:\n${perspectives.map(p => `${p.name}: ${p.content}`).join("\n")}\n\nREALITY CHECK:\n${realityReport}\n\nFinal Report Requirements:\n1. Key Consensus\n2. Flagged Risks/Unsubstantiated Claims\n3. Final Recommendation grounded in evidence.` }
    ];

    let finalSynthesis = "";
    const result = await streamText({
        model: providerInstance(modelId) as any,
        messages: finalMessages,
        temperature: 0.4,
    });

    for await (const chunk of result.textStream) {
        finalSynthesis += chunk;
        yield { type: "synthesis", content: chunk };
    }

    yield { type: "done", content: finalSynthesis };

  } catch (e) {
    yield { type: "error", content: e instanceof Error ? e.message : String(e) };
  }
}
