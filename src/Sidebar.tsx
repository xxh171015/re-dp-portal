import { useMemo, useState } from "react";
import { PanelSearchIcon, PlusIcon, Wordmark } from "./icons";
import { navigate } from "./route";
import { groupSessions, type ChatSession } from "./sessions";

type SidebarProps = {
  sessions: ChatSession[];
  activeId: string | null;
  onNewChat: () => void;
};

export function Sidebar({ sessions, activeId, onNewChat }: SidebarProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return sessions;
    return sessions.filter((session) => session.title.includes(needle));
  }, [query, sessions]);
  const groups = groupSessions(filtered);

  return (
    <aside className="ds-sidebar">
      <div className="ds-sidebar-top">
        <a className="topbar-brand" href="/" aria-label="deepseek">
          <Wordmark />
        </a>
        <div className="ds-sidebar-tools">
          <button
            type="button"
            className="ds-icon-btn"
            aria-label="搜索会话"
            aria-pressed={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <PanelSearchIcon />
          </button>
          <button type="button" className="ds-icon-btn" aria-label="新对话" onClick={onNewChat}>
            <PlusIcon />
          </button>
        </div>
      </div>

      <button type="button" className="ds-new-chat" onClick={onNewChat}>
        <PlusIcon />
        开启新对话
      </button>

      {searchOpen
        ? (
          <input
            className="ds-session-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索会话"
            aria-label="搜索会话"
          />
        )
        : null}

      <nav className="ds-history" aria-label="会话历史">
        {groups.map((group) => (
          <section key={group.label} className="ds-history-group">
            <h2>{group.label}</h2>
            {group.sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={session.id === activeId ? "ds-history-item active" : "ds-history-item"}
                onClick={() => navigate(`/chat/${session.id}`)}
              >
                {session.title}
              </button>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}
