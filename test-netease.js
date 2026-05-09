import { createNeteaseHttpClient } from "./server/src/adapters/music/netease-http-client.js";

async function test() {
  const client = createNeteaseHttpClient({ baseUrl: "http://127.0.0.1:3300", timeoutMs: 5000 });

  console.log("Testing /login/status...");
  try {
    await client.fetchJson("/login/status");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/qr/key...");
  try {
    await client.fetchJson("/login/qr/key");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/qr/create...");
  try {
    await client.fetchJson("/login/qr/create", { key: "test" });
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/qr/check...");
  try {
    await client.fetchJson("/login/qr/check", { key: "test" });
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /user/account...");
  try {
    await client.fetchJson("/user/account");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/refresh...");
  try {
    await client.fetchJson("/login/refresh");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }
}

test().catch(console.error);