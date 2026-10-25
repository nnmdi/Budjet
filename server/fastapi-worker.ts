// Private stdio adapter. No network listener; FastAPI is the only HTTP server.
import "dotenv/config";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Store, AppError } from "./store";
import { loadConfig } from "./config";
import { createMailer, accountLink } from "./mail";
import { cents } from "../src/domain/ledger";
import { spendingStatus } from "../src/domain/overspending";
const config = loadConfig();
const store = new Store(path.join(config.dataDir, "cash-diet.sqlite"));
const mailer = createMailer();
store.db.exec(`CREATE TABLE IF NOT EXISTS spending_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  data TEXT NOT NULL, version INTEGER NOT NULL,
  PRIMARY KEY(user_id,ledger_id));`);
const accepted = {
  message:
    "If this address is eligible, an email will arrive shortly. Check your inbox and spam folder.",
};
const pending = new Set<Promise<unknown>>();
function queueMail(task: () => Promise<void>) {
  const job = Promise.resolve()
    .then(task)
    .catch(() => {
      console.error(JSON.stringify({ event: "email_delivery_failed" }));
    })
    .finally(() => pending.delete(job));
  pending.add(job);
}
function sendToken(email: string, purpose: "verify" | "reset") {
  const item = store.issueEmailToken(email, purpose);
  if (!item) return;
  queueMail(async () => {
    try {
      await mailer.send({
        id: randomUUID(),
        to: item.email,
        subject:
          purpose === "verify"
            ? "Confirm your Cash Diet email"
            : "Reset your Cash Diet password",
        text: `${purpose === "verify" ? "Enter your account password to confirm your email. This link expires in 24 hours." : "Choose a new password. This link expires in 30 minutes."}\n\n${accountLink(config.publicAppUrl, purpose, item.token)}\n\nThis link works once. If you did not request this, ignore this email. Never share this link.`,
      });
    } catch {
      store.discardEmailToken(item.token);
      throw new Error("Email delivery failed.");
    }
  });
}
function validatePrefs(raw: any) {
  if (
    !raw ||
    !raw.rules ||
    typeof raw.rules !== "object" ||
    Array.isArray(raw.rules) ||
    Object.keys(raw.rules).length > 1000 ||
    !Array.isArray(raw.acknowledged) ||
    raw.acknowledged.length > 500
  )
    throw new AppError(400, "Invalid spending preferences.");
  const rules = Object.create(null);
  for (const [id, value] of Object.entries(raw.rules)) {
    const r = value as any;
    if (
      id.length > 120 ||
      !r ||
      ![r.limit, r.reserve].every(
        (n) =>
          typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e10,
      )
    )
      throw new AppError(400, "Use valid nonnegative spending limits.");
    rules[id] = {
      limit: cents(r.limit) / 100,
      reserve: cents(r.reserve) / 100,
    };
  }
  if (
    !raw.acknowledged.every(
      (x: any) => typeof x === "string" && x.length <= 500,
    )
  )
    throw new AppError(400, "Invalid acknowledgements.");
  return { rules, acknowledged: [...new Set(raw.acknowledged)] };
}
async function dispatch(m: any): Promise<any> {
  const b = m.body || {},
    args = m.args || {},
    token = m.token || "";
  if (m.action === "config") return { ...config, dataDir: undefined };
  if (m.action === "health") return { ok: store.ready() && mailer.ready };
  if (m.action === "limit") {
    store.rateLimit(args.key, args.max, args.windowMs);
    return { ok: true };
  }
  if (m.action === "register") {
    store.rateLimit(`auth:${m.ip}`, 20);
    store.rateLimit(
      `email-address:${String(b.email).trim().toLowerCase()}`,
      3,
      3600000,
    );
    try {
      await store.register(b.email, b.name, b.password, b.timeZone);
      await sendToken(b.email, "verify");
    } catch (e) {
      if (!(e instanceof AppError && e.status === 409)) throw e;
    }
    return {
      message:
        "Check your inbox to confirm your email. If you already have an account, sign in or use password recovery.",
    };
  }
  if (m.action === "login") {
    store.rateLimit(`auth:${m.ip}`, 20);
    const user = await store.login(b.email, b.password);
    store.logout(token);
    const session = store.session(user.id, user.authVersion);
    const { authVersion, ...publicUser } = user;
    return { user: publicUser, session };
  }
  if (m.action === "forgot-password" || m.action === "resend-verification") {
    store.rateLimit(`email-ip:${m.ip}`, 15);
    if (
      typeof b.email !== "string" ||
      b.email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(b.email.trim())
    )
      throw new AppError(400, "Enter a valid email address.");
    store.rateLimit(
      `email-address:${b.email.trim().toLowerCase()}`,
      3,
      3600000,
    );
    await sendToken(
      b.email,
      m.action === "forgot-password" ? "reset" : "verify",
    );
    return accepted;
  }
  if (m.action === "verify-email") {
    store.rateLimit(`token:${m.ip}`, 20);
    await store.verifyEmail(b.token, b.password);
    return { message: "Email confirmed. Sign in with your password." };
  }
  if (m.action === "reset-password") {
    store.rateLimit(`token:${m.ip}`, 20);
    if (b.password !== b.confirmPassword)
      throw new AppError(400, "The passwords do not match.");
    const u = await store.resetPassword(b.token, b.password);
    queueMail(() =>
      mailer.send({
        id: randomUUID(),
        to: u.email,
        subject: "Your Cash Diet password was changed",
        text: "Your password was changed and all existing sessions were signed out. If this was not you, use password recovery immediately.",
      }),
    );
    return {
      message:
        "Password changed. All devices were signed out. Sign in with your new password.",
    };
  }
  if (m.action === "logout") {
    store.logout(token);
    return { success: true };
  }
  const user = store.user(token);
  if (m.action === "me") return { user };
  const ledgerId = args.roomId || `personal:${user.id}`;
  switch (m.action) {
    case "read":
      return store.read(ledgerId, user.id);
    case "write":
      return store.write(ledgerId, user.id, b.ledger, b.version);
    case "rooms":
      return { rooms: store.roomsForUser(user.id) };
    case "create-room":
      store.rateLimit(`rooms:${user.id}`, 30);
      return store.createRoom(user.id, b.ledger);
    case "join":
      store.rateLimit(`join:${user.id}`, 30);
      return store.join(args.roomId, user.id, b.token);
    case "invite":
      return store.rotateInvite(args.roomId, user.id);
    case "members":
      return { members: store.members(args.roomId, user.id) };
    case "revoke":
      store.revoke(args.roomId, user.id, args.userId);
      return { success: true };
    case "spending-read":
    case "spending-write": {
      const snapshot = store.read(ledgerId, user.id); // Authorization always precedes settings access.
      if (m.action === "spending-write") {
        const prefs = validatePrefs(b.preferences);
        if (!Number.isSafeInteger(b.version) || b.version < 0)
          throw new AppError(400, "A valid preferences revision is required.");
        store.db.exec("BEGIN IMMEDIATE");
        try {
          const row = store.db
            .prepare(
              "SELECT version FROM spending_preferences WHERE user_id=? AND ledger_id=?",
            )
            .get(user.id, ledgerId);
          if (Number(row?.version || 0) !== b.version)
            throw new AppError(
              409,
              "Alert settings changed on another device. Reload settings before retrying.",
            );
          store.db
            .prepare(
              "INSERT INTO spending_preferences VALUES(?,?,?,?) ON CONFLICT(user_id,ledger_id) DO UPDATE SET data=excluded.data, version=excluded.version",
            )
            .run(user.id, ledgerId, JSON.stringify(prefs), b.version + 1);
          store.db.exec("COMMIT");
        } catch (e) {
          store.db.exec("ROLLBACK");
          throw e;
        }
      }
      const row = store.db
        .prepare(
          "SELECT data,version FROM spending_preferences WHERE user_id=? AND ledger_id=?",
        )
        .get(user.id, ledgerId);
      const preferences = row
        ? JSON.parse(String(row.data))
        : { rules: {}, acknowledged: [] };
      return {
        preferences,
        version: Number(row?.version || 0),
        ledgerVersion: snapshot.version,
        states: spendingStatus(snapshot.ledger, preferences.rules),
      };
    }
    default:
      throw new AppError(404, "API route not found.");
  }
}
async function main() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      const data = await dispatch(JSON.parse(line));
      process.stdout.write(JSON.stringify({ data }) + "\n");
    } catch (e) {
      process.stdout.write(
        JSON.stringify({
          error:
            e instanceof AppError
              ? e.message
              : "The server could not save this change.",
          status: e instanceof AppError ? e.status : 500,
        }) + "\n",
      );
    }
  }
  await Promise.allSettled([...pending]);
  store.close();
}
void main().catch(() => {
  console.error("Core stopped.");
  process.exitCode = 1;
});
