import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
let active = 0;
const waiting: (() => void)[] = [];
async function derive(
  password: string,
  salt: string,
  legacy = false,
): Promise<Buffer> {
  if (active >= 4) {
    if (waiting.length >= 32)
      throw new Error("Authentication is busy. Try again shortly.");
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        legacy ? {} : { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}
export async function hashPassword(password: string) {
  if (!validPassword(password))
    throw new Error("Use a password of 12–128 characters.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v2:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function checkPassword(
  password: unknown,
  stored?: string,
): Promise<boolean> {
  if (typeof password !== "string" || password.length > 128) return false;
  const parts = (
    stored || `scrypt-v2:${"0".repeat(32)}:${"0".repeat(128)}`
  ).split(":");
  if (parts.length !== 2 && (parts.length !== 3 || parts[0] !== "scrypt-v2"))
    return false;
  const legacy = parts.length === 2,
    [salt, hash] = legacy ? parts : parts.slice(1);
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hash || ""))
    return false;
  const actual = await derive(password, salt, legacy);
  return Boolean(stored) && timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
