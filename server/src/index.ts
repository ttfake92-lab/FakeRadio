import { env } from "./config/env.js";
import { createRadioServer } from "./http/create-server.js";

const app = await createRadioServer();

await app.listen({
  port: env.FAKERADIO_SERVER_PORT,
  host: "127.0.0.1"
});

console.log(`FakeRadio server listening on http://127.0.0.1:${env.FAKERADIO_SERVER_PORT}`);

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 5_000);
  forceExit.unref();

  app.close().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error("Error during shutdown:", err);
    process.exit(1);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
