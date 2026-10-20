import { QueryComposer } from "./QueryComposer";
import { ChatPage } from "./ChatPage";
import { Wordmark } from "./icons";
import { parseAppPath, useLocationHref } from "./route";

function LandingPage() {
  return (
    <div className="page">
      <header className="topbar">
        <a className="topbar-brand" href="/" aria-label="deepseek">
          <Wordmark />
        </a>
        <div className="topbar-actions">
          <a className="ghost-link" href="/chat">本地对话</a>
          <div className="lang-switch" aria-label="语言">
            <button type="button" className="lang active">
              中文
            </button>
            <button type="button" className="lang" disabled>
              EN
            </button>
          </div>
        </div>
      </header>

      <main className="hero">
        <p className="banner">
          本机查询入口，回答由官方 DeepSeek API 生成。深度思考与智能搜索会随问题一并送到本地服务。
        </p>
        <h1 className="slogan">探索未至之境</h1>
        <QueryComposer />
      </main>
    </div>
  );
}

export default function App() {
  const href = useLocationHref();
  const location = parseAppPath(new URL(href, "http://local.invalid").pathname);
  return location.kind === "chat"
    ? <ChatPage sessionId={location.sessionId} />
    : <LandingPage />;
}
