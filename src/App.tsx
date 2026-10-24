import AccountAction, { readAccountLink } from "./components/AccountAction";
import { apiAvailable } from "./api";
import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  DollarSign,
  Wallet,
  TrendingUp,
  Compass,
  AlertCircle,
  Copy,
  Users,
  Wifi,
  TrendingDown,
  Radio,
  Activity,
  CheckCircle2,
  PiggyBank,
  ArrowUpRight,
  Sparkles,
  Tag,
  Info,
} from "lucide-react";
import { transactionClassifier } from "./utils/transactionClassifier";
import { Budget, Transaction, Collaborator } from "./types";
import { formatCurrency, generateScheduleDates } from "./utils";

// Component imports
import Sidebar from "./components/Sidebar";
import ActiveBudgets from "./components/ActiveBudgets";
import AnomalyAlerts from "./components/AnomalyAlerts";
import OverspendingAlerts from "./components/OverspendingAlerts";
import ProjectionInsights from "./components/ProjectionInsights";
import RecentActivity from "./components/RecentActivity";
import DueToday, { RecurringBill } from "./components/DueToday";
import SmartProjections from "./components/SmartProjections";
import Calculator from "./components/Calculator";
import CollaborationHub from "./components/CollaborationHub";
import Toast, { ToastItem } from "./components/Toast";
import AuthOverlay from "./components/AuthOverlay";

