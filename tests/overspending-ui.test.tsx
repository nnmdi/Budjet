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
