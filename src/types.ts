export interface Budget {
  name: string;
  balance: number;
  created: string;
  targetBalance?: number;
}

export interface Transaction {
  id: string;
  budget: string; // Budget name, as in Python CLI
  date: string; // YYYY-MM-DD HH:MM:SS or ISO format
  type: 'profit' | 'expense';
  amount: number;
  description: string;
  recurrence: string;
  synced?: boolean;
}

export interface ActivityLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  timestamp: string;
}

export interface SyncAction {
  id: string;
  type: 'create_budget' | 'delete_budget' | 'add_transaction' | 'delete_transactions' | 'rename_budget' | 'reset_balance' | 'update_budget_goal';
  payload: any;
  timestamp: number;
  clientId: string;
  clientName: string;
  clientEmail: string;
}

export interface Room {
  id: string;
  budgets: Record<string, Budget>;
  transactions: Transaction[];
  history: ActivityLog[];
  version: number;
}

export interface Collaborator {
  email: string;
  name: string;
  color: string;
  joinedAt: string;
  clientId: string;
}

export interface HypotheticalEntry {
  id: string;
  type: 'profit' | 'expense';
  amount: number;
  description: string;
  frequency: 'd' | 'w' | 'b' | 'm' | 'y' | 'c';
  customUnit?: 'days' | 'weeks' | 'months' | 'years';
  customStep?: number;
  count: number;
  startDate: string;
}

export interface UndoStep {
  type: 'create_budget' | 'delete_budget' | 'add_transaction' | 'add_recurring' | 'erase_transactions' | 'rename_budget' | 'reset_balance' | 'update_budget_goal';
  data: any;
  timestamp: number;
}
