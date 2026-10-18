import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addTransactions,
  cents,
  createBudget,
  dateOnly,
  deleteTransactions,
  emptyLedger,
  importFingerprint,
  migrateLedger,
  nextDueDate,
  normalizeLedger,
  removeBudget,
  renameBudget,
  resetBalance,
  settleBill,
  todayIn,
} from "../src/domain/ledger";
import type { Transaction } from "../src/types";
import { generateScheduleDates } from "../src/utils";
const now = new Date("2026-10-18T15:00:00Z");
const today = () => todayIn("America/Chicago");
const base = () =>
  createBudget(
    { ...emptyLedger(), timeZone: "America/Chicago" },
    "A",
    1000,
    "a",
  );
const tx = (
  id: string,
  amount = 100,
  budget = "A",
  date = "2020-01-01",
  type: "profit" | "expense" = "expense",
): Transaction => ({
  id,
  amount,
  budget,
  date,
  type,
  description: id,
  recurrence: "one-time",
});
test("money uses exact cents; rejects nonfinite or excessive amounts", () => {
  assert.equal(cents(1.005), 101);
  assert.equal(cents(-1.005), -101);
  assert.throws(() => cents(Infinity));
  assert.throws(() => cents(NaN));
  assert.throws(() => cents(1e15));
});
test("posted income and expense sum exactly; IDs are idempotent", () => {
  let s = addTransactions(base(), [
    tx("1", 0.1),
    tx("2", 0.2),
    tx("3", 0.3, "A", "2020-01-01", "profit"),
  ]);
  assert.equal(s.budgets.A.balance, 1000);
  s = addTransactions(s, [tx("1", 0.1)]);
  assert.equal(s.transactions.length, 3);
});
test("future recurrence does not reduce current funds and deleting it does not refund", () => {
  const s = addTransactions(base(), [
    tx("now"),
    tx("future", 100, "A", "2099-01-01"),
  ]);
  assert.equal(s.budgets.A.balance, 900);
  assert.equal(s.transactions[1].status, "scheduled");
  assert.equal(deleteTransactions(s, ["future"]).budgets.A.balance, 900);
});
test("scheduled entry posts when due, once, without a double posting", () => {
  let s = base();
  s.transactions = [tx("later", 100, "A", "2026-10-19")];
  s = normalizeLedger(s, now);
  assert.equal(s.budgets.A.balance, 1000);
  s = normalizeLedger(s, new Date("2026-10-19T15:00Z"));
  assert.equal(s.budgets.A.balance, 900);
  assert.equal(
    normalizeLedger(s, new Date("2026-10-19T20:00Z")).budgets.A.balance,
    900,
  );
});
test("deleting entries from several budgets refunds each correctly", () => {
  let s = createBudget(base(), "B", 500, "b");
  s = addTransactions(s, [tx("a"), tx("b", 50, "B")]);
  s = deleteTransactions(s, ["a", "b"]);
  assert.equal(s.budgets.A.balance, 1000);
  assert.equal(s.budgets.B.balance, 500);
});
test("legacy migration preserves current balance; re-normalization does not replay history", () => {
  const s = migrateLedger(
    { A: { name: "A", created: "2020-01-01", balance: 900 } },
    [tx("history")],
    [],
    "UTC",
    now,
  );
  assert.equal(s.budgets.A.openingBalanceCents, 100000);
  assert.equal(s.budgets.A.balance, 900);
  assert.equal(normalizeLedger(s, now).budgets.A.balance, 900);
});
test("atomic snapshot bootstrap preserves opening and current balance", () => {
  const s = addTransactions(base(), [tx("history")]);
  const copy = normalizeLedger(JSON.parse(JSON.stringify(s)));
  assert.equal(copy.budgets.A.balance, 900);
  assert.equal(copy.transactions.length, 1);
});
test("import deduplicates repeat file contents across generated IDs", () => {
  let s = addTransactions(base(), [tx("first")], true);
  s = addTransactions(s, [{ ...tx("different"), description: "first" }], true);
  assert.equal(s.transactions.length, 1);
  assert.equal(s.budgets.A.balance, 900);
});
test("same merchant amount on different dates can be imported", () => {
  const s = addTransactions(
    base(),
    [
      { ...tx("a"), description: "Coffee" },
      { ...tx("b", 100, "A", "2020-01-02"), description: "Coffee" },
    ],
    true,
  );
  assert.equal(s.transactions.length, 2);
});
test("multi-budget import then snapshot undo/redo preserves both balances", () => {
  const before = createBudget(base(), "B", 500, "b");
  const after = addTransactions(before, [tx("a"), tx("b", 50, "B")], true);
  assert.equal(normalizeLedger(before).budgets.A.balance, 1000);
  assert.equal(normalizeLedger(before).budgets.B.balance, 500);
  assert.equal(normalizeLedger(after).budgets.A.balance, 900);
  assert.equal(normalizeLedger(after).budgets.B.balance, 450);
});
test("rename keeps stable IDs and imported duplicate matching", () => {
  let s = addTransactions(base(), [tx("first")], true);
  s = renameBudget(s, "A", "New");
  assert.equal(s.budgets.New.id, "a");
  assert.equal(s.transactions[0].budgetId, "a");
  s = addTransactions(
    s,
    [{ ...tx("second", 100, "New"), description: "first" }],
    true,
  );
  assert.equal(s.transactions.length, 1);
});
test("reset adjusts opening balance rather than adding fake transactions", () => {
  let s = addTransactions(base(), [tx("a")]);
  s = resetBalance(s, "A", 500);
  assert.equal(s.budgets.A.balance, 500);
  assert.equal(s.budgets.A.openingBalanceCents, 60000);
  assert.equal(deleteTransactions(s, ["a"]).budgets.A.balance, 600);
});
test("budget deletion and snapshot restoration preserve ledger", () => {
  const s = addTransactions(base(), [tx("a")]);
  assert.equal(removeBudget(s, "A").transactions.length, 0);
  assert.equal(normalizeLedger(s).budgets.A.balance, 900);
});
test("monthly recurrence clamps without drifting from original day", () => {
  assert.equal(nextDueDate("2026-01-31", "Monthly"), "2026-02-28");
  assert.equal(
    nextDueDate("2026-02-28", "Monthly", "2026-01-31"),
    "2026-03-31",
  );
  assert.deepEqual(generateScheduleDates("2026-01-31", "m", undefined, 1, 3), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31",
  ]);
});
test("leap day yearly recurrence and explicit one-time are respected", () => {
  assert.equal(nextDueDate("2024-02-29", "Yearly"), "2025-02-28");
  assert.equal(nextDueDate("2027-02-28", "Yearly", "2024-02-29"), "2028-02-29");
  assert.deepEqual(generateScheduleDates("2026-01-31", "o", undefined, 1, 20), [
    "2026-01-31",
  ]);
});
test("bill settlement advances calendar and debits funding budget atomically", () => {
  const s = normalizeLedger({
    ...base(),
    bills: [
      {
        id: "bill",
        name: "Rent",
        amount: 100,
        type: "expense",
        icon: "rent",
        frequency: "Monthly",
        dueDate: today(),
        budget: "A",
      },
    ],
  });
  const next = settleBill(s, "bill");
  assert.equal(next.budgets.A.balance, 900);
  assert.equal(next.transactions.length, 1);
  assert.notEqual(next.bills[0].dueDate, s.bills[0].dueDate);
  assert.equal(normalizeLedger(s).budgets.A.balance, 1000);
  assert.equal(normalizeLedger(s).bills[0].dueDate, today());
});
test("future bills cannot be prematurely posted and unassigned bills require funding", () => {
  const bill = {
    id: "x",
    name: "x",
    amount: 100,
    type: "expense" as const,
    icon: "rent" as const,
    frequency: "Monthly",
    dueDate: "2099-01-01",
    budget: "A",
  };
  assert.throws(() => settleBill({ ...base(), bills: [bill] }, "x"));
  assert.throws(() =>
    settleBill(
      { ...base(), bills: [{ ...bill, dueDate: today(), budget: undefined }] },
      "x",
    ),
  );
});
test("invalid transaction/budget/date payloads are rejected atomically", () => {
  const s = base();
  assert.throws(() => addTransactions(s, [tx("ok"), tx("bad", -1)]));
  assert.equal(s.transactions.length, 0);
  assert.throws(() => addTransactions(s, [tx("bad", 1, "missing")]));
  assert.throws(() => createBudget(s, "__proto__", 0));
  assert.throws(() => dateOnly("2026-02-30"));
  assert.throws(() =>
    normalizeLedger({
      ...s,
      transactions: [
        { ...tx("future", 1, "A", "2099-01-01"), status: "posted" },
      ],
    }),
  );
});
test("calendar day follows workspace timezone around UTC midnight", () => {
  assert.equal(
    todayIn("America/Chicago", new Date("2026-10-19T02:00Z")),
    "2026-10-18",
  );
});
test("same-file restore round trip is lossless", () => {
  const s = addTransactions(
    base(),
    [tx("a"), tx("b", 10, "A", "2099-01-01")],
    true,
  );
  assert.deepEqual(normalizeLedger(JSON.parse(JSON.stringify(s))), s);
});
test("import preserves repeated identical purchases within a file but repeated files remain idempotent", () => {
  const rows = [
    { ...tx("one"), description: "Coffee" },
    { ...tx("two"), description: "Coffee" },
  ];
  let ledger = addTransactions(base(), rows, true);
  assert.equal(ledger.transactions.length, 2);
  assert.equal(ledger.budgets.A.balance, 800);
  ledger = addTransactions(
    ledger,
    rows.map((t, i) => ({ ...t, id: "repeat" + i })),
    true,
  );
  assert.equal(ledger.transactions.length, 2);
  assert.equal(ledger.budgets.A.balance, 800);
});
test("stale bill clicks cannot settle the following overdue occurrence", () => {
  const ledger = normalizeLedger({
    ...base(),
    bills: [
      {
        id: "bill",
        name: "Rent",
        amount: 100,
        type: "expense",
        icon: "rent",
        frequency: "Monthly",
        dueDate: "2020-01-31",
        budget: "A",
      },
    ],
  });
  const paid = settleBill(ledger, "bill", undefined, "2020-01-31");
  assert.throws(() => settleBill(paid, "bill", undefined, "2020-01-31"));
  assert.equal(paid.transactions.length, 1);
});
