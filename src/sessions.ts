import { useSyncExternalStore } from "react";
import type { ComposerMode } from "./chatUrl";
import { DEFAULT_COMPOSER_MODE } from "./chatUrl";
import type { ChatMessage } from "./process";

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: ComposerMode;
  messages: ChatMessage[];
};

export type SessionGroup = {
  label: string;
  sessions: ChatSession[];
};

const STORAGE_KEY = "re-dp-portal.sessions.v1";

const memory = new Map<string, string>();
let cache: ChatSession[] | null = null;
const listeners = new Set<() => void>();

function storeGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    // Private mode or blocked storage falls back to process memory.
  }
  return memory.get(key) ?? null;
}

function storeSet(key: string, value: string) {
  memory.set(key, value);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory copy when localStorage is unavailable.
  }
}

function isSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") return false;
  const row = value as ChatSession;
  return typeof row.id === "string" && typeof row.title === "string" && Array.isArray(row.messages);
}

export function readSessions(): ChatSession[] {
  if (cache) return cache;
  const raw = storeGet(STORAGE_KEY);
  if (!raw) {
    cache = [];
    return cache;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cache = Array.isArray(parsed) ? parsed.filter(isSession) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function emit(next: ChatSession[]) {
  cache = next;
  storeSet(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

export function subscribeSessions(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useSessions() {
  return useSyncExternalStore(subscribeSessions, readSessions, () => []);
}

export function createSession(input: {
  title: string;
  mode?: ComposerMode;
  messages?: ChatMessage[];
  now?: number;
}): ChatSession {
  const now = input.now ?? Date.now();
  const session: ChatSession = {
    id: crypto.randomUUID(),
    title: input.title.trim() || "新对话",
    createdAt: now,
    updatedAt: now,
    mode: input.mode ?? DEFAULT_COMPOSER_MODE,
    messages: input.messages ?? [],
  };
  emit([session, ...readSessions().filter((row) => row.id !== session.id)]);
  return session;
}

export function saveSession(session: ChatSession) {
  const now = { ...session, updatedAt: Date.now() };
  const rest = readSessions().filter((row) => row.id !== session.id);
  emit([now, ...rest]);
  return now;
}

export function getSession(id: string): ChatSession | undefined {
  return readSessions().find((row) => row.id === id);
}

function ymd(ts: number) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function yearMonth(ts: number) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Group sessions the way the official sidebar does: today, last 30 days, then calendar months. */
export function groupSessions(sessions: ChatSession[], now = Date.now()): SessionGroup[] {
  const today = ymd(now);
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const buckets = new Map<string, ChatSession[]>();
  const order: string[] = [];

  const push = (label: string, session: ChatSession) => {
    const list = buckets.get(label);
    if (list) list.push(session);
    else {
      buckets.set(label, [session]);
      order.push(label);
    }
  };

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const session of sorted) {
    if (ymd(session.updatedAt) === today) push("今天", session);
    else if (session.updatedAt >= cutoff) push("30天内", session);
    else push(yearMonth(session.updatedAt), session);
  }

  return order.map((label) => ({ label, sessions: buckets.get(label) ?? [] }));
}

export function titleFromQuery(query: string) {
  const text = query.replace(/\s+/g, " ").trim();
  return text.length > 24 ? `${text.slice(0, 24)}…` : text || "新对话";
}
