export const QUERY_MAX_LENGTH = 800;

export type ComposerMode = {
  thinking: boolean;
  search: boolean;
};

export const DEFAULT_COMPOSER_MODE: ComposerMode = {
  thinking: false,
  search: true,
};

export function normalizeQuery(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

export function canSubmitQuery(raw: string): boolean {
  return normalizeQuery(raw).length > 0;
}

/** Local chat entry. Official API is called by the Vite /api/chat proxy. */
export function buildChatUrl(raw: string, mode: ComposerMode): string | null {
  const q = normalizeQuery(raw);
  if (!q) return null;

  const url = new URL("/chat", "http://local.invalid");
  url.searchParams.set("q", q);
  url.searchParams.set("autosend", "1");
  url.searchParams.set("source", "landing");
  url.searchParams.set("search", mode.search ? "1" : "0");
  url.searchParams.set("thinking", mode.thinking ? "1" : "0");
  return `${url.pathname}${url.search}`;
}

export function parseChatSearch(search: string): { query: string; mode: ComposerMode; autosend: boolean } {
  const params = new URLSearchParams(search);
  return {
    query: params.get("q") ?? "",
    autosend: params.get("autosend") === "1",
    mode: {
      thinking: params.get("thinking") === "1",
      search: params.get("search") !== "0",
    },
  };
}
