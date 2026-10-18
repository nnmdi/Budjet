const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cash-auth-smoke-"));
  const port = 3102,
    origin = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["build/server.cjs"], {
    env: {
      ...process.env,
      NODE_ENV: "development",
      MAIL_PROVIDER: "file",
      APP_URL: origin,
      PUBLIC_APP_URL: origin,
      COOKIE_CROSS_SITE: "false",
      DATA_DIR: directory,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (x) => (output += x));
  server.stderr.on("data", (x) => (output += x));
  const send = (
    route,
    body,
    cookie,
    method = body === undefined ? "GET" : "POST",
  ) =>
    fetch(`http://127.0.0.1:${port}` + route, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const pause = () => new Promise((r) => setTimeout(r, 100));
  async function message(subject) {
    for (let i = 0; i < 40; i++) {
      try {
        for (const file of fs.readdirSync(path.join(directory, "mail"))) {
          const data = JSON.parse(
            fs.readFileSync(path.join(directory, "mail", file), "utf8"),
          );
          if (data.subject === subject) return data;
        }
      } catch {}
      await pause();
    }
    throw new Error("Expected development email was not produced.");
  }
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        ready = (await send("/api/ready")).ok;
        if (ready) break;
      } catch {}
      await pause();
    }
    assert.ok(ready, "Server failed readiness: " + output);
    const email = "smoke@example.test",
      password = "initial-password-12345",
      next = "replacement-password-12345";
    const signup = await send("/api/auth/register", {
      email,
      name: "Smoke",
      password,
      timeZone: "America/Chicago",
    });
    assert.equal(signup.status, 202);
    assert.equal(signup.headers.get("set-cookie"), null);
    assert.equal(
      (await send("/api/auth/login", { email, password })).status,
      403,
    );
    const verification = await message("Confirm your Cash Diet email");
    const token = verification.text.match(/#verify-email=([a-f0-9]{64})/)[1];
    assert.equal(
      (await send("/api/auth/verify-email", { token, password })).status,
      200,
    );
    assert.equal(
      (await send("/api/auth/verify-email", { token, password })).status,
      400,
    );
    const login = await send("/api/auth/login", { email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const workspace = await (
      await send("/api/workspace", undefined, cookie)
    ).json();
    workspace.ledger.budgets.A = {
      id: "smoke",
      name: "A",
      created: "2020-01-01",
      openingBalanceCents: 100000,
      balance: 1000,
    };
    workspace.ledger.transactions = [
      {
        id: "expense",
        budget: "A",
        date: "2020-01-01",
        type: "expense",
        amount: 100,
        description: "Smoke",
        recurrence: "one-time",
      },
    ];
    const saved = await send("/api/workspace", workspace, cookie, "PUT");
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).ledger.budgets.A.balance, 900);
    assert.equal(
      (await send("/api/auth/forgot-password", { email })).status,
      202,
    );
    const recovery = await message("Reset your Cash Diet password"),
      resetToken = recovery.text.match(/#reset-password=([a-f0-9]{64})/)[1];
    const reset = { token: resetToken, password: next, confirmPassword: next };
    assert.equal((await send("/api/auth/reset-password", reset)).status, 200);
    assert.equal((await send("/api/auth/reset-password", reset)).status, 400);
    assert.equal((await send("/api/workspace", undefined, cookie)).status, 401);
    assert.equal(
      (await send("/api/auth/login", { email, password })).status,
      401,
    );
    const again = await send("/api/auth/login", { email, password: next });
    assert.equal(again.status, 200);
    assert.equal(
      (
        await (
          await send(
            "/api/workspace",
            undefined,
            again.headers.get("set-cookie").split(";")[0],
          )
        ).json()
      ).ledger.budgets.A.balance,
      900,
    );
    await message("Your Cash Diet password was changed");
    const backup = spawnSync(
      process.execPath,
      ["build/backup.cjs", path.join(directory, "backup.sqlite")],
      { env: { ...process.env, DATA_DIR: directory }, encoding: "utf8" },
    );
    assert.equal(backup.status, 0, backup.stderr);
    console.log(
      "Account HTTP smoke passed: confirmation, blocked unverified access, password recovery, token replay denial, session revocation, preserved ledger, and online backup. Development emails only.",
    );
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.on("exit", resolve));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
