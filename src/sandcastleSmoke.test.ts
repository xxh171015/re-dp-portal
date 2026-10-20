import { describe, expect, it } from "vitest";
import { SANDCASTLE_SMOKE } from "./sandcastleSmoke";

describe("SANDCASTLE_SMOKE", () => {
  it('equals "ok"', () => {
    expect(SANDCASTLE_SMOKE).toBe("ok");
  });
});
