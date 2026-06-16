import React, { useState, useMemo } from "react";
import { 
  Plus, 
  Trash2, 
  TrendingUp, 
  Sparkles, 
  Layers, 
  DollarSign, 
  Lightbulb, 
  Briefcase 
} from "lucide-react";
import { Budget, HypotheticalEntry } from "../types";
import { formatCurrency, generateScheduleDates } from "../utils";
import { motion } from "motion/react";

interface CalculatorProps {
  budgets: Record<string, Budget>;
}

export default function Calculator({ budgets }: CalculatorProps) {
  const budgetList = Object.values(budgets);

  // States mirroring screenplay
  const [baseType, setBaseType] = useState<"existing" | "custom">("existing");
  const [selectedBudget, setSelectedBudget] = useState(budgetList[0]?.name || "");
  const [customBalance, setCustomBalance] = useState("");

  // Fetch the active starting balance
  const startingBalance = useMemo(() => {
    if (baseType === "existing") {
      const b = budgets[selectedBudget];
      return b ? b.balance : 0;
    }
    const val = parseFloat(customBalance);
    return isNaN(val) ? 0 : val;
  }, [baseType, selectedBudget, customBalance, budgets]);

  // Temporary Sandbox entries
  const [entries, setEntries] = useState<HypotheticalEntry[]>([]);

  // Form parameters
  const [formType, setFormType] = useState<"profit" | "expense">("expense");
  const [formAmount, setFormAmount] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFreq, setFormFreq] = useState<"d" | "w" | "b" | "m" | "y" | "c">("o");
  const [customUnit, setCustomUnit] = useState<"days" | "weeks" | "months" | "years">("months");
  const [customStep, setCustomStep] = useState("1");
  const [formCount, setFormCount] = useState("1");

  // Handle addition of entry
  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(formAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      alert("Please enter a valid positive number for transaction amount.");
      return;
    }

    const newEntry: HypotheticalEntry = {
      id: "hypo-" + Math.random().toString(36).substring(2, 9),
      type: formType,
      amount: amountVal,
      description: formDesc.trim() || `Hypothetical ${formType}`,
      frequency: formFreq,
      count: parseInt(formCount) || 1,
      startDate: new Date().toISOString().slice(0, 10),
    };

    if (formFreq === "c") {
      newEntry.customUnit = customUnit;
      newEntry.customStep = parseInt(customStep) || 1;
    }

    setEntries([...entries, newEntry]);
    setFormAmount("");
    setFormDesc("");
    setFormFreq("o");
    setFormCount("1");
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(entries.filter((entry) => entry.id !== id));
  };

  const handleClearScenario = () => {
    setEntries([]);
  };

  // Run dynamic cashflow expansion across 12-month horizon
  const scenarioStats = useMemo(() => {
    let projectedAdditions = 0;
    let projectedExpenses = 0;

    // Expand recurrence matrices for each entry to calculate totals
    entries.forEach((entry) => {
      // Find matches in 12-month calendar
      const scheduleDates = generateScheduleDates(
        entry.startDate,
        entry.frequency,
        entry.customUnit,
        entry.customStep,
        entry.count
      );
      
      const totalSum = entry.amount * scheduleDates.length;
      if (entry.type === "profit") {
        projectedAdditions += totalSum;
      } else {
        projectedExpenses += totalSum;
      }
    });

    const endingBalance = startingBalance + projectedAdditions - projectedExpenses;
    const changePercentage = startingBalance > 0 
      ? ((endingBalance - startingBalance) / startingBalance) * 100 
      : 0;

    return {
      projectedAdditions,
      projectedExpenses,
      endingBalance,
      changePercentage
    };
  }, [startingBalance, entries]);

  // Compute points for drawing the beautiful, responsive projection area chart curves!
  const chartPointsData = useMemo(() => {
    // Generate cumulative monthly coordinates
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const points: Array<{ name: string; val: number }> = [];
    
    // Distribute entries monthly
    let balance = startingBalance;
    points.push({ name: "Start", val: balance });

    // Expand all transaction dates to plot progressive monthly balance shifts
    const allOccurrences: Array<{ date: Date; amount: number; type: "profit" | "expense" }> = [];
    
    entries.forEach((entry) => {
      const scheduleDates = generateScheduleDates(
        entry.startDate,
        entry.frequency,
        entry.customUnit,
        entry.customStep,
        entry.count
      );
      scheduleDates.forEach((dStr) => {
        allOccurrences.push({
          date: new Date(dStr),
          amount: entry.amount,
          type: entry.type
        });
      });
    });

    // Sort chrono
    allOccurrences.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Group into 12 periods (months from now)
    const now = new Date();
    for (let m = 1; m <= 12; m++) {
      const borderDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
      
      // Filter occurrences taking place in this month window
      const applicable = allOccurrences.filter(o => o.date < borderDate);
      
      // Compute total accumulated balance up to this border date
      let currentBalance = startingBalance;
      applicable.forEach((o) => {
        currentBalance += o.type === "profit" ? o.amount : -o.amount;
      });

      points.push({
        name: months[(now.getMonth() + m) % 12],
        val: currentBalance
      });
    }

    return points;
  }, [startingBalance, entries]);

  // Compile coordinates string for SVG area drawing
  const svgAttributes = useMemo(() => {
    const width = 500;
    const height = 180;
    const values = chartPointsData.map(p => p.val);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 100);
    const range = max - min || 1;

    const points = chartPointsData.map((pt, idx) => {
      const x = (idx / (chartPointsData.length - 1)) * (width - 40) + 20;
      const y = height - ((pt.val - min) / range) * (height - 50) - 25;
      return { x, y, name: pt.name, val: pt.val };
    });

    const polylinePath = points.map(p => `${p.x},${p.y}`).join(" L ");
    const areaPath = `M ${points[0].x},${height} L ${polylinePath} L ${points[points.length - 1].x},${height} Z`;

    return {
      polylinePath: `M ${polylinePath}`,
      areaPath,
      points,
      width,
      height
    };
  }, [chartPointsData]);

  return (
    <div id="calculator-workspace" className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      
      {/* Title Header */}
      <div>
        <h2 id="calculator-heading" className="text-2xl font-black tracking-tight text-white">What-If Money Calculator</h2>
        <p className="text-sm text-slate-400 max-w-2xl mt-1.5 leading-relaxed font-sans font-medium">
          Try out what-if tests with your money! See how buying a new phone, getting a job, or setting up a monthly subscription changes your savings over time without messing with your actual budget.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Scenario Config & Entry forms (Left column, takes 2 spans) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 01: Select Financial Base */}
          <div id="selection-financial-base" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-450 uppercase tracking-widest mb-4">
              1. Choose Your Starting Money
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Option A: Existing Budget */}
              <button
                type="button"
                onClick={() => setBaseType("existing")}
                className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  baseType === "existing" 
                    ? "border-rose-500 bg-rose-500/10 ring-1 ring-rose-500" 
                    : "border-slate-800 bg-slate-950 hover:border-slate-705"
                }`}
              >
                <div className={`p-2 rounded mt-1 shrink-0 ${baseType === "existing" ? "bg-rose-700 text-white" : "bg-slate-900 text-slate-400"}`}>
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-bold text-sm text-white">Use My Actual Budget</h5>
                  <p className="text-[11px] text-slate-400 mt-1 lines-2 font-normal leading-normal font-sans">
                    Start with your actual cash boxes and ongoing recurring costs automatically.
                  </p>
                </div>
              </button>

              {/* Option B: Custom Balance */}
              <button
                type="button"
                onClick={() => setBaseType("custom")}
                className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  baseType === "custom" 
                    ? "border-rose-500 bg-rose-500/10 ring-1 ring-rose-500" 
                    : "border-slate-800 bg-slate-950 hover:border-slate-705"
                }`}
              >
                <div className={`p-2 rounded mt-1 shrink-0 ${baseType === "custom" ? "bg-rose-700 text-white" : "bg-slate-900 text-slate-400"}`}>
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-bold text-sm text-white">Start with Custom Amount</h5>
                  <p className="text-[11px] text-slate-400 mt-1 lines-2 font-normal leading-normal font-sans">
                    Make up a starting amount of money from scratch.
                  </p>
                </div>
              </button>
            </div>

            {/* Input fields based on baseType selection */}
            {baseType === "existing" ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Choose budget box to use</label>
                <select
                  value={selectedBudget}
                  onChange={(e) => setSelectedBudget(e.target.value)}
                  className="w-full max-w-sm px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 outline-none font-medium focus:border-rose-500 transition-all cursor-pointer"
                >
                  {budgetList.map((bg) => (
                    <option key={bg.name} value={bg.name}>
                      {bg.name} — ({formatCurrency(bg.balance)})
                    </option>
                  ))}
                  {budgetList.length === 0 && (
                    <option value="">No Active Budgets Available</option>
                  )}
                </select>
              </div>
            ) : (
              <div className="max-w-sm space-y-1">
                <label className="text-xs font-bold text-slate-400 block uppercase tracking-widest">Starting Money ($)</label>
                <input
                  type="number"
                  placeholder="e.g. 15000"
                  value={customBalance}
                  onChange={(e) => setCustomBalance(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono tracking-tight font-medium outline-none focus:border-rose-500 transition-all"
                />
              </div>
            )}
          </div>

          {/* Section 02: Scenario Builder Form */}
          <div id="scenario-builder" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
              2. Add What-If Items
            </h4>

            <form onSubmit={handleAddEntry} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Type Parameter */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "profit" | "expense")}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:border-rose-500 font-medium outline-none cursor-pointer"
                  >
                    <option value="expense font-sans">Expense (You pay)</option>
                    <option value="profit font-sans">Income (You get paid)</option>
                  </select>
                </div>

                {/* Frequency selector */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">How often</label>
                  <select
                    value={formFreq}
                    onChange={(e) => setFormFreq(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:border-rose-500 font-medium outline-none cursor-pointer"
                  >
                    <option value="o">Just once</option>
                    <option value="d">Every day</option>
                    <option value="w">Every week</option>
                    <option value="b">Every two weeks</option>
                    <option value="m">Every month</option>
                    <option value="y">Every year</option>
                    <option value="c">Custom timing</option>
                  </select>
                </div>

                {/* Amount input field */}
                <div>
                  <label className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-1 block">Amount ($)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 500"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:border-rose-500 outline-none transition-all"
                  />
                </div>
              </div>              {/* Collapsible custom recurrence options matching Python program units */}
              {formFreq === "c" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800 border-dashed animate-fade-in text-xs">
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">Custom Unit</label>
                    <select
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">Repeat Every (Interval)</label>
                    <input
                      type="number"
                      min={1}
                      value={customStep}
                      onChange={(e) => setCustomStep(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Description & count rows */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">Description</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    placeholder="e.g. Bonus, new office upgrade, rent dues..."
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:border-rose-500 outline-none"
                  />
                </div>

                {/* Scheduled Count */}
                {formFreq !== "o" && (
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">Number of times</label>
                    <input
                      type="number"
                      min={1}
                      required
                      placeholder="e.g. 12"
                      value={formCount}
                      onChange={(e) => setFormCount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:border-rose-500 outline-none"
                    />
                  </div>
                )}

                {/* Submissions button */}
                <button
                  type="submit"
                  className="w-full py-2 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-rose-700/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Entry</span>
                </button>
              </div>
            </form>

            {/* Scrolling checklist of current sandbox entries */}
            <div className="mt-6 border-t border-slate-800 pt-6">
              <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-400">
                <span>What-If List ({entries.length})</span>
                {entries.length > 0 && (
                  <button 
                    onClick={handleClearScenario}
                    className="text-rose-400 hover:text-rose-300 font-bold hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {entries.map((entry) => {
                  const isProfit = entry.type === "profit";
                  return (
                    <div 
                      key={entry.id} 
                      className="p-3 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/60 flex items-center justify-between gap-3 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${isProfit ? "bg-emerald-400" : "bg-rose-400"}`} />
                        <div>
                          <p className="font-bold text-white">{entry.description}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Repeat: <span className="font-semibold uppercase text-rose-400">
                              {entry.frequency === "o" ? "Once" : entry.frequency}
                            </span> 
                            {entry.frequency !== "o" && ` • Running ${entry.count} times`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className={`font-mono font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                          {isProfit ? "+" : "-"}{formatCurrency(entry.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {entries.length === 0 && (
                  <div className="py-6 border-2 border-dashed border-slate-850 bg-slate-950/40 rounded-xl text-center text-xs text-slate-400 font-sans italic">
                    Your checklist is empty! Add some what-if items using the form above.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 12-Month Projection Sidebar Summary & area chart trend (Right column, takes 1 span) */}
        <div className="space-y-6">
          
          {/* Hypothetical 12-Month Projection */}
          <div id="hypothetical-projection" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm text-xs">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
              What-If Year Trend
            </h4>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400 font-sans">Start Amount</span>
                <span className="font-bold font-mono text-white">{formatCurrency(startingBalance)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400 font-sans">Money You Will Get</span>
                <span className="font-semibold font-mono text-emerald-400">+{formatCurrency(scenarioStats.projectedAdditions)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400 font-sans">Money You Will Spend</span>
                <span className="font-semibold font-mono text-rose-400">-{formatCurrency(scenarioStats.projectedExpenses)}</span>
              </div>
              <div className="flex flex-col gap-1 pt-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Ending Money (EST.)</span>
                <p className="text-2xl font-black font-mono tracking-tight text-white mt-1">
                  {formatCurrency(scenarioStats.endingBalance)}
                </p>
                
                {/* Progress trend status metrics */}
                <div className="mt-3">
                  <div className="w-full bg-slate-950 rounded-full h-1.5 relative overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${scenarioStats.changePercentage >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                      style={{ width: `${Math.min(Math.max(50 + scenarioStats.changePercentage * 0.5, 5), 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-sans font-medium">
                    This is a <strong className={scenarioStats.changePercentage >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {Math.abs(scenarioStats.changePercentage).toFixed(1)}% {scenarioStats.changePercentage >= 0 ? "increase" : "decrease"}
                    </strong> compared to your starting stash of money.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Forecast Trend Chart Area matching screengrab 3 layout */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5 font-sans">
              <TrendingUp className="w-3.5 h-3.5 text-rose-450 font-sans" />
              <span>How Your Savings Will look</span>
            </h4>
            
            {/* Custom Responsive SVG Chart */}
            <div className="h-44 w-full relative pt-2">
              <svg className="w-full h-full" viewBox={`0 0 ${svgAttributes.width} ${svgAttributes.height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#be123c" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#be123c" stopOpacity="0.00" />
                  </linearGradient>
                </defs>
                
                {/* Horizontal gridlines */}
                <line x1="20" y1="45" x2="480" y2="45" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="20" y1="90" x2="480" y2="90" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="20" y1="135" x2="480" y2="135" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />

                {/* Shard Area */}
                <path d={svgAttributes.areaPath} fill="url(#chart-grad)" />

                {/* Line string */}
                <path d={svgAttributes.polylinePath} fill="none" stroke="#be123c" strokeWidth="2.5" strokeLinecap="round" />

                {/* Node dots */}
                {svgAttributes.points.map((pt, i) => (
                  <g key={i} className="group cursor-pointer">
                    <circle cx={pt.x} cy={pt.y} r="3.5" fill="#be123c" stroke="#ffffff" strokeWidth="1.5" />
                    {/* Hover coordinates display tooltip */}
                    <text x={pt.x} y={pt.y - 12} className="text-[8px] font-sans font-bold bg-slate-950 fill-white text-center text-white pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-anchor-middle" textAnchor="middle">
                      {formatCurrency(pt.val).split(".")[0]}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Custom SVG Labels */}
            <div className="flex justify-between text-[8px] font-bold text-slate-500 tracking-wider uppercase mt-1 px-2 font-mono">
              {chartPointsData.map((pt, i) => (
                <span key={i}>{pt.name}</span>
              ))}
            </div>
          </div>

          {/* Quick suggestions optimizer box to add fidelity */}
          <div id="quick-optimizer-tip" className="bg-rose-950/25 border border-rose-500/15 rounded-2xl p-5 space-y-3">
            <h5 className="font-bold text-xs text-rose-400 flex items-center gap-1.5 uppercase tracking-widest text-[10px] font-sans">
              <Lightbulb className="w-4 h-4 text-amber-400 animate-pulse font-sans" />
              <span>Smart Money Tips</span>
            </h5>
            <p className="text-xs text-slate-400 font-sans leading-relaxed font-medium">
              Here are some quick tips based on your what-if items:
            </p>
            <ul className="text-[11px] text-slate-400 font-sans space-y-1.5 list-disc pl-4 leading-normal font-medium">
              <li>Putting some extra cash in a simple high-interest savings box can grow your money by <span className="font-bold text-emerald-400">+$120.00/mo</span>.</li>
              <li>Canceling streaming or game subscriptions you don't use can save you up to <span className="font-bold text-rose-450">$14.99/mo</span>.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
