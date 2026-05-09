async function test() {
  const fetchJson = async (path, query = {}) => {
    const url = new URL(`http://127.0.0.1:3300${path.startsWith("/") ? path : `/${path}`}`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Netease HTTP request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  };

  console.log("Testing /login/status...");
  try {
    await fetchJson("/login/status");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/qr/key...");
  try {
    await fetchJson("/login/qr/key");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/qr/create...");
  try {
    await fetchJson("/login/qr/create", { key: "test" });
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/qr/check...");
  try {
    await fetchJson("/login/qr/check", { key: "test" });
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /user/account...");
  try {
    await fetchJson("/user/account");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }

  console.log("Testing /login/refresh...");
  try {
    await fetchJson("/login/refresh");
    console.log("OK");
  } catch (e) {
    console.error(e.message);
  }
}

test().catch(console.error);