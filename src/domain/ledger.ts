import type { Budget, Transaction } from "../types";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  type: "expense" | "profit";
  icon: "subscription" | "rent" | "salary";
  dueDate?: string;
  budget?: string;
  anchorDate?: string;
}
export interface Ledger {
  schemaVersion: 1;
  timeZone: string;
  budgets: Record<string, Budget>;
  transactions: Transaction[];
  bills: Bill[];
}
export const emptyLedger = (): Ledger => ({
  schemaVersion: 1,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  budgets: {},
  transactions: [],
  bills: [],
});
export function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Enter a finite money amount.");
  const n = Math.round((value + Math.sign(value) * Number.EPSILON) * 100);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 1e12)
    throw new Error("Money amount is outside the supported range.");
  return n;
}
export function todayIn(timeZone: string, now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
}
export function dateOnly(value: unknown): string {
  if (typeof value !== "string") throw new Error("A date is required.");
  const d = value.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
    !Number.isFinite(Date.parse(d + "T00:00:00Z")) ||
    new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d
  )
    throw new Error("Use a valid YYYY-MM-DD date.");
  return d;
}
function name(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 120 ||
    ["__proto__", "prototype", "constructor"].includes(value)
  )
    throw new Error("Use a valid budget name (120 characters maximum).");
  return value.trim();
}
function text(value: unknown, limit = 500): string {
  if (typeof value !== "string" || value.length > limit)
    throw new Error("Invalid text field.");
  return value;
}
export function isPosted(tx: Transaction, day: string): boolean {
  return tx.status === "posted" || dateOnly(tx.date) <= day;
}
export function impact(tx: Transaction): number {
  return (tx.type === "profit" ? 1 : -1) * cents(tx.amount);
}
export function normalizeLedger(raw: Ledger, now = new Date()): Ledger {
  if (
    !raw ||
    raw.schemaVersion !== 1 ||
    !raw.budgets ||
    Array.isArray(raw.budgets) ||
    !Array.isArray(raw.transactions) ||
    !Array.isArray(raw.bills)
  )
    throw new Error("Invalid ledger format.");
  const day = todayIn(raw.timeZone, now);
  if (
    Object.keys(raw.budgets).length > 1000 ||
    raw.transactions.length > 50000 ||
    raw.bills.length > 1000
  )
    throw new Error("Ledger size limit exceeded.");
  const budgets: Record<string, Budget> = {};
  const budgetIds = new Set<string>();
  for (const [key, b] of Object.entries(raw.budgets)) {
    if (
      name(key) !== key ||
      b.name !== key ||
      typeof b.id !== "string" ||
      !b.id ||
      budgetIds.has(b.id) ||
      !Number.isSafeInteger(b.openingBalanceCents) ||
      Math.abs(b.openingBalanceCents!) > 1e12
    )
      throw new Error("Invalid budget.");
    budgetIds.add(b.id);
    budgets[key] = {
      id: b.id,
      name: key,
      created: dateOnly(b.created),
      openingBalanceCents: b.openingBalanceCents,
      balance: b.openingBalanceCents! / 100,
      ...(b.targetBalance !== undefined
        ? { targetBalance: cents(b.targetBalance) / 100 }
        : {}),
    };
  }
  const ids = new Set<string>();
  const transactions = raw.transactions.map((t) => {
    if (
      !t ||
      typeof t.id !== "string" ||
      !t.id ||
      t.id.length > 200 ||
      ids.has(t.id) ||
      !Object.hasOwn(budgets, t.budget) ||
      (t.type !== "profit" && t.type !== "expense") ||
      cents(t.amount) <= 0
    )
      throw new Error("Invalid or duplicate transaction.");
    ids.add(t.id);
    const date = dateOnly(t.date);
    if (t.status && t.status !== "posted" && t.status !== "scheduled")
      throw new Error("Invalid posting status.");
    if (t.status === "posted" && date > day)
      throw new Error("A future transaction must remain scheduled.");
    const tx: Transaction = {
      id: t.id,
      budget: t.budget,
      budgetId: budgets[t.budget].id,
      date,
      type: t.type,
      amount: cents(t.amount) / 100,
      description: text(t.description),
      recurrence: text(t.recurrence, 100),
      status: date <= day ? "posted" : "scheduled",
      ...(t.importKey ? { importKey: text(t.importKey, 1500) } : {}),
    };
    if (isPosted(tx, day))
      budgets[t.budget].balance =
        (cents(budgets[t.budget].balance) + impact(tx)) / 100;
    return tx;
  });
  for (const b of Object.values(budgets)) cents(b.balance);
  const billIds = new Set<string>();
  const bills = raw.bills.map((b) => {
    if (
      !b ||
      typeof b.id !== "string" ||
      !b.id ||
      billIds.has(b.id) ||
      cents(b.amount) <= 0 ||
      !["expense", "profit"].includes(b.type) ||
      !["subscription", "rent", "salary"].includes(b.icon) ||
      !["Daily", "Weekly", "Bi-weekly", "Monthly", "Yearly"].includes(
        b.frequency,
      )
    )
      throw new Error("Invalid recurring bill.");
    billIds.add(b.id);
    if (b.budget && !Object.hasOwn(budgets, b.budget))
      throw new Error("The bill funding budget does not exist.");
    return {
      ...b,
      name: text(b.name, 120),
      amount: cents(b.amount) / 100,
      dueDate: b.dueDate ? dateOnly(b.dueDate) : day,
      anchorDate: b.anchorDate
        ? dateOnly(b.anchorDate)
        : b.dueDate
          ? dateOnly(b.dueDate)
          : day,
    };
  });
  return {
    schemaVersion: 1,
    timeZone: raw.timeZone,
    budgets,
    transactions,
    bills,
  };
}
// Legacy balances already include posted history. Infer an opening balance once;
// never replay history against the displayed current balance.
export function migrateLedger(
  budgets: Record<string, Budget>,
  transactions: Transaction[],
  bills: Bill[] = [],
  timeZone = emptyLedger().timeZone,
  now = new Date(),
): Ledger {
  const day = todayIn(timeZone, now),
    copied = structuredClone(budgets);
  for (const [key, b] of Object.entries(copied)) {
    b.id ||= `legacy:${key}`;
    b.created = dateOnly(b.created);
    b.openingBalanceCents ??=
      cents(b.balance) -
      transactions
        .filter((t) => t.budget === key && dateOnly(t.date) <= day)
        .reduce((sum, t) => sum + impact(t), 0);
  }
  return normalizeLedger(
    {
      schemaVersion: 1,
      timeZone,
      budgets: copied,
      transactions: transactions.map((t) => ({
        ...t,
        status: dateOnly(t.date) <= day ? "posted" : "scheduled",
      })),
      bills,
    },
    now,
  );
}
export function importFingerprint(tx: Transaction): string {
  return JSON.stringify([
    tx.budgetId || tx.budget,
    dateOnly(tx.date),
    tx.type,
    cents(tx.amount),
    tx.description.trim().toLowerCase(),
  ]);
}
export function addTransactions(
  state: Ledger,
  input: Transaction[],
  imported = false,
): Ledger {
  const next = structuredClone(state),
    ids = new Set(next.transactions.map((t) => t.id));
  const existing = new Map<string, number>(),
    occurrences = new Map<string, number>();
  for (const t of next.transactions) {
    const k = importFingerprint(t);
    existing.set(k, (existing.get(k) || 0) + 1);
  }
  for (const item of input) {
    const tx = { ...item, budgetId: next.budgets[item.budget]?.id };
    const key = importFingerprint(tx);
    const occurrence = (occurrences.get(key) || 0) + 1;
    occurrences.set(key, occurrence);
    if (
      ids.has(item.id) ||
      (imported && occurrence <= (existing.get(key) || 0))
    )
      continue;
    if (imported) tx.importKey = key;
    next.transactions.push(tx);
    ids.add(tx.id);
  }
  return normalizeLedger(next);
}
export function deleteTransactions(state: Ledger, ids: string[]): Ledger {
  return normalizeLedger({
    ...state,
    transactions: state.transactions.filter((t) => !ids.includes(t.id)),
  });
}
export function createBudget(
  state: Ledger,
  budgetName: string,
  balance: number,
  id: string = crypto.randomUUID(),
): Ledger {
  const key = name(budgetName);
  if (Object.hasOwn(state.budgets, key))
    throw new Error("A budget with that name already exists.");
  return normalizeLedger({
    ...state,
    budgets: {
      ...state.budgets,
      [key]: {
        id,
        name: key,
        created: todayIn(state.timeZone),
        balance,
        openingBalanceCents: cents(balance),
      },
    },
  });
}
export function renameBudget(
  state: Ledger,
  oldName: string,
  newName: string,
): Ledger {
  const key = name(newName);
  if (!state.budgets[oldName] || Object.hasOwn(state.budgets, key))
    throw new Error("Budget missing or name already used.");
  const budgets = {
    ...state.budgets,
    [key]: { ...state.budgets[oldName], name: key },
  };
  delete budgets[oldName];
  return normalizeLedger({
    ...state,
    budgets,
    transactions: state.transactions.map((t) =>
      t.budget === oldName ? { ...t, budget: key, importKey: undefined } : t,
    ),
    bills: state.bills.map((b) =>
      b.budget === oldName ? { ...b, budget: key } : b,
    ),
  });
}
export function removeBudget(state: Ledger, key: string): Ledger {
  const budgets = { ...state.budgets };
  delete budgets[key];
  return normalizeLedger({
    ...state,
    budgets,
    transactions: state.transactions.filter((t) => t.budget !== key),
    bills: state.bills.filter((b) => b.budget !== key),
  });
}
export function resetBalance(
  state: Ledger,
  key: string,
  balance: number,
): Ledger {
  const b = state.budgets[key];
  if (!b) throw new Error("Budget not found.");
  return normalizeLedger({
    ...state,
    budgets: {
      ...state.budgets,
      [key]: {
        ...b,
        openingBalanceCents:
          b.openingBalanceCents! + cents(balance) - cents(b.balance),
      },
    },
  });
}
export function nextDueDate(
  date: string,
  frequency: string,
  anchor = date,
): string {
  const current = new Date(dateOnly(date) + "T12:00:00Z"),
    original = new Date(dateOnly(anchor) + "T12:00:00Z");
  const freq = frequency.toLowerCase();
  const days =
    freq === "daily" || freq === "d"
      ? 1
      : freq === "weekly" || freq === "w"
        ? 7
        : ["bi-weekly", "biweekly", "b"].includes(freq)
          ? 14
          : 0;
  if (days) current.setUTCDate(current.getUTCDate() + days);
  else {
    const year =
        current.getUTCFullYear() + (freq === "yearly" || freq === "y" ? 1 : 0),
      month =
        current.getUTCMonth() + (freq === "yearly" || freq === "y" ? 0 : 1);
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    current.setUTCDate(1);
    current.setUTCFullYear(year, month, Math.min(original.getUTCDate(), last));
  }
  return current.toISOString().slice(0, 10);
}
export function settleBill(
  state: Ledger,
  id: string,
  budgetName?: string,
  expectedDate?: string,
): Ledger {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) throw new Error("Bill not found.");
  if (expectedDate && bill.dueDate !== expectedDate)
    throw new Error(
      "This bill occurrence has changed. Check the next due date.",
    );
  const budget = bill.budget || budgetName;
  if (!budget || !state.budgets[budget])
    throw new Error("Choose a funding budget for this bill.");
  const day = todayIn(state.timeZone);
  if (bill.dueDate! > day) throw new Error("This bill is not due yet.");
  const tx: Transaction = {
    id: `bill:${bill.id}:${bill.dueDate}`,
    budget,
    date: day,
    status: "posted",
    type: bill.type,
    amount: bill.amount,
    description: bill.name,
    recurrence: bill.frequency,
  };
  if (state.transactions.some((t) => t.id === tx.id))
    throw new Error("This bill occurrence is already paid.");
  return normalizeLedger({
    ...state,
    transactions: [...state.transactions, tx],
    bills: state.bills.map((b) =>
      b.id === id
        ? {
            ...b,
            budget,
            dueDate: nextDueDate(b.dueDate!, b.frequency, b.anchorDate),
          }
        : b,
    ),
  });
}
