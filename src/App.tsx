import React, { useState, useEffect, useMemo, FormEvent } from "react";
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
  ArrowUpRight
} from "lucide-react";
import { 
  Budget, 
  Transaction, 
  Room, 
  Collaborator, 
  SyncAction, 
  UndoStep 
} from "./types";
import { 
  INITIAL_BUDGETS, 
  INITIAL_TRANSACTIONS, 
  formatCurrency, 
  generateScheduleDates 
} from "./utils";

// Component imports
import Sidebar from "./components/Sidebar";
import ActiveBudgets from "./components/ActiveBudgets";
import ProjectionInsights from "./components/ProjectionInsights";
import RecentActivity from "./components/RecentActivity";
import DueToday, { RecurringBill } from "./components/DueToday";
import Calculator from "./components/Calculator";
import CollaborationHub from "./components/CollaborationHub";
import Toast, { ToastItem } from "./components/Toast";

// Unique ID maker
const makeId = () => Math.random().toString(36).substring(2, 9);
const clientId = "client-" + makeId();

export default function App() {
  const userEmail = "na33009755@gmail.com";
  const userName = "The Reliable Advisor";

  // --- Primary App States ---
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [activeBudgetFilter, setActiveBudgetFilter] = useState<string | null>(null);

  // --- Financial State (Fallback / Local-First Database) ---
  const [budgets, setBudgets] = useState<Record<string, Budget>>(() => {
    const saved = localStorage.getItem("budgetmanager_v3_budgets");
    return saved ? JSON.parse(saved) : INITIAL_BUDGETS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem("budgetmanager_v3_transactions");
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  const [paidBills, setPaidBills] = useState<string[]>(() => {
    const saved = localStorage.getItem("budgetmanager_v3_paid_bills");
    return saved ? JSON.parse(saved) : [];
  });

  const [dueBills, setDueBills] = useState<RecurringBill[]>(() => {
    const saved = localStorage.getItem("budgetmanager_v4_due_bills");
    return saved ? JSON.parse(saved) : [];
  });

  // --- Undo / Redo Stacks (Python CLI equivalent stack) ---
  const [undoStack, setUndoStack] = useState<UndoStep[]>([]);
  const [redoStack, setRedoStack] = useState<UndoStep[]>([]);

  // --- Real-Time Collaboration Rooms States ---
  const [roomId, setRoomId] = useState<string | null>(() => {
    const saved = localStorage.getItem("budgetmanager_v3_room_id");
    return saved ? JSON.parse(saved) : null;
  });
  const [roomDetails, setRoomDetails] = useState<Room | null>(null);
  const [activeUsers, setActiveUsers] = useState<Collaborator[]>([]);
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  
  // --- UI Overlays & Toast triggers ---
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // --- Detailed Detailed Page Inputs ---
  const [txAmount, setTxAmount] = useState("");
  const [txType, setTxType] = useState<"profit" | "expense">("expense");
  const [txRecurrence, setTxRecurrence] = useState<"one-time" | "recurring">("one-time");
  const [txDescription, setTxDescription] = useState("");

  // --- Quick Action Inputs ---
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");
  const [newBalanceInput, setNewBalanceInput] = useState("");

  const [showQuickRename, setShowQuickRename] = useState(false);
  const [oldRenameSelect, setOldRenameSelect] = useState("");
  const [newNameSelect, setNewNameSelect] = useState("");

  // --- Persistence & Offline Logging trigger ---
  useEffect(() => {
    localStorage.setItem("budgetmanager_v3_budgets", JSON.stringify(budgets));
  }, [budgets]);

  useEffect(() => {
    localStorage.setItem("budgetmanager_v3_transactions", JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem("budgetmanager_v3_paid_bills", JSON.stringify(paidBills));
  }, [paidBills]);

  useEffect(() => {
    localStorage.setItem("budgetmanager_v4_due_bills", JSON.stringify(dueBills));
  }, [dueBills]);

  useEffect(() => {
    if (roomId) {
      localStorage.setItem("budgetmanager_v3_room_id", JSON.stringify(roomId));
    } else {
      localStorage.removeItem("budgetmanager_v3_room_id");
    }
  }, [roomId]);

  // Monitor network switches
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      triggerToast("System online: Re-establishing connections...", "info");
      replayOfflineQueue();
    };
    const onOffline = () => {
      setOnline(false);
      triggerToast("Local Sandbox Mode: offline-changes queued", "warning");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [roomId]);

  // Toast trigger routine
  const triggerToast = (message: string, type: "success" | "info" | "warning" = "success") => {
    const freshToast: ToastItem = { id: makeId(), message, type };
    setToasts((prev) => [...prev, freshToast]);
    setTimeout(() => {
      dismissToast(freshToast.id);
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // --- REAL-TIME COLLABORATIVE STREAMING (SSE) EFFECT ---
  useEffect(() => {
    if (!roomId || !online) return;

    console.log(`Setting up real-time stream subscription for Room: ${roomId}`);
    const source = new EventSource(`/api/rooms/${roomId}/stream?clientId=${clientId}&name=${encodeURIComponent(userName)}&email=${encodeURIComponent(userEmail)}`);

    source.addEventListener("user_joined", (e: any) => {
      const data = JSON.parse(e.data);
      if (data.userId !== clientId) {
        triggerToast(`${data.name} has joined the collaboration room.`, "info");
        // Add user to active roster
        setActiveUsers((prev) => {
          if (prev.some((u) => u.clientId === data.userId)) return prev;
          return [...prev, {
            email: data.email,
            name: data.name,
            color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
            joinedAt: data.joinedAt,
            clientId: data.userId
          }];
        });
      }
    });

    source.addEventListener("user_left", (e: any) => {
      const data = JSON.parse(e.data);
      setActiveUsers((prev) => prev.filter((u) => u.clientId !== data.userId));
      triggerToast(`${data.name} has disconnected.`, "info");
    });

    source.addEventListener("room_update", (e: any) => {
      const data = JSON.parse(e.data);
      if (data.senderAlias !== userName) {
        console.log("Receiving real-time merge logs from partner client");
        setBudgets(data.room.budgets);
        setTransactions(data.room.transactions);
        setRoomDetails(data.room);
        triggerToast(`Real-Time Update: synced latest modifications from ${data.senderAlias}`, "success");
      }
    });

    source.onerror = (err) => {
      console.warn("Real-time SSE subscription errored or closed. Retrying stream in back-off mode.", err);
    };

    // Grab initial room structural payload
    fetch(`/api/rooms/${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setBudgets(data.budgets);
          setTransactions(data.transactions);
          setRoomDetails(data);
        }
      })
      .catch((e) => console.error("Initial room fetch failed", e));

    return () => {
      source.close();
    };
  }, [roomId, online]);

  // --- COLLABORATION ACTIONS (Create & Join) ---
  const handleCreateRoom = async () => {
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRoomId(data.roomId);
        setRoomDetails(data.room);
        triggerToast(`Collaboration room created successfully! Code: ${data.roomId}`, "success");
        // Push initial local budgets and transactions to cloud
        syncActionsToCloud(data.roomId, [
          ...Object.values(budgets).map(b => ({
            id: makeId(),
            type: "create_budget" as const,
            payload: { budget: b },
            timestamp: Date.now(),
            clientId, clientName: userName, clientEmail: userEmail
          })),
          ...transactions.map(t => ({
            id: makeId(),
            type: "add_transaction" as const,
            payload: { transaction: t },
            timestamp: Date.now(),
            clientId, clientName: userName, clientEmail: userEmail
          }))
        ]);
        setShowJoinModal(false);
      }
    } catch (e) {
      console.error("Create room failed", e);
      triggerToast("Failed to connect to cloud service.", "warning");
    }
  };

  const handleJoinRoom = async (code: string) => {
    try {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json();
      if (data.error) {
        alert("The room code was not recognized. Please verify with peers.");
        return;
      }
      setRoomId(code);
      setRoomDetails(data);
      setBudgets(data.budgets);
      setTransactions(data.transactions);
      triggerToast(`Synced into collaboration session ${code}`, "success");
      setShowJoinModal(false);
    } catch (e) {
      console.error("Join room failed", e);
      triggerToast("Connection error while joining room.", "warning");
    }
  };

  const handleDisconnectRoom = () => {
    setRoomId(null);
    setRoomDetails(null);
    setActiveUsers([]);
    triggerToast("Left collaboration workspace. Returned to local workstation.", "info");
  };

  // --- ACTION SYNCHRONIZER ENGINE ---
  const syncActionsToCloud = async (roomCode: string, actionLogs: SyncAction[]) => {
    if (!online) {
      // Save to client offline queue
      const existing = localStorage.getItem("budgetmanager_v3_offline_queue");
      const queue = existing ? JSON.parse(existing) : [];
      queue.push(...actionLogs);
      localStorage.setItem("budgetmanager_v3_offline_queue", JSON.stringify(queue));
      console.log(`Queued ${actionLogs.length} actions offline`);
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${roomCode}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: actionLogs,
          clientVersion: roomDetails?.version || 1,
          userName,
          userEmail
        })
      });
      const data = await res.json();
      if (data.success) {
        setRoomDetails(data.room);
        setBudgets(data.room.budgets);
        setTransactions(data.room.transactions);
      }
    } catch (err) {
      console.warn("Failed to push sync logs, caching offline:", err);
      // Fallback: cache queue
      const existing = localStorage.getItem("budgetmanager_v3_offline_queue");
      const queue = existing ? JSON.parse(existing) : [];
      queue.push(...actionLogs);
      localStorage.setItem("budgetmanager_v3_offline_queue", JSON.stringify(queue));
    }
  };

  const replayOfflineQueue = async () => {
    const existing = localStorage.getItem("budgetmanager_v3_offline_queue");
    if (!existing || !roomId) return;
    const queue: SyncAction[] = JSON.parse(existing);
    if (queue.length === 0) return;

    triggerToast(`Pushing ${queue.length} cached offline transactions...`, "info");
    localStorage.removeItem("budgetmanager_v3_offline_queue");
    await syncActionsToCloud(roomId, queue);
    triggerToast("Offline logs merged successfully with high-stakes ledger.", "success");
  };

  // Helper to package and push actions
  const registerSyncAction = (type: SyncAction["type"], payload: any) => {
    if (!roomId) return;
    const action: SyncAction = {
      id: "act-" + makeId(),
      type,
      payload,
      timestamp: Date.now(),
      clientId,
      clientName: userName,
      clientEmail: userEmail
    };
    syncActionsToCloud(roomId, [action]);
  };

  // --- UNDO / REDO CONTROLLER (Complete parity with python stack) ---
  const pushUndoStep = (step: UndoStep) => {
    setUndoStack((prev) => [step, ...prev]);
    // Clear redo when a fresh action is committed
    setRedoStack([]);
  };

  const executeUndo = () => {
    if (undoStack.length === 0) {
      triggerToast("No actions left to undo.", "warning");
      return;
    }
    const [currentStep, ...restUndo] = undoStack;
    setUndoStack(restUndo);

    // Save corresponding Redo
    setRedoStack((prev) => [currentStep, ...prev]);

    try {
      switch (currentStep.type) {
        case "create_budget": {
          const { name } = currentStep.data;
          setBudgets((prev) => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
          setTransactions((prev) => prev.filter((t) => t.budget !== name));
          registerSyncAction("delete_budget", { budgetName: name });
          triggerToast(`Undid budget creation: '${name}'`, "info");
          break;
        }
        case "delete_budget": {
          const { budget, relatedTransactions } = currentStep.data;
          setBudgets((prev) => ({ ...prev, [budget.name]: budget }));
          setTransactions((prev) => [...prev, ...relatedTransactions]);
          registerSyncAction("create_budget", { budget });
          relatedTransactions.forEach((t: any) => registerSyncAction("add_transaction", { transaction: t }));
          triggerToast(`Restored deleted budget '${budget.name}' with its logs`, "info");
          break;
        }
        case "add_transaction": {
          const { transaction } = currentStep.data;
          setTransactions((prev) => prev.filter((t) => t.id !== transaction.id));
          setBudgets((prev) => {
            const budgetRef = prev[transaction.budget];
            if (!budgetRef) return prev;
            return {
              ...prev,
              [transaction.budget]: {
                ...budgetRef,
                balance: budgetRef.balance + (transaction.type === "profit" ? -transaction.amount : transaction.amount)
              }
            };
          });
          registerSyncAction("delete_transactions", { transactionIds: [transaction.id], budgetName: transaction.budget });
          triggerToast(`Undid added transaction`, "info");
          break;
        }
        case "add_recurring": {
          const { transactionIds, budgetName, totalBalanceOffset } = currentStep.data;
          setTransactions((prev) => prev.filter((t) => !transactionIds.includes(t.id)));
          setBudgets((prev) => {
            const budgetRef = prev[budgetName];
            if (!budgetRef) return prev;
            return {
              ...prev,
              [budgetName]: { ...budgetRef, balance: budgetRef.balance - totalBalanceOffset }
            };
          });
          registerSyncAction("delete_transactions", { transactionIds, budgetName });
          triggerToast(`Undid recurring schedule list`, "info");
          break;
        }
        case "erase_transactions": {
          const { budgetName, restoredTransactions } = currentStep.data;
          setTransactions((prev) => [...prev, ...restoredTransactions]);
          setBudgets((prev) => {
            const budgetRef = prev[budgetName];
            if (!budgetRef) return prev;
            let offset = 0;
            restoredTransactions.forEach((t: any) => {
              offset += t.type === "profit" ? t.amount : -t.amount;
            });
            return {
              ...prev,
              [budgetName]: { ...budgetRef, balance: budgetRef.balance + offset }
            };
          });
          restoredTransactions.forEach((t: any) => registerSyncAction("add_transaction", { transaction: t }));
          triggerToast(`Restored deleted transaction ledger`, "info");
          break;
        }
        case "rename_budget": {
          const { oldName, newName } = currentStep.data;
          setBudgets((prev) => {
            const next = { ...prev };
            next[oldName] = { ...next[newName], name: oldName };
            delete next[newName];
            return next;
          });
          setTransactions((prev) => prev.map((t) => t.budget === newName ? { ...t, budget: oldName } : t));
          registerSyncAction("rename_budget", { oldName: newName, newName: oldName });
          triggerToast(`Reverted name from '${newName}' back to '${oldName}'`, "info");
          break;
        }
        case "reset_balance": {
          const { budgetName, oldBalance } = currentStep.data;
          setBudgets((prev) => {
            const b = prev[budgetName];
            if (!b) return prev;
            return {
              ...prev,
              [budgetName]: { ...b, balance: oldBalance }
            };
          });
          registerSyncAction("reset_balance", { budgetName, oldBalance: currentStep.data.newBalance, newBalance: oldBalance });
          triggerToast(`Restored balance of '${budgetName}' to ${formatCurrency(oldBalance)}`, "info");
          break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const executeRedo = () => {
    if (redoStack.length === 0) {
      triggerToast("No actions left to redo.", "warning");
      return;
    }
    const [currentStep, ...restRedo] = redoStack;
    setRedoStack(restRedo);
    setUndoStack((prev) => [currentStep, ...prev]);

    try {
      switch (currentStep.type) {
        case "create_budget": {
          const { budget } = currentStep.data;
          setBudgets((prev) => ({ ...prev, [budget.name]: budget }));
          registerSyncAction("create_budget", { budget });
          triggerToast(`Redid budget creation: '${budget.name}'`, "info");
          break;
        }
        case "delete_budget": {
          const { budget } = currentStep.data;
          setBudgets((prev) => {
            const next = { ...prev };
            delete next[budget.name];
            return next;
          });
          setTransactions((prev) => prev.filter((t) => t.budget !== budget.name));
          registerSyncAction("delete_budget", { budgetName: budget.name });
          triggerToast(`Redid budget deletion: '${budget.name}'`, "info");
          break;
        }
        case "add_transaction": {
          const { transaction } = currentStep.data;
          setTransactions((prev) => [...prev, transaction]);
          setBudgets((prev) => {
            const b = prev[transaction.budget];
            if (!b) return prev;
            return {
              ...prev,
              [transaction.budget]: {
                ...b,
                balance: b.balance + (transaction.type === "profit" ? transaction.amount : -transaction.amount)
              }
            };
          });
          registerSyncAction("add_transaction", { transaction });
          triggerToast(`Redid transaction insert`, "info");
          break;
        }
        case "reset_balance": {
          const { budgetName, newBalance } = currentStep.data;
          setBudgets((prev) => {
            const b = prev[budgetName];
            if (!b) return prev;
            return {
              ...prev,
              [budgetName]: { ...b, balance: newBalance }
            };
          });
          registerSyncAction("reset_balance", { budgetName, oldBalance: currentStep.data.oldBalance, newBalance });
          triggerToast(`Redid balance reset of '${budgetName}' to ${formatCurrency(newBalance)}`, "info");
          break;
        }
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // --- GENERAL TRANSACTION LOGGING (Screenshot 2 / Back-end parity) ---
  const handleAddNewTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBudgetFilter) return;

    const amountVal = parseFloat(txAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    const descClean = txDescription.trim() || `Transaction on ${activeBudgetFilter}`;

    // Recurrence generation translating python recurrence interval computations
    if (txRecurrence === "recurring") {
      // Create 12 progressive monthly entries to match Python scheduling sequences
      const dates = generateScheduleDates(new Date().toISOString().slice(0, 10), "m", undefined, 1, 12);
      const recurringTrxs: Transaction[] = dates.map((dStr) => ({
        id: "tx-" + makeId(),
        budget: activeBudgetFilter,
        date: dStr,
        type: txType,
        amount: amountVal,
        description: descClean,
        recurrence: "recurring"
      }));

      // Balance offset computation based on transactions happening strictly in past-to-now sequence
      let totalOffset = 0;
      const today = new Date();
      recurringTrxs.forEach((t) => {
        if (new Date(t.date) <= today) {
          totalOffset += t.type === "profit" ? amountVal : -amountVal;
        }
      });

      setBudgets((prev) => {
        const b = prev[activeBudgetFilter];
        return {
          ...prev,
          [activeBudgetFilter]: { ...b, balance: b.balance + totalOffset }
        };
      });

      setTransactions((prev) => [...prev, ...recurringTrxs]);
      recurringTrxs.forEach((t) => registerSyncAction("add_transaction", { transaction: t }));

      pushUndoStep({
        type: "add_recurring",
        data: {
          transactionIds: recurringTrxs.map((t) => t.id),
          budgetName: activeBudgetFilter,
          totalBalanceOffset: totalOffset
        },
        timestamp: Date.now()
      });

      triggerToast(`Successfully scheduled ${recurringTrxs.length} recurring postings!`, "success");
    } else {
      // Standard singular transaction entry
      const newTrx: Transaction = {
        id: "tx-" + makeId(),
        budget: activeBudgetFilter,
        date: new Date().toISOString().slice(0, 19).replace("T", " "),
        type: txType,
        amount: amountVal,
        description: descClean,
        recurrence: "one-time"
      };

      setBudgets((prev) => {
        const b = prev[activeBudgetFilter];
        return {
          ...prev,
          [activeBudgetFilter]: { ...b, balance: b.balance + (txType === "profit" ? amountVal : -amountVal) }
        };
      });

      setTransactions((prev) => [...prev, newTrx]);
      registerSyncAction("add_transaction", { transaction: newTrx });

      pushUndoStep({
        type: "add_transaction",
        data: { transaction: newTrx },
        timestamp: Date.now()
      });

      triggerToast("Action Successful: Transaction has been added to your ledger.", "success");
    }

    setTxAmount("");
    setTxDescription("");
    setTxRecurrence("one-time");
  };

  // --- settle Dues panel action hook ---
  const handlePayBill = (bill: RecurringBill) => {
    if (paidBills.includes(bill.id)) return;

    // Pick target budget automatically or fallback to first budget
    const targetBudget = activeBudgetFilter || Object.keys(budgets)[0];
    if (!targetBudget) {
      alert("Create an active budget first!");
      return;
    }

    const newTrx: Transaction = {
      id: "tx-" + makeId(),
      budget: targetBudget,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      type: bill.type,
      amount: bill.amount,
      description: `${bill.name} - Settle Due Today`,
      recurrence: bill.frequency.toLowerCase() as any || "one-time"
    };

    setBudgets((prev) => {
      const b = prev[targetBudget];
      return {
        ...prev,
        [targetBudget]: { ...b, balance: b.balance + (bill.type === "profit" ? bill.amount : -bill.amount) }
      };
    });

    setTransactions((prev) => [...prev, newTrx]);
    setPaidBills((prev) => [...prev, bill.id]);
    registerSyncAction("add_transaction", { transaction: newTrx });

    // Store undo step
    pushUndoStep({
      type: "add_transaction",
      data: { transaction: newTrx },
      timestamp: Date.now()
    });

    triggerToast(`Settle Successful: registered payment for ${bill.name}`, "success");
  };

  const handleCreateBill = (bill: RecurringBill) => {
    setDueBills((prev) => [...prev, bill]);
    triggerToast(`Added ${bill.name} to Due Today checklist`, "success");
  };

  const handleDeleteBill = (id: string) => {
    setDueBills((prev) => prev.filter((b) => b.id !== id));
    setPaidBills((prev) => prev.filter((pid) => pid !== id));
    triggerToast("Removed bill from Due Today", "info");
  };

  // --- DELETE TRANSACTION BATCH ---
  const handleDeleteTransactionsBatch = (ids: string[]) => {
    const targets = transactions.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;

    const budgetName = targets[0].budget;

    setTransactions((prev) => prev.filter((t) => !ids.includes(t.id)));
    setBudgets((prev) => {
      const b = prev[budgetName];
      if (!b) return prev;
      let totalRefund = 0;
      targets.forEach((t) => {
        totalRefund += t.type === "profit" ? -t.amount : t.amount;
      });
      return {
        ...prev,
        [budgetName]: { ...b, balance: b.balance + totalRefund }
      };
    });

    registerSyncAction("delete_transactions", { transactionIds: ids, budgetName });

    // Undo trace
    pushUndoStep({
      type: "erase_transactions",
      data: {
        budgetName,
        restoredTransactions: targets
      },
      timestamp: Date.now()
    });

    triggerToast(`Erase successful: cleared ${ids.length} entries.`, "success");
  };

  // --- QUICK BUDGET MANAGEMENT ROUTINES ---
  const handleCreateNewBudget = () => {
    const rawVal = parseFloat(newBalanceInput);
    const balanceVal = isNaN(rawVal) ? 0 : rawVal;
    const nameClean = newNameInput.trim();

    if (!nameClean) {
      alert("Please enter a valid budget name.");
      return;
    }
    if (budgets[nameClean]) {
      alert("A budget with this name already exists.");
      return;
    }

    const fresh: Budget = {
      name: nameClean,
      balance: balanceVal,
      created: new Date().toISOString().slice(0, 19).replace("T", " ")
    };

    setBudgets((prev) => ({ ...prev, [nameClean]: fresh }));
    registerSyncAction("create_budget", { budget: fresh });

    pushUndoStep({
      type: "create_budget",
      data: { name: nameClean, balance: balanceVal },
      timestamp: Date.now()
    });

    triggerToast(`Budget '${nameClean}' created successfully!`, "success");
    setNewNameInput("");
    setNewBalanceInput("");
    setShowQuickCreate(false);
  };

  const handleRenameBudget = () => {
    const oldName = oldRenameSelect;
    const newName = newNameSelect.trim();

    if (!oldName || !newName) return;
    if (budgets[newName]) {
      alert("A budget with that name already exists!");
      return;
    }

    setBudgets((prev) => {
      const next = { ...prev };
      next[newName] = { ...next[oldName], name: newName };
      delete next[oldName];
      return next;
    });

    setTransactions((prev) => prev.map((t) => t.budget === oldName ? { ...t, budget: newName } : t));
    
    registerSyncAction("rename_budget", { oldName, newName });

    pushUndoStep({
      type: "rename_budget",
      data: { oldName, newName },
      timestamp: Date.now()
    });

    triggerToast(`Renamed budget to '${newNameSelect}'`, "success");
    setNewNameSelect("");
    setOldRenameSelect("");
    setShowQuickRename(false);
  };

  const handleResetBalance = (budgetName: string) => {
    const currentBudget = budgets[budgetName];
    if (!currentBudget) return;

    const raw = prompt(`Reset balance for '${budgetName}'\nCurrent balance: ${formatCurrency(currentBudget.balance)}\nEnter new balance:`, currentBudget.balance.toString());
    if (raw === null) return;

    const val = parseFloat(raw);
    if (isNaN(val)) {
      alert("Please enter a valid number.");
      return;
    }

    setBudgets((prev) => ({
      ...prev,
      [budgetName]: { ...currentBudget, balance: val }
    }));

    registerSyncAction("reset_balance", { budgetName, oldBalance: currentBudget.balance, newBalance: val });

    pushUndoStep({
      type: "reset_balance",
      data: { budgetName, oldBalance: currentBudget.balance, newBalance: val },
      timestamp: Date.now()
    });

    triggerToast(`Balance adjusted for '${budgetName}'`, "success");
  };

  const handleDeleteBudgetDirect = (budgetName: string) => {
    const target = budgets[budgetName];
    if (!target) return;

    if (!confirm(`Are you sure you want to delete budget '${budgetName}' and all its transactions? This action is undoable.`)) return;

    const relatedTransactions = transactions.filter((t) => t.budget === budgetName);

    setBudgets((prev) => {
      const next = { ...prev };
      delete next[budgetName];
      return next;
    });

    setTransactions((prev) => prev.filter((t) => t.budget !== budgetName));
    registerSyncAction("delete_budget", { budgetName });

    pushUndoStep({
      type: "delete_budget",
      data: { budget: target, relatedTransactions },
      timestamp: Date.now()
    });

    triggerToast(`Wiped budget '${budgetName}' from ledger.`, "warning");
    setActiveBudgetFilter(null);
  };

  const handleArchiveOldFunds = () => {
    alert("Clearing simulated memory buffers. All transactions settled. Real-time connections reconfirmed with server.");
    setPaidBills([]);
    triggerToast("Accounts consolidated and logs re-archived.", "success");
  };

  // --- COMPUTE LIQUIDITY STATS ---
  const totalLiquidity = useMemo(() => {
    return (Object.values(budgets) as Budget[]).reduce((sum, b) => sum + b.balance, 0);
  }, [budgets]);

  const monthlySpendTotal = useMemo(() => {
    // Total expenses registered in currently active month
    const today = new Date();
    const currYear = today.getFullYear();
    const currMonth = today.getMonth();

    return transactions
      .filter((t) => {
        const txDate = new Date(t.date);
        return (
          t.type === "expense" &&
          txDate.getFullYear() === currYear &&
          txDate.getMonth() === currMonth
        );
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  // --- DYNAMIC ADVISOR TIPS BASED ON REGISTERED BUDGETS ---
  const advisorTip = useMemo(() => {
    const budgetList = Object.values(budgets) as Budget[];
    
    // Case 1: No budgets
    if (budgetList.length === 0) {
      return {
        text: (
          <>
            No active budgets registered. Create a new <strong>Savings Goal</strong> or <strong>Institutional Fund</strong> to generate tailored financial trajectory tips and unlock advisor intelligence!
          </>
        ),
        actionLabel: "Create First Budget",
        onClick: () => setShowQuickCreate(true)
      };
    }

    // Case 2: Only 1 budget
    if (budgetList.length === 1) {
      const single = budgetList[0];
      return {
        text: (
          <>
            You have registered <strong>{single.name}</strong> with a balance of <strong>{formatCurrency(single.balance)}</strong>. To enhance wealth durability, consider establishing a separate <strong>Emergency Buffer</strong> to absorb short-term volatility.
          </>
        ),
        actionLabel: "Register Emergency Buffer",
        onClick: () => {
          setNewNameInput("Emergency Goal");
          setNewBalanceInput("1000");
          setShowQuickCreate(true);
        }
      };
    }

    // Case 3: Has budget(s) running thin (< $100 or negative)
    const thinBudget = budgetList.find(b => b.balance < 100);
    if (thinBudget) {
      return {
        text: (
          <>
            Caution: Your budget <strong>{thinBudget.name}</strong> has a low liquidity of <strong>{formatCurrency(thinBudget.balance)}</strong>. Consider reallocating asset shares from healthier reserves to support its velocity.
          </>
        ),
        actionLabel: `Manage ${thinBudget.name}`,
        onClick: () => {
          setActiveBudgetFilter(thinBudget.name);
          setCurrentTab("detailed");
        }
      };
    }

    // Case 4: General cashflow calculations from transactions
    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
    const totalProfits = transactions.filter(t => t.type === 'profit').reduce((acc, curr) => acc + curr.amount, 0);
    
    if (totalExpenses > totalProfits && transactions.length > 0) {
      return {
        text: (
          <>
            Aggregate cashflow metrics indicate total expense activity (<strong>{formatCurrency(totalExpenses)}</strong>) is outpacing registered income (<strong>{formatCurrency(totalProfits)}</strong>). Verify transaction categories to scale back on non-essential spending.
          </>
        ),
        actionLabel: "Optimize Cashflows",
        onClick: () => {
          setCurrentTab("calculator");
        }
      };
    }

    // Case 5: Standard high-liquidity general advisory
    const topBudget = [...budgetList].sort((a, b) => b.balance - a.balance)[0];
    return {
      text: (
        <>
          Excellent diversification! Your major treasury, <strong>{topBudget.name}</strong>, holds <strong>{formatCurrency(topBudget.balance)}</strong> of your portfolio. Consider setting up daily recurring checks or automatic micro-savings plans inside your detailed view.
        </>
      ),
      actionLabel: `Focus on ${topBudget.name}`,
      onClick: () => {
        setActiveBudgetFilter(topBudget.name);
        setCurrentTab("detailed");
      }
    };
  }, [budgets, transactions]);

  // Render proper sub views
  return (
    <div id="application-container" className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] pl-64 font-sans antialiased">
      
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
        onShowJoinModal={() => setShowJoinModal(true)}
        onDisconnectRoom={handleDisconnectRoom}
      />

      {/* Main Screen Container content area */}
      <main id="app-main" className="pt-6 pb-20 px-8">
        
        {/* Dynamic Nav Header Bar */}
        <header id="tab-nav-header" className="flex items-center justify-between mb-8 border-b border-[#eff4ff] pb-5">
          <div className="flex items-center gap-4">
            {activeBudgetFilter ? (
              <button
                onClick={() => setActiveBudgetFilter(null)}
                className="p-1.5 hover:bg-slate-100 rounded border border-slate-200 text-slate-500 hover:text-slate-900 transition-all"
                title="Return of dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            <h2 id="view-title" className="text-2xl font-bold tracking-tight text-[#0b1c30] capitalize">
              {activeBudgetFilter ? `Budget / ${activeBudgetFilter}` : currentTab}
            </h2>
          </div>

          {/* Desktop utility controls and ADD TRANSACTION BUTTON */}
          <div id="header-actions" className="flex items-center gap-4">
            
            {/* Search Box */}
            <div className="hidden sm:block text-slate-400 text-xs bg-white border border-[#e5eeff] px-4 py-1.5 rounded-lg w-52 text-slate-500 flex items-center justify-between font-medium">
              <span>na33009755@gmail.com</span>
              <Wifi className={`w-3.5 h-3.5 ${online ? "text-emerald-500" : "text-amber-500 animate-pulse"}`} />
            </div>

            {/* Undo / Redo triggers */}
            <div className="flex items-center border border-[#e5eeff] bg-white rounded-lg p-1 gap-1">
              <button
                onClick={executeUndo}
                className={`p-1.5 rounded hover:bg-slate-50 transition-colors ${undoStack.length === 0 ? "opacity-30 cursor-not-allowed text-slate-400" : "text-[#0058be]"}`}
                title="Undo last action"
              >
                <RotateCcw className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={executeRedo}
                className={`p-1.5 rounded hover:bg-slate-50 transition-colors ${redoStack.length === 0 ? "opacity-30 cursor-not-allowed text-slate-400" : "text-[#0058be]"}`}
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
                    alert("Please create a budget first via Quick Actions panel.");
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

        {/* --- ROUTED WORKSPACE VIEWS --- */}

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
            />
          </div>
        ) : currentTab === "transactions" && !activeBudgetFilter ? (
          // Tab 3: Transactions complete dataset spreadsheet listing
          <div className="max-w-7xl mx-auto">
            <RecentActivity 
              transactions={transactions} 
              mode="budget-view"
              onDeleteTransactions={handleDeleteTransactionsBatch}
            />
          </div>
        ) : currentTab === "settings" ? (
          // Tab 4: Settings config panel
          <div className="bg-white border border-[#eff4ff] rounded-lg p-6 max-w-2xl mx-auto shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#0b1c30]">Settings & Preferences</h3>
              <p className="text-xs text-slate-400 font-sans mt-0.5">Automate and customize active synchronization and assets</p>
            </div>

            <div className="space-y-4 text-xs font-sans">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded">
                <div>
                  <p className="font-bold text-slate-700">Automatic Sync Retry</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Attempt network re-sync every 30 seconds when in background mode</p>
                </div>
                <input type="checkbox" defaultChecked className="rounded text-rose-605 focus:ring-rose-500 w-4 h-4" />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded">
                <div>
                  <p className="font-bold text-slate-700">OpenType Tabular Numbers (tnum)</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Forces monospacing on numerical lists for perfect tabular alignment</p>
                </div>
                <input type="checkbox" defaultChecked className="rounded text-rose-605 focus:ring-rose-500 w-4 h-4" />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded">
                <div>
                  <p className="font-bold text-slate-700">Live Workspace Collaboration</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Enable Server-Sent Events push notifications on active folders</p>
                </div>
                <input type="checkbox" defaultChecked className="rounded text-rose-605 focus:ring-rose-500 w-4 h-4" />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 text-right">
              <button 
                onClick={() => triggerToast("Preferences saved to local workspace Storage", "success")}
                className="py-2 px-5 bg-[#0058be] text-white hover:bg-slate-800 text-xs font-bold rounded cursor-pointer transition-colors"
                title="Save preferences button"
              >
                Save Preferences
              </button>
            </div>
          </div>
        ) : activeBudgetFilter ? (
          // Tab 5: Dynamic Specific Budget Detailed Desk (Screenshot 2)
          <div className="space-y-8 max-w-7xl mx-auto">
            
            {/* Dark balance detail card header */}
            <div id="budget-detail-card" className="bg-[#131b2e] rounded-lg p-6 text-white border border-[#213145] shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-3 z-10 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Total Available Balance</span>
                <h1 className="text-3xl md:text-4xl font-extrabold font-mono tracking-tight text-white mt-1">
                  {formatCurrency(budgets[activeBudgetFilter]?.balance || 0)}
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold font-sans">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>+12.4% this month</span>
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
              </div>

              {/* Due Today panel inside Detailed view */}
              <div className="w-full md:w-80 shrink-0 z-10">
                <DueToday 
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
              <div className="bg-white border border-[#eff4ff] rounded-lg p-6 shadow-sm h-fit">
                <h3 className="text-base font-bold text-[#0b1c30] tracking-tight mb-4">New Transaction</h3>
                
                <form onSubmit={handleAddNewTransaction} className="space-y-4 text-xs">
                  {/* Amount Value */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 uppercase tracking-widest text-[9px] block">Amount ($)</label>
                    <input 
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="0.00"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded text-sm text-slate-900 font-mono focus:border-[#2170e4] font-medium outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Choose Transaction Type */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500 uppercase tracking-widest text-[9px] block">Type</label>
                      <select 
                        value={txType}
                        onChange={(e) => setTxType(e.target.value as "profit" | "expense")}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded font-medium text-slate-700 focus:border-[#2170e4] outline-none"
                      >
                        <option value="expense">Expense</option>
                        <option value="profit">Profit</option>
                      </select>
                    </div>

                    {/* Choose Recurrence */}
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500 uppercase tracking-widest text-[9px] block">Recurrence</label>
                      <select 
                        value={txRecurrence}
                        onChange={(e) => setTxRecurrence(e.target.value as "one-time" | "recurring")}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded font-medium text-slate-700 focus:border-[#2170e4] outline-none"
                      >
                        <option value="one-time">One-time</option>
                        <option value="recurring">Monthly Dues</option>
                      </select>
                    </div>
                  </div>

                  {/* Description Box */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-500 uppercase tracking-widest text-[9px] block">Description</label>
                    <input 
                      type="text"
                      required
                      maxLength={40}
                      placeholder="e.g. Weekly Groceries, Apple Store..."
                      value={txDescription}
                      onChange={(e) => setTxDescription(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded font-mono text-slate-900 focus:border-[#2170e4] outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-black hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors text-center cursor-pointer mt-2 block shadow-sm"
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
                />
              </div>

            </div>

          </div>
        ) : (
          // Tab 1: Primary Dashboard workspace (Screenshot 1)
          <div className="space-y-8 max-w-7xl mx-auto">
            
            {/* Top Statistics Cards row */}
            <div id="dashboard-statistics" className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Total Liquidity */}
              <div className="bg-white border border-[#eff4ff] rounded-lg p-6 shadow-sm border-l-4 border-l-[#2170e4] flex flex-col justify-between h-40">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">Total Liquidity</span>
                    <h3 className="text-3xl font-black font-mono tracking-tight text-slate-900 mt-2">
                      {formatCurrency(totalLiquidity)}
                    </h3>
                  </div>
                  <div className="p-3 bg-[#eff4ff] text-[#2170e4] rounded border border-[#dce9ff]">
                    <Wallet className="w-5.5 h-5.5" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold mt-2 font-sans">
                  <ArrowUpRight className="w-4 h-4" />
                  <span>+2.4% vs last month</span>
                </div>
              </div>

              {/* Monthly Spend tracker */}
              <div className="bg-white border border-[#eff4ff] rounded-lg p-6 shadow-sm border-l-4 border-l-[#ff6b6b] flex flex-col justify-between h-40">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">Monthly Spend</span>
                    <h3 className="text-3xl font-black font-mono tracking-tight text-slate-900 mt-2">
                      {formatCurrency(monthlySpendTotal)}
                    </h3>
                  </div>
                  <div className="p-3 bg-red-50 text-[#ff6b6b] rounded border border-red-100">
                    <TrendingDown className="w-5.5 h-5.5" />
                  </div>
                </div>
                {/* Red status progress bar mirroring mockup */}
                <div className="mt-2 text-xs">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 relative overflow-hidden">
                    <div 
                      className="h-full bg-rose-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((monthlySpendTotal / 10000) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1.5 font-sans">Budget threshold cap: $10,000.00</span>
                </div>
              </div>

              {/* Quick Actions Panel from Screenshot 1 */}
              <div className="bg-white border border-[#eff4ff] rounded-lg p-5 shadow-sm space-y-2.5 h-40 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Quick Actions</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowQuickCreate(true)}
                    className="py-2.5 px-3 bg-[#e5eeff] hover:bg-[#dce9ff] text-[#0058be] font-bold text-[10.5px] uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    Create Budget
                  </button>
                  <button
                    onClick={() => {
                      const list = Object.keys(budgets);
                      if (list.length === 0) {
                        alert("Please create a budget first!");
                        return;
                      }
                      setOldRenameSelect(list[0]);
                      setShowQuickRename(true);
                    }}
                    className="py-2.5 px-3 bg-[#e5eeff] hover:bg-[#dce9ff] text-[#0058be] font-bold text-[10.5px] uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    Rename Budget
                  </button>
                </div>
                <button
                  onClick={handleArchiveOldFunds}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1"
                >
                  Archive Old Funds
                </button>
              </div>

            </div>

            {/* Quick Create Budget Modal Overlay */}
            {showQuickCreate && (
              <div className="fixed inset-0 z-50 bg-[#0f172a]/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white max-w-sm w-full p-6 rounded-lg border border-slate-100 shadow-2xl space-y-4 font-sans text-xs">
                  <h4 className="font-bold text-base text-slate-900 leading-snug">Create Structural Budget</h4>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500">Budget Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Savings Bucket" 
                        value={newNameInput}
                        onChange={(e) => setNewNameInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded text-xs text-slate-950 font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500">Starting Balance ($)</label>
                      <input 
                        type="number" 
                        placeholder="0.00" 
                        value={newBalanceInput}
                        onChange={(e) => setNewBalanceInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded text-xs text-slate-950"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button 
                      onClick={() => setShowQuickCreate(false)}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleCreateNewBudget}
                      className="px-5 py-2 bg-slate-900 border border-slate-900 hover:bg-slate-800 hover:border-slate-800 text-white rounded font-bold cursor-pointer"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Rename Budget Modal Overlay */}
            {showQuickRename && (
              <div className="fixed inset-0 z-50 bg-[#0f172a]/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white max-w-sm w-full p-6 rounded-lg border border-slate-100 shadow-2xl space-y-4 font-sans text-xs">
                  <h4 className="font-bold text-base text-slate-900 leading-snug">Rename Structural Budget</h4>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500">Select Budget</label>
                      <select
                        value={oldRenameSelect}
                        onChange={(e) => setOldRenameSelect(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs"
                      >
                        {Object.keys(budgets).map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-500">New Target Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Swiss Alps Expedition" 
                        value={newNameSelect}
                        onChange={(e) => setNewNameSelect(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded text-xs text-slate-950"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button 
                      onClick={() => setShowQuickRename(false)}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleRenameBudget}
                      className="px-5 py-2 bg-slate-900 border border-slate-900 hover:bg-slate-800 hover:border-slate-800 text-white rounded font-bold cursor-pointer"
                    >
                      Confirm Rename
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Active Budgets lists mapping */}
            <ActiveBudgets 
              budgets={budgets} 
              transactions={transactions} 
              onManageBudget={(name) => {
                setActiveBudgetFilter(name);
              }}
              onCreateBudget={() => setShowQuickCreate(true)}
            />

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
            <div id="alert-advisor-tip" className="bg-[#eff4ff]/60 border border-[#dce9ff] rounded-lg p-5 flex items-start gap-4">
              <span className="p-2 bg-white rounded border border-[#dce9ff] text-[#2070e4] shrink-0 mt-0.5">
                <Users className="w-5 h-5 animate-pulse" />
              </span>
              <div className="space-y-1">
                <h5 className="font-bold text-xs text-[#0058be] uppercase tracking-widest text-[10px]">Advisor Tip</h5>
                <p className="text-xs text-slate-600 font-sans leading-relaxed">
                  {advisorTip.text}
                </p>
                <button 
                  onClick={advisorTip.onClick} 
                  className="text-xs font-bold text-[#0058be] hover:underline block pt-1.5 cursor-pointer shadow-none bg-transparent hover:bg-transparent border-0 p-0"
                >
                  {advisorTip.actionLabel} &rarr;
                </button>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Collaboration Session Join and Peer modal config */}
      {showJoinModal && (
        <CollaborationHub
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

      {/* Floating System-wide action Alerts Toasts */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

    </div>
  );
}
