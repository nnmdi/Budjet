import "dotenv/config";
import path from "node:path";
import { Store } from "./server/store";
import { createApp } from "./server/app";
import { createMailer } from "./server/mail";
import { loadConfig } from "./server/config";
import express from "express";
async function start() {
  const config = loadConfig();
  const mailer = createMailer();
  const store = new Store(path.join(config.dataDir, "cash-diet.sqlite"));
  const app = createApp(store, {
    ...config,
    mailer,
    log: (event) => console.log(JSON.stringify(event)),
  });
  if (config.trustProxy) app.set("trust proxy", 1);
  if (!config.production) {
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
  const server = app.listen(config.port, "0.0.0.0", () =>
    console.log(JSON.stringify({ event: "server_started", port: config.port })),
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 15000);
    deadline.unref();
    server.close(async () => {
      await app.locals.drainEmail();
      store.close();
      clearTimeout(deadline);
      process.exit(0);
    });
    server.closeIdleConnections();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
start().catch((error) => {
  console.error(
    JSON.stringify({ event: "startup_failed", message: error.message }),
  );
  process.exitCode = 1;
});
