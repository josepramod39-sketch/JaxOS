import { join } from "path";
import { homedir } from "os";
import { searchArxiv, fetchByArxivId } from "./arxiv.ts";
import { getCitations, getReferences } from "./semantic_scholar.ts";
import { savePaper, makeSlug } from "./journal.ts";
import { saveSkill } from "./skills.ts";
import { savePersona } from "./personas.ts";
import { saveUserProfile } from "./user_profile.ts";
import { addTriples, loadGraph } from "./graph.ts";

export const TOOLS = [
  {
    name: "search_arxiv",
    description: "Search arXiv for papers on a given topic.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        limit: { type: "number", description: "Max results (default 5)." },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_paper",
    description: "Fetch full abstract and metadata for a specific arXiv ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The arXiv ID (e.g. 2305.16300)." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_citations",
    description: "Get papers that cite a specific arXiv paper (using Semantic Scholar).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The arXiv ID." },
        limit: { type: "number", description: "Max results (default 5)." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_references",
    description: "Get papers cited by a specific arXiv paper.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The arXiv ID." },
        limit: { type: "number", description: "Max results (default 5)." },
      },
      required: ["id"],
    },
  },
  {
    name: "save_note",
    description: "Save a research note or summary to the local knowledge base.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The title of the note." },
        content: { type: "string", description: "The markdown content to save." },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "save_skill",
    description: "Save a new skill (instruction set) to the garage.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name of the skill." },
        instructions: { type: "string", description: "The detailed system prompt or instructions for the skill." },
      },
      required: ["name", "instructions"],
    },
  },
  {
    name: "save_persona",
    description: "Save a new expert persona (specialized role) to the garage.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name of the expert (e.g. Senior_Researcher)." },
        role: { type: "string", description: "The role and system instructions for this persona." },
      },
      required: ["name", "role"],
    },
  },
  {
    name: "save_distilled_skill",
    description: "Save a successful task trajectory as a reusable skill (instruction set).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name of the skill (e.g. quantum_research_workflow)." },
        instructions: { type: "string", description: "The distilled instructions or code to replicate the success." },
      },
      required: ["name", "instructions"],
    },
  },
  {
    name: "update_user_profile",
    description: "Update the user's research interests, style preferences, and long-term goals.",
    parameters: {
      type: "object",
      properties: {
        interests: { type: "array", items: { type: "string" } },
        style: { type: "string" },
        goals: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "update_graph",
    description: "Update the knowledge graph with new concepts and relations (triples).",
    parameters: {
      type: "object",
      properties: {
        triples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              target: { type: "string" },
              relation: { type: "string" }
            },
            required: ["source", "target", "relation"]
          }
        },
        paper_id: { type: "string", description: "Optional arXiv ID to link the concepts to." }
      },
      required: ["triples"]
    }
  },
  {
    name: "query_graph",
    description: "Search the knowledge graph for a concept and its related nodes.",
    parameters: {
      type: "object",
      properties: {
        concept: { type: "string", description: "The concept to search for." }
      },
      required: ["concept"]
    }
  },
  {
    name: "check_delegation_status",
    description: "Check the status of a previously delegated task to the engineering team.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The ID or filename of the delegation." }
      },
      required: ["task_id"]
    }
  },
  {
    name: "delegate_to_opencode",
    description: "Outsource a complex coding or benchmarking task to the engineering team (OpenCode).",
    parameters: {
      type: "object",
      properties: {
        task_description: { type: "string", description: "Detailed description of the code to be built or algorithm to implement." },
        target_file: { type: "string", description: "Optional filename to save the results." }
      },
      required: ["task_description"]
    }
  }
];

