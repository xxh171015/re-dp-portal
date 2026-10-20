import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  buildMessagesBody,
  createAnthropicReducer,
  parseSseDataFrames,
  type ChatTurn,
  type ClientEvent,
  type ThinkingReplay,
} from "./deepseek.ts";

type Env = Record<string, string>;

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isThinkingReplay(value: unknown): value is ThinkingReplay {
  if (!value || typeof value !== "object") return false;
  const row = value as ThinkingReplay;
  return typeof row.text === "string" && typeof row.signature === "string";
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as ChatTurn;
  if (!(turn.role === "user" || turn.role === "assistant") || typeof turn.content !== "string") return false;
  if (turn.thinkingBlocks && !turn.thinkingBlocks.every(isThinkingReplay)) return false;
  return true;
}

async function handleChat(req: IncomingMessage, res: ServerResponse, env: Env) {
  if (req.method === "GET" && req.url?.startsWith("/api/health")) {
    json(res, 200, {
      ok: true,
      configured: Boolean(env.DEEPSEEK_API_KEY),
      model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    });
    return true;
  }

  if (!req.url?.startsWith("/api/chat")) return false;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return true;
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    json(res, 503, {
      error: "未配置 DEEPSEEK_API_KEY。在项目根目录创建 .env 后重启 npm run dev。",
    });
    return true;
  }

  let payload: { messages?: unknown; thinking?: unknown; search?: unknown };
  try {
    payload = JSON.parse(await readBody(req)) as typeof payload;
  } catch {
    json(res, 400, { error: "请求体不是合法 JSON" });
    return true;
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.filter(isChatTurn) : [];
  if (!messages.length || messages.at(-1)?.role !== "user") {
    json(res, 400, { error: "需要至少一条 user 消息" });
    return true;
  }

  const body = buildMessagesBody(messages, {
    thinking: payload.thinking === true,
    search: payload.search !== false,
  }, env.DEEPSEEK_MODEL || DEFAULT_MODEL);

  const base = (env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const endpoint = `${base}/v1/messages`;
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    json(res, 502, { error: error instanceof Error ? error.message : "无法连接 DeepSeek API" });
    return true;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    json(res, upstream.status, {
      error: detail.slice(0, 800) || `DeepSeek API ${upstream.status}`,
    });
    return true;
  }

  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");

  const reducer = createAnthropicReducer();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const write = (event: ClientEvent) => {
    if (finished && event.type !== "done") return;
    res.write(`${JSON.stringify(event)}\n`);
    if (event.type === "done" || event.type === "error") finished = true;
  };

  try {
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\n\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        for (const frame of parseSseDataFrames(`${part}\n\n`)) {
          for (const event of reducer.push(frame)) write(event);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const frame of parseSseDataFrames(`${buffer}\n\n`)) {
        for (const event of reducer.push(frame)) write(event);
      }
    }
    if (!finished) write({ type: "done" });
  } catch (error) {
    write({
      type: "error",
      message: error instanceof Error ? error.message : "读取官方流失败",
    });
  } finally {
    res.end();
  }
  return true;
}

export function deepseekChatProxy(env: Env): Plugin {
  return {
    name: "deepseek-chat-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) {
          next();
          return;
        }
        try {
          const handled = await handleChat(req, res, env);
          if (!handled) next();
        } catch (error) {
          if (!res.headersSent) {
            json(res, 500, { error: error instanceof Error ? error.message : "本地代理失败" });
          } else {
            res.end();
          }
        }
      });
    },
  };
}
