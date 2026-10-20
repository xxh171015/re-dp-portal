import { useState } from "react";
import { MarkdownBody } from "./MarkdownBody";
import { SparkleIcon } from "./icons";
import type { AssistantMessage, ProcessStep } from "./process";

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function favicon(url: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=32`;
}

function SearchCard({ step }: { step: Extract<ProcessStep, { type: "search" }> }) {
  const count = step.sources.length;
  const preview = step.sources.slice(0, 5);
  return (
    <details className="ds-search-card">
      <summary>
        <span className="ds-search-label">
          {step.pending ? "正在搜索网页" : `搜索到 ${count} 个网页`}
        </span>
        <span className="ds-favicons">
          {preview.map((source) => (
            <img key={source.url} src={favicon(source.url)} alt="" />
          ))}
        </span>
      </summary>
      {count
        ? (
          <ul>
            {step.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
              </li>
            ))}
          </ul>
        )
        : null}
    </details>
  );
}

export function AssistantTurn({
  message,
  streaming,
}: {
  message: AssistantMessage;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(true);
  const hasProcess = message.steps.some((step) => (
    step.type === "thinking" ? step.text.trim().length > 0 : true
  ));
  const thinkingOpen = streaming && !message.text && !message.error;

  return (
    <article className="assistant-turn">
      {hasProcess
        ? (
          <details
            className="ds-think"
            open={open}
            onToggle={(event) => setOpen(event.currentTarget.open)}
          >
            <summary>
              <SparkleIcon />
              <span>{thinkingOpen ? "正在思考" : "已深度思考"}</span>
            </summary>
            <div className="ds-think-body">
              {message.steps.map((step, index) => (
                step.type === "thinking"
                  ? <MarkdownBody key={`t-${index}`} className="ds-think-text" text={step.text} />
                  : <SearchCard key={`s-${index}`} step={step} />
              ))}
            </div>
          </details>
        )
        : null}
      {message.text ? <MarkdownBody className="answer" text={message.text} /> : null}
      {message.error ? <p className="chat-error">{message.error}</p> : null}
    </article>
  );
}
