import { browser } from "./dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {
  render,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import App from "../src/App";
afterEach(() => {
  cleanup();
  browser.localStorage.clear();
});
test("local profile UI creates a budget, records an expense, and undoes/redoes the balance", async () => {
  const view = render(<App />);
  assert.equal(view.queryByLabelText(/Password/), null);
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "Test" } });
  fireEvent.change(view.getByLabelText("Email"), {
    target: { value: "ui@example.test" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Open local profile" }).closest("form")!,
  );
  await waitFor(() =>
    assert.ok(view.getByRole("button", { name: "Create New Budget Now" })),
  );
  fireEvent.click(view.getByRole("button", { name: "Create New Budget Now" }));
  fireEvent.change(view.getByPlaceholderText("e.g. Savings Bucket"), {
    target: { value: "Everyday" },
  });
  fireEvent.change(view.getByPlaceholderText("0.00"), {
    target: { value: "1000" },
  });
  fireEvent.click(view.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    assert.ok(view.getByRole("heading", { name: "Everyday" })),
  );
  fireEvent.click(view.getByRole("button", { name: "Manage" }));
  fireEvent.change(view.getByPlaceholderText("0.00"), {
    target: { value: "100" },
  });
  fireEvent.submit(
    view.getByRole("button", { name: "Confirm Transaction" }).closest("form")!,
  );
  const saved = () =>
    JSON.parse(localStorage.getItem("cashdiet:ledger:v1:ui@example.test")!);
  await waitFor(() => assert.equal(saved().budgets.Everyday.balance, 900));
  fireEvent.click(view.getByTitle("Undo last action"));
  await waitFor(() => assert.equal(saved().budgets.Everyday.balance, 1000));
  fireEvent.click(view.getByTitle("Redo action"));
  await waitFor(() => assert.equal(saved().budgets.Everyday.balance, 900));
  assert.equal(saved().transactions.length, 1);
  fireEvent.click(view.getByRole("button", { name: "Logout" }));
  await waitFor(() =>
    assert.ok(view.getByRole("button", { name: "Open local profile" })),
  );
});
