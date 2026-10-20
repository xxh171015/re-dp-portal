import { describe, expect, it } from "vitest";
import { parseAppPath } from "./route";

describe("parseAppPath", () => {
  it("treats the homepage as landing", () => {
    expect(parseAppPath("/")).toEqual({ kind: "landing" });
    expect(parseAppPath("")).toEqual({ kind: "landing" });
  });

  it("opens a new local chat or a stored session", () => {
    expect(parseAppPath("/chat")).toEqual({ kind: "chat", sessionId: null });
    expect(parseAppPath("/chat/")).toEqual({ kind: "chat", sessionId: null });
    expect(parseAppPath("/chat/abc-123")).toEqual({ kind: "chat", sessionId: "abc-123" });
  });
});
