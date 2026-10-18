import path from "node:path";
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production",
    port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  const origin = env.APP_URL || `http://localhost:${port}`;
  const cors = (env.CORS_ORIGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const origins = [origin, ...cors];
  for (const value of origins) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Use valid, exact application origins.");
    }
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      !["http:", "https:"].includes(url.protocol) ||
      (production && url.protocol !== "https:")
    )
      throw new Error("Use exact origins; production origins must use HTTPS.");
  }
  if (production && !env.DATA_DIR)
    throw new Error("Production requires DATA_DIR on a persistent volume.");
  const dataDir = path.resolve(env.DATA_DIR || "data");
  if (dataDir === path.parse(dataDir).root)
    throw new Error("DATA_DIR must be a dedicated application directory.");
  const publicAppUrl = env.PUBLIC_APP_URL || origin;
  const url = new URL(publicAppUrl);
  if (
    !origins.includes(url.origin) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "PUBLIC_APP_URL must use an allowed origin and have no query, credentials, or fragment.",
    );
  const crossSite = env.COOKIE_CROSS_SITE === "true";
  if (crossSite && !production)
    throw new Error("Cross-site cookies require production HTTPS.");
  return {
    production,
    port,
    origin,
    cors,
    publicAppUrl,
    dataDir,
    crossSite,
    trustProxy: env.TRUST_PROXY === "1",
  };
}
