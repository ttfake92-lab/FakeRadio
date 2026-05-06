import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NeteaseFetchJson } from "./netease-http-client.js";

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
      try {
        const response = (await fetchJson("/login/qr/check", {
          method: "POST",
          noCookie: true,
          query: {
            key,
            timestamp: Date.now()
          }
        })) as NeteaseQrCheckResponse;
        const code = typeof response.code === "number" ? response.code : 0;
        const message = response.message ?? "等待扫码确认";
        const loggedIn = code === 803 && typeof response.cookie === "string" && response.cookie.length > 0;
        if (loggedIn && response.cookie) {
          await cookieStore.save(response.cookie);
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
    },

    async logout() {
      await cookieStore.clear();
      return { loggedIn: false, cookieStored: false };
    }
  };
}

export type NeteaseAuthService = ReturnType<typeof createNeteaseAuthService>;
