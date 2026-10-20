import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  buildChatUrl,
  canSubmitQuery,
  DEFAULT_COMPOSER_MODE,
  QUERY_MAX_LENGTH,
  type ComposerMode,
} from "./chatUrl";
import { SearchIcon, SendIcon, ThinkIcon } from "./icons";

const MIN_INPUT_HEIGHT = 80;
const MAX_INPUT_HEIGHT = 300;

export type QueryComposerProps = {
  openUrl?: (url: string) => void;
  initialMode?: ComposerMode;
  variant?: "hero" | "dock";
  placeholder?: string;
};

function defaultOpenUrl(url: string) {
  window.location.assign(url);
}

export function QueryComposer({
  openUrl = defaultOpenUrl,
  initialMode = DEFAULT_COMPOSER_MODE,
  variant = "hero",
  placeholder = "问点什么，一起探索",
}: QueryComposerProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ComposerMode>(initialMode);
  const [composing, setComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minHeight = variant === "dock" ? 48 : MIN_INPUT_HEIGHT;
    const next = Math.min(MAX_INPUT_HEIGHT, Math.max(minHeight, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [query, variant]);

  function submit() {
    const url = buildChatUrl(query, mode);
    if (!url) return;
    openUrl(url);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || composing) return;
    event.preventDefault();
    submit();
  }

  function toggle(key: keyof ComposerMode) {
    setMode((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className={variant === "dock" ? "composer dock" : "composer"} onClick={() => textareaRef.current?.focus()}>
      <textarea
        ref={textareaRef}
        className="composer-input"
        rows={variant === "dock" ? 1 : 2}
        maxLength={QUERY_MAX_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
      />
      <div className="composer-toolbar">
        <div className="composer-toggles">
          <button
            type="button"
            className={mode.thinking ? "toggle selected" : "toggle"}
            aria-label="深度思考"
            aria-pressed={mode.thinking}
            onClick={(event) => {
              event.stopPropagation();
              toggle("thinking");
            }}
          >
            <ThinkIcon />
            <span>深度思考</span>
          </button>
          <button
            type="button"
            className={mode.search ? "toggle selected" : "toggle"}
            aria-label="智能搜索"
            aria-pressed={mode.search}
            onClick={(event) => {
              event.stopPropagation();
              toggle("search");
            }}
          >
            <SearchIcon />
            <span>智能搜索</span>
          </button>
        </div>
        <button
          type="button"
          className="send"
          aria-label="发送"
          onClick={(event) => {
            event.stopPropagation();
            submit();
          }}
        >
          <SendIcon />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {canSubmitQuery(query) ? "可以发送" : "输入问题后发送"}
      </span>
    </div>
  );
}
