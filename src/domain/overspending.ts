import type { Ledger } from "./ledger";
import { cents, todayIn, dateOnly } from "./ledger";

export interface SpendingRule {
  limit: number;
  reserve: number;
}
export interface SpendingAlert {
  id: string;
  budget: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
}
export const budgetKey = (b: { id?: string; name: string }) => b.id || b.name;
export function spendingStatus(
  ledger: Ledger,
  rules: Record<string, SpendingRule>,
  now = new Date(),
) {
  const day = todayIn(ledger.timeZone, now),
    month = day.slice(0, 7);
  const elapsed = Number(day.slice(8));
  const days = new Date(
    Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0),
  ).getUTCDate();
  return Object.values(ledger.budgets).map((b) => {
    const key = budgetKey(b),
      rule = rules[key];
    const limit = rule ? cents(rule.limit) : 0,
      reserve = rule ? cents(rule.reserve) : 0;
    const spent = ledger.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          (t.budgetId ? t.budgetId === b.id : t.budget === b.name) &&
          dateOnly(t.date).slice(0, 7) === month &&
          dateOnly(t.date) <= day &&
          t.status !== "scheduled",
      )
      .reduce((sum, t) => sum + cents(t.amount), 0);
    const balance = cents(b.balance),
      remaining = Math.max(0, limit - spent);
    const alerts: SpendingAlert[] = [];
    const money = (n: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n / 100);
    const add = (
      kind: string,
      severity: SpendingAlert["severity"],
      title: string,
      message: string,
    ) =>
      alerts.push({
        id: JSON.stringify([key, month, kind]),
        budget: b.name,
        severity,
        title,
        message,
      });
    if (balance < 0)
      add(
        "negative",
        "critical",
        "Budget balance below zero",
        `${b.name} is ${money(-balance)} below zero. Review expenses or add funds to this budget.`,
      );
    else if (reserve > 0 && balance < reserve)
      add(
        "reserve",
        "warning",
        "Below your protected balance",
        `${b.name} has ${money(balance)} left, ${money(reserve - balance)} below your ${money(reserve)} minimum. Pause optional spending or review funding.`,
      );
    if (limit > 0) {
      if (spent > limit)
        add(
          "over",
          "critical",
          "Monthly limit exceeded",
          `${b.name}: ${money(spent)} spent against a ${money(limit)} limit — ${money(spent - limit)} over. Review recent transactions and reduce optional spending.`,
        );
      else if (spent === limit)
        add(
          "reached",
          "critical",
          "Monthly limit reached",
          `${b.name} has used its full ${money(limit)} monthly limit. Any further expense will exceed it.`,
        );
      else if (spent * 100 >= limit * 80)
        add(
          "near",
          "warning",
          "Approaching your monthly limit",
          `${b.name} has used ${Math.floor((spent / limit) * 100)}% of its limit. ${money(remaining)} remains for this month.`,
        );
      else if (
        elapsed >= 7 &&
        elapsed < days &&
        (spent / elapsed) * days > limit
      )
        add(
          "pace",
          "warning",
          "Spending pace may exceed your limit",
          `At this month's average daily pace, ${b.name} could reach ${money(Math.round((spent / elapsed) * days))} by month-end. This estimate assumes spending continues at the same rate.`,
        );
    }
    return {
      key,
      budget: b,
      spent,
      limit,
      reserve,
      balance,
      remaining,
      daysLeft: days - elapsed + 1,
      dailyAllowance: Math.floor(remaining / (days - elapsed + 1)),
      alerts,
    };
  });
}
