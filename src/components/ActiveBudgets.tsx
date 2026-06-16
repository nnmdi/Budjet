import { ArrowUpRight, TrendingUp, Compass, Landmark, AlertCircle, Sparkles, Plus } from "lucide-react";
import { Budget, Transaction } from "../types";
import { formatCurrency, generateSparklinePoints } from "../utils";

interface ActiveBudgetsProps {
  budgets: Record<string, Budget>;
  transactions: Transaction[];
  onManageBudget: (name: string) => void;
  onCreateBudget?: () => void;
  onShowToast?: (msg: string, type?: "success" | "info" | "warning") => void;
}

export default function ActiveBudgets({ budgets, transactions, onManageBudget, onCreateBudget, onShowToast }: ActiveBudgetsProps) {
  const budgetList = Object.values(budgets);

  return (
    <div id="active-budgets-section" className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 id="active-budgets-heading" className="text-base font-bold text-white tracking-tight">Active Budgets</h3>
        <div className="flex items-center gap-3">
          {onCreateBudget && (
            <button
              onClick={onCreateBudget}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-sm shadow-rose-700/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Budget</span>
            </button>
          )}
          <button 
            onClick={() => {
              if (onShowToast) {
                onShowToast("Showing your budget categories and spending limits!", "info");
              } else {
                alert("Checking all budgets...");
              }
            }} 
            className="text-xs font-bold text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
          >
            View All
          </button>
        </div>
      </div>

      <div id="active-budgets-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {budgetList.map((bg) => {
          // Dynamic status tracker
          const isSavings = bg.name.toLowerCase().includes("savings");
          const isEmergency = bg.name.toLowerCase().includes("emergency") || bg.name.toLowerCase().includes("guard") || bg.name.toLowerCase().includes("buffer");
          
          let icon = <Landmark className="w-5 h-5 text-rose-400" />;
          let subText = "General Category";
          let statusText = "On Track";
          let statusColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

          if (isSavings) {
            icon = <Landmark className="w-5 h-5 text-rose-400" />;
            subText = "Future Savings Pool";
            statusText = "Growing";
            statusColor = "bg-sky-500/10 text-sky-400 border-sky-500/20";
          } else if (isEmergency) {
            icon = <Sparkles className="w-5 h-5 text-rose-400" />;
            subText = "Safety Fund";
            statusText = "Safe & Secure";
            statusColor = "bg-teal-500/10 text-teal-400 border-teal-500/20";
          } else {
            icon = <Compass className="w-5 h-5 text-rose-400" />;
            subText = "Spending Envelope";
            statusText = bg.balance > 500 ? "Fully Prepared" : "Active Pool";
            statusColor = bg.balance > 500 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20";
          }

          // Count allocated total from transactions inside this budget
          const allocatedSum = bg.balance;

          return (
            <div 
              key={bg.name}
              id={`budget-card-${bg.name.replace(/\s+/g, "-")}`}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 hover:shadow-xl transition-all relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-white text-base">{bg.name}</h4>
                    <p className="text-xs text-slate-400 font-sans">{subText}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/50">
                    {icon}
                  </div>
                </div>

                <div className="flex items-baseline justify-between mt-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Money In Box</span>
                  <span className="text-lg font-bold text-white tracking-tight font-mono">
                    {formatCurrency(allocatedSum)}
                  </span>
                </div>
              </div>

              {/* Sparkline Visualisation area matching screenshots */}
              <div className="my-3 h-14 w-full relative">
                <svg className="w-full h-full" viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`grad-${bg.name}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#be123c" stopOpacity="0.30" />
                      <stop offset="100%" stopColor="#be123c" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  
                  {/* Fill slope */}
                  <path
                    d={`${generateSparklinePoints(transactions, bg.name, 200, 50)} L 200 50 L 0 50 Z`}
                    fill={`url(#grad-${bg.name})`}
                  />
                  
                  {/* Sparkline curve stroke */}
                  <path
                    d={generateSparklinePoints(transactions, bg.name, 200, 50)}
                    fill="none"
                    stroke="#be123c"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {bg.targetBalance !== undefined && bg.targetBalance > 0 && (
                <div className="mb-4 space-y-1 font-sans">
                  <div className="flex items-center justify-between text-[10px] text-slate-450 font-bold tracking-wide">
                    <span>Goal: {formatCurrency(bg.targetBalance)}</span>
                    <span className="text-rose-400">{Math.round(Math.min(100, Math.max(0, (allocatedSum / bg.targetBalance) * 100)))}%</span>
                  </div>
                  <div className="relative w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                    <div 
                      className="h-full bg-gradient-to-r from-rose-700 to-rose-450 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round(Math.min(100, Math.max(0, (allocatedSum / bg.targetBalance) * 100)))}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-800 pt-3 mt-1 font-sans">
                <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${statusColor}`}>
                  {statusText}
                </span>
                <button
                  onClick={() => onManageBudget(bg.name)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  <span>Manage</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {budgetList.length === 0 && (
          <div className="col-span-full border-2 border-dashed border-slate-800 rounded-2xl p-8 text-center text-slate-400 bg-slate-900/40 flex flex-col items-center justify-center gap-3">
            <p>No active budgets created yet.</p>
            {onCreateBudget && (
              <button
                onClick={onCreateBudget}
                className="mt-1 py-2 px-4 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer shadow-md shadow-rose-700/25 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Budget Now</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
