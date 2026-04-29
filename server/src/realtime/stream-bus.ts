import { StreamEventSchema, type StreamEvent } from "@fakeradio/shared";

export type StreamClient = {
  send(message: string): void;
};

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
      for (const client of clients) {
        try {
          client.send(message);
        } catch {
          clients.delete(client);
        }
      }
    }
  };
}
