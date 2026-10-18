import { hashPassword, checkPassword, validPassword } from "./passwords";
import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { emptyLedger, Ledger, normalizeLedger } from "../src/domain/ledger";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class Store {
  db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:") {
      fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version > 2) {
      this.db.close();
      throw new Error("This database requires a newer version of Cash Diet.");
    }
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;",
    );
    try {
      this.db
        .exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS ledgers(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL,invite TEXT);
        CREATE TABLE IF NOT EXISTS members(ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(ledger_id,user_id));`);
      const columns = this.db.prepare("PRAGMA table_info(users)").all();
      if (!columns.some((c) => c.name === "verified_at"))
        this.db.exec("ALTER TABLE users ADD COLUMN verified_at INTEGER;");
      if (!columns.some((c) => c.name === "auth_version"))
        this.db.exec(
          "ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;",
        );
      this.db
        .exec(`CREATE TABLE IF NOT EXISTS email_tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),expires INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS email_token_user ON email_tokens(user_id,purpose);
        CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS auth_limit_expiry ON auth_limits(expires);
        PRAGMA user_version=2; COMMIT;`);
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }

  async register(
    email: string,
    name: string,
    password: string,
    timeZone = "UTC",
  ) {
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 120 ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      throw new AppError(
        400,
        "Use a valid email, name, and a password of 12–128 characters.",
      );
    const initial = emptyLedger();
    initial.timeZone = timeZone;
    try {
      normalizeLedger(initial);
    } catch {
      throw new AppError(400, "Choose a valid timezone.");
    }
    email = email.trim().toLowerCase();
    const hashed = await hashPassword(password);
    const user = {
      id: randomUUID(),
      email,
      name: name.trim(),
      emailVerified: false,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO users(id,email,name,password) VALUES(?,?,?,?)")
        .run(user.id, email, user.name, hashed);
      this.db
        .prepare("INSERT INTO ledgers VALUES(?,?,?,?,?,NULL)")
        .run(
          `personal:${user.id}`,
          user.id,
          "personal",
          JSON.stringify(initial),
          1,
        );
      this.db.exec("COMMIT");
      return user;
    } catch (e) {
      this.db.exec("ROLLBACK");
      if (String(e).includes("UNIQUE"))
        throw new AppError(
          409,
          "Unable to create this account. Try signing in.",
        );
      throw e;
    }
  }
  async login(email: string, password: string) {
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      typeof password !== "string" ||
      password.length > 128
    )
      throw new AppError(401, "Email or password is incorrect.");
    const row = this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase()) as any;
    if (!(await checkPassword(password, row?.password)))
      throw new AppError(401, "Email or password is incorrect.");
    const current = this.db
      .prepare("SELECT password,verified_at,auth_version FROM users WHERE id=?")
      .get(row.id) as any;
    if (!current || current.password !== row.password)
      throw new AppError(401, "Credentials changed. Sign in again.");
    if (!current.verified_at)
      throw new AppError(403, "Verify your email before signing in.");
    if (!row.password.startsWith("scrypt-v2:")) {
      const upgraded = await hashPassword(password);
      if (
        !this.db
          .prepare(
            "UPDATE users SET password=? WHERE id=? AND password=? AND auth_version=?",
          )
          .run(upgraded, row.id, row.password, current.auth_version).changes
      )
        throw new AppError(401, "Credentials changed. Sign in again.");
    }
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: true,
      authVersion: Number(current.auth_version),
    };
  }
  session(userId: string, expectedVersion?: number) {
    if (
      expectedVersion !== undefined &&
      !this.db
        .prepare("SELECT 1 FROM users WHERE id=? AND auth_version=?")
        .get(userId, expectedVersion)
    )
      throw new AppError(401, "Credentials changed. Sign in again.");
    if (
      !this.db
        .prepare("SELECT 1 FROM users WHERE id=? AND verified_at IS NOT NULL")
        .get(userId)
    )
      throw new AppError(403, "Verify your email before signing in.");
    this.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    const token = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), userId, Date.now() + 7 * 86400000);
    return token;
  }
  user(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new AppError(401, "Sign in to continue.");
    const row = this.db
      .prepare(
        "SELECT users.id,email,name FROM users JOIN sessions ON users.id=sessions.user_id WHERE hash=? AND expires>? AND verified_at IS NOT NULL",
      )
      .get(digest(token), Date.now());
    if (!row) throw new AppError(401, "Sign in to continue.");
    return row as { id: string; email: string; name: string };
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE hash=?").run(digest(token));
  }
  issueEmailToken(
    email: string,
    purpose: "verify" | "reset",
    now = Date.now(),
  ) {
    if (typeof email !== "string" || email.length > 254) return null;
    const user = this.db
      .prepare("SELECT id,email,verified_at FROM users WHERE email=?")
      .get(email.trim().toLowerCase()) as any;
    if (!user || (purpose === "verify" && user.verified_at)) return null;
    const token = randomBytes(32).toString("hex");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM email_tokens WHERE expires<=? OR (user_id=? AND purpose=?)",
        )
        .run(now, user.id, purpose);
      this.db
        .prepare("INSERT INTO email_tokens VALUES(?,?,?,?)")
        .run(
          digest(token),
          user.id,
          purpose,
          now + (purpose === "verify" ? 24 * 3600000 : 30 * 60000),
        );
      this.db.exec("COMMIT");
      return { token, email: user.email, userId: user.id };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  discardEmailToken(token: string) {
    this.db.prepare("DELETE FROM email_tokens WHERE hash=?").run(digest(token));
  }
  private emailToken(token: string, purpose: "verify" | "reset", now: number) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw new AppError(
        400,
        "This link is invalid or expired. Request a new email.",
      );
    const row = this.db
      .prepare(
        "SELECT email_tokens.user_id,users.password FROM email_tokens JOIN users ON users.id=email_tokens.user_id WHERE hash=? AND purpose=? AND expires>?",
      )
      .get(digest(token), purpose, now) as any;
    if (!row)
      throw new AppError(
        400,
        "This link is invalid or expired. Request a new email.",
      );
    return row;
  }
  async verifyEmail(token: string, password: string, now = Date.now()) {
    const row = this.emailToken(token, "verify", now);
    if (!(await checkPassword(password, row.password)))
      throw new AppError(
        400,
        "The account password is incorrect. Use password recovery if you did not create this account.",
      );
    this.completeEmailAction(token, "verify", row.user_id, now);
  }
  async resetPassword(token: string, password: string, now = Date.now()) {
    this.emailToken(token, "reset", now);
    if (!validPassword(password))
      throw new AppError(400, "Use a password of 12–128 characters.");
    const hash = await hashPassword(password);
    const row = this.emailToken(
      token,
      "reset",
      Date.now() > now ? Date.now() : now,
    );
    this.completeEmailAction(token, "reset", row.user_id, now, hash);
    return this.db
      .prepare("SELECT email FROM users WHERE id=?")
      .get(row.user_id) as { email: string };
  }
  private completeEmailAction(
    token: string,
    purpose: "verify" | "reset",
    userId: string,
    now: number,
    password?: string,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.emailToken(token, purpose, Math.max(now, Date.now()));
      const removed = this.db
        .prepare(
          "DELETE FROM email_tokens WHERE hash=? AND user_id=? AND purpose=?",
        )
        .run(digest(token), userId, purpose);
      if (removed.changes !== 1)
        throw new AppError(400, "This link has already been used.");
      if (password)
        this.db
          .prepare(
            "UPDATE users SET password=?,verified_at=COALESCE(verified_at,?),auth_version=auth_version+1 WHERE id=?",
          )
          .run(password, now, userId);
      else
        this.db
          .prepare(
            "UPDATE users SET verified_at=COALESCE(verified_at,?),auth_version=auth_version+1 WHERE id=?",
          )
          .run(now, userId);
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      this.db.prepare("DELETE FROM email_tokens WHERE user_id=?").run(userId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  rateLimit(key: string, max: number, windowMs = 15 * 60000) {
    const now = Date.now();
    this.db.prepare("DELETE FROM auth_limits WHERE expires<=?").run(now);
    if (
      !this.db
        .prepare("SELECT 1 FROM auth_limits WHERE key=?")
        .get(digest(key)) &&
      Number(
        this.db.prepare("SELECT count(*) AS n FROM auth_limits").get()!.n,
      ) >= 20000
    )
      throw new AppError(429, "Authentication is busy. Try again later.");
    this.db
      .prepare(
        "INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      )
      .run(digest(key), now + windowMs);
    if (
      Number(
        this.db
          .prepare("SELECT count FROM auth_limits WHERE key=?")
          .get(digest(key))!.count,
      ) > max
    )
      throw new AppError(429, "Too many attempts. Try again later.");
  }
  ready() {
    this.db.prepare("SELECT 1").get();
    return (
      Number(this.db.prepare("PRAGMA user_version").get()!.user_version) === 2
    );
  }
  private authorize(id: string, userId: string) {
    const row = this.db
      .prepare(
        "SELECT * FROM ledgers WHERE id=? AND (owner=? OR EXISTS(SELECT 1 FROM members WHERE ledger_id=ledgers.id AND user_id=?))",
      )
      .get(id, userId, userId) as any;
    if (!row) throw new AppError(404, "Workspace not found or access denied.");
    return row;
  }
  read(id: string, userId: string) {
    const row = this.authorize(id, userId);
    return {
      ledger: normalizeLedger(JSON.parse(row.data)),
      version: row.version,
    };
  }
  write(id: string, userId: string, ledger: Ledger, version: number) {
    this.authorize(id, userId);
    if (!Number.isSafeInteger(version) || version < 1)
      throw new AppError(400, "A valid workspace revision is required.");
    let clean: Ledger;
    try {
      clean = normalizeLedger(ledger);
    } catch (e) {
      throw new AppError(400, (e as Error).message);
    }
    const result = this.db
      .prepare(
        "UPDATE ledgers SET data=?,version=version+1 WHERE id=? AND version=?",
      )
      .run(JSON.stringify(clean), id, version);
    if (result.changes !== 1)
      throw new AppError(
        409,
        "This workspace changed elsewhere. Export your backup, reload the latest version, and retry.",
      );
    return { ledger: clean, version: version + 1 };
  }
  createRoom(userId: string, ledger: Ledger) {
    let clean: Ledger;
    try {
      clean = normalizeLedger(ledger);
    } catch (e) {
      throw new AppError(400, (e as Error).message);
    }
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO ledgers VALUES(?,?,?,?,?,?)")
      .run(id, userId, "room", JSON.stringify(clean), 1, digest(token));
    return {
      roomId: id,
      invitation: `${id}.${token}`,
      ledger: clean,
      version: 1,
    };
  }
  join(id: string, userId: string, token?: string) {
    const row = this.db
      .prepare("SELECT * FROM ledgers WHERE id=? AND kind='room'")
      .get(id) as any;
    if (!row) throw new AppError(404, "Invitation not recognized.");
    const already =
      row.owner === userId ||
      this.db
        .prepare("SELECT 1 FROM members WHERE ledger_id=? AND user_id=?")
        .get(id, userId);
    if (!already) {
      if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token) ||
        !row.invite ||
        !timingSafeEqual(
          Buffer.from(digest(token), "hex"),
          Buffer.from(row.invite, "hex"),
        )
      )
        throw new AppError(403, "A valid private invitation is required.");
      this.db
        .prepare("INSERT OR IGNORE INTO members VALUES(?,?)")
        .run(id, userId);
    }
    return this.read(id, userId);
  }
  rotateInvite(id: string, userId: string) {
    const token = randomBytes(32).toString("hex");
    const r = this.db
      .prepare(
        "UPDATE ledgers SET invite=? WHERE id=? AND owner=? AND kind='room'",
      )
      .run(digest(token), id, userId);
    if (!r.changes)
      throw new AppError(403, "Only the room owner can issue invitations.");
    return { invitation: `${id}.${token}` };
  }
  revoke(id: string, owner: string, userId: string) {
    const row = this.authorize(id, owner);
    if (row.owner !== owner || userId === owner)
      throw new AppError(403, "Only the owner can remove another member.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM members WHERE ledger_id=? AND user_id=?")
        .run(id, userId);
      this.db.prepare("UPDATE ledgers SET invite=NULL WHERE id=?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  roomsForUser(userId: string) {
    return this.db
      .prepare(
        "SELECT id,owner FROM ledgers WHERE kind='room' AND (owner=? OR EXISTS(SELECT 1 FROM members WHERE ledger_id=ledgers.id AND user_id=?))",
      )
      .all(userId, userId)
      .map((row) => ({ id: String(row.id), owner: row.owner === userId }));
  }
  members(id: string, owner: string) {
    const row = this.authorize(id, owner);
    if (row.owner !== owner)
      throw new AppError(403, "Only the owner can manage members.");
    return this.db
      .prepare(
        "SELECT users.id,users.name,users.email FROM users JOIN members ON members.user_id=users.id WHERE ledger_id=?",
      )
      .all(id) as { id: string; name: string; email: string }[];
  }
  close() {
    this.db.close();
  }
}
