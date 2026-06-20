import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNeteaseAuthService,
  createNeteaseCookieStore,
  clearNeteaseQrCheckInFlightForTests
} from "./netease-auth.js";

const tempDirs: string[] = [];

afterEach(async () => {
  clearNeteaseQrCheckInFlightForTests();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function makeCookieFile() {
  const dir = await mkdtemp(join(tmpdir(), "fakeradio-netease-auth-"));
  tempDirs.push(dir);
  return join(dir, "secrets", "netease-cookie.txt");
}

describe("createNeteaseCookieStore", () => {
  it("stores and reads a Netease cookie from a local secret file", async () => {
    const cookieFile = await makeCookieFile();
    const store = createNeteaseCookieStore(cookieFile);

    await store.save(" MUSIC_U=stored-cookie; ");

    await expect(readFile(cookieFile, "utf-8")).resolves.toBe("MUSIC_U=stored-cookie;");
    await expect(store.read()).resolves.toBe("MUSIC_U=stored-cookie;");
  });
});

describe("createNeteaseAuthService", () => {
  it("creates a QR login challenge from the local Netease service", async () => {
    const fetchJson = vi.fn()
      .mockResolvedValueOnce({ data: { unikey: "qr-key-1" } })
      .mockResolvedValueOnce({ data: { qrimg: "data:image/png;base64,abc", qrurl: "https://music.163.com/login?code=1" } });
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(await makeCookieFile())
    });

    await expect(service.createQrLogin()).resolves.toEqual({
      key: "qr-key-1",
      qrImageUrl: "data:image/png;base64,abc",
      qrUrl: "https://music.163.com/login?code=1"
    });
    expect(fetchJson).toHaveBeenNthCalledWith(1, "/login/qr/key", {
      method: "POST",
      noCookie: true,
      query: expect.objectContaining({ timestamp: expect.any(Number) })
    });
    expect(fetchJson).toHaveBeenNthCalledWith(2, "/login/qr/create", {
      method: "POST",
      noCookie: true,
      query: expect.objectContaining({
        key: "qr-key-1",
        qrimg: "true",
        timestamp: expect.any(Number)
      })
    });
  });

  it("saves the returned cookie when QR login succeeds", async () => {
    const cookieFile = await makeCookieFile();
    const fetchJson = vi.fn().mockResolvedValue({
      code: 803,
      message: "授权登录成功",
      cookie: "MUSIC_U=stored-cookie;"
    });
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(cookieFile)
    });

    await expect(service.checkQrLogin("qr-key-1")).resolves.toEqual({
      code: 803,
      message: "授权登录成功",
      loggedIn: true,
      cookieSaved: true
    });
    await expect(readFile(cookieFile, "utf-8")).resolves.toBe("MUSIC_U=stored-cookie;");
    expect(fetchJson).toHaveBeenCalledWith(
      "/login/qr/check",
      expect.objectContaining({
        method: "GET",
        noCookie: true,
        query: expect.objectContaining({ key: "qr-key-1", timestamp: expect.any(Number) })
      })
    );
    expect(fetchJson.mock.calls[0]?.[1]?.query).not.toHaveProperty("noCookie");
  });

  it("retries qr/check with POST when GET returns HTTP 404", async () => {
    const fetchJson = vi
      .fn()
      .mockRejectedValueOnce(new Error("Netease HTTP request failed: 404 Not Found"))
      .mockResolvedValueOnce({
        code: 803,
        message: "授权登录成功",
        cookie: "MUSIC_U=stored-cookie;"
      });
    const cookieFile = await makeCookieFile();
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(cookieFile)
    });

    await expect(service.checkQrLogin("qr-key-1")).resolves.toEqual({
      code: 803,
      message: "授权登录成功",
      loggedIn: true,
      cookieSaved: true
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson).toHaveBeenNthCalledWith(
      1,
      "/login/qr/check",
      expect.objectContaining({ method: "GET", noCookie: true })
    );
    expect(fetchJson).toHaveBeenNthCalledWith(
      2,
      "/login/qr/check",
      expect.objectContaining({ method: "POST", noCookie: true })
    );
    expect(fetchJson.mock.calls[0]?.[1]?.query).not.toHaveProperty("noCookie");
    expect(fetchJson.mock.calls[1]?.[1]?.query).not.toHaveProperty("noCookie");
  });

  it("retries qr/check with noCookie query after minimal GET+POST return HTTP 404", async () => {
    const fetchJson = vi
      .fn()
      .mockRejectedValueOnce(new Error("Netease HTTP request failed: 404 Not Found"))
      .mockRejectedValueOnce(new Error("Netease HTTP request failed: 404 Not Found"))
      .mockResolvedValueOnce({
        code: 803,
        message: "授权登录成功",
        cookie: "MUSIC_U=stored-cookie;"
      });
    const cookieFile = await makeCookieFile();
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(cookieFile)
    });

    await expect(service.checkQrLogin("qr-key-1")).resolves.toEqual({
      code: 803,
      message: "授权登录成功",
      loggedIn: true,
      cookieSaved: true
    });
    expect(fetchJson).toHaveBeenCalledTimes(3);
    expect(fetchJson.mock.calls[2]?.[1]?.query).toEqual(
      expect.objectContaining({ key: "qr-key-1", noCookie: "true" })
    );
  });

  it("dedupes checkQrLogin when two calls happen in the same synchronous turn", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchJson = vi.fn().mockImplementation(async () => {
      await barrier;
      return { code: 801, message: "等待扫码", cookie: "" };
    });
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(await makeCookieFile())
    });
    const a = service.checkQrLogin("sync-same-turn");
    const b = service.checkQrLogin("sync-same-turn");
    release();
    await expect(Promise.all([a, b])).resolves.toEqual([
      expect.objectContaining({ code: 801 }),
      expect.objectContaining({ code: 801 })
    ]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent checkQrLogin calls for the same unikey into one upstream poll", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchJson = vi.fn().mockImplementation(async () => {
      await barrier;
      return { code: 801, message: "等待扫码", cookie: "" };
    });
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(await makeCookieFile())
    });
    const a = service.checkQrLogin("same-unikey");
    const b = service.checkQrLogin("same-unikey");
    release();
    await expect(Promise.all([a, b])).resolves.toEqual([
      expect.objectContaining({ code: 801, message: "等待扫码" }),
      expect.objectContaining({ code: 801, message: "等待扫码" })
    ]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("returns controlled check when qr/check GET fails with HTTP error", async () => {
    const fetchJson = vi.fn().mockRejectedValue(new Error("Netease HTTP request failed: 502 Bad Gateway"));
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(await makeCookieFile())
    });

    await expect(service.checkQrLogin("qr-key-1")).resolves.toMatchObject({
      code: 0,
      message: "Netease HTTP request failed: 502 Bad Gateway",
      loggedIn: false,
      cookieSaved: false
    });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith(
      "/login/qr/check",
      expect.objectContaining({ method: "GET", noCookie: true })
    );
  });

  it("reports cookie-invalid when a stored cookie returns an empty profile payload", async () => {
    const cookieFile = await makeCookieFile();
    const store = createNeteaseCookieStore(cookieFile);
    await store.save("MUSIC_U=stored-cookie;");
    const fetchJson = vi.fn().mockResolvedValue({ data: { code: 200, account: null, profile: null } });
    const service = createNeteaseAuthService({ fetchJson, cookieStore: store });

    await expect(service.getStatus()).resolves.toMatchObject({
      status: "cookie-invalid",
      loggedIn: false,
      cookieStored: true,
      message: "已保存网易云 cookie，但当前登录状态无效，请重新注入 cookie。"
    });
  });

  it("returns a controlled check result when the local Netease service rejects QR polling", async () => {
    const fetchJson = vi.fn().mockRejectedValue(new Error("Netease QR check failed"));
    const service = createNeteaseAuthService({
      fetchJson,
      cookieStore: createNeteaseCookieStore(await makeCookieFile())
    });

    await expect(service.checkQrLogin("qr-key-1")).resolves.toEqual({
      code: 0,
      message: "Netease QR check failed",
      loggedIn: false,
      cookieSaved: false
    });
  });
});