export async function executeTool(name: string, args: any): Promise<string> {
  switch (name) {
    case "delegate_to_opencode": {
      const logDir = join(homedir(), "jaxos", "lab", "delegations");
      await Bun.$`mkdir -p ${logDir}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const taskId = `delegation-${timestamp}`;
      const filename = `${taskId}.md`;

      // --- KARPATHY GUARDRAIL INJECTION ---
      // We automatically suggest a CLAUDE.md or rules file for the delegated workspace
      const guardrails = `
# JaxOS Lab: Karpathy Guardrails
Follow these strictly during delegation:
1. **Surgical Changes**: Minimize the diff. Fix the goal, nothing else.
2. **Simplicity First**: No speculative abstractions or new dependencies.
3. **Verifiable**: Every implementation must include a minimal test or proof of work.
`;
      
      const content = `# OpenCode Delegation\n\n**Status:** PENDING\n**Task:** ${args.task_description}\n**Target:** ${args.target_file || "N/A"}\n\n## Guardrails\n${guardrails}\n`;
      await Bun.write(join(logDir, filename), content);
      
      return `Task successfully delegated. 
TASK_ID: ${taskId}
GUARDRAILS: Karpathy-Standard injected.
Note: Run 'bun src/tools/watcher.ts' in your OpenCode terminal to see this request.`;
    }
    case "check_delegation_status": {
      const logDir = join(homedir(), "jaxos", "lab", "delegations");
      const filename = args.task_id.endsWith(".md") ? args.task_id : `${args.task_id}.md`;
      const file = Bun.file(join(logDir, filename));
      if (!(await file.exists())) return `Error: Task ID ${args.task_id} not found.`;
      
      const content = await file.text();
      if (content.includes("**Status:** COMPLETED")) {
        return `STATUS: COMPLETED\nRESULT: ${content.split("## Result")[1] || "Process finished successfully."}`;
      }
      
      return `STATUS: PENDING\nNote: The engineering team is still working on this task. Do not synthesize results yet.`;
    }
    // ... rest of cases ...
    case "search_arxiv": {
      const results = await searchArxiv(args.query, args.limit || 5);
      return JSON.stringify(results);
    }
    case "fetch_paper": {
      const paper = await fetchByArxivId(args.id);
      return JSON.stringify(paper);
    }
    case "get_citations": {
      const results = await getCitations(args.id, args.limit || 5);
      return JSON.stringify(results);
    }
    case "get_references": {
      const results = await getReferences(args.id, args.limit || 5);
      return JSON.stringify(results);
    }
    case "save_note": {
      await savePaper(makeSlug(args.title), args.content);
      return `Successfully saved note: ${args.title}`;
    }
    case "save_skill": {
      await saveSkill(makeSlug(args.name), args.instructions);
      return `Successfully saved skill: ${args.name} to the garage.`;
    }
    case "save_persona": {
      await savePersona(makeSlug(args.name), args.role);
      return `Successfully saved expert persona: ${args.name} to the garage.`;
    }
    case "save_distilled_skill": {
      await saveSkill(makeSlug(args.name), args.instructions);
      return `Successfully distilled and saved skill: ${args.name}. This is now a permanent part of your repertoire.`;
    }
    case "update_user_profile": {
      await saveUserProfile({
        researchInterests: args.interests,
        preferredStyle: args.style,
        longTermGoals: args.goals
      });
      return "User profile updated successfully.";
    }
    case "update_graph": {
      let triples: any[] = [];
      
      // 1. Handle potential JSON errors or non-standard formats
      if (typeof args === "string") {
        // Fallback for raw string output from model
        const regex = /\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\]/g;
        let match;
        while ((match = regex.exec(args)) !== null) {
          triples.push({ source: match[1], relation: match[2], target: match[3] });
        }
      } else if (Array.isArray(args.triples)) {
        triples = args.triples;
      } else if (Array.isArray(args)) {
        triples = args;
      } else if (typeof args === "object" && args !== null) {
        // Support singular "triple" or "triples"
        const data = args.triples || args.triple || args;
        if (Array.isArray(data)) {
          // Check if it's an array of strings ["S", "R", "T"]
          if (data.length === 3 && typeof data[0] === "string") {
            triples = [{ source: data[0], relation: data[1], target: data[2] }];
          } else {
            triples = data;
          }
        } else {
          triples = [data];
        }
      }

      // 2. Normalize triple fields
      const normalized = triples.map((t: any) => {
        if (Array.isArray(t) && t.length >= 3) {
          return { source: t[0], relation: t[1], target: t[2] };
        }
        return {
          source: t.source || t.concept1 || t.subject,
          target: t.target || t.concept2 || t.object,
          relation: t.relation || t.relation1 || t.predicate || "related_to"
        };
      }).filter((t: any) => t.source && t.target);

      if (normalized.length === 0) return "No valid triples found. Ensure you use: [\"source\", \"relation\", \"target\"]";

      await addTriples(normalized, args.paper_id ? { id: args.paper_id } : undefined);
      return `Knowledge graph updated with ${normalized.length} new connections.`;
    }
    case "query_graph": {
      const graph = await loadGraph();
      const concept = args.concept.toLowerCase();
      const relatedEdges = graph.edges.filter(e => 
        e.source.toLowerCase() === concept || e.target.toLowerCase() === concept
      );
      
      if (relatedEdges.length === 0) return `No connections found for "${args.concept}".`;

      const hasConflicts = relatedEdges.some(e => e.disputed);
      let response = JSON.stringify(relatedEdges);
      
      if (hasConflicts) {
        response = `⚠️ WARNING: SOME CONNECTIONS ARE DISPUTED/CONTRADICTORY\n${response}\nNote: Analyze the conflicting evidence before reaching a conclusion.`;
      }
      
      return response;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
