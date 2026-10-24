import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyLedger,
  createBudget,
  addTransactions,
  deleteTransactions,
  renameBudget,
} from "../src/domain/ledger";
import { spendingStatus, budgetKey } from "../src/domain/overspending";
const now = new Date("2026-10-15T12:00:00Z");
function fixture(amount: number) {
  let l = createBudget(
    { ...emptyLedger(), timeZone: "America/Chicago" },
    "Food",
    500,
    "food",
  );
  l = addTransactions(l, [
    {
      id: "tx",
      budget: "Food",
      type: "expense",
      amount,
      date: "2026-10-10",
      description: "Groceries",
      recurrence: "one-time",
    },
  ]);
  const key = budgetKey(l.budgets.Food);
  return { l, rules: { [key]: { limit: 100, reserve: 0 } } };
}
test("80%, reached and exceeded monthly limits have distinct escalation identities", () => {
  for (const [amount, kind, severity] of [
    [80, "near", "warning"],
    [100, "reached", "critical"],
    [100.01, "over", "critical"],
  ] as const) {
    const { l, rules } = fixture(amount);
    const s = spendingStatus(l, rules, now)[0];
    assert.equal(s.spent, Math.round(amount * 100));
    assert.ok(
      s.alerts.some(
        (a) => JSON.parse(a.id)[2] === kind && a.severity === severity,
      ),
    );
  }
});
test("income does not offset spending and future, scheduled and prior-month expenses do not count", () => {
  const { l, rules } = fixture(80);
  l.transactions.push(
    ...[
      {
        ...l.transactions[0],
        id: "income",
        type: "profit" as const,
        amount: 100,
      },
      { ...l.transactions[0], id: "future", date: "2026-10-20", amount: 900 },
      {
        ...l.transactions[0],
        id: "scheduled",
        status: "scheduled" as const,
        amount: 900,
      },
      { ...l.transactions[0], id: "prior", date: "2026-09-20", amount: 900 },
    ],
  );
  assert.equal(spendingStatus(l, rules, now)[0].spent, 8000);
});
test("undo/delete recalculates spending rather than preserving stale alerts", () => {
  const { l, rules } = fixture(101);
  const fixed = deleteTransactions(l, ["tx"]);
  assert.equal(spendingStatus(fixed, rules, now)[0].alerts.length, 0);
});
test("stable budget IDs retain limits after a rename", () => {
  const { l, rules } = fixture(80);
  const renamed = renameBudget(l, "Food", "Groceries");
  const s = spendingStatus(renamed, rules, now)[0];
  assert.equal(s.limit, 10000);
  assert.equal(s.spent, 8000);
  assert.equal(s.alerts[0].budget, "Groceries");
});
test("negative balances trigger without settings; reserves are independent of monthly limits", () => {
  const { l, rules } = fixture(10);
  l.budgets.Food.balance = -5;
  assert.ok(
    spendingStatus(l, {}, now)[0].alerts.some((a) => a.severity === "critical"),
  );
  l.budgets.Food.balance = 20;
  Object.values(rules)[0].reserve = 50;
  assert.ok(
    spendingStatus(l, rules, now)[0].alerts.some(
      (a) => JSON.parse(a.id)[2] === "reserve",
    ),
  );
});
test("pace warnings require seven days and avoid duplicating threshold alerts", () => {
  const { l, rules } = fixture(60);
  l.transactions[0].date = "2026-10-01";
  assert.equal(
    spendingStatus(l, rules, new Date("2026-10-06T12:00:00Z"))[0].alerts.length,
    0,
  );
  assert.equal(
    JSON.parse(spendingStatus(l, rules, now)[0].alerts[0].id)[2],
    "pace",
  );
  l.transactions[0].amount = 80;
  assert.equal(spendingStatus(l, rules, now)[0].alerts.length, 1);
});
test("monthly resets use workspace timezone at UTC month boundaries", () => {
  const { l, rules } = fixture(80);
  assert.equal(
    spendingStatus(l, rules, new Date("2026-11-01T01:00:00Z"))[0].spent,
    8000,
  );
  assert.equal(
    spendingStatus(l, rules, new Date("2026-11-01T07:00:00Z"))[0].spent,
    0,
  );
});
test("daily allowance handles final day and cents precisely", () => {
  const { l, rules } = fixture(80.01);
  const s = spendingStatus(l, rules, new Date("2026-10-31T12:00:00Z"))[0];
  assert.equal(s.daysLeft, 1);
  assert.equal(s.dailyAllowance, 1999);
});
