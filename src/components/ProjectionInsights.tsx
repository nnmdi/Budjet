import { formatCurrency } from "../utils";
interface Props {
  onRunCalculator: () => void;
  totalLiquidity: number;
}
export default function ProjectionInsights({
  onRunCalculator,
  totalLiquidity,
}: Props) {
  return (
    <div
      id="projection-insights-card"
      className="bg-rose-900 rounded-2xl p-6 border border-rose-700 text-white space-y-4"
    >
      <h4 className="text-xl font-bold">Plan your next move</h4>
      <p className="text-sm text-rose-100">
        Your current posted funds total {formatCurrency(totalLiquidity)}.
        Explore planned income and expenses without changing your ledger.
      </p>
      <button
        onClick={onRunCalculator}
        className="rounded-xl bg-white text-rose-900 font-bold text-sm p-3"
      >
        Try What-If Calculator
      </button>
    </div>
  );
}
