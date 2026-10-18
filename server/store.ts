import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
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
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ledgers(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL,invite TEXT);
      CREATE TABLE IF NOT EXISTS members(ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(ledger_id,user_id));
      PRAGMA user_version=1;`);
  }
  register(email: string, name: string, password: string, timeZone = "UTC") {
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
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    const user = { id: randomUUID(), email, name: name.trim() };
    const schema = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (schema.user_version > 1) {
      this.db.close();
      throw new Error("This database requires a newer version of Cash Diet.");
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?)")
        .run(user.id, email, user.name, `${salt}:${hash}`);
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
  login(email: string, password: string) {
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 128
    )
      throw new AppError(401, "Email or password is incorrect.");
    const row = this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase()) as any;
    const [salt, expected] = (
      row?.password || `${"0".repeat(32)}:${"0".repeat(128)}`
    ).split(":");
    const actual = scryptSync(password, salt, 64);
    if (!row || !timingSafeEqual(actual, Buffer.from(expected, "hex")))
      throw new AppError(401, "Email or password is incorrect.");
    return { id: row.id, email: row.email, name: row.name };
  }
  session(userId: string) {
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
        "SELECT users.id,email,name FROM users JOIN sessions ON users.id=sessions.user_id WHERE hash=? AND expires>?",
      )
      .get(digest(token), Date.now());
    if (!row) throw new AppError(401, "Sign in to continue.");
    return row as { id: string; email: string; name: string };
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE hash=?").run(digest(token));
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
