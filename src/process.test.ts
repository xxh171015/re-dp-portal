import { describe, expect, it } from "vitest";
import { applyClientEvent, emptyAssistant } from "./process";

describe("applyClientEvent", () => {
  it("keeps thinking, search, and later thinking in order", () => {
    let message = emptyAssistant("a1");
    message = applyClientEvent(message, { type: "thinking", delta: "先搜天气。" });
    message = applyClientEvent(message, { type: "search_start" });
    message = applyClientEvent(message, {
      type: "search",
      sources: [{ url: "https://weather.test", title: "上海天气" }],
    });
    message = applyClientEvent(message, { type: "thinking", delta: "再整理。" });
    message = applyClientEvent(message, { type: "text", delta: "阴有阵雨" });
    expect(message.steps).toEqual([
      { type: "thinking", text: "先搜天气。" },
      { type: "search", sources: [{ url: "https://weather.test", title: "上海天气" }], pending: false },
      { type: "thinking", text: "再整理。" },
    ]);
    expect(message.text).toBe("阴有阵雨");
  });
});
