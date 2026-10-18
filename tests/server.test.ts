import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createMocks } from "node-mocks-http";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import {
  addTransactions,
  createBudget,
  emptyLedger,
} from "../src/domain/ledger";
const password = "test-password-12345";
const account = (store: Store, email = "a@example.test") =>
  store.register(email, "Test", password);
test("server stores salted password hashes and authenticates correctly", () => {
  const s = new Store(":memory:");
  const user = account(s);
  const raw = s.db.prepare("SELECT password FROM users").get() as any;
  assert.ok(!raw.password.includes(password));
  assert.equal(s.login(user.email, password).id, user.id);
  assert.throws(() => s.login(user.email, "wrong"));
  assert.throws(() => account(s));
  s.close();
});
test("sessions are opaque, hashed, expiring and revocable", () => {
  const s = new Store(":memory:");
  const user = account(s);
  const token = s.session(user.id);
  const stored = s.db.prepare("SELECT hash FROM sessions").get() as any;
  assert.notEqual(stored.hash, token);
  assert.equal(s.user(token).id, user.id);
  s.logout(token);
  assert.throws(() => s.user(token));
  const expired = s.session(user.id);
  s.db.prepare("UPDATE sessions SET expires=0").run();
  assert.throws(() => s.user(expired));
  s.close();
});
test("personal data is isolated and invalid saves are atomic", () => {
  const s = new Store(":memory:");
  const a = account(s),
    b = account(s, "b@example.test");
  const key = `personal:${a.id}`;
  assert.throws(() => s.read(key, b.id));
  const before = s.read(key, a.id);
  assert.throws(() => s.write(key, a.id, {} as any, before.version));
  assert.deepEqual(s.read(key, a.id), before);
  s.close();
});
test("stale writes cannot overwrite a newer ledger", () => {
  const s = new Store(":memory:");
  const a = account(s),
    key = `personal:${a.id}`;
  const saved = s.write(
    key,
    a.id,
    createBudget(emptyLedger(), "A", 1000, "a"),
    1,
  );
  assert.equal(saved.version, 2);
  assert.throws(() => s.write(key, a.id, emptyLedger(), 1));
  assert.equal(s.read(key, a.id).ledger.budgets.A.balance, 1000);
  s.close();
});
test("room bootstrap copies a snapshot without double counting; membership required", () => {
  const s = new Store(":memory:");
  const a = account(s),
    b = account(s, "b@example.test");
  const ledger = addTransactions(createBudget(emptyLedger(), "A", 1000, "a"), [
    {
      id: "one",
      budget: "A",
      amount: 100,
      type: "expense",
      date: "2020-01-01",
      description: "Expense",
      recurrence: "one-time",
    },
  ]);
  const room = s.createRoom(a.id, ledger);
  assert.equal(room.ledger.budgets.A.balance, 900);
  assert.throws(() => s.read(room.roomId, b.id));
  assert.throws(() => s.join(room.roomId, b.id, "bad"));
  s.join(room.roomId, b.id, room.invitation.split(".")[1]);
  assert.equal(s.roomsForUser(b.id)[0].id, room.roomId);
  assert.equal(s.read(room.roomId, b.id).ledger.budgets.A.balance, 900);
  s.close();
});
test("owners can rotate invitations and revoke members", () => {
  const s = new Store(":memory:");
  const a = account(s),
    b = account(s, "b@example.test"),
    c = account(s, "c@example.test");
  const room = s.createRoom(a.id, emptyLedger());
  s.join(room.roomId, b.id, room.invitation.split(".")[1]);
  assert.equal(s.roomsForUser(b.id)[0].id, room.roomId);
  assert.throws(() => s.rotateInvite(room.roomId, b.id));
  s.rotateInvite(room.roomId, a.id);
  assert.throws(() => s.join(room.roomId, c.id, room.invitation.split(".")[1]));
  assert.equal(s.members(room.roomId, a.id)[0].id, b.id);
  assert.throws(() => s.members(room.roomId, b.id));
  s.revoke(room.roomId, a.id, b.id);
  assert.throws(() => s.join(room.roomId, b.id, room.invitation.split(".")[1]));
  assert.throws(() => s.read(room.roomId, b.id));
  s.close();
});
test("SQLite data and sessions survive reopening with private file permissions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cash-diet-test-")),
    file = path.join(dir, "test.sqlite");
  let s = new Store(file);
  const a = account(s),
    token = s.session(a.id);
  s.write(
    `personal:${a.id}`,
    a.id,
    createBudget(emptyLedger(), "A", 123.45, "a"),
    1,
  );
  s.close();
  s = new Store(file);
  assert.equal(s.user(token).id, a.id);
  assert.equal(
    s.read(`personal:${a.id}`, a.id).ledger.budgets.A.balance,
    123.45,
  );
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  s.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
async function http(
  app: ReturnType<typeof createApp>,
  method: string,
  url: string,
  body?: any,
  cookie?: string,
  origin = "https://cash.example",
) {
  const { req, res } = createMocks(
    {
      method: method as any,
      url,
      headers: {
        origin,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body,
    },
    { eventEmitter: EventEmitter },
  );
  await new Promise<void>((resolve, reject) => {
    res.on("end", () => resolve());
    (app as any).handle(req as any, res as any, (e: any) =>
      e ? reject(e) : resolve(),
    );
  });
  return {
    status: res._getStatusCode(),
    data: res._getJSONData(),
    cookie: String(res.getHeader("set-cookie") || ""),
  };
}
test("API enforces credentials, CSRF origins and HttpOnly secure sessions without sockets", async () => {
  const s = new Store(":memory:"),
    app = createApp(s, { origin: "https://cash.example", production: true });
  assert.equal((await http(app, "GET", "/api/workspace")).status, 401);
  assert.equal(
    (
      await http(
        app,
        "POST",
        "/api/auth/register",
        { email: "a@example.test", name: "A", password },
        undefined,
        "https://evil.example",
      )
    ).status,
    403,
  );
  const signup = await http(app, "POST", "/api/auth/register", {
    email: "a@example.test",
    name: "A",
    password,
  });
  assert.equal(signup.status, 200);
  assert.match(signup.cookie, /HttpOnly/);
  assert.match(signup.cookie, /Secure/);
  assert.match(signup.cookie, /SameSite=Lax/);
  const cookie = signup.cookie.split(";")[0];
  assert.equal(
    (await http(app, "GET", "/api/workspace", undefined, cookie)).status,
    200,
  );
  assert.equal(
    (
      await http(
        app,
        "PUT",
        "/api/workspace",
        { ledger: emptyLedger(), version: 1 },
        cookie,
        "https://evil.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await http(
        app,
        "PUT",
        "/api/workspace",
        { ledger: {}, version: 1 },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await http(app, "POST", "/api/auth/logout", {}, cookie)).status,
    200,
  );
  assert.equal(
    (await http(app, "GET", "/api/workspace", undefined, cookie)).status,
    401,
  );
  s.close();
});
