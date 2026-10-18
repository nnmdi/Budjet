import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../server/config";
import { createMailer } from "../server/mail";
try {
  const config = loadConfig();
  if (!config.production)
    throw new Error("Set NODE_ENV=production for this check.");
  createMailer();
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const probe = path.join(config.dataDir, ".write-check-" + randomUUID());
  fs.writeFileSync(probe, "ok", { mode: 0o600, flag: "wx" });
  fs.unlinkSync(probe);
  const file = path.join(config.dataDir, "cash-diet.sqlite");
  let database = "new";
  if (fs.existsSync(file)) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      if (db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok")
        throw new Error("Database integrity check failed.");
      const schema = Number(
        db.prepare("PRAGMA user_version").get()!.user_version,
      );
      if (schema > 2)
        throw new Error("The database requires a newer app version.");
      database = schema === 2 ? "ready" : "migration-required";
    } finally {
      db.close();
    }
  }
  console.log(
    JSON.stringify({
      ok: true,
      configuration: "valid",
      storage: "writable",
      database,
      email: "configured-not-delivery-tested",
    }),
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