import useWorkspace, { request } from "./hooks/useWorkspace";
import {
  addTransactions,
  createBudget,
  deleteTransactions,
  isPosted,
  normalizeLedger,
  removeBudget,
  renameBudget,
  resetBalance,
  settleBill,
  todayIn,
  cents,
} from "./domain/ledger";
const makeId = () => crypto.randomUUID();
export default function App() {
  const [accountAction, setAccountAction] = useState(readAccountLink);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [authReady, setAuthReady] = useState(!apiAvailable);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [activeBudgetFilter, setActiveBudgetFilter] = useState<string | null>(
    null,
  );
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomInvitation, setRoomInvitation] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const triggerToast = (
    message: string,
    type: "success" | "info" | "warning" = "success",
  ) => {
    const toast = { id: makeId(), message, type };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => dismissToast(toast.id), 6000);
  };
  const dismissToast = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));
  const workspace = useWorkspace(userEmail, isGuestMode, (message) =>
    triggerToast(message, "warning"),
  );
  const { budgets, transactions, bills: dueBills } = workspace.ledger;
  const roomId = workspace.roomId;
  const paidBills: string[] = [];
  const activeUsers: Collaborator[] = [];
  const roomDetails = roomId
    ? { id: roomId, history: [], version: 1, budgets, transactions }
    : null;
  const [online, setOnline] = useState(navigator.onLine);
  const undoStack = workspace.canUndo ? [1] : [],
    redoStack = workspace.canRedo ? [1] : [];
  const executeUndo = () => void workspace.undo(),
    executeRedo = () => void workspace.redo();
  const [txAmount, setTxAmount] = useState("");
  const [txType, setTxType] = useState<"profit" | "expense">("expense");
  const [txRecurrence, setTxRecurrence] = useState("one-time"),
    [txCustomWeeks, setTxCustomWeeks] = useState("3"),
    [txOccurrencesCount, setTxOccurrencesCount] = useState("12"),
    [txDescription, setTxDescription] = useState("");
  const [isEditingGoal, setIsEditingGoal] = useState(false),
    [goalInputValue, setGoalInputValue] = useState("");
  const txClassification = useMemo(
    () => transactionClassifier.classify(txDescription),
    [txDescription],
  );
  const [showQuickCreate, setShowQuickCreate] = useState(false),
    [newNameInput, setNewNameInput] = useState(""),
    [newBalanceInput, setNewBalanceInput] = useState("");
  const [showQuickRename, setShowQuickRename] = useState(false),
    [oldRenameSelect, setOldRenameSelect] = useState(""),
    [newNameSelect, setNewNameSelect] = useState("");
  const [budgetToDelete, setBudgetToDelete] = useState<string | null>(null),
    [budgetToReset, setBudgetToReset] = useState<string | null>(null),
    [resetBalanceAmountInput, setResetBalanceAmountInput] = useState("");
  useEffect(() => {
    // Old client-side passwords are not credentials for server accounts.
    try {
      localStorage.removeItem("budgetmanager_accounts");
      localStorage.removeItem("budjet_dynamic_ml_data");
    } catch {}
    if (apiAvailable && !accountAction)
      request("/api/auth/me")
        .then((data) => {
          setUserEmail(data.user.email);
          setUserName(data.user.name);
        })
        .catch(() => {})
        .finally(() => setAuthReady(true));
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (activeBudgetFilter && !Object.hasOwn(budgets, activeBudgetFilter))
      setActiveBudgetFilter(null);
  }, [budgets, activeBudgetFilter]);
  const handleLogin = (email: string, name: string) => {
    setUserEmail(email);
    setUserName(name);
    setIsGuestMode(false);
    setActiveBudgetFilter(null);
  };
  const handleLogout = async () => {
    if (workspace.busy) {
      triggerToast("Wait for the current save before signing out.", "info");
      return;
    }
    try {
      if (apiAvailable && userEmail)
        await request("/api/auth/logout", { method: "POST" });
      setUserEmail("");
      setUserName("");
      setIsGuestMode(false);
      setActiveBudgetFilter(null);
      setCurrentTab("dashboard");
    } catch (e) {
      triggerToast((e as Error).message, "warning");
    }
  };
  const handleCreateRoom = async () => {
    try {
      const data = await workspace.createRoom();
      if (!data) return;
      setShowJoinModal(true);
      setRoomInvitation(data.invitation);
      triggerToast("Private shared room created.");
    } catch (e) {
      triggerToast((e as Error).message, "warning");
    }
  };
  const handleJoinRoom = async (invitation: string) => {
    try {
      const [id, token] = invitation.trim().split(".");
      await workspace.switchRoom(id, token);
      setShowJoinModal(false);
      setActiveBudgetFilter(null);
    } catch (e) {
      triggerToast((e as Error).message, "warning");
    }
  };
  const handleDisconnectRoom = () => {
    setRoomInvitation("");
    void workspace
      .switchRoom(null)
      .catch((e) => triggerToast(e.message, "warning"));
    setActiveBudgetFilter(null);
  };
  const handleAddNewTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBudgetFilter) return;
    const amount = Number(txAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      triggerToast("Enter a positive amount.", "warning");
      return;
    }
    const day = todayIn(workspace.ledger.timeZone);
    const freq =
      txRecurrence === "weekly"
        ? "w"
        : txRecurrence === "bi-weekly"
          ? "b"
          : txRecurrence === "yearly"
            ? "y"
            : txRecurrence === "custom-weeks"
              ? "c"
              : "m";
    let dates: string[];
    try {
      dates =
        txRecurrence === "one-time"
          ? [day]
          : generateScheduleDates(
              day,
              freq,
              txRecurrence === "custom-weeks" ? "weeks" : undefined,
              Math.max(1, Number(txCustomWeeks) || 1),
              Math.max(1, Math.min(100, Number(txOccurrencesCount) || 12)),
            );
    } catch (error) {
      triggerToast((error as Error).message, "warning");
      return;
    }
    const items: Transaction[] = dates.map((date) => ({
      id: makeId(),
      budget: activeBudgetFilter,
      date: date.slice(0, 10),
      type: txType,
      amount,
      description:
        txDescription.trim() || `Transaction on ${activeBudgetFilter}`,
      recurrence: txRecurrence,
    }));
    void workspace.edit((current) => addTransactions(current, items));
    setTxAmount("");
    setTxDescription("");
    setTxRecurrence("one-time");
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        !(e.ctrlKey || e.metaKey) ||
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName)
      )
        return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        void (e.shiftKey ? workspace.redo() : workspace.undo());
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        void workspace.redo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [userEmail, isGuestMode, roomId]);
  const handlePayBill = (bill: RecurringBill) =>
    void workspace.edit((current) =>
      settleBill(
        current,
        bill.id,
        activeBudgetFilter || undefined,
        bill.dueDate,
      ),
    );
  const handleCreateBill = (bill: RecurringBill) =>
    void workspace.edit((current) =>
      normalizeLedger({ ...current, bills: [...current.bills, bill] }),
    );
  const handleDeleteBill = (id: string) =>
    void workspace.edit((current) => ({
      ...current,
      bills: current.bills.filter((b) => b.id !== id),
    }));
  const handleDeleteTransactionsBatch = (ids: string[]) =>
    void workspace.edit((current) => deleteTransactions(current, ids));
  const handleImportTransactionsBatch = (
    items: Transaction[],
    names: string[],
  ) => {
    void workspace.edit((current) => {
      let next = current;
      for (const name of names)
        if (!Object.hasOwn(next.budgets, name))
          next = createBudget(next, name, 0);
      return addTransactions(next, items, true);
    });
  };
  const handleCreateNewBudget = () => {
    const value = newBalanceInput.trim() ? Number(newBalanceInput) : 0;
    void workspace.edit((current) =>
      createBudget(current, newNameInput, value),
    );
    setShowQuickCreate(false);
    setNewNameInput("");
    setNewBalanceInput("");
  };
  const handleRenameBudget = () => {
    void workspace.edit((current) =>
      renameBudget(current, oldRenameSelect, newNameSelect),
    );
    setShowQuickRename(false);
    setActiveBudgetFilter(null);
    setNewNameSelect("");
  };
  const handleResetBalance = (name: string) => {
    setBudgetToReset(name);
    setResetBalanceAmountInput(String(budgets[name].balance));
  };
  const performResetBalance = (name: string, value: number) => {
    void workspace.edit((current) => resetBalance(current, name, value));
    setBudgetToReset(null);
  };
  const handleSetBudgetGoal = (name: string, goal: number | undefined) =>
    void workspace.edit((current) => ({
      ...current,
      budgets: {
        ...current.budgets,
        [name]: { ...current.budgets[name], targetBalance: goal },
      },
    }));
  const handleDeleteBudgetDirect = (name: string) => setBudgetToDelete(name);
  const performDeleteBudget = (name: string) => {
    void workspace.edit((current) => removeBudget(current, name));
    setBudgetToDelete(null);
    setActiveBudgetFilter(null);
  };
  const handleArchiveOldFunds = () =>
    triggerToast(
      "Your ledger history is retained. Use Export backup before removing records.",
      "info",
    );
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(workspace.ledger, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cash-diet-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 10_000_000) throw new Error("Backup is too large.");
      const parsed = normalizeLedger(JSON.parse(await file.text()));
      if (
        window.confirm(
          "Replace this workspace with this backup? Export a backup first to keep the current records.",
        )
      )
        void workspace.edit(() => parsed);
    } catch (e) {
      triggerToast((e as Error).message, "warning");
    }
  };
  // --- COMPUTE LIQUIDITY STATS ---
  const totalLiquidity = useMemo(() => {
    return (
      (Object.values(budgets) as Budget[]).reduce(
        (sum, b) => sum + cents(b.balance),
        0,
      ) / 100
    );
  }, [budgets]);

  const monthlySpendTotal = useMemo(() => {
    const day = todayIn(workspace.ledger.timeZone);
    return (
      transactions
        .filter(
          (t) =>
            isPosted(t, day) &&
            t.type === "expense" &&
            t.date.slice(0, 7) === day.slice(0, 7),
        )
        .reduce((sum, t) => sum + cents(t.amount), 0) / 100
    );
  }, [transactions, workspace.ledger.timeZone]);
  const liquidityComparison = {
    text: "Posted funds across your budgets",
    percentage: 0,
    isIncrease: true,
    hasHistory: false,
  };

  // --- DYNAMIC ADVISOR TIPS BASED ON REGISTERED BUDGETS ---
  const advisorTip = useMemo(() => {
    const budgetList = Object.values(budgets) as Budget[];

    // Case 1: No budgets
    if (budgetList.length === 0) {
      return {
        text: (
          <>
            No active budgets registered. Create a new{" "}
            <strong>Savings Goal</strong> or <strong>Institutional Fund</strong>{" "}
            to generate tailored financial trajectory tips and unlock advisor
            intelligence!
          </>
        ),
        actionLabel: "Create First Budget",
        onClick: () => setShowQuickCreate(true),
      };
    }

    // Case 2: Only 1 budget
    if (budgetList.length === 1) {
      const single = budgetList[0];
      return {
        text: (
          <>
            You have registered <strong>{single.name}</strong> with a balance of{" "}
            <strong>{formatCurrency(single.balance)}</strong>. To enhance wealth
            durability, consider establishing a separate{" "}
            <strong>Emergency Buffer</strong> to absorb short-term volatility.
          </>
        ),
        actionLabel: "Register Emergency Buffer",
        onClick: () => {
          setNewNameInput("Emergency Goal");
          setNewBalanceInput("1000");
          setShowQuickCreate(true);
        },
      };
    }

    // Case 3: Has budget(s) running thin (< $100 or negative)
    const thinBudget = budgetList.find((b) => b.balance < 100);
    if (thinBudget) {
      return {
        text: (
          <>
            Caution: Your budget <strong>{thinBudget.name}</strong> has a low
            liquidity of <strong>{formatCurrency(thinBudget.balance)}</strong>.
            Consider reallocating asset shares from healthier reserves to
            support its velocity.
          </>
        ),
        actionLabel: `Manage ${thinBudget.name}`,
        onClick: () => {
          setActiveBudgetFilter(thinBudget.name);
          setCurrentTab("detailed");
        },
      };
    }

    // Case 4: General cashflow calculations from transactions
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, curr) => acc + curr.amount, 0);
    const totalProfits = transactions
      .filter((t) => t.type === "profit")
      .reduce((acc, curr) => acc + curr.amount, 0);

    if (totalExpenses > totalProfits && transactions.length > 0) {
      return {
        text: (
          <>
            Aggregate cashflow metrics indicate total expense activity (
            <strong>{formatCurrency(totalExpenses)}</strong>) is outpacing
            registered income (<strong>{formatCurrency(totalProfits)}</strong>).
            Verify transaction categories to scale back on non-essential
            spending.
          </>
        ),
        actionLabel: "Optimize Cashflows",
        onClick: () => {
          setCurrentTab("calculator");
        },
      };
    }

    // Case 5: Standard high-liquidity general advisory
    const topBudget = [...budgetList].sort((a, b) => b.balance - a.balance)[0];
    return {
      text: (
        <>
          Excellent diversification! Your major treasury,{" "}
          <strong>{topBudget.name}</strong>, holds{" "}
          <strong>{formatCurrency(topBudget.balance)}</strong> of your
          portfolio. Consider setting up daily recurring checks or automatic
          micro-savings plans inside your detailed view.
        </>
      ),
      actionLabel: `Focus on ${topBudget.name}`,
      onClick: () => {
        setActiveBudgetFilter(topBudget.name);
        setCurrentTab("detailed");
      },
    };
  }, [budgets, transactions]);

  if (accountAction)
    return (
      <AccountAction
        action={accountAction}
        onDone={() => {
          setAccountAction(null);
          setUserEmail("");
          setUserName("");
          setIsGuestMode(false);
          setAuthReady(true);
        }}
      />
    );
  if (!authReady)
    return (
      <div className="p-8 text-white bg-slate-950 min-h-screen">
        Checking account session…
      </div>
    );
  if ((userEmail || isGuestMode) && !workspace.ready)
    return (
      <div className="p-8 text-white bg-slate-950 min-h-screen space-y-4">
        <p>Loading ledger…</p>
        <button onClick={() => location.reload()}>Retry</button>
        <button onClick={handleLogout}>Sign out</button>
        {!apiAvailable && (
          <label className="block">
            Recover from a JSON backup
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                try {
                  const f = e.target.files?.[0];
                  if (f && f.size <= 10_000_000)
                    workspace.recover(JSON.parse(await f.text()));
                } catch (error) {
                  triggerToast((error as Error).message, "warning");
                }
              }}
            />
          </label>
        )}
        <Toast toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  // --- Auth Wall Gate ---
  if (!userEmail && !isGuestMode) {
    return (
      <div className="min-h-screen bg-[#161a15] flex items-center justify-center">
        <AuthOverlay
          onLogin={handleLogin}
          onGuest={() => {
            setIsGuestMode(true);

            triggerToast(
              "Guest Mode enabled. Progress will not be saved.",
              "warning",
            );
          }}
        />
        <Toast toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  // Render proper sub views
  return (
    <div
      id="application-container"
      className="min-h-screen dark-theme bg-slate-950 text-slate-705 lg:pl-64 font-sans antialiased"
    >
      {/* Sidebar navigation */}
      <Sidebar
        currentTab={currentTab}
        onChangeTab={(tab) => {
          setCurrentTab(tab);
          setActiveBudgetFilter(null); // Reset detail filter when changing section
        }}
        online={online}
        roomId={roomId}
        activeUsers={activeUsers}
        onTriggerNewScenario={() => {
          setCurrentTab("calculator");
          setActiveBudgetFilter(null);
        }}
        userEmail={userEmail || "guest@example.com"}
        userName={userName || "Guest User"}
        onLogout={handleLogout}
        onShowJoinModal={() => setShowJoinModal(true)}
        onDisconnectRoom={handleDisconnectRoom}
        onShowToast={triggerToast}
      />

      {/* Main Screen Container content area */}
      <main id="app-main" className="min-w-0 px-4 pt-5 pb-20 sm:px-6 lg:pr-8">
        <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-300">
          <span>
            {apiAvailable
              ? "Server account"
              : "Local profile: this browser only"}{" "}
            · {workspace.busy ? "Saving…" : "Ledger ready"}
          </span>
          <button onClick={exportBackup}>Export backup</button>
          <label className="cursor-pointer">
            Restore backup
            <input
              className="sr-only"
              type="file"
              accept=".json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importBackup(f);
                e.target.value = "";
              }}
            />
          </label>
          {apiAvailable && userEmail && (
            <button
              onClick={() =>
                void workspace
                  .reload()
                  .catch((e) => triggerToast(e.message, "warning"))
              }
            >
              Reload latest
            </button>
          )}
        </div>
        {/* Guest Warning Banner */}
        {!userEmail && isGuestMode && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-200 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/15 rounded-xl text-amber-400 shrink-0">
                <AlertCircle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <p className="font-extrabold text-[13px] text-amber-100 leading-tight">
                  Guest Workspace / Transient Session
                </p>
                <p className="text-[11px] text-amber-400/85 mt-1 leading-relaxed">
                  Your transactions and budgets are NOT being saved. Create an
                  account or log in to persist your personal ledger across
                  sessions.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setIsGuestMode(false);
              }}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded-xl transition duration-150 shadow-md shadow-rose-700/10 hover:shadow-rose-600/20 text-xs shrink-0 cursor-pointer"
            >
              🔐 Create Account / Login
            </button>
          </div>
        )}

        {/* Dynamic Nav Header Bar */}
        <header
          id="tab-nav-header"
          className="flex items-center justify-between gap-4 flex-wrap xl:flex-nowrap mb-8 border-b border-slate-800/80 pb-5"
        >
          <div className="flex items-center gap-4">
            {activeBudgetFilter ? (
              <button
                onClick={() => setActiveBudgetFilter(null)}
                className="p-1.5 hover:bg-slate-800 rounded border border-slate-850 text-slate-400 hover:text-white transition-all cursor-pointer"
                title="Return to dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            <h2
              id="view-title"
              className="text-xl sm:text-2xl font-black tracking-tight text-white capitalize break-words"
            >
              {activeBudgetFilter
                ? `Budget / ${activeBudgetFilter}`
                : currentTab === "dashboard"
                  ? "Home"
                  : currentTab}
            </h2>
          </div>

          {/* Desktop utility controls and ADD TRANSACTION BUTTON */}
          <div
            id="header-actions"
            className="flex items-center gap-2 sm:gap-4 flex-wrap"
          >
            {/* Search Box */}
            <div className="hidden sm:block text-slate-400 text-xs bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-lg w-52 flex items-center justify-between font-medium">
              <span className="truncate max-w-[150px]">
                {userEmail || "Guest Session"}
              </span>
              <Wifi
                className={`w-3.5 h-3.5 shrink-0 ${online ? "text-rose-455" : "text-amber-500 animate-pulse"}`}
              />
            </div>

            {/* Undo / Redo triggers */}
            <div className="flex items-center border border-slate-800 bg-slate-900 rounded-lg p-1 gap-1">
              <button
                onClick={executeUndo}
                className={`p-1.5 rounded hover:bg-slate-850 transition-colors cursor-pointer ${undoStack.length === 0 ? "opacity-30 cursor-not-allowed text-slate-500" : "text-rose-400"}`}
                title="Undo last action"
              >
                <RotateCcw className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={executeRedo}
                className={`p-1.5 rounded hover:bg-slate-850 transition-colors cursor-pointer ${redoStack.length === 0 ? "opacity-30 cursor-not-allowed text-slate-500" : "text-rose-400"}`}
                title="Redo action"
              >
                <RotateCw className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* General quick actions click list */}
            {!activeBudgetFilter && (
              <button
                onClick={() => {
                  const bList = Object.keys(budgets);
                  if (bList.length === 0) {
                    triggerToast(
                      "Please create a budget first via Quick Actions panel.",
                      "warning",
                    );
                    return;
                  }
                  setActiveBudgetFilter(bList[0]);
                }}
                id="btn-header-add-transaction"
                className="py-2.5 px-4 bg-black hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded transition-all cursor-pointer shadow"
              >
                Add Transaction
              </button>
            )}
          </div>
        </header>

        <OverspendingAlerts
          key={JSON.stringify([userEmail || "guest", roomId || "personal"])}
          scope={JSON.stringify([userEmail || "guest", roomId || "personal"])}
          ledger={workspace.ledger}
          onReview={(name) => { setCurrentTab("budgets"); setActiveBudgetFilter(name); }}
        />
        {/* --- ROUTED WORKSPACE VIEWS --- */}
        <div className="bento-workspace" key={`${currentTab}-${activeBudgetFilter ?? "all"}`}>

        {currentTab === "calculator" ? (
          <Calculator budgets={budgets} />
        ) : currentTab === "budgets" && !activeBudgetFilter ? (
          // Tab 2: Budgets overview grid representation
          <div className="space-y-6 max-w-7xl mx-auto">
            <ActiveBudgets
              budgets={budgets}
              transactions={transactions}
              onManageBudget={(name) => {
                setActiveBudgetFilter(name);
              }}
              onCreateBudget={() => setShowQuickCreate(true)}
              onShowToast={triggerToast}
            />
          </div>
        ) : currentTab === "transactions" && !activeBudgetFilter ? (
          // Tab 3: Transactions complete dataset spreadsheet listing
          <div className="max-w-7xl mx-auto">
            <RecentActivity
              transactions={transactions}
              mode="budget-view"
              onDeleteTransactions={handleDeleteTransactionsBatch}
              onImportTransactions={handleImportTransactionsBatch}
              existingBudgetNames={Object.keys(budgets)}
            />
          </div>
        ) : currentTab === "projections" ? (
          // Tab: Smart Projections & Asset Forecasts
          <SmartProjections
            budgets={budgets}
            transactions={transactions}
            dueBills={dueBills}
          />
        ) : currentTab === "settings" ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-2xl space-y-4 text-slate-300">
            <h3 className="text-lg font-bold text-white">Workspace settings</h3>
            <p className="text-sm">
              Calendar timezone: {workspace.ledger.timeZone}. Scheduled entries
              become posted on their due date in this timezone.
            </p>
            <p className="text-sm">
              {apiAvailable
                ? "Changes save after the server accepts them. If another editor changes this workspace first, reload the latest revision before retrying."
                : "Changes save as one snapshot in this browser. Local profiles do not restrict access. Keep exported backups somewhere private."}
            </p>
            <button
              onClick={exportBackup}
              className="rounded-xl bg-rose-700 p-3 text-white"
            >
              Export full backup
            </button>
            <p className="text-xs">
              Use Restore backup above to replace this workspace. Undo and redo
              apply to changes from this session.
            </p>
          </div>
        ) : activeBudgetFilter ? (
          // Tab 5: Dynamic Specific Budget Detailed Desk (Screenshot 2)
          <div className="space-y-8 max-w-7xl mx-auto">
            {/* Dark balance detail card header */}
            <div
              id="budget-detail-card"
              className="bg-[#292d24] rounded-lg p-6 text-white border border-[#454c3b] shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6"
            >
              <div className="space-y-3 z-10 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">
                  Total Available Balance
                </span>
                <h1 className="text-3xl md:text-4xl font-extrabold font-mono tracking-tight text-white mt-1">
                  {formatCurrency(budgets[activeBudgetFilter]?.balance || 0)}
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold font-sans">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Posted balance · scheduled entries are separate</span>
                  </span>
                </div>

                <div className="flex items-center gap-2.5 pt-3">
                  <button
                    onClick={() => handleResetBalance(activeBudgetFilter)}
                    className="py-2 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    Reset Balance
                  </button>
                  <button
                    onClick={() => handleDeleteBudgetDirect(activeBudgetFilter)}
                    className="py-2 px-4 bg-rose-950/45 hover:bg-rose-900 border border-rose-900 text-rose-300 text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer"
                  >
                    Delete Budget
                  </button>
                </div>

                {/* 'Budget Goal' progress tracker */}
                <div className="border-t border-slate-800/80 pt-4 mt-4 space-y-3 max-w-lg">
                  {isEditingGoal ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = parseFloat(goalInputValue);
                        if (isNaN(val) || val <= 0) {
                          handleSetBudgetGoal(activeBudgetFilter, undefined);
                        } else {
                          handleSetBudgetGoal(activeBudgetFilter, val);
                        }
                        setIsEditingGoal(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                          $
                        </span>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          placeholder="e.g. 5000"
                          value={goalInputValue}
                          onChange={(e) => setGoalInputValue(e.target.value)}
                          className="w-32 pl-6 pr-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono outline-none focus:border-rose-500"
                          required
                          autoFocus
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold rounded cursor-pointer transition-all"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingGoal(false)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-350 text-[11px] font-medium rounded cursor-pointer transition-all"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest font-sans">
                          Budget Goal:
                        </span>
                        <span className="text-sm font-bold font-mono text-white">
                          {budgets[activeBudgetFilter]?.targetBalance !==
                            undefined &&
                          budgets[activeBudgetFilter]!.targetBalance! > 0
                            ? formatCurrency(
                                budgets[activeBudgetFilter]!.targetBalance!,
                              )
                            : "No Goal Set"}
                        </span>
                        {budgets[activeBudgetFilter]?.targetBalance !==
                          undefined &&
                          budgets[activeBudgetFilter]!.targetBalance! > 0 && (
                            <span className="text-[11px] font-bold text-rose-450 font-sans ml-1">
                              (
                              {Math.round(
                                Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    ((budgets[activeBudgetFilter]?.balance ||
                                      0) /
                                      budgets[activeBudgetFilter]!
                                        .targetBalance!) *
                                      100,
                                  ),
                                ),
                              )}
                              % reached)
                            </span>
                          )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            const currentTarget =
                              budgets[activeBudgetFilter]?.targetBalance;
                            setGoalInputValue(
                              currentTarget ? currentTarget.toString() : "",
                            );
                            setIsEditingGoal(true);
                          }}
                          className="text-[11px] font-bold text-rose-400 hover:text-rose-300 font-sans cursor-pointer hover:underline"
                        >
                          {budgets[activeBudgetFilter]?.targetBalance !==
                            undefined &&
                          budgets[activeBudgetFilter]!.targetBalance! > 0
                            ? "Edit Goal"
                            : "Set Goal"}
                        </button>
                        {budgets[activeBudgetFilter]?.targetBalance !==
                          undefined &&
                          budgets[activeBudgetFilter]!.targetBalance! > 0 && (
                            <button
                              onClick={() => {
                                handleSetBudgetGoal(
                                  activeBudgetFilter,
                                  undefined,
                                );
                              }}
                              className="text-[11px] text-slate-500 hover:text-rose-450 font-sans cursor-pointer hover:underline"
                            >
                              Remove
                            </button>
                          )}
                      </div>
                    </div>
                  )}

                  {budgets[activeBudgetFilter]?.targetBalance !== undefined &&
                    budgets[activeBudgetFilter]!.targetBalance! > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="relative w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-rose-700 to-rose-400 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.round(Math.min(100, Math.max(0, ((budgets[activeBudgetFilter]?.balance || 0) / budgets[activeBudgetFilter]!.targetBalance!) * 100)))}%`,
                            }}
                          />
                        </div>

                        <p className="text-[11px] text-slate-300 font-sans tracking-wide">
                          {Math.round(
                            Math.min(
                              100,
                              Math.max(
                                0,
                                ((budgets[activeBudgetFilter]?.balance || 0) /
                                  budgets[activeBudgetFilter]!.targetBalance!) *
                                  100,
                              ),
                            ),
                          ) >= 100 ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              ✨ Goal achieved! Fantastic savings and tracking!
                            </span>
                          ) : (
                            <span>
                              Saved{" "}
                              <strong>
                                {formatCurrency(
                                  budgets[activeBudgetFilter]?.balance || 0,
                                )}
                              </strong>{" "}
                              of{" "}
                              <strong>
                                {formatCurrency(
                                  budgets[activeBudgetFilter]!.targetBalance!,
                                )}
                              </strong>{" "}
                              target. Only{" "}
                              <strong>
                                {formatCurrency(
                                  Math.max(
                                    0,
                                    budgets[activeBudgetFilter]!
                                      .targetBalance! -
                                      (budgets[activeBudgetFilter]?.balance ||
                                        0),
                                  ),
                                )}
                              </strong>{" "}
                              left!
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                </div>
              </div>

              {/* Due Today panel inside Detailed view */}
              <div className="w-full md:w-80 shrink-0 z-10">
                <DueToday
                  onAssignBudget={(id, budget) =>
                    void workspace.edit((current) => ({
                      ...current,
                      bills: current.bills.map((b) =>
                        b.id === id ? { ...b, budget } : b,
                      ),
                    }))
                  }
                  budgetNames={Object.keys(budgets)}
                  bills={dueBills}
                  onPayBill={handlePayBill}
                  paidIds={paidBills}
                  onAddBill={handleCreateBill}
                  onDeleteBill={handleDeleteBill}
                />
              </div>

              {/* Absolute background card deco shape */}
              <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-6 translate-x-6">
                <PiggyBank className="w-64 h-64 text-sky-400" />
              </div>
            </div>

            {/* Split row content layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Add Transaction form card */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-sm h-fit">
                <h3 className="text-base font-black text-white tracking-tight mb-4">
                  New Transaction
                </h3>

                <form
                  onSubmit={handleAddNewTransaction}
                  className="space-y-4 text-xs"
                >
                  {/* Amount Value */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 uppercase tracking-widest text-[9px] block">
                      Amount ($)
                    </label>
                    <input
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="0.00"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded text-sm text-white font-mono focus:border-rose-400 font-medium outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Choose Transaction Type */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-400 uppercase tracking-widest text-[9px] block">
                        Type
                      </label>
                      <select
                        value={txType}
                        onChange={(e) =>
                          setTxType(e.target.value as "profit" | "expense")
                        }
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded font-medium text-white focus:border-rose-400 outline-none [&>option]:bg-slate-950 [&>option]:text-white"
                      >
                        <option value="expense">Expense</option>
                        <option value="profit">Profit</option>
                      </select>
                    </div>

                    {/* Choose Recurrence */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-400 uppercase tracking-widest text-[9px] block">
                        Recurrence
                      </label>
                      <select
                        value={txRecurrence}
                        onChange={(e) => setTxRecurrence(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded font-medium text-white focus:border-rose-400 outline-none [&>option]:bg-slate-950 [&>option]:text-white"
                      >
                        <option value="one-time">One-time</option>
                        <option value="weekly">Weekly</option>
                        <option value="bi-weekly">Bi-weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="custom-weeks">X Weeks Interval</option>
                      </select>
                    </div>
                  </div>

                  {/* Progressive Recurrence Parameters Dashboard */}
                  {txRecurrence !== "one-time" && (
                    <div className="grid grid-cols-2 gap-3 bg-[#20251c] border border-slate-850 p-2.5 rounded-lg animate-fadeIn text-[10px]">
                      {txRecurrence === "custom-weeks" ? (
                        <div className="space-y-1">
                          <label className="font-bold text-slate-400 uppercase tracking-widest text-[8px] block">
                            Weeks (X)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            required
                            value={txCustomWeeks}
                            onChange={(e) => setTxCustomWeeks(e.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-950 border border-slate-850 rounded font-mono text-white text-xs outline-none focus:border-rose-400"
                            placeholder="e.g. 3"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="font-bold text-slate-400 uppercase tracking-widest text-[8px] block">
                            Frequency Rules
                          </label>
                          <div className="px-2 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 rounded font-bold font-mono text-[9px] uppercase tracking-wider text-center">
                            {txRecurrence === "weekly"
                              ? "Every 1 Week"
                              : txRecurrence === "bi-weekly"
                                ? "Every 2 Weeks"
                                : txRecurrence === "monthly"
                                  ? "Every Month"
                                  : "Every Year"}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="font-bold text-slate-400 uppercase tracking-widest text-[8px] block">
                          Occurrences
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          required
                          value={txOccurrencesCount}
                          onChange={(e) =>
                            setTxOccurrencesCount(e.target.value)
                          }
                          className="w-full px-2 py-1.5 bg-slate-950 border border-slate-850 rounded font-mono text-white text-xs outline-none focus:border-rose-400"
                          placeholder="e.g. 12"
                        />
                      </div>
                    </div>
                  )}

                  {/* Description Box */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 uppercase tracking-widest text-[9px] block">
                      Description
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      placeholder="e.g. Weekly Groceries, Apple Store..."
                      value={txDescription}
                      onChange={(e) => setTxDescription(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-850 rounded font-mono text-white focus:border-rose-400 outline-none"
                    />
                  </div>

                  {/* Dynamic Naive Bayes Classifier Feedback panel */}
                  {txDescription.trim().length >= 2 && (
                    <div
                      id="ai-categorization-panel"
                      className="bg-slate-900/65 border border-slate-800/85 rounded-lg p-3 space-y-2 text-[10px]"
                    >
                      <div className="flex items-center justify-between text-slate-400 pb-1.5 border-b border-dashed border-slate-800">
                        <span className="font-bold uppercase tracking-wider text-[8px] flex items-center gap-1 text-indigo-400">
                          <Sparkles className="w-3 h-3 animate-pulse text-indigo-400" />{" "}
                          Automated Pipeline
                        </span>
                        <span className="font-mono bg-indigo-950/40 border border-indigo-900/30 text-indigo-300 px-1.5 py-0.5 rounded font-bold text-[8.5px]">
                          {Math.round(txClassification.confidence * 100)}%
                          Probability
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-slate-400 text-[8.5px] uppercase tracking-wider">
                            Classification
                          </p>
                          <p className="text-[11.5px] font-bold text-slate-100 flex items-center gap-1 mt-0.5">
                            <Tag className="w-3 h-3 text-indigo-400" />
                            <span>{txClassification.category}</span>
                          </p>
                        </div>

                        {/* Interactive dynamic relocation action */}
                        {activeBudgetFilter &&
                          activeBudgetFilter.toLowerCase().trim() !==
                            txClassification.category.toLowerCase().trim() && (
                            <div className="text-right">
                              {budgets[txClassification.category] ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveBudgetFilter(
                                      txClassification.category,
                                    );
                                    triggerToast(
                                      `Switched workspace compartment to '${txClassification.category}'`,
                                      "info",
                                    );
                                  }}
                                  className="py-1 px-2.5 bg-indigo-950/50 hover:bg-indigo-900/50 text-indigo-300 font-bold border border-indigo-900/50 rounded transition-all cursor-pointer text-[9px]"
                                >
                                  Switch Category &rarr;
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fresh: Budget = {
                                      name: txClassification.category,
                                      balance: 0,
                                      created: new Date()
                                        .toISOString()
                                        .slice(0, 19)
                                        .replace("T", " "),
                                    };
                                    void workspace.edit((current) =>
                                      createBudget(
                                        current,
                                        txClassification.category,
                                        0,
                                      ),
                                    );
                                    setActiveBudgetFilter(
                                      txClassification.category,
                                    );
                                    triggerToast(
                                      `Auto-created category & switched workspace to '${txClassification.category}'`,
                                      "success",
                                    );
                                  }}
                                  className="py-1 px-2 bg-rose-950/40 hover:bg-rose-900/40 text-rose-450 font-bold border border-rose-900/40 rounded transition-all cursor-pointer text-[9px]"
                                >
                                  Create &amp; Switch &rarr;
                                </button>
                              )}
                            </div>
                          )}
                      </div>

                      {/* Probabilities micro-distribution */}
                      <div className="space-y-1 pt-1.5 border-t border-slate-800">
                        <p className="text-[8px] text-slate-400 uppercase font-black tracking-wiest">
                          Estimated Bayes Likelihood Space:
                        </p>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[8.5px] text-slate-300">
                          {txClassification.allProbabilities
                            .slice(0, 4)
                            .map((p, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center bg-slate-950 py-0.5 px-1.5 rounded border border-slate-850/60 font-sans"
                              >
                                <span className="truncate max-w-[65px] font-medium">
                                  {p.category}
                                </span>
                                <span className="text-indigo-400 font-bold">
                                  {(p.probability * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 bg-rose-700 hover:bg-rose-650 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors text-center cursor-pointer mt-2 block shadow-sm"
                  >
                    Confirm Transaction
                  </button>
                </form>
              </div>

              {/* Interactive filtered activity table sheet segment */}
              <div className="lg:col-span-2">
                <RecentActivity
                  transactions={transactions}
                  mode="budget-view"
                  selectedBudgetFilter={activeBudgetFilter}
                  onDeleteTransactions={handleDeleteTransactionsBatch}
                  onImportTransactions={handleImportTransactionsBatch}
                  existingBudgetNames={Object.keys(budgets)}
                />
              </div>
            </div>
          </div>
        ) : (
          // Tab 1: Primary Dashboard workspace (Screenshot 1)
          <div className="space-y-8 max-w-7xl mx-auto">
            {/* Top Statistics Cards row */}
            <div
              id="dashboard-statistics"
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Total Liquidity */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-sm border-l-4 border-l-rose-500 flex flex-col justify-between h-40">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
                      Total Liquidity
                    </span>
                    <h3 className="text-3xl font-black font-mono tracking-tight text-slate-705 mt-2">
                      {formatCurrency(totalLiquidity)}
                    </h3>
                  </div>
                  <div className="p-3 bg-rose-500/10 text-rose-450 rounded border border-rose-500/20">
                    <Wallet className="w-5.5 h-5.5" />
                  </div>
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs font-bold mt-2 font-sans ${
                    !liquidityComparison.hasHistory
                      ? "text-slate-500"
                      : liquidityComparison.isIncrease
                        ? "text-emerald-500"
                        : "text-rose-500"
                  }`}
                >
                  {liquidityComparison.hasHistory ? (
                    liquidityComparison.isIncrease ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                  <span>{liquidityComparison.text}</span>
                </div>
              </div>

              {/* Monthly Spend tracker */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-sm border-l-4 border-l-[#e29a7a] flex flex-col justify-between h-40">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
                      Monthly Spend
                    </span>
                    <h3 className="text-3xl font-black font-mono tracking-tight text-slate-705 mt-2">
                      {formatCurrency(monthlySpendTotal)}
                    </h3>
                  </div>
                  <div className="p-3 bg-red-500/10 text-[#e29a7a] rounded border border-red-500/20">
                    <TrendingDown className="w-5.5 h-5.5" />
                  </div>
                </div>
                {/* Red status progress bar mirroring mockup */}
                <div className="mt-2 text-xs">
                  <span className="text-[10px] text-slate-400 block mt-1.5 font-sans">
                    Posted expenses this month
                  </span>
                </div>
              </div>

              {/* Quick Actions Panel from Screenshot 1 */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-sm space-y-2.5 h-40 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                  Quick Actions
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowQuickCreate(true)}
                    className="py-2.5 px-3 bg-slate-805 hover:bg-slate-800 text-rose-455 hover:text-white border border-slate-700/40 font-bold text-[10.5px] uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    Create Budget
                  </button>
                  <button
                    onClick={() => {
                      const list = Object.keys(budgets);
                      if (list.length === 0) {
                        triggerToast(
                          "Please create a budget first!",
                          "warning",
                        );
                        return;
                      }
                      setOldRenameSelect(list[0]);
                      setShowQuickRename(true);
                    }}
                    className="py-2.5 px-3 bg-slate-805 hover:bg-slate-800 text-rose-455 hover:text-white border border-slate-700/40 font-bold text-[10.5px] uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    Rename Budget
                  </button>
                </div>
                <button
                  onClick={handleArchiveOldFunds}
                  className="w-full py-2 bg-slate-855 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 font-bold text-[10px] uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1"
                >
                  Archive Old Funds
                </button>
              </div>
            </div>

            {/* Active Budgets lists mapping */}
            <ActiveBudgets
              budgets={budgets}
              transactions={transactions}
              onManageBudget={(name) => {
                setActiveBudgetFilter(name);
              }}
              onCreateBudget={() => setShowQuickCreate(true)}
              onShowToast={triggerToast}
            />

            {/* Statistical Outliers & Anomaly Alerts Hub */}
            <div className="my-2">
              <AnomalyAlerts transactions={transactions} />
            </div>

            {/* Split layout: Projection Insights (Left) & Compact Recent Activity (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-stretch">
              {/* Projection Card */}
              <div className="lg:col-span-3 flex flex-col justify-between">
                <ProjectionInsights
                  totalLiquidity={totalLiquidity}
                  onRunCalculator={() => {
                    setCurrentTab("calculator");
                  }}
                />
              </div>

              {/* Brief dashboard recent log feed card */}
              <div className="lg:col-span-2">
                <RecentActivity mode="dashboard" transactions={transactions} />
              </div>
            </div>

            {/* Advisor Tip of the week panel */}
            <div
              id="alert-advisor-tip"
              className="bg-blue-950/30 border border-blue-900/60 rounded-xl p-5 flex items-start gap-4"
            >
              <span className="p-2 bg-blue-900/30 rounded-lg border border-blue-800/40 text-blue-400 shrink-0 mt-0.5">
                <Users className="w-5 h-5 animate-pulse" />
              </span>
              <div className="space-y-1">
                <h5 className="font-bold text-xs text-blue-400 uppercase tracking-widest text-[10px]">
                  Advisor Tip
                </h5>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {advisorTip.text}
                </p>
                <button
                  onClick={advisorTip.onClick}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 hover:underline block pt-1.5 cursor-pointer shadow-none bg-transparent hover:bg-transparent border-0 p-0"
                >
                  {advisorTip.actionLabel} &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Quick Create Budget Modal Overlay */}
      {showQuickCreate && (
        <div className="fixed inset-0 z-50 bg-[#10140f]/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 max-w-sm w-full p-6 rounded-xl border border-slate-800 shadow-2xl space-y-4 font-sans text-xs">
            <h4 className="font-bold text-base text-white leading-snug">
              Create Structural Budget
            </h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-400">Budget Name</label>
                <input
                  type="text"
                  placeholder="e.g. Savings Bucket"
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-400 transition-colors font-bold font-sans"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-400">
                  Starting Balance ($)
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={newBalanceInput}
                  onChange={(e) => setNewBalanceInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-400 transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowQuickCreate(false)}
                className="px-3 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-350 hover:text-white rounded font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewBudget}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded font-bold cursor-pointer transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Rename Budget Modal Overlay */}
      {showQuickRename && (
        <div className="fixed inset-0 z-50 bg-[#10140f]/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 max-w-sm w-full p-6 rounded-xl border border-slate-800 shadow-2xl space-y-4 font-sans text-xs">
            <h4 className="font-bold text-base text-white leading-snug">
              Rename Structural Budget
            </h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-400">
                  Select Budget
                </label>
                <select
                  value={oldRenameSelect}
                  onChange={(e) => setOldRenameSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs text-white outline-none focus:border-rose-400 cursor-pointer font-sans"
                >
                  {Object.keys(budgets).map((name) => (
                    <option
                      key={name}
                      value={name}
                      className="bg-slate-950 text-white"
                    >
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-400">
                  New Target Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Swiss Alps Expedition"
                  value={newNameSelect}
                  onChange={(e) => setNewNameSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-400 transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowQuickRename(false)}
                className="px-3 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-350 hover:text-white rounded font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameBudget}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded font-bold cursor-pointer transition-colors"
              >
                Confirm Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collaboration Session Join and Peer modal config */}
      {showJoinModal && (
        <CollaborationHub
          invitation={roomInvitation}
          online={online}
          roomId={roomId}
          roomDetails={roomDetails}
          activeUsers={activeUsers}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onDisconnectRoom={handleDisconnectRoom}
          onClose={() => setShowJoinModal(false)}
        />
      )}

      {/* Custom Budget Elimination Modal overlay */}
      {budgetToDelete && (
        <div className="fixed inset-0 z-50 bg-[#10140f]/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 max-w-sm w-full p-6 rounded-xl border border-slate-800 shadow-2xl space-y-4 font-sans text-xs">
            <h4 className="font-bold text-base text-white leading-snug">
              Confirm Budget Elimination
            </h4>
            <div className="space-y-2">
              <p className="text-slate-300 font-sans">
                Are you sure you want to delete budget{" "}
                <strong className="text-rose-400">'{budgetToDelete}'</strong>{" "}
                and all associated transaction history entries?
              </p>
              <p className="text-[11px] text-amber-500 font-bold bg-amber-500/10 border border-amber-500/20 rounded p-2.5 font-sans">
                ⚠ Note: This action is fully undoable using the system's live
                memory stack (Cmd/Ctrl + Z), but will clear active calculations
                immediately.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setBudgetToDelete(null)}
                className="px-3 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-350 hover:text-white rounded font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => performDeleteBudget(budgetToDelete)}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded font-bold cursor-pointer transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Balance adjustment / Reset Modal overlay */}
      {budgetToReset && (
        <div className="fixed inset-0 z-50 bg-[#10140f]/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 max-w-sm w-full p-6 rounded-xl border border-slate-800 shadow-2xl space-y-4 font-sans text-xs">
            <h4 className="font-bold text-base text-white leading-snug">
              Reset Budget Balance
            </h4>
            <div className="space-y-3">
              <p className="text-slate-300 font-sans">
                Adjust ledger settings for starting capsule balance of{" "}
                <strong className="text-rose-400">'{budgetToReset}'</strong>.
              </p>
              <div className="space-y-1">
                <label className="font-bold text-slate-400">
                  New Target Balance ($)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={resetBalanceAmountInput}
                  onChange={(e) => setResetBalanceAmountInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-400 transition-colors font-bold font-sans"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setBudgetToReset(null);
                  setResetBalanceAmountInput("");
                }}
                className="px-3 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-350 hover:text-white rounded font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = parseFloat(resetBalanceAmountInput);
                  if (isNaN(val)) {
                    triggerToast(
                      "Please enter a valid balance amount.",
                      "warning",
                    );
                    return;
                  }
                  performResetBalance(budgetToReset, val);
                }}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded font-bold cursor-pointer transition-colors"
              >
                Update Balance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating System-wide action Alerts Toasts */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
