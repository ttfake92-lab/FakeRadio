import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NeteaseFetchJson } from "./netease-http-client.js";

/** 进程内全局：避免多个 NeteaseAuthService 实例（或异常重复调度）时重复打 /login/qr/check */
const neteaseQrCheckInFlightByUnikey = new Map<string, Promise<NeteaseQrLoginCheck>>();

/** @internal 仅单测清理 Map，避免用例间泄漏 */
export function clearNeteaseQrCheckInFlightForTests(): void {
  neteaseQrCheckInFlightByUnikey.clear();
}

export type NeteaseCookieStore = {
  read: () => Promise<string | null>;
  save: (cookie: string) => Promise<void>;
  clear: () => Promise<void>;
};

export type NeteaseQrLoginChallenge = {
  key: string;
  qrImageUrl: string;
  qrUrl?: string;
};

export type NeteaseQrLoginCheck = {
  code: number;
  message: string;
  loggedIn: boolean;
  cookieSaved: boolean;
};

export type NeteaseLoginStatus = {
  loggedIn: boolean;
  cookieStored: boolean;
  nickname?: string;
  userId?: number;
  message?: string;
};

type NeteaseQrKeyResponse = {
  data?: {
    unikey?: string;
  };
};

type NeteaseQrCreateResponse = {
  data?: {
    qrimg?: string;
    qrurl?: string;
  };
};

type NeteaseQrCheckResponse = {
  code?: number;
  message?: string;
  cookie?: string;
  data?: {
    code?: number;
    message?: string;
    cookie?: string;
  };
};

type NeteaseLoginStatusResponse = {
  data?: {
    account?: unknown;
    profile?: {
      nickname?: string;
      userId?: number;
    } | null;
  };
  profile?: {
    nickname?: string;
    userId?: number;
  } | null;
};

export function createNeteaseCookieStore(cookieFile: string): NeteaseCookieStore {
  return {
    async read() {
      try {
        const cookie = (await readFile(cookieFile, "utf-8")).trim();
        return cookie.length > 0 ? cookie : null;
      } catch {
        return null;
      }
    },

    async save(cookie) {
      await mkdir(dirname(cookieFile), { recursive: true });
      await writeFile(cookieFile, cookie.trim(), "utf-8");
    },

    async clear() {
      await rm(cookieFile, { force: true });
    }
  };
}

