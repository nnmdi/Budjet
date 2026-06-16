import React, { useState, useEffect } from "react";
import { AlertTriangle, TrendingUp, Info, ChevronDown, ChevronUp, Sparkles, Check } from "lucide-react";
import { Transaction } from "../types";

interface Anomaly {
  id: string;
  transactionId: string;
  transaction: Transaction;
  budget: string;
  amount: number;
  mean: number;
  median: number;
  stdDev: number;
  zScore: number;
  message: string;
  severity: "critical" | "warning" | "low";
}

interface AnomalyAlertsProps {
  transactions: Transaction[];
}

export default function AnomalyAlerts({ transactions }: AnomalyAlertsProps) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Fetch or calculate outliers
  useEffect(() => {
    if (!transactions || transactions.length < 3) {
      setAnomalies([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchAnomalies = async () => {
      try {
        const res = await fetch("/api/analytics/anomalies", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transactions }),
        });

        if (!res.ok) {
          throw new Error("Backend analytical service responded with an error");
        }

        const data = await res.json();
        if (isMounted && data.success) {
          setAnomalies(data.anomalies || []);
        }
      } catch (err) {
        console.warn("Falling back to local client-side statistical anomaly tracker:", err);
        if (isMounted) {
          runLocalAnomalyTracker();
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // Backup local calculation if backend is briefly offline/rebounding
    const runLocalAnomalyTracker = () => {
      const today = new Date();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 180);

      const expenses = transactions.filter((t) => {
        const d = new Date(t.date);
        return t.type === "expense" && !isNaN(d.getTime()) && d >= cutoff && d <= today;
      });

      const groupMap: Record<string, Transaction[]> = {};
      expenses.forEach((t) => {
        if (!groupMap[t.budget]) groupMap[t.budget] = [];
        groupMap[t.budget].push(t);
      });

      const localAnomalies: Anomaly[] = [];

      Object.keys(groupMap).forEach((budgetName) => {
        const groupTx = groupMap[budgetName];
        const count = groupTx.length;

        if (count < 3) {
          if (count >= 1) {
            const sorted = groupTx.map((t) => t.amount).sort((a,b) => a - b);
            const medianVal = sorted[Math.floor(sorted.length / 2)];
            groupTx.forEach((t) => {
              if (t.amount > medianVal * 3.5 && t.amount > 50) {
                localAnomalies.push({
                  id: `local-sparse-${t.id}`,
                  transactionId: t.id,
                  transaction: t,
                  budget: t.budget,
                  amount: t.amount,
                  mean: medianVal,
                  median: medianVal,
                  stdDev: 0,
                  zScore: 3.5,
                  message: `Significant spike of ${t.description} ($${t.amount}) is over 3.5x higher than your historical baseline of $${medianVal.toFixed(0)} for '${t.budget}'.`,
                  severity: "warning",
                });
              }
            });
          }
          return;
        }

        const amounts = groupTx.map((t) => t.amount);
        const mean = amounts.reduce((a, b) => a + b, 0) / count;

        const sortedAmounts = [...amounts].sort((a, b) => a - b);
        const mid = Math.floor(count / 2);
        const median = count % 2 !== 0 ? sortedAmounts[mid] : (sortedAmounts[mid - 1] + sortedAmounts[mid]) / 2;

        const varianceSum = amounts.reduce((total, val) => total + Math.pow(val - mean, 2), 0);
        let stdDev = Math.sqrt(varianceSum / (count - 1));

        if (stdDev < 0.05 * mean || stdDev === 0) {
          stdDev = Math.max(5.0, mean * 0.1);
        }

        groupTx.forEach((t) => {
          const diff = t.amount - median;
          const zScore = diff / stdDev;

          if (zScore >= 1.5 && t.amount > median + 15) {
            localAnomalies.push({
              id: `local-z-${t.id}`,
              transactionId: t.id,
              transaction: t,
              budget: t.budget,
              amount: t.amount,
              mean,
              median,
              stdDev,
              zScore,
              message: `Your transaction '${t.description}' ($${t.amount}) is ${zScore.toFixed(1)}x higher than your typical average spend of $${mean.toFixed(0)} in '${t.budget}'.`,
              severity: zScore >= 2.5 ? "critical" : zScore >= 1.8 ? "warning" : "low",
            });
          }
        });
      });

      localAnomalies.sort((a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime());
      setAnomalies(localAnomalies.slice(0, 15));
    };

    fetchAnomalies();

    return () => {
      isMounted = false;
    };
  }, [transactions]);

  const activeAnomalies = anomalies.filter((a) => !dismissedIds.includes(a.id));

  if (activeAnomalies.length === 0) {
    if (loading) {
      return (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-center text-xs text-slate-400 gap-2">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Refining outlier statistics...</span>
        </div>
      );
    }
    // Return a neat, quiet diagnostic status showing health state
    return (
      <div id="anomaly-healthy-banner" className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm text-xs text-slate-600">
        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
          <Check className="w-4.5 h-4.5 font-bold" />
        </div>
        <div className="space-y-0.5">
          <p className="font-bold text-slate-800 flex items-center gap-1.5 leading-tight">
            <span>Smart Spending Baseline Active</span>
            <span className="font-mono bg-emerald-100/75 text-emerald-700 px-1 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider">HEALTHY</span>
          </p>
          <p className="text-[11px] text-slate-500 leading-normal font-sans">
            No unexpected spending spikes or outliers detected in your categories. Your recent activity matches typical historical baselines.
          </p>
        </div>
      </div>
    );
  }

  const criticalCount = activeAnomalies.filter((a) => a.severity === "critical").length;
  const warningCount = activeAnomalies.filter((a) => a.severity === "warning").length;

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds((prev) => [...prev, id]);
  };

  return (
    <div 
      id="anomaly-alerts-container" 
      className={`border rounded-2xl transition-all duration-300 shadow-sm overflow-hidden bg-white ${
        criticalCount > 0 
          ? "border-amber-200 shadow-amber-50/20" 
          : "border-slate-200"
      }`}
    >
      {/* Banner Header */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`p-4 flex items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
          criticalCount > 0 ? "bg-amber-50/50 hover:bg-amber-50" : "bg-slate-50/50 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
            criticalCount > 0 
              ? "bg-amber-100 text-amber-700 border-amber-200" 
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? "animate-bounce" : ""}`} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2">
              <h4 className="text-sm font-black tracking-tight text-slate-800">
                Insights &amp; Statistical Alerts
              </h4>
              <div className="flex items-center gap-1 font-mono text-[9px] font-bold">
                {criticalCount > 0 && (
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200 leading-none">
                    {criticalCount} Critical Outlier{criticalCount > 1 ? "s" : ""}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 leading-none">
                    {warningCount} Budget Spike{warningCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11.5px] text-slate-500 font-sans leading-normal">
              {criticalCount > 0 
                ? `Alert: Detected ${criticalCount} transaction${criticalCount > 1 ? "s" : ""} that are significantly higher than your typical budget average.`
                : `Detected minor spending deviations. Click to inspect threshold calculations.`
              }
            </p>
          </div>
        </div>

        <button 
          type="button"
          className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* Expanded Outlier Report Listing */}
      {isExpanded && (
        <div className="p-4 border-t border-slate-100 bg-white space-y-4 animate-fadeIn">
          <div className="flex items-start gap-2.5 p-3 bg-[#eff4ff]/60 border border-[#dce9ff] rounded-xl text-[10.5px] text-slate-600 shadow-inner">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed font-sans">
              <p className="font-bold text-slate-800">How is this determined?</p>
              <p>
                Our system analyzes historical transaction trends across each budget category. By comparing active transactions against typical spending ranges, we detect unusually high expenses or irregular spikes, highlighting patterns that may warrant closer inspection.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
            {activeAnomalies.map((anomaly) => {
              const dateObj = new Date(anomaly.transaction.date);
              const formattedDate = !isNaN(dateObj.getTime()) 
                ? dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : anomaly.transaction.date;

              return (
                <div key={anomaly.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-[8.5px] px-2 py-0.5 rounded font-black font-mono leading-none tracking-wider ${
                        anomaly.severity === "critical"
                          ? "bg-rose-50 text-rose-700 border border-rose-100"
                          : "bg-amber-50 text-amber-800 border border-amber-100"
                      }`}>
                        {anomaly.severity === "critical" ? "CRITICAL OUTLIER" : "BUDGET SPIKE"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{formattedDate}</span>
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-1.5 bg-slate-100 rounded text-[9px]">{anomaly.budget}</span>
                    </div>

                    <p className="text-xs text-slate-700 font-sans font-medium leading-relaxed">
                      {anomaly.message}
                    </p>

                    {/* Standard Deviation Gauge Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[8.5px] font-mono text-slate-400">
                        <span>Baseline (Average: ${anomaly.mean.toFixed(0)})</span>
                        <span className={anomaly.severity === "critical" ? "text-rose-600 font-bold" : "text-amber-700 font-bold"}>
                          +{anomaly.zScore.toFixed(1)}x Spending Deviation
                        </span>
                      </div>
                      
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                        {/* Background ticks */}
                        <div className="absolute left-[30%] top-0 bottom-0 w-0.5 bg-slate-200" title="Minor variance"></div>
                        <div className="absolute left-[50%] top-0 bottom-0 w-0.5 bg-slate-200" title="Moderate deviation"></div>
                        <div className="absolute left-[75%] top-0 bottom-0 w-0.5 bg-slate-300" title="Significant spike"></div>

                        {/* Fill line */}
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            anomaly.severity === "critical" ? "bg-rose-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${Math.min(100, (anomaly.zScore / 3.5) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right whitespace-nowrap">
                      <p className="text-xs font-black text-slate-900 font-mono">${anomaly.amount.toFixed(2)}</p>
                      <p className="text-[9px] text-slate-400">Transaction Value</p>
                    </div>

                    <button
                      onClick={(e) => handleDismiss(anomaly.id, e)}
                      className="py-1 px-2.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[10px] font-bold rounded text-slate-500 cursor-pointer transition-colors"
                      title="Mute alert for this session"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
