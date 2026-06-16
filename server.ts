import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { Room, SyncAction, Budget, Transaction, ActivityLog } from "./src/types";

const app = express();
const PORT = 3000;
const DB_PATH = path.join(process.cwd(), "rooms_db.json");

app.use(express.json());

// In-Memory active rooms structure
let rooms: Record<string, Room> = {};

// Load rooms database from local JSON if available
function loadRoomsDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, "utf-8");
      rooms = JSON.parse(data);
      console.log(`Loaded ${Object.keys(rooms).length} collaborative rooms from database.`);
    }
  } catch (err) {
    console.error("Failed to load rooms database, starting fresh:", err);
    rooms = {};
  }
}

// Persist rooms database to local JSON
function persistRoomsDatabase() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(rooms, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save rooms database:", err);
  }
}

loadRoomsDatabase();

// Keep track of active stream connections for real-time push events
const roomClients: Record<string, Array<{ id: string; res: any }>> = {};

// Broadcast event to all clients in a room
function broadcastToRoom(roomId: string, event: string, data: any) {
  const clients = roomClients[roomId] || [];
  console.log(`Broadcasting event '${event}' to ${clients.length} active clients in room ${roomId}`);
  clients.forEach((client) => {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

// Generate room code (e.g. 662912)
function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

// -----------------------------------------------------------------------------
// API Endpoints for Collaborative Rooms
// -----------------------------------------------------------------------------

// Create a new Room
app.post("/api/rooms", (req, res) => {
  const roomId = generateRoomCode();
  rooms[roomId] = {
    id: roomId,
    budgets: {},
    transactions: [],
    history: [
      {
        id: Math.random().toString(),
        userName: "System",
        userEmail: "system@budgetmanager.app",
        action: `Collaborative financial room established. Code: ${roomId}`,
        timestamp: new Date().toISOString(),
      },
    ],
    version: 1,
  };
  persistRoomsDatabase();
  console.log(`Created new Room: ${roomId}`);
  res.json({ success: true, roomId, room: rooms[roomId] });
});

// Get Room details
app.get("/api/rooms/:id", (req, res) => {
  const roomId = req.params.id;
  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Collaboration room not found." });
    return;
  }
  res.json(room);
});

// Real-Time Event Stream (SSE)
app.get("/api/rooms/:id/stream", (req, res) => {
  const roomId = req.params.id;
  const clientId = req.query.clientId as string || Math.random().toString();
  
  const room = rooms[roomId];
  if (!room) {
    res.status(404).end("Room not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  res.write(`data: ${JSON.stringify({ connected: true, clientId })}\n\n`);

  if (!roomClients[roomId]) {
    roomClients[roomId] = [];
  }

  const client = { id: clientId, res };
  roomClients[roomId].push(client);

  console.log(`Client ${clientId} joined room ${roomId} event stream. Open connections: ${roomClients[roomId].length}`);

  // Notify others that someone joined
  const username = req.query.name as string || "An anonymous user";
  const useremail = req.query.email as string || "unknown";
  
  broadcastToRoom(roomId, "user_joined", {
    userId: clientId,
    name: username,
    email: useremail,
    joinedAt: new Date().toISOString()
  });

  req.on("close", () => {
    roomClients[roomId] = roomClients[roomId].filter((c) => c.id !== clientId);
    console.log(`Client ${clientId} disconnected from room ${roomId}. Remaining: ${roomClients[roomId].length}`);
    
    broadcastToRoom(roomId, "user_left", {
      userId: clientId,
      name: username
    });
  });
});

// Sync mutations from client (Local-First Offline Replay Engine)
app.post("/api/rooms/:id/sync", (req, res) => {
  const roomId = req.params.id;
  const room = rooms[roomId];
  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }

  const { actions, clientVersion, userName, userEmail } = req.body as {
    actions: SyncAction[];
    clientVersion: number;
    userName: string;
    userEmail: string;
  };

  console.log(`Received ${actions.length} sync actions from ${userName} (${userEmail}) for room ${roomId}. Client Version: ${clientVersion}, Server Version: ${room.version}`);

  let changed = false;

  // Process actions sequentially to guarantee server-authoritative convergence
  // Implement idempotency guards by checking duplicate execution markers (like Action IDs)
  actions.forEach((action) => {
    // Avoid double execution if database history has recorded this action ID
    const exists = room.history.some((log) => log.id === action.id);
    if (exists) {
      console.log(`Action ${action.id} already applied. Skipping.`);
      return;
    }

    try {
      let actionLabel = "";
      
      switch (action.type) {
        case "create_budget": {
          const { budget } = action.payload;
          room.budgets[budget.name] = {
            name: budget.name,
            balance: Number(budget.balance),
            created: budget.created,
            targetBalance: budget.targetBalance ? Number(budget.targetBalance) : undefined,
          };
          actionLabel = `Created budget '${budget.name}' with starter balance of $${Number(budget.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          changed = true;
          break;
        }
        case "delete_budget": {
          const { budgetName } = action.payload;
          if (room.budgets[budgetName]) {
            actionLabel = `Deleted budget '${budgetName}' and wiped its related transactions`;
            delete room.budgets[budgetName];
            room.transactions = room.transactions.filter((t) => t.budget !== budgetName);
            changed = true;
          }
          break;
        }
        case "add_transaction": {
          const { transaction } = action.payload;
          // Guard against duplicate transaction inserts by ID
          const trxExists = room.transactions.some((t) => t.id === transaction.id);
          if (!trxExists) {
            room.transactions.push(transaction);
            const budgetRef = room.budgets[transaction.budget];
            if (budgetRef) {
              const amount = Number(transaction.amount);
              budgetRef.balance += transaction.type === "profit" ? amount : -amount;
            }
            actionLabel = `Recorded ${transaction.type} of $${Number(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} on '${transaction.budget}': ${transaction.description}`;
            changed = true;
          }
          break;
        }
        case "delete_transactions": {
          const { transactionIds, budgetName } = action.payload;
          let sumRefund = 0;
          
          room.transactions = room.transactions.filter((t) => {
            if (transactionIds.includes(t.id)) {
              const amount = Number(t.amount);
              sumRefund += t.type === "profit" ? -amount : amount;
              return false;
            }
            return true;
          });

          const budgetRef = room.budgets[budgetName];
          if (budgetRef) {
            budgetRef.balance += sumRefund;
          }

          actionLabel = `Erased ${transactionIds.length} transactions from '${budgetName}' (Balance adjusted by $${sumRefund.toLocaleString('en-US', { minimumFractionDigits: 2 })})`;
          changed = true;
          break;
        }
        case "rename_budget": {
          const { oldName, newName } = action.payload;
          if (room.budgets[oldName] && !room.budgets[newName]) {
            room.budgets[newName] = {
              ...room.budgets[oldName],
              name: newName,
            };
            delete room.budgets[oldName];
            
            room.transactions = room.transactions.map((t) => {
              if (t.budget === oldName) {
                return { ...t, budget: newName };
              }
              return t;
            });

            actionLabel = `Renamed budget from '${oldName}' to '${newName}'`;
            changed = true;
          }
          break;
        }
        case "reset_balance": {
          const { budgetName, oldBalance, newBalance } = action.payload;
          const budgetRef = room.budgets[budgetName];
          if (budgetRef) {
            budgetRef.balance = Number(newBalance);
            actionLabel = `Reset balance of '${budgetName}' from $${Number(oldBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })} to $${Number(newBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            changed = true;
          }
          break;
        }
        case "update_budget_goal": {
          const { budgetName, targetBalance } = action.payload;
          const budgetRef = room.budgets[budgetName];
          if (budgetRef) {
            budgetRef.targetBalance = targetBalance !== undefined ? Number(targetBalance) : undefined;
            actionLabel = `Updated budget goal for '${budgetName}' to ${targetBalance !== undefined ? `$${Number(targetBalance).toLocaleString('en-US')}` : 'none'}`;
            changed = true;
          }
          break;
        }
      }

      if (actionLabel) {
        // Log action on database history stack
        room.history.unshift({
          id: action.id,
          userName: action.clientName,
          userEmail: action.clientEmail,
          action: actionLabel,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      console.error("Failed to apply action", action, e);
    }
  });

  if (changed) {
    room.version += 1;
    persistRoomsDatabase();
    // Flush updates immediately to all concurrent streams in real-time
    broadcastToRoom(roomId, "room_update", {
      version: room.version,
      room,
      senderAlias: userName,
    });
  }

  res.json({
    success: true,
    version: room.version,
    room,
  });
});

// -----------------------------------------------------------------------------
// Core Machine Learning & Statistical Anomaly Detection Engine (Z-Score Outliers)
// -----------------------------------------------------------------------------

app.post("/api/analytics/anomalies", (req, res) => {
  try {
    const { transactions } = req.body as { transactions: Transaction[] };
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      res.json({ success: true, anomalies: [] });
      return;
    }

    const today = new Date();
    // Consider transactions up to the last 180 days (6 months)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 180);

    const relevantTx = transactions.filter((t) => {
      const d = new Date(t.date);
      return !isNaN(d.getTime()) && d >= cutoffDate && d <= today;
    });

    // Group expenses by budget category. (We focus primarily on expenses since budget spikes are critical anomalies)
    const expenses = relevantTx.filter((t) => t.type === "expense");
    const groupMap: Record<string, Transaction[]> = {};

    expenses.forEach((t) => {
      if (!groupMap[t.budget]) groupMap[t.budget] = [];
      groupMap[t.budget].push(t);
    });

    const anomalies: Array<{
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
    }> = [];

    // Run statistical threshold tracking on each group
    Object.keys(groupMap).forEach((budgetName) => {
      const groupTx = groupMap[budgetName];
      const count = groupTx.length;

      if (count < 3) {
        // Less than 3 transactions in 6 months is too sparse for reliable standard deviation.
        // We can check for absolute massive spikes compared to baseline median if there are any.
        if (count >= 1) {
          const amounts = groupTx.map((t) => t.amount);
          const medianVal = amounts.sort((a,b) => a - b)[Math.floor(amounts.length / 2)];
          
          groupTx.forEach((t) => {
            // If expense is simple spike over median (e.g. 3.5x higher and substantial)
            if (t.amount > medianVal * 3.5 && t.amount > 50) {
              anomalies.push({
                id: `anomaly-sparse-${t.id}`,
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
      const sum = amounts.reduce((a, b) => a + b, 0);
      const mean = sum / count;

      // Median calculation
      const sortedAmounts = [...amounts].sort((a, b) => a - b);
      const mid = Math.floor(count / 2);
      const median = count % 2 !== 0 ? sortedAmounts[mid] : (sortedAmounts[mid - 1] + sortedAmounts[mid]) / 2;

      // Standard Deviation calculation
      const varianceSum = amounts.reduce((total, val) => total + Math.pow(val - mean, 2), 0);
      let stdDev = Math.sqrt(varianceSum / (count - 1));

      // Defense boundary against standard deviation of identically priced items (like recurring Netflix bills)
      const isConstant = stdDev < 0.05 * mean;
      if (isConstant || stdDev === 0) {
        stdDev = Math.max(5.0, mean * 0.1); // minimum $5 or 10% standard deviation of average
      }

      // Check for outlier entries (Z-score > 1.5)
      groupTx.forEach((t) => {
        const diff = t.amount - median;
        const zScore = diff / stdDev;

        // We focus on high-spend anomalies (Z-score > 1.5 and transaction being above the median baseline)
        if (zScore >= 1.5 && t.amount > median + 15) {
          let severity: "critical" | "warning" | "low" = "low";
          if (zScore >= 2.5) severity = "critical";
          else if (zScore >= 1.8) severity = "warning";

          anomalies.push({
            id: `anomaly-z-${t.id}`,
            transactionId: t.id,
            transaction: t,
            budget: t.budget,
            amount: t.amount,
            mean,
            median,
            stdDev,
            zScore,
            message: `Your transaction '${t.description}' ($${t.amount}) is ${zScore.toFixed(1)} standard deviations higher than your 6-month average of $${mean.toFixed(0)} in '${t.budget}'.`,
            severity,
          });
        }
      });
    });

    // Sort key anomalies by date (most recent first) and slice to highest impact
    anomalies.sort((a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime());

    res.json({
      success: true,
      anomalies: anomalies.slice(0, 15),
    });
  } catch (err: any) {
    console.error("Backend outlier processing failed:", err);
    res.status(500).json({ error: "Statistical analysis failed", details: err.message });
  }
});

// -----------------------------------------------------------------------------
// Vite Dev Server Middleware & Asset Serving
// -----------------------------------------------------------------------------

async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const hasDist = fs.existsSync(path.join(distPath, "index.html"));

  if (process.env.NODE_ENV !== "production" || !hasDist) {
    // Development mode or fallback if no static build has been processed
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware mounted.");
  } else {
    // Production output asset serving
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving production static assets from dist/");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BudgetManager server booted: Running on http://localhost:${PORT}`);
  });
}

startServer();
