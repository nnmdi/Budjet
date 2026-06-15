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
  const expectedMonth = ((startDate.getMonth() + months) % 12 + 12) % 12;
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
  amount: number
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
  frequency: "d" | "w" | "b" | "m" | "y" | "c",
  customUnit?: "days" | "weeks" | "months" | "years",
  customStep = 1,
  count = 1
): string[] {
  const dates: string[] = [];
  let current = new Date(startDateStr);
  if (isNaN(current.getTime())) {
    current = new Date();
  }

  // Convert abbreviations to uniform units
  let unit: "days" | "weeks" | "months" | "years" = "months";
  let step = 1;

  if (frequency === "d") {
    unit = "days";
    step = 1;
  } else if (frequency === "w") {
    unit = "weeks";
    step = 1;
  } else if (frequency === "b") {
    unit = "weeks";
    step = 2;
  } else if (frequency === "m") {
    unit = "months";
    step = 1;
  } else if (frequency === "y") {
    unit = "years";
    step = 1;
  } else if (frequency === "c" && customUnit) {
    unit = customUnit;
    step = customStep;
  }

  for (let i = 0; i < count; i++) {
    dates.push(current.toISOString().slice(0, 19).replace("T", " "));
    current = nextRecurringDate(current, unit, step);
  }

  return dates;
}

// Demo data matching screenshots for instant high-fidelity loading
export const INITIAL_BUDGETS: Record<string, Budget> = {};

export const INITIAL_TRANSACTIONS: Transaction[] = [];

// Sparkline points generator for visual sparkline curves in active budgets cards
export function generateSparklinePoints(
  transactions: Transaction[],
  budget: string,
  width = 200,
  height = 50
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
