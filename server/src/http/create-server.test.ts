import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createRadioServer } from "./create-server.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("createRadioServer", () => {
  it("serves health, now, plan, next, taste, and chat contracts", async () => {
    app = await createRadioServer();

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().service).toBe("FakeRadio");

    const now = await app.inject({ method: "GET", url: "/api/now" });
    expect(now.statusCode).toBe(200);
    expect(now.json().playback).toBe("idle");

    const plan = await app.inject({ method: "GET", url: "/api/plan/today" });
    expect(plan.statusCode).toBe(200);
    expect(plan.json().blocks).toHaveLength(3);

    const taste = await app.inject({ method: "GET", url: "/api/taste" });
    expect(taste.statusCode).toBe(200);
    expect(taste.json().playlists[0].id).toBe("morning-soft-start");

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);
    expect(next.json().track.id).toBe("mock-track-001");

    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        message: "来点适合写代码的"
      }
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().decision.play.query).toBe("warm morning indie");
  });

  it("keeps the latest DJ speech in now after computing next", async () => {
    app = await createRadioServer();

    const next = await app.inject({ method: "GET", url: "/api/next" });
    expect(next.statusCode).toBe(200);

    const nextBody = next.json();
    const now = await app.inject({ method: "GET", url: "/api/now" });

    expect(now.statusCode).toBe(200);
    expect(now.json()).toMatchObject({
      playback: "playing",
      track: {
        id: nextBody.track.id
      },
      dj: {
        say: nextBody.decision.say,
        audioUrl: nextBody.tts.audioUrl,
        segue: nextBody.decision.segue
      }
    });
  });

  it("allows the local web app origin during development", async () => {
    app = await createRadioServer();

    const health = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "http://127.0.0.1:3002"
      }
    });

    expect(health.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3002");
  });
});
