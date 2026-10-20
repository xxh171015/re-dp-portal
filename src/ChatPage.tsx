import { useEffect, useRef, useState } from "react";
import { AssistantTurn } from "./AssistantTurn";
import { DEFAULT_COMPOSER_MODE, parseChatSearch, type ComposerMode } from "./chatUrl";
import { Wordmark } from "./icons";
import { applyClientEvent, emptyAssistant, thinkingBlocksForReplay, type ChatMessage } from "./process";
import { QueryComposer } from "./QueryComposer";
import { navigate } from "./route";
import {
  createSession,
  getSession,
  saveSession,
  titleFromQuery,
  useSessions,
} from "./sessions";
import { Sidebar } from "./Sidebar";
import type { ChatTurn } from "../server/deepseek";

async function readNdjson(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
) {
  if (!response.body) throw new Error("本地服务没有返回流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as Record<string, unknown>);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as Record<string, unknown>);
}

function historyFrom(messages: ChatMessage[]): ChatTurn[] {
  const history: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role === "user") history.push({ role: "user", content: message.text });
    else if (message.text) {
      history.push({
        role: "assistant",
        content: message.text,
        thinkingBlocks: thinkingBlocksForReplay(message),
      });
    }
  }
  return history;
}

type ChatPageProps = {
  sessionId: string | null;
};

export function ChatPage({ sessionId }: ChatPageProps) {
  const sessions = useSessions();
  const stored = sessionId ? getSession(sessionId) : undefined;
  const initial = parseChatSearch(window.location.search);
  const [mode, setMode] = useState<ComposerMode>(stored?.mode ?? initial.mode);
  const [messages, setMessages] = useState<ChatMessage[]>(stored?.messages ?? []);
  const [busy, setBusy] = useState(false);
  const activeId = useRef(sessionId);
  const started = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionId === activeId.current) return;
    activeId.current = sessionId;
    const next = sessionId ? getSession(sessionId) : undefined;
    setMode(next?.mode ?? DEFAULT_COMPOSER_MODE);
    setMessages(next?.messages ?? []);
    setBusy(false);
  }, [sessionId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    const title = stored?.title ?? (messages.find((row) => row.role === "user")?.text ?? "新对话");
    document.title = `${title} | DeepSeek`;
  }, [messages, stored?.title]);

  function persist(nextMessages: ChatMessage[], nextMode: ComposerMode, id: string) {
    const existing = getSession(id);
    saveSession({
      id,
      title: existing?.title || titleFromQuery(nextMessages.find((row) => row.role === "user")?.text ?? "新对话"),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      mode: nextMode,
      messages: nextMessages,
    });
  }

  async function ask(text: string, nextMode = mode) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMode(nextMode);

    let id = activeId.current;
    if (!id) {
      const created = createSession({ title: titleFromQuery(trimmed), mode: nextMode });
      id = created.id;
      activeId.current = id;
      navigate(`/chat/${id}`, true);
    }

    const user: ChatMessage = { id: crypto.randomUUID(), role: "user", text: trimmed };
    const assistant = emptyAssistant(crypto.randomUUID());
    const pending = [...messages, user, assistant];
    setMessages(pending);
    persist(pending, nextMode, id);
    setBusy(true);

    const history = [...historyFrom(messages), { role: "user" as const, content: trimmed }];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history,
          thinking: nextMode.thinking,
          search: nextMode.search,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
      }

      let latest = pending;
      await readNdjson(response, (event) => {
        setMessages((current) => {
          const copy = [...current];
          const last = copy.at(-1);
          if (!last || last.role !== "assistant") return current;
          copy[copy.length - 1] = applyClientEvent(last, event as Parameters<typeof applyClientEvent>[1]);
          latest = copy;
          return copy;
        });
      });
      persist(latest, nextMode, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提问失败";
      setMessages((current) => {
        const copy = [...current];
        const last = copy.at(-1);
        if (last?.role === "assistant") {
          copy[copy.length - 1] = { ...last, error: message };
          persist(copy, nextMode, id);
          return copy;
        }
        return current;
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (sessionId) return;
    if (!initial.autosend || !initial.query) return;
    const stamp = `autosend:${window.location.search}`;
    if (started.current || sessionStorage.getItem(stamp)) return;
    started.current = true;
    sessionStorage.setItem(stamp, "1");
    void ask(initial.query, initial.mode);
    // Landing query should only auto-send once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function newChat() {
    if (busy) return;
    navigate("/chat");
  }

  const last = messages.at(-1);
  const streaming = busy && last?.role === "assistant";

  return (
    <div className="ds-shell">
      <Sidebar sessions={sessions} activeId={sessionId ?? activeId.current} onNewChat={newChat} />
      <section className="ds-main">
        <header className="chat-topbar">
          <a className="topbar-brand" href="/" aria-label="deepseek">
            <Wordmark />
          </a>
          <button type="button" className="ghost-link as-button" onClick={newChat}>新对话</button>
        </header>

        <div className="chat-scroll" ref={scroller}>
          <div className="chat-column">
            {messages.map((message, index) => (
              message.role === "user"
                ? <div className="user-bubble" key={message.id}>{message.text}</div>
                : (
                  <AssistantTurn
                    key={message.id}
                    message={message}
                    streaming={Boolean(streaming && index === messages.length - 1)}
                  />
                )
            ))}
          </div>
        </div>

        <div className="chat-composer">
          <QueryComposer
            key={sessionId ?? "new"}
            variant="dock"
            placeholder="DeepSeek 发送消息"
            initialMode={mode}
            openUrl={(url) => {
              const next = parseChatSearch(url.slice(url.indexOf("?")));
              void ask(next.query, next.mode);
            }}
          />
        </div>
      </section>
    </div>
  );
}
