import { describe, expect, it } from "vitest";
import { buildChatUrl, canSubmitQuery, DEFAULT_COMPOSER_MODE, parseChatSearch } from "./chatUrl";

describe("buildChatUrl", () => {
  it("returns null for empty or whitespace queries", () => {
    expect(buildChatUrl("", DEFAULT_COMPOSER_MODE)).toBeNull();
    expect(buildChatUrl("   \n  ", DEFAULT_COMPOSER_MODE)).toBeNull();
    expect(canSubmitQuery("   ")).toBe(false);
  });

  it("stays on the local chat route", () => {
    const url = buildChatUrl("什么是深度学习", {
      thinking: true,
      search: false,
    });

    expect(url).toBe(
      "/chat?q=%E4%BB%80%E4%B9%88%E6%98%AF%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0&autosend=1&source=landing&search=0&thinking=1",
    );
  });

  it("defaults search on and thinking off", () => {
    const url = new URL(buildChatUrl("hello", DEFAULT_COMPOSER_MODE)!, "http://127.0.0.1:5173");
    expect(url.pathname).toBe("/chat");
    expect(url.searchParams.get("search")).toBe("1");
    expect(url.searchParams.get("thinking")).toBe("0");
    expect(url.searchParams.get("autosend")).toBe("1");
    expect(parseChatSearch(url.search)).toEqual({
      query: "hello",
      autosend: true,
      mode: { thinking: false, search: true },
    });
  });
});
