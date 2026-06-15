import React, { useState } from "react";
import { Sparkles, Calendar, Receipt, CreditCard, Plus, Trash2, X } from "lucide-react";
import { formatCurrency } from "../utils";

export interface RecurringBill {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  type: "expense" | "profit";
  icon: "subscription" | "rent" | "salary";
}

interface DueTodayProps {
  bills: RecurringBill[];
  onPayBill: (bill: RecurringBill) => void;
  paidIds: string[];
  onAddBill: (bill: RecurringBill) => void;
  onDeleteBill: (id: string) => void;
}

export default function DueToday({ bills, onPayBill, paidIds, onAddBill, onDeleteBill }: DueTodayProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"expense" | "profit">("expense");
  const [frequency, setFrequency] = useState("Monthly");
  const [iconType, setIconType] = useState<"subscription" | "rent" | "salary">("subscription");

  const activeBills = bills.filter((bill) => !paidIds.includes(bill.id));

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
    };

    onAddBill(newBill);
    setName("");
    setAmount("");
    setShowAddForm(false);
  };

  return (
    <div id="due-today-panel" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
          <Calendar className="w-4.5 h-4.5 text-rose-400" />
          <span>Due Today</span>
        </h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="p-1 px-2.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
          >
            {showAddForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            <span>Set Bill</span>
          </button>
          {activeBills.length > 0 ? (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 tracking-wider">
              {activeBills.length} PENDING
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-wider">
              ALL SET
            </span>
          )}
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3 animate-fade-in">
          <div className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Set New Bill / Income Due</div>
          <div className="space-y-2">
            <div>
              <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Bill Name</label>
              <input
                type="text"
                placeholder="e.g. Amazon Prime"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-rose-500 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 14.99"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono outline-none focus:border-rose-500 transition-all animate-fade-in"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Frequency</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly, Weekly"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-rose-500 transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "expense" | "profit")}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white cursor-pointer outline-none focus:border-rose-500"
                >
                  <option value="expense">Expense (You pay)</option>
                  <option value="profit">Income (You collect)</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Visual Asset Styling</label>
                <select
                  value={iconType}
                  onChange={(e) => setIconType(e.target.value as "subscription" | "rent" | "salary")}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white cursor-pointer outline-none focus:border-rose-500"
                >
                  <option value="subscription">Subscription (Card Icon)</option>
                  <option value="rent">Rent (Receipt Icon)</option>
                  <option value="salary">Bonus/Salary (Sparkle Icon)</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold uppercase rounded-lg transition-all cursor-pointer shadow-sm shadow-rose-700/20"
            >
              Add Due Item
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {bills.map((bill) => {
          const isPaid = paidIds.includes(bill.id);
          const isIncome = bill.type === "profit";

          // Icons selection matching screenshots
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
              className={`flex items-center justify-between gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-800 shadow-sm relative overflow-hidden transition-all duration-300 ${isPaid ? "opacity-30 line-through scale-95" : ""}`}
            >
              {/* Vertical indicator bar */}
              {!isPaid && (
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isIncome ? "bg-emerald-500" : "bg-rose-500"}`} />
              )}

              <div className="flex items-center gap-3 pl-1.5 min-w-0 flex-1">
                <div className={`p-2 rounded-lg border ${iconBg} shrink-0`}>
                  {icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{bill.name}</p>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5 font-medium">
                    {formatCurrency(bill.amount)} • {bill.frequency}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isPaid ? (
                  <button
                    type="button"
                    onClick={() => onPayBill(bill)}
                    className={`text-[9px] font-black uppercase tracking-widest hover:underline cursor-pointer px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-755 transition-colors shrink-0 ${
                      isIncome ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isIncome ? "COLLECT" : "PAY"}
                  </button>
                ) : (
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono shrink-0">
                    Settle
                  </span>
                )}
                
                <button
                  type="button"
                  onClick={() => onDeleteBill(bill.id)}
                  title="Remove Bill from Due List"
                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-850 rounded transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {bills.length === 0 && (
          <div className="py-8 border-2 border-dashed border-slate-850 rounded-xl text-center text-xs text-slate-500 italic bg-slate-950/20">
            No bills set for today. Click "Set Bill" above to schedule a due item.
          </div>
        )}
      </div>

      <p className="text-[9px] text-slate-500 text-center font-sans mt-4 italic block">
        Set your custom cash flows or recurring subscriptions for today's checklist.
      </p>
    </div>
  );
}
