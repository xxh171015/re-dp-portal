import { useSyncExternalStore } from "react";

export type AppLocation =
  | { kind: "landing" }
  | { kind: "chat"; sessionId: string | null };

export function parseAppPath(pathname: string): AppLocation {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/chat") return { kind: "chat", sessionId: null };
  const match = path.match(/^\/chat\/([^/]+)$/);
  if (match) return { kind: "chat", sessionId: decodeURIComponent(match[1]) };
  return { kind: "landing" };
}

export function navigate(path: string, replace = false) {
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useLocationHref() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("popstate", onChange);
      return () => window.removeEventListener("popstate", onChange);
    },
    () => window.location.pathname + window.location.search,
    () => "/",
  );
}
