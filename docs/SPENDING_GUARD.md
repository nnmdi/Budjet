# Spending Guard

Spending Guard turns Cash Diet's budget boxes into actionable spending boundaries. Each budget can have a monthly expense limit and a protected minimum cash balance. These are independent of the existing savings target and opening balance.

## Implemented experience

Spending Guard appears above the workspace on every tab. Open **Set limits**, enter a monthly spending cap and optional minimum balance for each budget, then save. A zero or blank value disables that rule. All budgets are checked for negative balances even without configured limits.

| Trigger | Level | Example with a $300 monthly limit |
| --- | --- | --- |
| At least 80%, below 100% | Heads up | $240 spent; $60 remains |
| Exactly 100% | Action needed | $300 spent; limit reached |
| Above 100% | Action needed | $325 spent; $25 over |
| Cash below the chosen minimum | Heads up | $40 remains against a $50 minimum |
| Cash below zero | Action needed | Budget is $15 below zero |
| Average daily pace projects above the cap | Heads up | After seven days, current pace suggests exceeding $300 |

Threshold warnings take priority over pacing for the same budget. Balance warnings are separate, because spending limits and available cash answer different questions. Critical alerts appear first. Each alert explains the cause and offers **Review [budget]** and **Acknowledge**. Reviewing opens that budget's transactions. Acknowledgement suppresses that trigger for the current month; a higher trigger (80% → reached → exceeded) appears again. Settings can restore acknowledged alerts. Saving a budget's settings resets its acknowledgements so the new rules can be reviewed.

Monthly counters use the ledger timezone and calendar month. Calculations use integer cents. Only posted expense entries dated within the current month and no later than today count. Income does not cancel spending. Scheduled and future entries do not count. Deletions, imports, undo, redo and balance edits update the derived alerts from the current ledger. No alerts change balances or move money. Stable budget IDs preserve configured rules after renaming.

The settings panel shows remaining monthly allowance and its average per remaining day, including today. This is an expense-limit calculation, not a guarantee of available cash or affordability. Pacing assumes spending continues at the current average rate; it is an estimate, especially for budgets with irregular bills.

## Persistence and notification scope

Limits and acknowledgements are browser-local, isolated by profile and room. They are not shared with collaborators, synced to other devices, or part of ledger backup exports. Storage failures are shown instead of claiming a save succeeded. Alerts run while the app is open, updating with ledger changes and a once-per-minute clock for month rollover. This version has no email, SMS or background push notifications. It does not block purchases or bank transactions.

## Possible later improvements

- Server-backed preferences and alert history, with explicit rules for personal versus shared-room settings.
- Optional email/push delivery, quiet hours and delivery deduplication; requires a running backend and permission to notify.
- Configurable weekly or payday cycles, rollover and per-budget warning thresholds.
- Upcoming-bill shortfall estimates using scheduled transactions, avoiding double counting of recurring bills.
- A pre-save transaction preview showing the effect on the monthly limit, with an explicit option to continue.

These extensions are proposals, not shipped capabilities.
