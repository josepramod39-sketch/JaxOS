import { streamText } from "ai";
import { getProvider, type Provider, type ChatMessage } from "./llm.ts";
import { executeTool } from "./tools.ts";

export interface AgentEvent {
  type: "text" | "thought" | "tool_start" | "tool_end" | "done" | "error";
  content: string;
}

export async function* runAgentLoop(
  messages: ChatMessage[],
  modelId: string,
  provider: Provider,
  options: { temperature?: number; maxTurns?: number } = {}
): AsyncGenerator<AgentEvent> {
  const providerInstance = getProvider(provider);
  let currentMessages = [...messages];
  const maxTurns = options.maxTurns || 15;
  let turn = 0;
  const errorHistory: Record<string, string> = {};

  while (turn < maxTurns) {
    turn++;
    let fullResponse = "";
    let inThought = false;
    let lastYieldedText = "";

    try {
      const result = await streamText({
        model: providerInstance(modelId),
        messages: currentMessages as any,
        temperature: options.temperature ?? 0.7,
        system: "You follow the Hermes XML protocol: Always use <thought> blocks for internal reasoning before calling tools or answering.",
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          const text = part.text;
          fullResponse += text;

          if (fullResponse.includes("<thought>") && !inThought && !fullResponse.includes("</thought>")) {
            inThought = true;
          }

          if (inThought) {
            const thoughtMatch = fullResponse.match(/<thought>([\s\S]*)$/);
            if (thoughtMatch && thoughtMatch[1]) {
              yield { type: "thought", content: thoughtMatch[1] };
            }
            if (fullResponse.includes("</thought>")) inThought = false;
          } else {
            const textOutsideThought = fullResponse.replace(/<thought>[\s\S]*?<\/thought>/g, "").trim();
            const delta = textOutsideThought.slice(lastYieldedText.length);
            if (delta) {
              yield { type: "text", content: delta };
              lastYieldedText = textOutsideThought;
            }
          }
        }
      }

      currentMessages.push({ role: "assistant", content: fullResponse } as any);

      const toolCallRegex = /<call:(\w+)>([\s\S]*?)<\/call:\1>/g;
      let match;
      let hasToolCall = false;

      while ((match = toolCallRegex.exec(fullResponse)) !== null) {
        hasToolCall = true;
        const toolName = match[1];
        const toolArgsRaw = match[2];
        if (!toolName || !toolArgsRaw) continue;

        const argsTrimmed = toolArgsRaw.trim();
        const callSignature = `${toolName}:${argsTrimmed}`;
        
        if (errorHistory[callSignature]) {
          yield { type: "error", content: `System Roadblock: <call:${toolName}> failed repeatedly. Breaking loop.` };
          return;
        }

        yield { type: "tool_start", content: `${toolName}(${argsTrimmed})` };

        try {
          const args = JSON.parse(argsTrimmed);
          const result = await executeTool(toolName, args);
          
          currentMessages.push({
            role: "user",
            content: `<tool_response name="${toolName}">\n${result}\n</tool_response>`
          } as any);
          
          yield { type: "tool_end", content: result };
          delete errorHistory[callSignature];
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const isHardError = errorMsg.includes("EACCES") || errorMsg.includes("permission denied") || errorMsg.includes("ENOENT");
          
          if (isHardError) {
             yield { type: "error", content: `Critical System Error: ${errorMsg}. Breaking loop.` };
             return;
          }

          errorHistory[callSignature] = errorMsg;
          currentMessages.push({
            role: "user",
            content: `<tool_response name="${toolName}">\nError: ${errorMsg}\n</tool_response>`
          } as any);
          yield { type: "error", content: `Tool error: ${errorMsg}` };
        }
      }

      if (!hasToolCall) {
        yield { type: "done", content: fullResponse };
        return;
      }
    } catch (e) {
      yield { type: "error", content: e instanceof Error ? e.message : String(e) };
      return;
    }
  }

  yield { type: "error", content: "Max turns reached" };
}
