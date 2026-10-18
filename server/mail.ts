import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export interface Mail {
  to: string;
  subject: string;
  text: string;
  id: string;
}
export interface Mailer {
  ready: boolean;
  send: (mail: Mail) => Promise<void>;
}
export function createMailer(
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
): Mailer {
  const production = env.NODE_ENV === "production";
  const provider = env.MAIL_PROVIDER || (production ? "resend" : "file");
  if (provider === "file") {
    if (production)
      throw new Error("Production cannot use the development email outbox.");
    const directory = path.join(env.DATA_DIR || "data", "mail");
    return {
      ready: true,
      async send(mail) {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.writeFile(
          path.join(directory, randomUUID() + ".json"),
          JSON.stringify(mail, null, 2),
          { mode: 0o600, flag: "wx" },
        );
      },
    };
  }
  if (provider !== "resend")
    throw new Error(
      "MAIL_PROVIDER must be resend (production) or file (development).",
    );
  if (
    !env.RESEND_API_KEY ||
    !env.MAIL_FROM ||
    /[\r\n]/.test(env.MAIL_FROM) ||
    !/.+@.+\..+/.test(env.MAIL_FROM)
  )
    throw new Error(
      "Set RESEND_API_KEY and MAIL_FROM to a verified sender before starting the account service.",
    );
  const key = env.RESEND_API_KEY,
    from = env.MAIL_FROM;
  return {
    ready: true,
    async send(mail) {
      const response = await transport("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": mail.id,
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
      });
      if (!response.ok)
        throw new Error(`Email delivery rejected (${response.status}).`);
    },
  };
}
export function accountLink(
  base: string,
  purpose: "verify" | "reset",
  token: string,
) {
  const url = new URL(base);
  url.search = "";
  url.hash = `${purpose === "verify" ? "verify-email" : "reset-password"}=${token}`;
  return url.href;
}
