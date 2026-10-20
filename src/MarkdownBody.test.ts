import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownBody } from "./MarkdownBody";

const sample = `I'll caveat that different sources vary.

## 上海天气概况（据中国天气网、中央气象台数据）

**当前实况**
- 天气：小雨、阴天
- 气温：约 21℃

**今天（19日）**：阵雨转阴，气温 21～24℃。

| 日期 | 天气 | 气温 | 风力 |
|---|---|---|---|
| 20日（明天） | 小雨 | 17～28℃ | <3级 |
`;

describe("MarkdownBody", () => {
  it("renders headings, emphasis, lists, and tables instead of raw markers", () => {
    const html = renderToStaticMarkup(createElement(MarkdownBody, { text: sample, className: "answer" }));
    expect(html).toContain("<h2>");
    expect(html).toContain("上海天气概况");
    expect(html).toContain("<strong>");
    expect(html).toContain("<table>");
    expect(html).toContain("<li>");
    expect(html).not.toContain("**当前实况**");
    expect(html).not.toContain("## 上海天气概况");
  });
});
