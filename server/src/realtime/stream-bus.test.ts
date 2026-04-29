import { describe, expect, it } from "vitest";
import { createStreamBroadcaster } from "./stream-bus";

describe("stream broadcaster", () => {
  it("broadcasts serialized stream events to active clients", () => {
    const broadcaster = createStreamBroadcaster();
    const sent: string[] = [];

    broadcaster.add({
      send(message) {
        sent.push(message);
      }
    });

    broadcaster.broadcast({
      type: "diagnostic",
      payload: {
        level: "info",
        message: "connected",
        at: "2026-04-29T00:00:00.000Z"
      }
    });

    expect(sent).toEqual([
      JSON.stringify({
        type: "diagnostic",
        payload: {
          level: "info",
          message: "connected",
          at: "2026-04-29T00:00:00.000Z"
        }
      })
    ]);
  });

  it("stops broadcasting to removed clients", () => {
    const broadcaster = createStreamBroadcaster();
    const sent: string[] = [];
    const remove = broadcaster.add({
      send(message) {
        sent.push(message);
      }
    });

    remove();
    broadcaster.broadcast({
      type: "diagnostic",
      payload: {
        level: "info",
        message: "ignored",
        at: "2026-04-29T00:00:00.000Z"
      }
    });

    expect(sent).toEqual([]);
  });

  it("removes a failing client and continues broadcasting to healthy clients", () => {
    const broadcaster = createStreamBroadcaster();
    const sent: string[] = [];
    let failingSendCount = 0;

    broadcaster.add({
      send() {
        failingSendCount += 1;
        throw new Error("socket closed");
      }
    });
    broadcaster.add({
      send(message) {
        sent.push(message);
      }
    });

    const event = {
      type: "diagnostic" as const,
      payload: {
        level: "info" as const,
        message: "still delivered",
        at: "2026-04-29T00:00:00.000Z"
      }
    };

    expect(() => broadcaster.broadcast(event)).not.toThrow();
    broadcaster.broadcast(event);

    expect(failingSendCount).toBe(1);
    expect(sent).toHaveLength(2);
  });
});
