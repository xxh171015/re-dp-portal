import type { ClientEvent, SearchSource } from "../server/deepseek";

export type ProcessStep =
  | { type: "thinking"; text: string; signature?: string }
  | { type: "search"; sources: SearchSource[]; pending?: boolean };

export type UserMessage = { id: string; role: "user"; text: string };

export type AssistantMessage = {
  id: string;
  role: "assistant";
  steps: ProcessStep[];
  text: string;
  error?: string;
};

export type ChatMessage = UserMessage | AssistantMessage;

export function emptyAssistant(id: string): AssistantMessage {
  return { id, role: "assistant", steps: [], text: "" };
}

export function applyClientEvent(message: AssistantMessage, event: ClientEvent): AssistantMessage {
  const next: AssistantMessage = { ...message, steps: [...message.steps] };
  if (event.type === "thinking") {
    const last = next.steps.at(-1);
    if (last?.type === "thinking") {
      next.steps[next.steps.length - 1] = { ...last, text: last.text + event.delta };
    } else {
      next.steps.push({ type: "thinking", text: event.delta });
    }
    return next;
  }
  if (event.type === "signature") {
    for (let index = next.steps.length - 1; index >= 0; index -= 1) {
      const step = next.steps[index];
      if (step?.type !== "thinking") continue;
      next.steps[index] = { ...step, signature: `${step.signature ?? ""}${event.value}` };
      break;
    }
    return next;
  }
  if (event.type === "search_start") {
    const last = next.steps.at(-1);
    if (!(last?.type === "search" && last.pending)) {
      next.steps.push({ type: "search", sources: [], pending: true });
    }
    return next;
  }
  if (event.type === "search") {
    let index = -1;
    for (let i = next.steps.length - 1; i >= 0; i -= 1) {
      if (next.steps[i]?.type === "search") {
        index = i;
        break;
      }
    }
    if (index >= 0) {
      const lastSearch = next.steps[index];
      if (lastSearch?.type === "search") {
        const seen = new Set(lastSearch.sources.map((source) => source.url));
        const sources = [...lastSearch.sources];
        for (const source of event.sources) {
          if (!source.url || seen.has(source.url)) continue;
          seen.add(source.url);
          sources.push(source);
        }
        next.steps[index] = { ...lastSearch, sources, pending: false };
      }
    } else {
      next.steps.push({ type: "search", sources: event.sources, pending: false });
    }
    return next;
  }
  if (event.type === "text") {
    next.text += event.delta;
    return next;
  }
  if (event.type === "error") {
    next.error = event.message;
  }
  return next;
}

export function thinkingBlocksForReplay(message: AssistantMessage) {
  return message.steps.flatMap((step) => {
    if (step.type !== "thinking" || !step.signature || !step.text) return [];
    return [{ text: step.text, signature: step.signature }];
  });
}
