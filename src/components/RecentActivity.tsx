import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Smile, 
  Trash2, 
  Search, 
  Download, 
  FileText, 
  Filter, 
  CircleDot, 
  BadgeAlert 
} from "lucide-react";
import { useState } from "react";
import { Transaction } from "../types";
import { formatCurrency } from "../utils";

interface RecentActivityProps {
  transactions: Transaction[];
  mode: "dashboard" | "budget-view";
  selectedBudgetFilter?: string; // Optional: restrict to a single budget
  onDeleteTransactions?: (ids: string[]) => void;
}

export default function RecentActivity({
  transactions,
  mode,
  selectedBudgetFilter,
  onDeleteTransactions,
}: RecentActivityProps) {
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter based on parent context or search keyword
  const filtered = transactions
    .filter((tx) => {
      // Filter by sub budget if specified
      if (selectedBudgetFilter && tx.budget !== selectedBudgetFilter) return false;
      
      // Filter by search query
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        return (
          tx.description.toLowerCase().includes(query) ||
          tx.budget.toLowerCase().includes(query) ||
          tx.amount.toString().includes(query)
        );
      }
      return true;
    })
    // Sort youngest transactions to top
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Handle single checklist toggle
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Trigger delete on all checked records
  const handleDeleteSelected = () => {
    if (selectedIds.length > 0 && onDeleteTransactions) {
      onDeleteTransactions(selectedIds);
      setSelectedIds([]);
    }
  };

  // Export full CSV format statement
  const triggerCSVExport = () => {
    const headers = "Budget,Date,Type,Amount,Description,Recurrence\n";
    const rows = filtered
      .map((tx) => `${tx.budget},${tx.date},${tx.type},${tx.amount},"${tx.description}",${tx.recurrence}`)
      .join("\n");
    
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", `budget_statement_${selectedBudgetFilter || "all"}.csv`);
    a.click();
  };

  if (mode === "dashboard") {
    // Mode 1: Dashboard Sidecard representation (Screenshot 1)
    return (
      <div id="recent-activity-dashboard" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight mb-4">Recent Activity</h3>
          
          <div className="space-y-4 font-sans">
            {filtered.slice(0, 4).map((tx, idx) => {
              const isProfit = tx.type === "profit";
              const isApple = tx.description.toLowerCase().includes("apple");
              const isStarbucks = tx.description.toLowerCase().includes("starbucks");
              const isSalary = tx.description.toLowerCase().includes("salary");

              // Determine icon and status colors mimicking mockup design
              let iconBg = "bg-rose-500/10 border-rose-500/20 text-rose-400";
              let icon = <ArrowDownLeft className="w-5 h-5" />;
              let statusText = "CLEARED";
              let statusBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

              if (isProfit) {
                iconBg = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                icon = <ArrowUpRight className="w-5 h-5" />;
              }

              if (isStarbucks) {
                statusText = "PENDING";
                statusBg = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              }

              return (
                <div key={tx.id || idx} className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-full border ${iconBg} shrink-0`}>
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{tx.description}</p>
                      <p className="text-xs text-slate-400 font-sans mt-0.5">
                        {tx.budget} • {tx.date.slice(5, 16)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold tracking-tight font-mono ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                      {isProfit ? "+" : "-"}{formatCurrency(tx.amount)}
                    </p>
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold mt-1 tracking-wider ${statusBg}`}>
                      {statusText}
                    </span>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-400 font-sans">
                No recent transactions logged yet. Move to active budgets to add records.
              </div>
            )}
          </div>
        </div>

        <button 
          onClick={triggerCSVExport}
          id="btn-download-statement"
          className="w-full mt-6 py-2.5 px-4 bg-slate-800 border border-slate-700/60 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Download Statement</span>
        </button>
      </div>
    );
  }

  // Mode 2: Budget Detail fully featured list (Screenshot 2)
  return (
    <div id="recent-activity-tabular" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
      {/* Table search & Actions Header bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-4">
        <h4 className="text-base font-bold text-white tracking-tight">Recent Activity</h4>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Detailed keyword finder input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full sm:w-56 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:border-rose-500 outline-none transition-colors"
            />
          </div>

          <button 
            type="button" 
            onClick={() => setSearchQuery("")}
            className="p-2 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-850 rounded-xl border border-slate-800 transition-colors cursor-pointer"
            title="Clear Search Filters"
          >
            <Filter className="w-4 h-4" />
          </button>

          {selectedIds.length > 0 && onDeleteTransactions && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Erase Selected ({selectedIds.length})</span>
            </button>
          )}

          <button
            onClick={triggerCSVExport}
            className="px-3 py-2 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-rose-700/25"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Structured Sheet Rows */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
              {onDeleteTransactions && (
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(filtered.map((t) => t.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="rounded text-rose-500 bg-slate-900 border-slate-800 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
                  />
                </th>
              )}
              <th className="p-3">Date</th>
              <th className="p-3">Description</th>
              <th className="p-3">Type</th>
              <th className="p-3">Recurrence</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {filtered.map((tx) => {
              const checked = selectedIds.includes(tx.id);
              const isProfit = tx.type === "profit";
              return (
                <tr 
                  key={tx.id} 
                  className={`hover:bg-slate-850/40 transition-all ${checked ? "bg-rose-950/20" : ""}`}
                >
                  {onDeleteTransactions && (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(tx.id)}
                        className="rounded text-rose-500 bg-slate-950 border-slate-800 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="p-3 font-mono text-slate-400">{tx.date.slice(0, 16)}</td>
                  <td className="p-3 font-semibold text-white">
                    <span className="block">{tx.description}</span>
                    <span className="text-[10px] text-slate-500 font-normal sm:hidden">{tx.budget}</span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      isProfit ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}>
                      {tx.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-slate-450 capitalize">{tx.recurrence}</td>
                  <td className={`p-3 text-right font-mono font-semibold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                    {isProfit ? "+" : "-"}{formatCurrency(tx.amount)}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400 font-sans italic bg-slate-900">
                  No matching transaction activity registered in the timeline.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 font-sans mt-3 border-t border-slate-800 pt-3">
        <span>Showing {filtered.length} of {transactions.filter(t => !selectedBudgetFilter || t.budget === selectedBudgetFilter).length} total logs</span>
        <span>My Money Journal v2.4.1</span>
      </div>
    </div>
  );
}
