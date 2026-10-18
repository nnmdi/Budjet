import "dotenv/config";
import path from "node:path";
import { Store } from "./server/store";
import { createApp } from "./server/app";
import express from "express";

async function start() {
  const production = process.env.NODE_ENV === "production";
  const port = Number(process.env.PORT || 3000);
  const origin = process.env.APP_URL || `http://localhost:${port}`;
  if (production && (!process.env.DATA_DIR || !origin.startsWith("https://")))
    throw new Error(
      "Production requires DATA_DIR on a persistent volume and an HTTPS APP_URL.",
    );
  const origins = [
    origin,
    ...(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ];
  if (
    origins.some((value) => {
      try {
        const url = new URL(value);
        return (
          url.origin !== value || (production && url.protocol !== "https:")
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      "Use exact, valid HTTP origins; production origins must use HTTPS.",
    );
  if (process.env.COOKIE_CROSS_SITE === "true" && !production)
    throw new Error("Cross-site cookies require production HTTPS.");
  const store = new Store(
    path.join(process.env.DATA_DIR || "data", "cash-diet.sqlite"),
  );
  const app = createApp(store, {
    origin,
    production,
    crossSite: process.env.COOKIE_CROSS_SITE === "true",
    cors: origins.slice(1),
  });
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  if (!production) {
    const { createServer } = await import("vite");
    app.use(
      (await createServer({ server: { middlewareMode: true }, appType: "spa" }))
        .middlewares,
    );
  } else {
    const dist = path.resolve("dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  const server = app.listen(port, "0.0.0.0", () =>
    console.log(`Cash Diet listening on ${port}`),
  );
  const shutdown = () =>
    server.close(() => {
      store.close();
      process.exit(0);
    });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
