import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { Ledger } from "../domain/ledger";
import {
  budgetKey,
  spendingStatus,
  type SpendingRule,
} from "../domain/overspending";
import { formatCurrency } from "../utils";

interface Preferences {
  rules: Record<string, SpendingRule>;
  acknowledged: string[];
}
function load(key: string): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    const rules: Record<string, SpendingRule> = {};
    for (const [id, r] of Object.entries(raw.rules || {})) {
      const v = r as SpendingRule;
      if (
        [v.limit, v.reserve].every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e10,
        )
      )
        rules[id] = v;
    }
    return {
      rules,
      acknowledged: Array.isArray(raw.acknowledged)
        ? raw.acknowledged
            .filter((x: unknown) => typeof x === "string")
            .slice(-500)
        : [],
    };
  } catch {
    return { rules: {}, acknowledged: [] };
  }
}
export default function OverspendingAlerts({
  ledger,
  scope,
  onReview,
}: {
  ledger: Ledger;
  scope: string;
  onReview: (budget: string) => void;
}) {
  const storageKey = `cashdiet:spending-alerts:v1:${scope}`;
  const [prefs, setPrefs] = useState(() => load(storageKey));
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const states = spendingStatus(ledger, prefs.rules, now);
  const alerts = states
    .flatMap((s) => s.alerts)
    .filter((a) => !prefs.acknowledged.includes(a.id))
    .sort(
      (a, b) =>
        Number(b.severity === "critical") - Number(a.severity === "critical"),
    );
  const configured = states.filter((s) => s.limit > 0).length;
  function save(next: Preferences) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setPrefs(next);
      setError("");
    } catch {
      setError(
        "Could not save alert settings in this browser. Free browser storage and try again.",
      );
    }
  }
  return (
    <section
      aria-labelledby="overspending-heading"
      className="mb-6 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-rose-400" />
          <div>
            <h3 id="overspending-heading" className="font-bold text-white">
              Spending Guard
            </h3>
            <p className="text-xs text-slate-400">
              {configured} of {states.length} budgets have monthly spending
              limits
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={settings}
          aria-controls="spending-settings"
          onClick={() => setSettings(!settings)}
          className="flex items-center gap-2 text-xs text-white border border-slate-800 rounded-xl px-3 py-2 hover:bg-slate-850"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {settings ? "Close settings" : "Set limits"}
        </button>
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-slate-300"
      >
        {alerts.length
          ? `${alerts.length} spending alert${alerts.length === 1 ? "" : "s"} need attention.`
          : configured
            ? "No unacknowledged alerts for your configured limits."
            : "Set a monthly limit to get an early warning before spending too much."}
      </div>
      <div className="space-y-3">
        {alerts.map((a) => (
          <article
            key={a.id}
            className={`rounded-2xl border p-4 ${a.severity === "critical" ? "bg-red-950/30 border-red-500/40" : "bg-amber-950/20 border-amber-500/30"}`}
          >
            <h4
              className={`font-bold text-sm flex items-center gap-2 ${a.severity === "critical" ? "text-red-300" : "text-amber-200"}`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {a.severity === "critical" ? "Action needed" : "Heads up"} ·{" "}
              {a.title}
            </h4>
            <p className="text-sm text-white mt-2">{a.message}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              <button
                onClick={() => onReview(a.budget)}
                className="text-white underline underline-offset-4"
              >
                Review {a.budget}
              </button>
              <button
                className="text-slate-300 underline underline-offset-4"
                onClick={() =>
                  save({
                    ...prefs,
                    acknowledged: [...prefs.acknowledged, a.id].slice(-500),
                  })
                }
              >
                Acknowledge
              </button>
            </div>
          </article>
        ))}
      </div>
      {settings && (
        <div
          id="spending-settings"
          className="border-t border-slate-800 pt-4 space-y-4"
        >
          <p className="text-xs text-slate-300">
            Monthly limits reset on the first in {ledger.timeZone}. Only posted
            expenses count; income does not erase spending. Minimum balances
            protect the money left in each budget. A blank or zero limit
            disables that rule.
          </p>
          {!states.length && (
            <p className="text-sm text-white">
              Create a budget first, then set its limits here.
            </p>
          )}
          {states.map((s) => (
            <form
              key={`${s.key}-${s.limit}-${s.reserve}`}
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const limit = Number(data.get("limit")),
                  reserve = Number(data.get("reserve"));
                if (
                  ![limit, reserve].every(
                    (n) => Number.isFinite(n) && n >= 0 && n <= 1e10,
                  )
                ) {
                  setError("Enter amounts between $0 and $10 billion.");
                  return;
                }
                const key = budgetKey(s.budget);
                save({
                  rules: { ...prefs.rules, [key]: { limit, reserve } },
                  acknowledged: prefs.acknowledged.filter((id) => {
                    try {
                      return JSON.parse(id)[0] !== key;
                    } catch {
                      return false;
                    }
                  }),
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end border border-slate-800 rounded-2xl p-4"
            >
              <div className="min-w-0">
                <p className="font-bold text-white break-words">
                  {s.budget.name}
                </p>
                <p className="text-xs text-slate-400">
                  Spent this month: {formatCurrency(s.spent / 100)}
                </p>
              </div>
              <label className="text-xs text-slate-300">
                Monthly spending limit ($)
                <input
                  name="limit"
                  type="number"
                  min="0"
                  max="10000000000"
                  step="0.01"
                  defaultValue={s.limit / 100 || ""}
                  placeholder="e.g. 300"
                  className="mt-1 w-full rounded-xl p-2 bg-slate-950 text-white border border-slate-800"
                />
              </label>
              <label className="text-xs text-slate-300">
                Minimum balance ($)
                <input
                  name="reserve"
                  type="number"
                  min="0"
                  max="10000000000"
                  step="0.01"
                  defaultValue={s.reserve / 100 || ""}
                  placeholder="e.g. 50"
                  className="mt-1 w-full rounded-xl p-2 bg-slate-950 text-white border border-slate-800"
                />
              </label>
              <button className="bg-rose-700 text-white rounded-xl p-2 text-sm font-bold">
                Save {s.budget.name} limits
              </button>
              {s.limit > 0 && (
                <p className="sm:col-span-2 lg:col-span-4 text-xs text-slate-300">
                  {formatCurrency(s.remaining / 100)} left in this month's limit
                  · about {formatCurrency(s.dailyAllowance / 100)}/day across{" "}
                  {s.daysLeft} remaining days, including today.
                </p>
              )}
            </form>
          ))}
          <p className="text-xs text-slate-400">
            Alerts update while the app is open. Settings and acknowledgements
            stay in this browser for this profile and workspace; they are not
            included in ledger backups. Acknowledged alerts return at a higher
            severity or next month. Pace estimates start after seven days and
            assume the same average spending rate.
          </p>
          <button
            className="text-xs text-white underline"
            onClick={() => save({ ...prefs, acknowledged: [] })}
          >
            Show acknowledged alerts again
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