export function createNeteaseAuthService(input: {
  fetchJson: NeteaseFetchJson;
  cookieStore: NeteaseCookieStore;
}) {
  const { fetchJson, cookieStore } = input;

  async function checkQrLoginOnce(key: string): Promise<NeteaseQrLoginCheck> {
    try {
      /** 仅 key+timestamp；部分 fork 对额外 query（如 noCookie）路由更严，会先试极简参数 */
      const queryMinimal = { key, timestamp: Date.now() };
      /** 与 fetchJson 的 noCookie 选项（不发送 Cookie 头）独立；部分上游文档要求在 query 里带 noCookie=true */
      const queryWithNoCookieParam = { ...queryMinimal, noCookie: "true" as const };
      const queryVariants = [
        { label: "minimal" as const, base: queryMinimal },
        { label: "noCookieQuery" as const, base: queryWithNoCookieParam }
      ];

      let response: NeteaseQrCheckResponse | undefined;
      let lastQrCheckError: unknown;
      attemptLoop: for (const { label: variantLabel, base } of queryVariants) {
        for (const method of ["GET", "POST"] as const) {
          try {
            response = (await fetchJson("/login/qr/check", {
              method,
              noCookie: true,
              query: { ...base, timestamp: Date.now() }
            })) as NeteaseQrCheckResponse;
            break attemptLoop;
          } catch (e) {
            lastQrCheckError = e;
            const is404 =
              e instanceof Error && /Netease HTTP request failed:\s*404\b/.test(e.message);
            if (is404) {
              continue;
            }
            throw e;
          }
        }
      }

      if (response === undefined) {
        throw lastQrCheckError;
      }
      const code =
        typeof response.code === "number"
          ? response.code
          : typeof response.data?.code === "number"
            ? response.data.code
            : 0;
      const message = response.message ?? response.data?.message ?? "等待扫码确认";
      const cookieStr = response.cookie ?? response.data?.cookie;
      if (code === 8821) {
        return {
          code,
          message: "网易云已封禁网页版扫码登录，请改用下方「手动注入 Cookie」方式",
          loggedIn: false,
          cookieSaved: false
        };
      }
      const loggedIn = code === 803 && typeof cookieStr === "string" && cookieStr.length > 0;
      if (loggedIn && cookieStr) {
        await cookieStore.save(cookieStr);
      }

      return {
        code,
        message,
        loggedIn,
        cookieSaved: loggedIn
      };
    } catch (error) {
      return {
        code: 0,
        message: error instanceof Error ? error.message : "网易云扫码登录检查失败",
        loggedIn: false,
        cookieSaved: false
      };
    }
  }

  return {
    async getStatus(): Promise<NeteaseLoginStatus> {
      const cookie = await cookieStore.read();
      if (cookie === null) {
        return { loggedIn: false, cookieStored: false, message: "尚未保存网易云登录 cookie" };
      }

      try {
        const response = (await fetchJson("/login/status", {
          method: "POST",
          noCookie: cookie === null,
          query: {
            timestamp: Date.now()
          }
        })) as NeteaseLoginStatusResponse;
        const profile = response.data?.profile ?? response.profile ?? null;
        return {
          loggedIn: profile !== null || cookie !== null,
          cookieStored: true,
          ...(profile?.nickname ? { nickname: profile.nickname } : {}),
          ...(typeof profile?.userId === "number" ? { userId: profile.userId } : {}),
          ...(profile === null ? { message: "已保存网易云 cookie，后续音乐请求会带登录态。" } : {})
        };
      } catch (error) {
        return {
          loggedIn: false,
          cookieStored: true,
          message: error instanceof Error ? error.message : "网易云登录状态检查失败"
        };
      }
    },

    async createQrLogin(): Promise<NeteaseQrLoginChallenge> {
      const timestamp = Date.now();
      const keyResponse = (await fetchJson("/login/qr/key", {
        method: "POST",
        noCookie: true,
        query: { timestamp }
      })) as NeteaseQrKeyResponse;
      const key = keyResponse.data?.unikey;
      if (!key) {
        throw new Error("Netease QR login key missing");
      }

      const qrResponse = (await fetchJson("/login/qr/create", {
        method: "POST",
        noCookie: true,
        query: {
          key,
          qrimg: "true",
          timestamp: Date.now()
        }
      })) as NeteaseQrCreateResponse;
      const qrImageUrl = qrResponse.data?.qrimg;
      if (!qrImageUrl) {
        throw new Error("Netease QR login image missing");
      }

      return {
        key,
        qrImageUrl,
        ...(qrResponse.data?.qrurl ? { qrUrl: qrResponse.data.qrurl } : {})
      };
    },

    async checkQrLogin(key: string): Promise<NeteaseQrLoginCheck> {
      const k = key.trim();
      let inflight = neteaseQrCheckInFlightByUnikey.get(k);
      if (inflight === undefined) {
        let resolveResult!: (value: NeteaseQrLoginCheck) => void;
        inflight = new Promise<NeteaseQrLoginCheck>((resolve) => {
          resolveResult = resolve;
        });
        neteaseQrCheckInFlightByUnikey.set(k, inflight);
        queueMicrotask(() => {
          void checkQrLoginOnce(k)
            .then(resolveResult)
            .catch((err: unknown) => {
              resolveResult({
                code: 0,
                message: err instanceof Error ? err.message : "网易云扫码登录检查失败",
                loggedIn: false,
                cookieSaved: false
              });
            })
            .finally(() => {
              neteaseQrCheckInFlightByUnikey.delete(k);
            });
        });
      }
      return inflight;
    },

    async saveCookie(cookie: string) {
      await cookieStore.save(cookie);
    },

    async logout() {
      await cookieStore.clear();
      return { loggedIn: false, cookieStored: false };
    }
  };
}

export type NeteaseAuthService = ReturnType<typeof createNeteaseAuthService>;
