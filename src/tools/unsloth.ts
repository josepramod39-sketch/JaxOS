const STUDIO_URL = process.env.UNSLOTH_URL ?? "http://localhost:8888";
const authHeaders = () => ({
  "Content-Type": "application/json",
  ...(process.env.UNSLOTH_API_KEY ? { Authorization: `Bearer ${process.env.UNSLOTH_API_KEY}` } : {}),
});

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function* streamChat(
  messages: ChatMessage[],
  model = "unsloth/Qwen3-8B-GGUF",
): AsyncGenerator<string> {
  const res = await fetch(`${STUDIO_URL}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) throw new Error(`Unsloth error: ${res.status} ${await res.text()}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const chunk = JSON.parse(data);
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {}
    }
  }
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${STUDIO_URL}/v1/models`, { headers: authHeaders() });
    const json = (await res.json()) as { data: { id: string }[] };
    return json.data.map((m) => m.id);
  } catch {
    return [];
  }
}

export async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${STUDIO_URL}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { status?: string };
    return json.status === "healthy";
  } catch {
    return false;
  }
}
