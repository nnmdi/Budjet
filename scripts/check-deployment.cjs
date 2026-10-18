const assert = require("node:assert/strict");
(async () => {
  const target = process.argv[2];
  if (!target)
    throw new Error(
      "Usage: npm run check:deployment -- https://your-app-origin [--allow-http]",
    );
  const base = new URL(target);
  if (base.origin !== target || base.username || base.password)
    throw new Error("Use an exact origin without a path or credentials.");
  if (base.protocol !== "https:" && !process.argv.includes("--allow-http"))
    throw new Error(
      "Deployment checks require HTTPS; --allow-http is only for local container tests.",
    );
  for (const [route, status] of [
    ["/api/health", 200],
    ["/api/ready", 200],
    ["/api/workspace", 401],
  ]) {
    const r = await fetch(base.origin + route, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(r.status, status, route + " returned an unexpected status");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
    assert.ok(r.headers.get("content-security-policy"));
    assert.ok(r.headers.get("x-request-id"));
  }
  const reject = await fetch(base.origin + "/api/auth/forgot-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.invalid",
    },
    body: '{"email":"no-delivery@example.test"}',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(reject.status, 403);
  console.log(
    "Deployment checks passed: liveness, readiness, unauthenticated denial, security headers, and rejected untrusted Origin. No emails sent or accounts created.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
