export const DEFAULT_MODEL = "deepseek-flash";
export const DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic";

/** Keep thinking and answers in Simplified Chinese, matching the official chat UI. */
export const DEFAULT_SYSTEM =
  "思考过程和最终回答都使用简体中文。思考过程写成给用户看的中文步骤或短句，不要使用英文，不要写 The user asks、I should、Let me 这类内心独白。";

export type ThinkingReplay = {
  text: string;
  signature: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  thinkingBlocks?: ThinkingReplay[];
};

export type ChatMode = {
  thinking: boolean;
  search: boolean;
};

export type SearchSource = {
  url: string;
  title: string;
};

export type ClientEvent =
  | { type: "thinking"; delta: string }
  | { type: "signature"; value: string }
  | { type: "search_start" }
  | { type: "search"; sources: SearchSource[] }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

type TextBlock = { type: "text"; text: string };
type ThinkingBlock = { type: "thinking"; thinking: string; signature: string };
type MessageContent = TextBlock | ThinkingBlock;

export type MessagesBody = {
  model: string;
  max_tokens: number;
  stream: true;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: MessageContent[] }>;
  thinking: { type: "enabled" | "disabled" };
  output_config?: { effort: "high" };
  tools?: Array<{ type: "web_search_20250305"; name: "web_search"; max_uses: number }>;
};

function assistantContent(turn: ChatTurn): MessageContent[] {
  const blocks: MessageContent[] = [];
  for (const part of turn.thinkingBlocks ?? []) {
    if (!part.signature || !part.text) continue;
    blocks.push({ type: "thinking", thinking: part.text, signature: part.signature });
  }
  blocks.push({ type: "text", text: turn.content });
  return blocks;
}

export function buildMessagesBody(
  turns: ChatTurn[],
  mode: ChatMode,
  model = DEFAULT_MODEL,
): MessagesBody {
  const body: MessagesBody = {
    model,
    max_tokens: 8192,
    stream: true,
    system: DEFAULT_SYSTEM,
    messages: turns.map((turn) => ({
      role: turn.role,
      content: turn.role === "assistant" ? assistantContent(turn) : [{ type: "text", text: turn.content }],
    })),
    thinking: { type: mode.thinking ? "enabled" : "disabled" },
  };
  if (mode.thinking) body.output_config = { effort: "high" };
  if (mode.search) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }
  return body;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sourcesFromBlock(block: Record<string, unknown> | null): SearchSource[] {
  if (!block) return [];
  const content = Array.isArray(block.content) ? block.content : [];
  const sources: SearchSource[] = [];
  const seen = new Set<string>();
  for (const item of content) {
    const row = asRecord(item);
    if (!row || row.type !== "web_search_result" || typeof row.url !== "string" || !row.url) continue;
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    sources.push({
      url: row.url,
      title: typeof row.title === "string" && row.title.trim() ? row.title : row.url,
    });
  }
  return sources;
}

export function createAnthropicReducer() {
  const blockType = new Map<number, string>();
  return {
    push(event: Record<string, unknown>): ClientEvent[] {
      const out: ClientEvent[] = [];
      if (event.type === "content_block_start") {
        const index = typeof event.index === "number" ? event.index : -1;
        const block = asRecord(event.content_block);
        const type = typeof block?.type === "string" ? block.type : "";
        if (index >= 0) blockType.set(index, type);
        if (type === "thinking" && typeof block?.thinking === "string" && block.thinking) {
          out.push({ type: "thinking", delta: block.thinking });
        }
        if (type === "thinking" && typeof block?.signature === "string" && block.signature) {
          out.push({ type: "signature", value: block.signature });
        }
        if (type === "text" && typeof block?.text === "string" && block.text) {
          out.push({ type: "text", delta: block.text });
        }
        if (type === "server_tool_use" && block?.name === "web_search") {
          out.push({ type: "search_start" });
        }
        if (type === "web_search_tool_result") {
          const sources = sourcesFromBlock(block);
          if (sources.length) out.push({ type: "search", sources });
        }
        return out;
      }
      if (event.type === "content_block_delta") {
        const index = typeof event.index === "number" ? event.index : -1;
        const delta = asRecord(event.delta);
        const kind = blockType.get(index);
        if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
          out.push({ type: "thinking", delta: delta.thinking });
        }
        if (delta?.type === "signature_delta" && typeof delta.signature === "string") {
          out.push({ type: "signature", value: delta.signature });
        }
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          out.push({ type: "text", delta: delta.text });
        }
        if (kind === "web_search_tool_result") {
          const sources = sourcesFromBlock(delta);
          if (sources.length) out.push({ type: "search", sources });
        }
        return out;
      }
      if (event.type === "message_stop") {
        out.push({ type: "done" });
      }
      return out;
    },
  };
}

export function parseSseDataFrames(chunk: string): Array<Record<string, unknown>> {
  const frames: Array<Record<string, unknown>> = [];
  for (const block of chunk.split(/\r?\n\r?\n/)) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) continue;
    const payload = dataLines.join("\n");
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as unknown;
      const record = asRecord(parsed);
      if (record) frames.push(record);
    } catch {
      // Ignore incomplete or non-JSON keepalives.
    }
  }
  return frames;
}
