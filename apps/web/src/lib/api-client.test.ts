import { describe, expect, it } from "vitest";
import { buildApiUrl, getServerBaseUrl } from "./api-client";

describe("api-client", () => {
  it("uses localhost server by default", () => {
    expect(getServerBaseUrl()).toBe("http://localhost:3001");
    expect(buildApiUrl("/api/now")).toBe("http://localhost:3001/api/now");
  });
});
