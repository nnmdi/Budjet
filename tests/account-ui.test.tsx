import { browser } from "./dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AccountAction, {
  readAccountLink,
} from "../src/components/AccountAction";
import AuthOverlay from "../src/components/AuthOverlay";
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  browser.location.hash = "";
  browser.localStorage.clear();
});
test("opening a reset link clears browser history and never consumes it automatically", async () => {
  const token = "a".repeat(64);
  browser.location.hash = "#reset-password=" + token;
  assert.equal(readAccountLink()!.token, token);
  const requests: { path: string; body: any }[] = [];
  globalThis.fetch = async (url, options) => {
    requests.push({
      path: String(url),
      body: JSON.parse(String(options?.body)),
    });
    return new Response(
      JSON.stringify({ message: "Password changed. Sign in again." }),
      { status: 200 },
    );
  };
  const view = render(
    <AccountAction
      action={{ purpose: "reset", token }}
      hosted
      onDone={() => {}}
    />,
  );
  assert.equal(browser.location.hash, "");
  assert.equal(requests.length, 0);
  fireEvent.change(view.getByLabelText("New password"), {
    target: { value: "new-password-12345" },
  });
  fireEvent.change(view.getByLabelText("Confirm new password"), {
    target: { value: "new-password-12345" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Change password" }).closest("form")!,
  );
  await waitFor(() => assert.ok(view.getByRole("status")));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/api/auth/reset-password");
  assert.equal(requests[0].body.token, token);
  assert.equal(browser.localStorage.length, 0);
});
test("verification requires an explicit password submission", async () => {
  let submitted = false;
  globalThis.fetch = async () => {
    submitted = true;
    return new Response(
      JSON.stringify({ message: "Email confirmed. Sign in." }),
      { status: 200 },
    );
  };
  const view = render(
    <AccountAction
      action={{ purpose: "verify", token: "b".repeat(64) }}
      hosted
      onDone={() => {}}
    />,
  );
  assert.equal(submitted, false);
  fireEvent.change(view.getByLabelText("Account password"), {
    target: { value: "account-password-12345" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Confirm email" }).closest("form")!,
  );
  await waitFor(() => assert.ok(view.getByRole("status")));
  assert.equal(submitted, true);
});
test("forgot password UI sends the email alone and does not log in", async () => {
  let login = false,
    payload: any;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "/api/auth/forgot-password");
    payload = JSON.parse(String(options?.body));
    return new Response(
      JSON.stringify({ message: "If eligible, check your inbox." }),
      { status: 202 },
    );
  };
  const view = render(
    <AuthOverlay
      hosted
      onLogin={() => {
        login = true;
      }}
      onGuest={() => {}}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Forgot password?" }));
  assert.equal(view.queryByLabelText("Password"), null);
  fireEvent.change(view.getByLabelText("Email"), {
    target: { value: "person@example.test" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Send recovery email" }).closest("form")!,
  );
  await waitFor(() => assert.ok(view.getByRole("status")));
  assert.deepEqual(payload, { email: "person@example.test" });
  assert.equal(login, false);
});
test("registration waits for email confirmation rather than creating a browser session", async () => {
  let login = false;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Check your email to confirm." }), {
      status: 202,
    });
  const view = render(
    <AuthOverlay
      hosted
      onLogin={() => {
        login = true;
      }}
      onGuest={() => {}}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Create a new account" }));
  fireEvent.change(view.getByLabelText("Name"), {
    target: { value: "Account" },
  });
  fireEvent.change(view.getByLabelText("Email"), {
    target: { value: "person@example.test" },
  });
  fireEvent.change(view.getByLabelText("Password (at least 12 characters)"), {
    target: { value: "account-password-12345" },
  });
  fireEvent.change(view.getByLabelText("Confirm password"), {
    target: { value: "account-password-12345" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Create account" }).closest("form")!,
  );
  await waitFor(() => assert.ok(view.getByRole("status")));
  assert.equal(login, false);
});
