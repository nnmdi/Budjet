import express from "express";
import { AppError, Store } from "./store";

export function createApp(
  store: Store,
  options: {
    origin: string;
    production?: boolean;
    crossSite?: boolean;
    cors?: string[];
  },
) {
  const app = express(),
    allowed = new Set([options.origin, ...(options.cors || [])]);
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use("/api", (req, res, next) => {
    const origin = req.get("Origin");
    if (origin && !allowed.has(origin))
      return res.status(403).json({ error: "Origin is not permitted." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,OPTIONS",
      );
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.sendStatus(204);
    }
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (!origin || !allowed.has(origin))
    )
      return res
        .status(403)
        .json({ error: "A trusted request origin is required." });
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.get("Content-Type")?.split(";")[0].trim() !== "application/json"
    )
      return res.status(415).json({ error: "Use application/json." });
    next();
  });
  app.use(express.json({ limit: "10mb" }));
  const attempts = new Map<string, { count: number; expires: number }>();
  const limit = (key: string, max: number) => {
    const now = Date.now();
    if (attempts.size > 10000)
      for (const [k, v] of attempts) if (v.expires < now) attempts.delete(k);
    let entry = attempts.get(key);
    if (!entry || entry.expires < now) {
      if (attempts.size >= 20000)
        throw new AppError(429, "Please try again later.");
      entry = { count: 0, expires: now + 15 * 60_000 };
      attempts.set(key, entry);
    }
    if (++entry.count > max)
      throw new AppError(429, "Too many attempts. Try again in 15 minutes.");
  };
  const cookie = (token: string, clear = false) =>
    `cashdiet_session=${token}; HttpOnly; Path=/; SameSite=${options.crossSite ? "None" : "Lax"}; Max-Age=${clear ? 0 : 604800}${options.production ? "; Secure" : ""}`;
  const token = (req: express.Request) =>
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("cashdiet_session="))
      ?.slice("cashdiet_session=".length) || "";
  const route =
    (
      fn: (req: express.Request, res: express.Response) => unknown,
    ): express.RequestHandler =>
    (req, res, next) => {
      try {
        fn(req, res);
      } catch (e) {
        next(e);
      }
    };
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  for (const action of ["register", "login"] as const)
    app.post(
      `/api/auth/${action}`,
      route((req, res) => {
        limit(`auth:${req.ip}`, 20);
        const body = req.body || {};
        const user =
          action === "register"
            ? store.register(
                body.email,
                body.name,
                body.password,
                body.timeZone,
              )
            : store.login(body.email, body.password);
        store.logout(token(req));
        const session = store.session(user.id);
        res.setHeader("Set-Cookie", cookie(session));
        res.json({ user });
      }),
    );
  app.get(
    "/api/auth/me",
    route((req, res) => res.json({ user: store.user(token(req)) })),
  );
  app.post(
    "/api/auth/logout",
    route((req, res) => {
      store.logout(token(req));
      res.setHeader("Set-Cookie", cookie("", true));
      res.json({ success: true });
    }),
  );
  app.use("/api", (req, res, next) => {
    try {
      res.locals.user = store.user(token(req));
      next();
    } catch (e) {
      next(e);
    }
  });
  // The authentication middleware above deliberately resolves the account before any ledger route.
  app.get(
    "/api/workspace",
    route((_req, res) =>
      res.json(
        store.read(`personal:${res.locals.user.id}`, res.locals.user.id),
      ),
    ),
  );
  app.put(
    "/api/workspace",
    route((req, res) =>
      res.json(
        store.write(
          `personal:${res.locals.user.id}`,
          res.locals.user.id,
          req.body.ledger,
          req.body.version,
        ),
      ),
    ),
  );
  app.get(
    "/api/rooms",
    route((_req, res) =>
      res.json({ rooms: store.roomsForUser(res.locals.user.id) }),
    ),
  );
  app.post(
    "/api/rooms",
    route((req, res) => {
      limit(`rooms:${res.locals.user.id}`, 30);
      res.json(store.createRoom(res.locals.user.id, req.body.ledger));
    }),
  );
  app.post(
    "/api/rooms/:id/join",
    route((req, res) => {
      limit(`join:${res.locals.user.id}`, 30);
      res.json(
        store.join(String(req.params.id), res.locals.user.id, req.body.token),
      );
    }),
  );
  app.get(
    "/api/rooms/:id",
    route((req, res) =>
      res.json(store.read(String(req.params.id), res.locals.user.id)),
    ),
  );
  app.put(
    "/api/rooms/:id",
    route((req, res) =>
      res.json(
        store.write(
          String(req.params.id),
          res.locals.user.id,
          req.body.ledger,
          req.body.version,
        ),
      ),
    ),
  );
  app.post(
    "/api/rooms/:id/invite",
    route((req, res) =>
      res.json(store.rotateInvite(String(req.params.id), res.locals.user.id)),
    ),
  );
  app.get(
    "/api/rooms/:id/members",
    route((req, res) =>
      res.json({
        members: store.members(String(req.params.id), res.locals.user.id),
      }),
    ),
  );
  app.delete(
    "/api/rooms/:id/members/:userId",
    route((req, res) => {
      store.revoke(
        String(req.params.id),
        res.locals.user.id,
        String(req.params.userId),
      );
      res.json({ success: true });
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        err instanceof AppError
          ? err.status
          : err.type === "entity.too.large"
            ? 413
            : err instanceof SyntaxError
              ? 400
              : 500;
      res.status(status).json({
        error:
          status === 500
            ? "The server could not save this change."
            : err.message,
      });
    },
  );
  return app;
}
