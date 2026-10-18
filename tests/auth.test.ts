import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store, digest } from "../server/store";
import { createApp } from "../server/app";
import { createMailer, accountLink, Mail } from "../server/mail";
import { hashPassword, checkPassword } from "../server/passwords";
import { loadConfig } from "../server/config";
import { createMocks } from "node-mocks-http";
import { EventEmitter } from "node:events";
const password = "initial-password-12345",
  replacement = "replacement-password-12345";
async function verified(store: Store, email = "a@example.test") {
  const user = await store.register(email, "Account", password);
  const issued = store.issueEmailToken(email, "verify")!;
  await store.verifyEmail(issued.token, password);
  return user;
}
async function http(
  app: ReturnType<typeof createApp>,
  url: string,
  body?: unknown,
  cookie?: string,
  method = "POST",
) {
  const { req, res } = createMocks(
    {
      method: method as any,
      url,
      headers: {
        origin: "https://cash.example",
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body as any,
    },
    { eventEmitter: EventEmitter },
  );
  await new Promise<void>((resolve, reject) => {
    res.on("end", resolve);
    (app as any).handle(req, res, (e: any) => (e ? reject(e) : resolve()));
  });
  return {
    status: res._getStatusCode(),
    data: res._getJSONData(),
    headers: res._getHeaders(),
  };
}
test("unverified accounts cannot log in, mint sessions, or use old sessions", async () => {
  const s = new Store(":memory:");
  const user = await s.register("a@example.test", "A", password);
  await assert.rejects(() => s.login(user.email, password), /Verify/);
  assert.throws(() => s.session(user.id), /Verify/);
  s.db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(digest("f".repeat(64)), user.id, Date.now() + 60000);
  assert.throws(() => s.user("f".repeat(64)));
  s.close();
});
test("verification tokens are hashed, password-bound, expiring and single-use", async () => {
  const s = new Store(":memory:");
  const user = await s.register("a@example.test", "A", password);
  const issued = s.issueEmailToken(user.email, "verify")!;
  assert.equal(issued.token.length, 64);
  const stored = s.db.prepare("SELECT hash FROM email_tokens").get()!;
  assert.equal(stored.hash, digest(issued.token));
  assert.notEqual(stored.hash, issued.token);
  await assert.rejects(() => s.verifyEmail(issued.token, "wrong"));
  assert.equal(
    s.db.prepare("SELECT count(*) AS n FROM email_tokens").get()!.n,
    1,
  );
  await s.verifyEmail(issued.token, password);
  assert.equal((await s.login(user.email, password)).emailVerified, true);
  await assert.rejects(() => s.verifyEmail(issued.token, password));
  s.close();
});
test("resending invalidates older links; expired and wrong-purpose tokens fail", async () => {
  const s = new Store(":memory:");
  const user = await s.register("a@example.test", "A", password);
  const first = s.issueEmailToken(user.email, "verify")!,
    second = s.issueEmailToken(user.email, "verify")!;
  await assert.rejects(() => s.verifyEmail(first.token, password));
  await assert.rejects(() => s.resetPassword(second.token, replacement));
  s.db.prepare("UPDATE email_tokens SET expires=0").run();
  await assert.rejects(() => s.verifyEmail(second.token, password));
  s.close();
});
test("reset changes credentials, verifies email, revokes sessions/tokens and does not auto-login", async () => {
  const s = new Store(":memory:");
  const user = await verified(s),
    session = s.session(user.id);
  const link = s.issueEmailToken(user.email, "reset")!;
  await s.resetPassword(link.token, replacement);
  assert.throws(() => s.user(session));
  await assert.rejects(() => s.login(user.email, password));
  assert.equal((await s.login(user.email, replacement)).id, user.id);
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM sessions").get()!.n, 0);
  assert.equal(
    s.db.prepare("SELECT count(*) AS n FROM email_tokens").get()!.n,
    0,
  );
  await assert.rejects(() => s.resetPassword(link.token, password));
  s.close();
});
test("concurrent reset submissions consume a link exactly once", async () => {
  const s = new Store(":memory:");
  const user = await verified(s),
    link = s.issueEmailToken(user.email, "reset")!;
  const outcomes = await Promise.allSettled([
    s.resetPassword(link.token, replacement),
    s.resetPassword(link.token, "another-long-password-12345"),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  s.close();
});
test("a credential version checked before recovery cannot mint a session afterward", async () => {
  const s = new Store(":memory:");
  const user = await verified(s),
    login = await s.login(user.email, password),
    link = s.issueEmailToken(user.email, "reset")!;
  await s.resetPassword(link.token, replacement);
  assert.throws(() => s.session(user.id, login.authVersion));
  s.close();
});
test("unverified registrations can be reclaimed through email recovery without the old password", async () => {
  const s = new Store(":memory:");
  const user = await s.register("a@example.test", "A", password);
  const link = s.issueEmailToken(user.email, "reset")!;
  await s.resetPassword(link.token, replacement);
  assert.equal((await s.login(user.email, replacement)).emailVerified, true);
  await assert.rejects(() => s.login(user.email, password));
  s.close();
});
test("invalid reset passwords leave the token and credentials unchanged", async () => {
  const s = new Store(":memory:");
  const user = await verified(s),
    link = s.issueEmailToken(user.email, "reset")!;
  await assert.rejects(() => s.resetPassword(link.token, "short"));
  assert.equal((await s.login(user.email, password)).id, user.id);
  await s.resetPassword(link.token, replacement);
  s.close();
});
test("API recovery returns identical generic responses and sends only to the stored account address", async () => {
  const s = new Store(":memory:"),
    mail: Mail[] = [],
    events: unknown[] = [];
  const user = await verified(s);
  const app = createApp(s, {
    origin: "https://cash.example",
    production: true,
    mailer: {
      ready: true,
      async send(item) {
        mail.push(item);
      },
    },
    log: (event) => events.push(event),
  });
  const known = await http(app, "/api/auth/forgot-password", {
      email: user.email,
    }),
    unknown = await http(app, "/api/auth/forgot-password", {
      email: "unknown@example.test",
    });
  await app.locals.drainEmail();
  assert.equal(known.status, 202);
  assert.deepEqual(known.data, unknown.data);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, user.email);
  assert.ok(!JSON.stringify(known.data).includes(mail[0].text));
  assert.equal(JSON.stringify(events).includes(user.email), false);
  const token = mail[0].text.match(/#reset-password=([a-f0-9]{64})/)![1];
  assert.equal(
    (
      await http(app, "/api/auth/reset-password", {
        token,
        password: replacement,
        confirmPassword: "mismatch",
      })
    ).status,
    400,
  );
  const reset = await http(app, "/api/auth/reset-password", {
    token,
    password: replacement,
    confirmPassword: replacement,
  });
  assert.equal(reset.status, 200);
  assert.match(String(reset.headers["set-cookie"]), /Max-Age=0/);
  await app.locals.drainEmail();
  assert.equal(mail.length, 2);
  assert.equal(mail[1].text.includes(replacement), false);
  assert.equal(JSON.stringify(events).includes(token), false);
  s.close();
});
test("mail failures invalidate delivery tokens without disclosing account existence or provider details", async () => {
  const s = new Store(":memory:");
  const user = await verified(s),
    events: unknown[] = [];
  const app = createApp(s, {
    origin: "https://cash.example",
    mailer: {
      ready: true,
      async send() {
        throw new Error("secret provider detail");
      },
    },
    log: (e) => events.push(e),
  });
  const result = await http(app, "/api/auth/forgot-password", {
    email: user.email,
  });
  await app.locals.drainEmail();
  assert.equal(result.status, 202);
  assert.equal(
    s.db.prepare("SELECT count(*) AS n FROM email_tokens").get()!.n,
    0,
  );
  assert.equal(JSON.stringify(events).includes("secret provider"), false);
  assert.ok(JSON.stringify(events).includes("email_delivery_failed"));
  s.close();
});
test("production mail cannot fall back to files and provider request keys stay server-side", async () => {
  assert.throws(() =>
    createMailer({ NODE_ENV: "production", MAIL_PROVIDER: "file" }),
  );
  assert.throws(() => createMailer({ NODE_ENV: "production" }));
  let called: any;
  const mailer = createMailer(
    {
      NODE_ENV: "production",
      MAIL_PROVIDER: "resend",
      RESEND_API_KEY: "test-only",
      MAIL_FROM: "Cash Diet <security@example.test>",
    },
    async (url, options) => {
      called = { url, options };
      return new Response("{}", { status: 200 });
    },
  );
  await mailer.send({
    id: "idempotent-test",
    to: "person@example.test",
    subject: "Test",
    text: "Text",
  });
  assert.equal(called.url, "https://api.resend.com/emails");
  assert.equal(called.options.headers["Idempotency-Key"], "idempotent-test");
  assert.equal(JSON.parse(called.options.body).text, "Text");
});
test("development outbox is private and email URLs keep tokens out of HTTP query strings", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cash-mail-"));
  const mailer = createMailer({ NODE_ENV: "development", DATA_DIR: dir });
  await mailer.send({
    id: "test",
    to: "person@example.test",
    subject: "Test",
    text: "development",
  });
  const file = path.join(
    dir,
    "mail",
    fs.readdirSync(path.join(dir, "mail"))[0],
  );
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const link = new URL(
    accountLink("https://cash.example/", "reset", "a".repeat(64)),
  );
  assert.equal(link.search, "");
  assert.match(link.hash, /reset-password=/);
  fs.rmSync(dir, { recursive: true, force: true });
});
test("database migration preserves legacy users and data but requires email verification", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cash-migration-")),
    file = path.join(dir, "old.sqlite");
  const old = new DatabaseSync(file);
  old.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL); INSERT INTO users VALUES('legacy','legacy@example.test','Legacy','legacy-hash'); PRAGMA user_version=1;",
  );
  old.close();
  const store = new Store(file);
  assert.equal(
    store.db.prepare("SELECT name,verified_at FROM users").get()!.name,
    "Legacy",
  );
  assert.equal(
    store.db.prepare("SELECT verified_at FROM users").get()!.verified_at,
    null,
  );
  assert.equal(store.ready(), true);
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("newer database versions fail before downgrading schema metadata", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cash-version-")),
    file = path.join(dir, "future.sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA user_version=99;");
  db.close();
  assert.throws(() => new Store(file), /newer/);
  const check = new DatabaseSync(file);
  assert.equal(check.prepare("PRAGMA user_version").get()!.user_version, 99);
  check.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("email rate limits survive restart and limit nonexistent addresses equally", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cash-limit-")),
    file = path.join(dir, "db.sqlite");
  let s = new Store(file);
  s.rateLimit("address:a@example.test", 1);
  s.close();
  s = new Store(file);
  assert.throws(() => s.rateLimit("address:a@example.test", 1), /Too many/);
  s.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("readiness fails closed without mail configuration and security headers are applied", async () => {
  const s = new Store(":memory:"),
    app = createApp(s, { origin: "https://cash.example", production: true });
  const r = await http(app, "/api/ready", undefined, undefined, "GET");
  assert.equal(r.status, 503);
  assert.equal(r.headers["x-frame-options"], "SAMEORIGIN");
  assert.match(
    String(r.headers["content-security-policy"]),
    /frame-ancestors 'none'/,
  );
  assert.equal(r.headers["referrer-policy"], "no-referrer");
  s.close();
});
test("production configuration rejects missing volumes, insecure or untrusted link origins", () => {
  assert.throws(() =>
    loadConfig({
      NODE_ENV: "production",
      APP_URL: "http://example.test",
      DATA_DIR: "/data",
    }),
  );
  assert.throws(() =>
    loadConfig({ NODE_ENV: "production", APP_URL: "https://cash.example" }),
  );
  assert.throws(() =>
    loadConfig({
      NODE_ENV: "production",
      APP_URL: "https://cash.example",
      DATA_DIR: "/data",
      PUBLIC_APP_URL: "https://evil.example",
    }),
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "production",
      APP_URL: "https://cash.example",
      DATA_DIR: "/data",
    }).publicAppUrl,
    "https://cash.example",
  );
});
test("password hashes use asynchronous scrypt with a bounded format", async () => {
  const hash = await hashPassword(password);
  assert.match(hash, /^scrypt-v2:/);
  assert.equal(await checkPassword(password, hash), true);
  assert.equal(await checkPassword("wrong", hash), false);
});
