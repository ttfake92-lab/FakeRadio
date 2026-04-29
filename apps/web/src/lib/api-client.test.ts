import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiUrl, buildStreamUrl, getServerBaseUrl } from "./api-client";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("api-client", () => {
  it("uses localhost server by default", () => {
    expect(getServerBaseUrl()).toBe("http://localhost:3001");
    expect(buildApiUrl("/api/now")).toBe("http://localhost:3001/api/now");
  });

  it("builds websocket stream url from the default server", () => {
    expect(buildStreamUrl("/stream")).toBe("ws://localhost:3001/stream");
  });

  it("builds secure websocket stream url from https server", () => {
    vi.stubEnv("NEXT_PUBLIC_FAKERADIO_SERVER_URL", "https://radio.local:3443");

    expect(buildStreamUrl("/stream")).toBe("wss://radio.local:3443/stream");
  });
});
