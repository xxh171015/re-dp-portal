import { describe, expect, it } from "vitest";
import { groupSessions, titleFromQuery, type ChatSession } from "./sessions";
import { DEFAULT_COMPOSER_MODE } from "./chatUrl";

function session(id: string, updatedAt: number, title = id): ChatSession {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    mode: DEFAULT_COMPOSER_MODE,
    messages: [],
  };
}

describe("groupSessions", () => {
  it("buckets today, last 30 days, then year-month", () => {
    const now = Date.parse("2026-10-19T12:00:00+08:00");
    const groups = groupSessions([
      session("today", now),
      session("week", now - 3 * 24 * 60 * 60 * 1000),
      session("old", Date.parse("2026-08-02T12:00:00+08:00")),
    ], now);
    expect(groups.map((group) => group.label)).toEqual(["今天", "30天内", "2026-08"]);
    expect(groups[0]?.sessions.map((row) => row.id)).toEqual(["today"]);
  });
});

describe("titleFromQuery", () => {
  it("uses the first line of the question", () => {
    expect(titleFromQuery("  上海今天的天气怎么样  ")).toBe("上海今天的天气怎么样");
    expect(titleFromQuery("a".repeat(30)).endsWith("…")).toBe(true);
  });
});
