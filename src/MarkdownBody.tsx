import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function safeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : "";
}

const components: Components = {
  a({ href, title, children }) {
    return <a href={href} title={title} target="_blank" rel="noreferrer">{children}</a>;
  },
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

export function MarkdownBody({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl}>
        {text}
      </Markdown>
    </div>
  );
}
