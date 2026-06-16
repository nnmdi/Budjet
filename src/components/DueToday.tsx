import React, { useState } from "react";
import { Sparkles, Calendar, Receipt, CreditCard, Plus, Trash2, X, Check } from "lucide-react";
import { formatCurrency } from "../utils";

export interface RecurringBill {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  type: "expense" | "profit";
  icon: "subscription" | "rent" | "salary";
  dueDate?: string; // YYYY-MM-DD
}

interface DueTodayProps {
  bills: RecurringBill[];
  onPayBill: (bill: RecurringBill) => void;
  paidIds: string[];
  onAddBill: (bill: RecurringBill) => void;
  onDeleteBill: (id: string) => void;
}

// Utility to calculate subsequent date matching standard frequency options
export function getNextDueDate(currentDueDateStr: string, frequency: string): string {
  const date = new Date(currentDueDateStr + "T12:00:00");
  if (isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + 1);
    return fallback.toISOString().slice(0, 10);
  }

  const freqClean = frequency.toLowerCase().trim();

  if (freqClean.includes("daily") || freqClean === "d") {
    date.setDate(date.getDate() + 1);
  } else if (freqClean.includes("weekly") || freqClean === "w") {
    if (freqClean.includes("bi") || freqClean.includes("2")) {
      date.setDate(date.getDate() + 14);
    } else {
      date.setDate(date.getDate() + 7);
    }
  } else if (freqClean.includes("bi-weekly") || freqClean.includes("biweekly")) {
    date.setDate(date.getDate() + 14);
  } else if (freqClean.includes("monthly") || freqClean === "m") {
    date.setMonth(date.getMonth() + 1);
  } else if (freqClean.includes("yearly") || freqClean === "y") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    // defaults to monthly increment
    date.setMonth(date.getMonth() + 1);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Format date nicely (e.g., Jun 16, 2026)
export function formatReadableDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIdx = parseInt(month, 10) - 1;
  const monthName = months[mIdx] || month;
  return `${monthName} ${parseInt(day, 10)}, ${year}`;
}

