import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import useWorkspace from "../src/hooks/useWorkspace";
import {
  addTransactions,
  createBudget,
  emptyLedger,
  normalizeLedger,
  settleBill,
  todayIn,
} from "../src/domain/ledger";
const browser = new Window({ url: "http://localhost" });
Object.defineProperties(globalThis, {
  window: { value: browser, configurable: true },
  document: { value: browser.document, configurable: true },
  navigator: { value: browser.navigator, configurable: true },
  localStorage: { value: browser.localStorage, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true, writable: true },
});
const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  browser.localStorage.clear();
  globalThis.fetch = originalFetch;
});
test("local workspace serializes commands, persists one atomic snapshot and supports all undo/redo", async () => {
  const errors: string[] = [];
  const { result } = renderHook(() =>
    useWorkspace("local@example.test", false, (e) => errors.push(e), false),
  );
  await waitFor(() => assert.equal(result.current.ready, true));
  await act(async () => {
    await result.current.edit((s) => createBudget(s, "A", 1000, "a"));
    await result.current.edit((s) => createBudget(s, "B", 500, "b"));
  });
  await act(async () => {
    await result.current.edit((s) =>
      addTransactions(
        s,
        [
          {
            id: "a",
            budget: "A",
            amount: 100,
            type: "expense",
            date: "2020-01-01",
            description: "A",
            recurrence: "one-time",
          },
          {
            id: "b",
            budget: "B",
            amount: 50,
            type: "expense",
            date: "2020-01-01",
            description: "B",
            recurrence: "one-time",
          },
        ],
        true,
      ),
    );
  });
  assert.equal(result.current.ledger.budgets.A.balance, 900);
  assert.equal(result.current.ledger.budgets.B.balance, 450);
  await act(async () => {
    await result.current.undo();
  });
  assert.equal(result.current.ledger.budgets.A.balance, 1000);
  assert.equal(result.current.ledger.budgets.B.balance, 500);
  await act(async () => {
    await result.current.redo();
  });
  assert.equal(result.current.ledger.budgets.A.balance, 900);
  assert.equal(result.current.ledger.budgets.B.balance, 450);
  assert.deepEqual(
    JSON.parse(localStorage.getItem("cashdiet:ledger:v1:local@example.test")!),
    result.current.ledger,
  );
  assert.deepEqual(errors, []);
});
test("undo/redo of a bill payment restores both balance and due date", async () => {
  const { result } = renderHook(() =>
    useWorkspace("bill@example.test", false, () => {}, false),
  );
  await waitFor(() => assert.equal(result.current.ready, true));
  const today = todayIn(result.current.ledger.timeZone);
  await act(async () => {
    await result.current.edit((s) =>
      normalizeLedger({
        ...createBudget(s, "A", 1000, "a"),
        bills: [
          {
            id: "rent",
            name: "Rent",
            amount: 100,
            frequency: "Monthly",
            type: "expense",
            icon: "rent",
            dueDate: today,
            budget: "A",
          },
        ],
      }),
    );
    await result.current.edit((s) => settleBill(s, "rent"));
  });
  assert.equal(result.current.ledger.budgets.A.balance, 900);
  const nextDate = result.current.ledger.bills[0].dueDate;
  await act(async () => {
    await result.current.undo();
  });
  assert.equal(result.current.ledger.bills[0].dueDate, today);
  assert.equal(result.current.ledger.budgets.A.balance, 1000);
  await act(async () => {
    await result.current.redo();
  });
  assert.equal(result.current.ledger.bills[0].dueDate, nextDate);
  assert.equal(result.current.ledger.budgets.A.balance, 900);
});
test("changing local profiles clears ledger and undo history", async () => {
  const { result, rerender } = renderHook(
    ({ email }) => useWorkspace(email, false, () => {}, false),
    { initialProps: { email: "a@example.test" } },
  );
  await waitFor(() => assert.equal(result.current.ready, true));
  await act(async () => {
    await result.current.edit((s) => createBudget(s, "Private", 1000, "a"));
  });
  rerender({ email: "b@example.test" });
  await waitFor(() => assert.equal(result.current.ready, true));
  assert.deepEqual(result.current.ledger.budgets, {});
  assert.equal(result.current.canUndo, false);
  rerender({ email: "a@example.test" });
  await waitFor(() => assert.equal(result.current.ready, true));
  assert.equal(result.current.ledger.budgets.Private.balance, 1000);
  assert.equal(result.current.canUndo, false);
});
test("corrupt local data is not overwritten and can be explicitly recovered", async () => {
  const key = "cashdiet:ledger:v1:a@example.test";
  localStorage.setItem(key, "broken");
  const errors: string[] = [];
  const { result } = renderHook(() =>
    useWorkspace("a@example.test", false, (e) => errors.push(e), false),
  );
  await waitFor(() => assert.equal(errors.length, 1));
  assert.equal(result.current.ready, false);
  assert.equal(localStorage.getItem(key), "broken");
  act(() =>
    result.current.recover(createBudget(emptyLedger(), "Recovered", 50, "a")),
  );
  assert.equal(result.current.ready, true);
  assert.equal(result.current.ledger.budgets.Recovered.balance, 50);
  assert.equal(localStorage.getItem(key + ":previous"), "broken");
});
test("hosted commands save serially against current revisions; conflicts keep the last accepted state", async () => {
  let ledger = emptyLedger(),
    version = 1;
  const writes: number[] = [];
  let reject = false;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PUT") {
      const input = JSON.parse(init.body as string);
      writes.push(input.version);
      if (reject)
        return new Response(JSON.stringify({ error: "Revision conflict" }), {
          status: 409,
        });
      assert.equal(input.version, version);
      ledger = normalizeLedger(input.ledger);
      version++;
    }
    return new Response(JSON.stringify({ ledger, version }), { status: 200 });
  };
  const errors: string[] = [];
  const { result } = renderHook(() =>
    useWorkspace("server@example.test", false, (e) => errors.push(e), true),
  );
  await waitFor(() => assert.equal(result.current.ready, true));
  await act(async () => {
    await Promise.all([
      result.current.edit((s) => createBudget(s, "A", 1000, "a")),
      result.current.edit((s) => createBudget(s, "B", 500, "b")),
    ]);
  });
  assert.deepEqual(writes, [1, 2]);
  assert.equal(result.current.ledger.budgets.B.balance, 500);
  reject = true;
  await act(async () => {
    await result.current.edit((s) => createBudget(s, "Rejected", 1, "r"));
  });
  assert.equal(result.current.ledger.budgets.Rejected, undefined);
  assert.match(errors[0], /not confirmed/);
  assert.equal(localStorage.length, 0);
});
test("joining and leaving a room never overwrites the personal ledger", async () => {
  const personal = createBudget(emptyLedger(), "Personal", 1000, "a"),
    shared = createBudget(emptyLedger(), "Shared", 500, "b");
  globalThis.fetch = async (url, init) =>
    new Response(
      JSON.stringify({
        ledger: String(url).includes("/rooms/") ? shared : personal,
        version: 1,
      }),
      { status: 200 },
    );
  const { result } = renderHook(() =>
    useWorkspace("server@example.test", false, () => {}, true),
  );
  await waitFor(() => assert.equal(result.current.ready, true));
  await act(async () => {
    await result.current.switchRoom("room", "secret");
  });
  assert.equal(result.current.ledger.budgets.Shared.balance, 500);
  assert.equal(result.current.canUndo, false);
  await act(async () => {
    await result.current.switchRoom(null);
  });
  assert.equal(result.current.ledger.budgets.Personal.balance, 1000);
  assert.equal(result.current.ledger.budgets.Shared, undefined);
  assert.equal(result.current.canUndo, false);
});
