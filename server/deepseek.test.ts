import { describe, expect, it } from "vitest";
import { DEFAULT_SYSTEM, buildMessagesBody, createAnthropicReducer, parseSseDataFrames } from "./deepseek";

describe("buildMessagesBody", () => {
  it("enables thinking effort and omits search tools when asked", () => {
    const body = buildMessagesBody(
      [{ role: "user", content: "上海今日天气" }],
      { thinking: true, search: false },
    );
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.output_config).toEqual({ effort: "high" });
    expect(body.system).toBe(DEFAULT_SYSTEM);
    expect(body.tools).toBeUndefined();
  });

  it("attaches the official web_search server tool", () => {
    const body = buildMessagesBody(
      [{ role: "user", content: "hello" }],
      { thinking: false, search: true },
    );
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.tools).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 5 },
    ]);
  });
});

describe("anthropic stream reducer", () => {
  it("maps thinking, search sources, and text", () => {
    const sse = [
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"先搜天气\"}}\n",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"再回答\"}}\n",
      "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"server_tool_use\",\"name\":\"web_search\"}}\n",
      "data: {\"type\":\"content_block_start\",\"index\":2,\"content_block\":{\"type\":\"web_search_tool_result\",\"content\":[{\"type\":\"web_search_result\",\"url\":\"https://weather.test\",\"title\":\"上海天气\"}]}}\n",
      "data: {\"type\":\"content_block_start\",\"index\":3,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"再整理\"}}\n",
      "data: {\"type\":\"content_block_start\",\"index\":4,\"content_block\":{\"type\":\"text\",\"text\":\"阴有短时阵雨\"}}\n",
      "data: {\"type\":\"message_stop\"}\n",
    ].join("\n");

    const reducer = createAnthropicReducer();
    const events = parseSseDataFrames(sse).flatMap((frame) => reducer.push(frame));
    expect(events).toEqual([
      { type: "thinking", delta: "先搜天气" },
      { type: "thinking", delta: "再回答" },
      { type: "search_start" },
      { type: "search", sources: [{ url: "https://weather.test", title: "上海天气" }] },
      { type: "thinking", delta: "再整理" },
      { type: "text", delta: "阴有短时阵雨" },
      { type: "done" },
    ]);
  });
});