export default function DueToday({ bills, onPayBill, paidIds, onAddBill, onDeleteBill }: DueTodayProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"expense" | "profit">("expense");
  const [frequency, setFrequency] = useState("Monthly");
  const [iconType, setIconType] = useState<"subscription" | "rent" | "salary">("subscription");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const todayStr = new Date().toISOString().slice(0, 10);

  // Split bills into Due/Overdue vs Upcoming
  const dueBills = bills.filter((bill) => {
    const billDate = bill.dueDate || todayStr;
    return billDate <= todayStr;
  });

  const upcomingBills = bills.filter((bill) => {
    const billDate = bill.dueDate || todayStr;
    return billDate > todayStr;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount) return;

    const newBill: RecurringBill = {
      id: "bill-" + Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      amount: parseFloat(amount),
      frequency,
      type,
      icon: iconType,
      dueDate: dueDate || todayStr,
    };

    onAddBill(newBill);
    setName("");
    setAmount("");
    setDueDate(new Date().toISOString().slice(0, 10));
    setShowAddForm(false);
  };

  return (
    <div id="due-today-panel" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 font-sans">
          <Calendar className="w-4.5 h-4.5 text-rose-400 font-sans" />
          <span>Bills &amp; Income Checklist</span>
        </h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="p-1 px-2.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer font-sans"
          >
            {showAddForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            <span>Add Bill / Income</span>
          </button>
          {dueBills.length > 0 ? (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 tracking-wider font-sans">
              {dueBills.length} DUE
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-wider font-sans">
              ALL SET
            </span>
          )}
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3 animate-fade-in font-sans">
          <div className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1 font-sans">Add a repeating bill or pay</div>
          <div className="space-y-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">What is this for?</label>
              <input
                type="text"
                placeholder="e.g. Amazon Prime"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-rose-500 transition-all font-sans"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">How much ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 14.99"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono outline-none focus:border-rose-500 transition-all"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">When is it due?</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono outline-none focus:border-rose-500 transition-all cursor-pointer font-sans"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">How often does it repeat?</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white cursor-pointer outline-none focus:border-rose-500 font-sans"
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Bi-weekly">Bi-weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Is it money in or money out?</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "expense" | "profit")}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white cursor-pointer outline-none focus:border-rose-500 font-sans"
                >
                  <option value="expense">Money out (You pay)</option>
                  <option value="profit">Money in (You get paid)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Pick an icon</label>
              <select
                value={iconType}
                onChange={(e) => setIconType(e.target.value as "subscription" | "rent" | "salary")}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white cursor-pointer outline-none focus:border-rose-500 font-sans"
              >
                <option value="subscription">Regular Bill</option>
                <option value="rent">Rent/Receipt</option>
                <option value="salary">Paycheck/Salary</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold uppercase rounded-lg transition-all cursor-pointer shadow-sm shadow-rose-700/20 font-sans"
            >
              Save Repeating Item
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {/* DUE / OVERDUE SECTION */}
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex items-center justify-between font-sans">
            <span>Due now ({dueBills.length})</span>
            {dueBills.length > 0 && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />}
          </div>
          <div className="space-y-2">
            {dueBills.map((bill) => {
              const isIncome = bill.type === "profit";
              const billDate = bill.dueDate || todayStr;
              const isOverdue = billDate < todayStr;

              let icon = <CreditCard className="w-5 h-5 text-rose-400" />;
              let iconBg = "bg-rose-500/10 border-rose-500/20";

              if (bill.icon === "rent") {
                icon = <Receipt className="w-5 h-5 text-rose-400" />;
                iconBg = "bg-rose-500/10 border-rose-500/20";
              } else if (bill.icon === "salary") {
                icon = <Sparkles className="w-5 h-5 text-emerald-400" />;
                iconBg = "bg-emerald-500/10 border-emerald-500/20";
              }

              return (
                <div 
                   key={bill.id} 
                  className="flex items-center justify-between gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden transition-all duration-300 font-sans"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${isIncome ? "bg-emerald-500" : "bg-rose-500"}`} />

                  <div className="flex items-center gap-3 pl-1.5 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg border ${iconBg} shrink-0`}>
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-white truncate font-sans">{bill.name}</p>
                        {isOverdue ? (
                          <span className="text-[8px] font-extrabold text-rose-400 bg-rose-500/15 px-1 py-[1px] rounded tracking-wide uppercase font-sans">Overdue</span>
                        ) : (
                          <span className="text-[8px] font-extrabold text-amber-400 bg-amber-500/15 px-1 py-[1px] rounded tracking-wide uppercase font-sans">Today</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-medium">
                        {formatCurrency(bill.amount)} • {bill.frequency} • <span className={isOverdue ? "text-rose-400 font-semibold" : "text-slate-400"}>Due: {formatReadableDate(billDate)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPayBill(bill)}
                      className={`text-[9.5px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 cursor-pointer px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all shrink-0 font-sans ${
                        isIncome ? "text-emerald-400 hover:border-emerald-500/50" : "text-rose-400 hover:border-rose-500/50"
                      }`}
                    >
                      {isIncome ? "GET PAID" : "PAY BILL"}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => onDeleteBill(bill.id)}
                      title="Remove Bill"
                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-850 rounded transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {dueBills.length === 0 && (
              <div className="py-4 border border-dashed border-slate-850 rounded-xl text-center text-[11px] text-slate-500 italic bg-slate-950/20">
                No items currently due. You are all caught up!
              </div>
            )}
          </div>
        </div>

        {/* UPCOMING / RECURRING FUTURE FLOWS */}
        {upcomingBills.length > 0 && (
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 font-sans">
              Coming up next ({upcomingBills.length})
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {upcomingBills.map((bill) => {
                const isIncome = bill.type === "profit";
                const billDate = bill.dueDate || todayStr;

                let icon = <CreditCard className="w-4 h-4 text-slate-400 font-sans" />;
                let iconBg = "bg-slate-800/40 border-slate-800";

                if (bill.icon === "rent") {
                  icon = <Receipt className="w-4 h-4 text-slate-400 font-sans" />;
                } else if (bill.icon === "salary") {
                  icon = <Sparkles className="w-4 h-4 text-emerald-500/70 font-sans" />;
                  iconBg = "bg-emerald-500/5 border-emerald-500/10";
                }

                return (
                  <div 
                    key={bill.id} 
                    className="flex items-center justify-between gap-3 p-2 bg-slate-950/25 rounded-lg border border-slate-850/60 shadow-sm relative overflow-hidden opacity-75 hover:opacity-100 transition-opacity font-sans"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-1">
                      <div className={`p-1.5 rounded-md border ${iconBg} shrink-0`}>
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-slate-300 truncate font-sans">{bill.name}</p>
                          <span className="text-[7.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-[0.5px] rounded border border-emerald-500/20 flex items-center gap-0.5 font-sans">
                            <Check className="w-2 h-2" />
                            <span>All Set</span>
                          </span>
                        </div>
                        <p className="text-[9.5px] text-slate-500 font-sans mt-0.5">
                          {formatCurrency(bill.amount)} • {bill.frequency} • <span className="text-slate-400 font-medium font-sans">Next: {formatReadableDate(billDate)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPayBill(bill)}
                        title="Collect or Pay early for the next cycle"
                        className="text-[8px] font-bold uppercase hover:underline text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 font-sans cursor-pointer"
                      >
                        Early
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteBill(bill.id)}
                        title="Remove Bill"
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-850 rounded transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="text-[9px] text-slate-500 text-center font-sans mt-4 italic block">
        These repeat automatically once paid or received!
      </p>
    </div>
  );
}
