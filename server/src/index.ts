import { env } from "./config/env.js";
import { createRadioServer } from "./http/create-server.js";

const app = await createRadioServer();

await app.listen({
  port: env.FAKERADIO_SERVER_PORT,
  host: "127.0.0.1"
});

console.log(`FakeRadio server listening on http://127.0.0.1:${env.FAKERADIO_SERVER_PORT}`);
