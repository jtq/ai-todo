import { describe, expect, it } from "vitest";
import { encodeBase62 } from "./id.js";

describe("encodeBase62", () => {
  it("encodes short incrementing IDs", () => {
    expect(encodeBase62(1)).toBe("1");
    expect(encodeBase62(9)).toBe("9");
    expect(encodeBase62(10)).toBe("A");
    expect(encodeBase62(35)).toBe("Z");
    expect(encodeBase62(36)).toBe("a");
    expect(encodeBase62(61)).toBe("z");
    expect(encodeBase62(62)).toBe("10");
    expect(encodeBase62(3843)).toBe("zz");
    expect(encodeBase62(3844)).toBe("100");
  });
});
