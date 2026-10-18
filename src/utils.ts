import { dateOnly } from "./domain/ledger";
import { Budget, Transaction } from "./types";

// Format value as USDcurrency
export function formatCurrency(amount: number): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  return formatter.format(amount);
}

// Add month offset with leap-year awareness (translation of add_months in python)
export function addMonths(startDate: Date, months: number): Date {
  const d = new Date(startDate.getTime());
  const expectedMonth = (((startDate.getMonth() + months) % 12) + 12) % 12;
  d.setMonth(d.getMonth() + months);
  // Guard day overflow (e.g. March 31st - 1 month = Feb 28th)
  if (d.getMonth() !== expectedMonth) {
    d.setDate(0);
  }
  return d;
}

// Compute next recurring transaction sequence date
export function nextRecurringDate(
  currentDate: Date,
  unit: "days" | "weeks" | "months" | "years",
  amount: number,
): Date {
  const d = new Date(currentDate.getTime());
  if (unit === "days") {
    d.setDate(d.getDate() + amount);
  } else if (unit === "weeks") {
    d.setDate(d.getDate() + amount * 7);
  } else if (unit === "months") {
    return addMonths(d, amount);
  } else if (unit === "years") {
    return addMonths(d, amount * 12);
  }
  return d;
}

// Generate the whole occurrence sequence list
export function generateScheduleDates(
  startDateStr: string,
  frequency: "o" | "d" | "w" | "b" | "m" | "y" | "c",
  customUnit?: "days" | "weeks" | "months" | "years",
  customStep = 1,
  count = 1,
): string[] {
  const anchor = new Date(dateOnly(startDateStr) + "T12:00:00Z");
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1000 ||
    !Number.isInteger(customStep) ||
    customStep < 1 ||
    customStep > 1000
  )
    throw new Error("Invalid recurrence interval or count.");
  if (frequency === "o") return [dateOnly(startDateStr)];
  const unit =
    frequency === "d"
      ? "days"
      : frequency === "w" || frequency === "b"
        ? "weeks"
        : frequency === "y"
          ? "years"
          : frequency === "c"
            ? customUnit
            : "months";
  const step = frequency === "b" ? 2 : frequency === "c" ? customStep : 1;
  if (!unit) throw new Error("Choose a recurrence interval.");
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(anchor);
    const offset = i * step;
    if (unit === "days" || unit === "weeks")
      date.setUTCDate(
        anchor.getUTCDate() + offset * (unit === "weeks" ? 7 : 1),
      );
    else {
      const month = anchor.getUTCMonth() + offset * (unit === "years" ? 12 : 1);
      const last = new Date(
        Date.UTC(anchor.getUTCFullYear(), month + 1, 0),
      ).getUTCDate();
      date.setUTCDate(1);
      date.setUTCFullYear(
        anchor.getUTCFullYear(),
        month,
        Math.min(anchor.getUTCDate(), last),
      );
    }
    return date.toISOString().slice(0, 10);
  });
}

// Demo data matching screenshots for instant high-fidelity loading
export const INITIAL_BUDGETS: Record<string, Budget> = {};

export const INITIAL_TRANSACTIONS: Transaction[] = [];

// Sparkline points generator for visual sparkline curves in active budgets cards
export function generateSparklinePoints(
  transactions: Transaction[],
  budget: string,
  width = 200,
  height = 50,
): string {
  const filtered = transactions
    .filter((t) => t.budget === budget)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (filtered.length < 2) {
    // Return flat line if insufficient historical transactions
    return `M 0 ${height / 2} L ${width} ${height / 2}`;
  }

  // Calculate cumulative balance points
  let balance = 20000; // Starter offset base
  const balances: number[] = [balance];
  filtered.forEach((t) => {
    balance += t.type === "profit" ? t.amount : -t.amount;
    balances.push(balance);
  });

  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;

  const points = balances.map((val, idx) => {
    const x = (idx / (balances.length - 1)) * width;
    // SVGs draw from top-left, so we subtract percentage from height
    const y = height - ((val - min) / range) * (height * 0.7) - height * 0.15;
    return `${x},${y}`;
  });

  return `M ${points.join(" L ")}`;
}
