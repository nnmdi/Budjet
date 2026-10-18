import { DatabaseSync, backup } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
async function main() {
  const directory = process.env.DATA_DIR || "data";
  const destination = process.argv[2];
  if (!destination)
    throw new Error(
      "Usage: npm run backup -- /private/path/cash-diet-backup.sqlite",
    );
  if (fs.existsSync(destination))
    throw new Error(
      "Choose a new backup filename; existing backups are never overwritten.",
    );
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, "cash-diet.sqlite"), {
    readOnly: true,
  });
  try {
    await backup(db, destination);
    fs.chmodSync(destination, 0o600);
    console.log("Database backup saved.");
  } finally {
    db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
