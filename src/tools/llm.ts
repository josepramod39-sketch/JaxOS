import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";

// --- PROVIDERS ---

export const ollama = createOpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});

export const unsloth = createOpenAI({
  baseURL: process.env.UNSLOTH_URL ?? "http://localhost:8888/v1",
  apiKey: process.env.UNSLOTH_API_KEY ?? "unsloth",
});

export const lmstudio = createOpenAI({
  baseURL: "http://localhost:1234/v1",
  apiKey: "lm-studio",
});

export type Provider = "unsloth" | "ollama" | "lmstudio";

export function getProvider(name: Provider) {
  switch (name) {
    case "ollama": return ollama;
    case "unsloth": return unsloth;
    case "lmstudio": return lmstudio;
    default: return unsloth;
  }
}

// --- MODELS ---

export interface ModelInfo {
  id: string;
  provider: Provider;
}

export async function listAllModels(): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];

  // Try Ollama
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    if (res.ok) {
      const json = await res.json() as { models: { name: string }[] };
      models.push(...json.models.map(m => ({ id: m.name, provider: "ollama" as Provider })));
    }
  } catch {}

  // Try LM Studio
  try {
    const res = await fetch("http://localhost:1234/v1/models");
    if (res.ok) {
      const json = await res.json() as { data: { id: string }[] };
      models.push(...json.data.map(m => ({ id: m.id, provider: "lmstudio" as Provider })));
    }
  } catch {}

  // Try Unsloth
  try {
    const res = await fetch(`${process.env.UNSLOTH_URL ?? "http://localhost:8888"}/api/health`);
    if (res.ok) {
      const modelsRes = await fetch(`${process.env.UNSLOTH_URL ?? "http://localhost:8888"}/v1/models`, {
          headers: { Authorization: `Bearer ${process.env.UNSLOTH_API_KEY}` }
      });
      if (modelsRes.ok) {
          const json = await modelsRes.json() as { data: { id: string }[] };
          models.push(...json.data.map(m => ({ id: m.id, provider: "unsloth" as Provider })));
      }
    }
  } catch {}

  return models;
}

// --- SCHEMAS ---

export const TripleSchema = z.object({
  source: z.string().describe("The subject concept"),
  target: z.string().describe("The object concept"),
  relation: z.string().describe("The relationship between them"),
});

export const KnowledgeExtractionSchema = z.object({
  thought: z.string().describe("Step-by-step reasoning about the extraction"),
  triples: z.array(TripleSchema),
});

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

// --- CORE AGENTIC PRIMITIVES ---

export async function* streamChat(
  messages: ChatMessage[],
  modelId: string,
  provider: Provider,
  options: { temperature?: number; tools?: any } = {}
): AsyncGenerator<{ type: "text" | "tool_call"; content: string; tool_call?: any }> {
  const providerInstance = getProvider(provider);
  
  const result = await streamText({
    model: providerInstance(modelId),
    messages: messages as any,
    temperature: options.temperature ?? 0.7,
    tools: options.tools,
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      yield { type: "text", content: part.text };
    } else if (part.type === "tool-call") {
      yield { 
        type: "tool_call", 
        content: "", 
        tool_call: { 
          id: part.toolCallId, 
          name: part.toolName, 
          arguments: JSON.stringify((part as any).args) 
        } 
      };
    }
  }
}
