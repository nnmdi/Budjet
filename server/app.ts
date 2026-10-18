import helmet from "helmet";
import { accountLink, Mailer } from "./mail";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import { AppError, Store } from "./store";

export function createApp(
  store: Store,
  options: {
    origin: string;
    production?: boolean;
    crossSite?: boolean;
    cors?: string[];
    mailer?: Mailer;
    publicAppUrl?: string;
    log?: (event: Record<string, unknown>) => void;
  },
) {
  const app = express(),
    allowed = new Set([options.origin, ...(options.cors || [])]);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: options.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
              ],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
      strictTransportSecurity: options.production
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.on("finish", () =>
      options.log?.({
        event: "request_completed",
        requestId,
        status: res.statusCode,
        method: req.method,
        route: req.route?.path || "unmatched",
      }),
    );
    next();
  });
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
  app.use("/api/auth", express.json({ limit: "16kb" }));
  app.use(express.json({ limit: "10mb" }));
  const limit = (key: string, max: number, windowMs?: number) =>
    store.rateLimit(key, max, windowMs);
  const mailer = options.mailer;
  const pending = new Set<Promise<unknown>>();
  const queueMail = (task: () => Promise<void>) => {
    const id = randomUUID();
    const job = Promise.resolve()
      .then(task)
      .catch(() =>
        options.log?.({ event: "email_delivery_failed", requestId: id }),
      )
      .finally(() => pending.delete(job));
    pending.add(job);
  };
  app.locals.drainEmail = () => Promise.allSettled([...pending]);
  const sendToken = (email: string, purpose: "verify" | "reset") => {
    const item = store.issueEmailToken(email, purpose);
    if (!item) return;
    const link = accountLink(
      options.publicAppUrl || options.origin,
      purpose,
      item.token,
    );
    const verify = purpose === "verify";
    queueMail(async () => {
      try {
        if (!mailer) throw new Error("Email service unavailable.");
        await mailer.send({
          id: randomUUID(),
          to: item.email,
          subject: verify
            ? "Confirm your Cash Diet email"
            : "Reset your Cash Diet password",
          text: verify
            ? `You requested a Cash Diet account. Open this link and enter the password you chose to confirm your email:\n\n${link}\n\nThis link expires in 24 hours and works once. If you did not create this account, do not confirm it. You can use password recovery to secure an account registered with your email.`
            : `Open this link to choose a new Cash Diet password:\n\n${link}\n\nThis link expires in 30 minutes and works once. If you did not request this, ignore the email. Never share this link.`,
        });
      } catch (error) {
        store.discardEmailToken(item.token);
        throw error;
      }
    });
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
        Promise.resolve(fn(req, res)).catch(next);
      } catch (e) {
        next(e);
      }
    };
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get(
    "/api/ready",
    route((_req, res) => {
      try {
        if (!store.ready() || !mailer?.ready) throw new Error();
        res.json({ ok: true });
      } catch {
        res.status(503).json({ ok: false });
      }
    }),
  );
  app.post(
    "/api/auth/register",
    route(async (req, res) => {
      limit(`auth:${req.ip}`, 20);
      if (!mailer?.ready)
        throw new AppError(503, "Email service is not configured.");
      const body = req.body || {};
      limit(
        `email-address:${String(body.email).trim().toLowerCase()}`,
        3,
        3600000,
      );
      try {
        await store.register(
          body.email,
          body.name,
          body.password,
          body.timeZone,
        );
        sendToken(body.email, "verify");
      } catch (error) {
        if (!(error instanceof AppError && error.status === 409)) throw error;
      }
      res.status(202).json({
        message:
          "Check your inbox to confirm your email. If you already have an account, sign in or use password recovery.",
      });
    }),
  );
  app.post(
    "/api/auth/login",
    route(async (req, res) => {
      limit(`auth:${req.ip}`, 20);
      const user = await store.login(req.body?.email, req.body?.password);
      store.logout(token(req));
      const session = store.session(user.id, user.authVersion);
      const { authVersion, ...publicUser } = user;
      res.setHeader("Set-Cookie", cookie(session));
      res.json({ user: publicUser });
    }),
  );
  const accepted = {
    message:
      "If this address is eligible, an email will arrive shortly. Check your inbox and spam folder.",
  };
  for (const [endpoint, purpose] of [
    ["forgot-password", "reset"],
    ["resend-verification", "verify"],
  ] as const) {
    app.post(
      `/api/auth/${endpoint}`,
      route(async (req, res) => {
        limit(`email-ip:${req.ip}`, 15);
        if (!mailer?.ready)
          throw new AppError(503, "Email service is not configured.");
        const email =
          typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
        if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
          throw new AppError(400, "Enter a valid email address.");
        limit(`email-address:${email}`, 3, 3600000);
        sendToken(email, purpose);
        await delay(150);
        res.status(202).json(accepted);
      }),
    );
  }
  app.post(
    "/api/auth/verify-email",
    route(async (req, res) => {
      limit(`token:${req.ip}`, 20);
      await store.verifyEmail(req.body?.token, req.body?.password);
      res.setHeader("Set-Cookie", cookie("", true));
      res.json({ message: "Email confirmed. Sign in with your password." });
    }),
  );
  app.post(
    "/api/auth/reset-password",
    route(async (req, res) => {
      limit(`token:${req.ip}`, 20);
      if (req.body?.password !== req.body?.confirmPassword)
        throw new AppError(400, "The passwords do not match.");
      const user = await store.resetPassword(
        req.body?.token,
        req.body?.password,
      );
      if (mailer)
        queueMail(() =>
          mailer.send({
            id: randomUUID(),
            to: user.email,
            subject: "Your Cash Diet password was changed",
            text: "Your Cash Diet password was changed and all existing sessions were signed out. If this was not you, use password recovery immediately. No password is included in this email.",
          }),
        );
      res.setHeader("Set-Cookie", cookie("", true));
      res.json({
        message:
          "Password changed. All devices were signed out. Sign in with your new password.",
      });
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
