import { browser } from "./dom";
import React from "react";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, fireEvent, cleanup } from "@testing-library/react";
import OverspendingAlerts from "../src/components/OverspendingAlerts";
import {
  addTransactions,
  createBudget,
  emptyLedger,
  todayIn,
} from "../src/domain/ledger";
Object.defineProperty(globalThis, "FormData", {
  value: browser.FormData,
  configurable: true,
});
afterEach(() => {
  cleanup();
  browser.localStorage.clear();
});
test("saving limits, acknowledging, escalation and reviewing a budget work through the UI", () => {
  let ledger = createBudget(emptyLedger(), "Food", 1000, "food");
  ledger = addTransactions(ledger, [
    {
      id: "x",
      budget: "Food",
      type: "expense",
      amount: 80,
      date: todayIn(ledger.timeZone),
      description: "Food",
      recurrence: "one-time",
    },
  ]);
  let reviewed = "";
  const view = render(
    <OverspendingAlerts
      ledger={ledger}
      scope="profile-a"
      onReview={(name) => {
        reviewed = name;
      }}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Set limits" }));
  fireEvent.change(view.getByLabelText("Monthly spending limit ($)"), {
    target: { value: "100" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Save Food limits" }).closest("form")!,
  );
  assert.ok(view.getByText(/Approaching your monthly limit/));
  fireEvent.click(view.getByRole("button", { name: "Review Food" }));
  assert.equal(reviewed, "Food");
  fireEvent.click(view.getByRole("button", { name: "Acknowledge" }));
  assert.equal(view.queryByText(/Approaching your monthly limit/), null);
  view.unmount();
  const restored = render(
    <OverspendingAlerts
      ledger={ledger}
      scope="profile-a"
      onReview={() => {}}
    />,
  );
  assert.equal(restored.queryByText(/Approaching your monthly limit/), null);
  ledger = addTransactions(ledger, [
    {
      id: "y",
      budget: "Food",
      type: "expense",
      amount: 21,
      date: todayIn(ledger.timeZone),
      description: "More food",
      recurrence: "one-time",
    },
  ]);
  restored.rerender(
    <OverspendingAlerts
      ledger={ledger}
      scope="profile-a"
      onReview={() => {}}
    />,
  );
  assert.ok(restored.getByText(/Monthly limit exceeded/));
  restored.unmount();
  const other = render(
    <OverspendingAlerts
      ledger={ledger}
      scope="profile-b"
      onReview={() => {}}
    />,
  );
  assert.equal(other.queryByText(/Monthly limit exceeded/), null);
});

test("hosted limits load from the server and rejected saves never claim success", async () => {
  const { waitFor } = await import("@testing-library/react");
  const originalFetch = globalThis.fetch;
  let revision = 3,
    reject = false;
  const ledger = createBudget(emptyLedger(), "Food", 1000, "food");
  const key = ledger.budgets.Food.id!;
  let preferences = {
    rules: { [key]: { limit: 200, reserve: 0 } },
    acknowledged: [],
  };
  let sent: any;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "PUT") {
      sent = JSON.parse(String(options.body));
      if (reject)
        return new Response(
          JSON.stringify({ error: "Settings changed elsewhere." }),
          { status: 409 },
        );
      preferences = sent.preferences;
      revision++;
    }
    const { spendingStatus } = await import("../src/domain/overspending");
    return new Response(
      JSON.stringify({
        preferences,
        version: revision,
        states: spendingStatus(ledger, preferences.rules),
      }),
    );
  };
  try {
    const view = render(
      <OverspendingAlerts
        ledger={ledger}
        scope="hosted"
        hosted
        onReview={() => {}}
      />,
    );
    await waitFor(() => assert.ok(view.getByText(/Account-backed limits/)));
    fireEvent.click(view.getByRole("button", { name: "Set limits" }));
    const input = () =>
      view.getByLabelText("Monthly spending limit ($)") as HTMLInputElement;
    assert.equal(input().value, "200");
    fireEvent.change(input(), { target: { value: "250" } });
    fireEvent.submit(
      view.getByRole("button", { name: "Save Food limits" }).closest("form")!,
    );
    await waitFor(() => assert.equal(sent.version, 3));
    await waitFor(() => assert.equal(input().value, "250"));
    reject = true;
    await waitFor(() =>
      assert.equal(
        (
          view.getByRole("button", {
            name: "Save Food limits",
          }) as HTMLButtonElement
        ).disabled,
        false,
      ),
    );
    fireEvent.change(input(), { target: { value: "300" } });
    fireEvent.submit(
      view.getByRole("button", { name: "Save Food limits" }).closest("form")!,
    );
    await waitFor(() =>
      assert.ok(view.getByRole("alert").textContent?.includes("not saved")),
    );
    assert.equal(preferences.rules[key].limit, 250);
    assert.equal(
      localStorage.getItem("cashdiet:spending-alerts:v1:hosted"),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
