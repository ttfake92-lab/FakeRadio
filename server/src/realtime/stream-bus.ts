import { StreamEventSchema, type StreamEvent } from "@fakeradio/shared";

export type StreamClient = {
  send(message: string): void;
};

export type StreamBroadcaster = ReturnType<typeof createStreamBroadcaster>;

export function createStreamBroadcaster() {
  const clients = new Set<StreamClient>();

  return {
    add(client: StreamClient) {
      clients.add(client);
      return () => {
        clients.delete(client);
      };
    },
    broadcast(event: StreamEvent) {
      const message = JSON.stringify(StreamEventSchema.parse(event));
      const dead: StreamClient[] = [];
      for (const client of clients) {
        try {
          client.send(message);
        } catch {
          dead.push(client);
        }
      }
      for (const client of dead) {
        clients.delete(client);
      }
    }
  };
}
