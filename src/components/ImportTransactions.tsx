import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Check, 
  Plus, 
  TrendingUp, 
  Sparkles,
  Info,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Search,
  CheckCircle2
} from "lucide-react";
import { Transaction } from "../types";
import { formatCurrency } from "../utils";
import { transactionClassifier } from "../utils/transactionClassifier";

interface ImportTransactionsProps {
  existingBudgets: string[];
  onImportComplete: (finalTransactions: Transaction[], autoCreateBudgets: string[]) => void;
  onCancel: () => void;
}

interface ParsedRow {
  index: number;
  rawDate: string;
  rawDescription: string;
  rawAmount: string;
  rawType?: string; // profit, expense, credit, debit etc
  rawBudget?: string;
  // Normalized / Sanitized state
  date: string;
  description: string;
  amount: number;
  type: "profit" | "expense";
  budget: string;
  isExcluded: boolean;
  isCustomBudget: boolean; // if mapped budget is currently non-existent
}

// Map simple types from user string
function normalizeType(typeStr: string, amountNum: number): "profit" | "expense" {
  const norm = typeStr.toLowerCase().trim();
  if (norm.includes("income") || norm.includes("profit") || norm.includes("credit") || norm.includes("deposit") || norm.includes("in")) {
    return "profit";
  }
  if (norm.includes("expense") || norm.includes("debit") || norm.includes("payment") || norm.includes("out") || norm.includes("charge")) {
    return "expense";
  }
  // fallback based on value
  return amountNum >= 0 ? "profit" : "expense";
}

// Generate an elegant unique key ID
const makeId = () => Math.random().toString(36).substring(2, 9);

export default function ImportTransactions({
  existingBudgets,
  onImportComplete,
  onCancel
}: ImportTransactionsProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileLoaded, setFileLoaded] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [allBudgets, setAllBudgets] = useState<string[]>(existingBudgets);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [errorText, setErrorText] = useState<string>("");
  
  // Custom column mapping states if files have irregular headers
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawLines, setRawLines] = useState<string[][]>([]);
  const [mappings, setMappings] = useState({
    dateCol: -1,
    descCol: -1,
    amountCol: -1,
    typeCol: -1,
    budgetCol: -1
  });
  
  const [hasUnrecognizedBudgets, setHasUnrecognizedBudgets] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse a CSV line with respect to double quotes
  const parseCSVLine = (text: string): string[] => {
    const result: string[] = [];
    let cell = "";
    let insideQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(cell.trim().replace(/^"(.*)"$/, "$1"));
        cell = "";
      } else {
        cell += char;
      }
    }
    result.push(cell.trim().replace(/^"(.*)"$/, "$1"));
    return result;
  };

  // Process raw lines based on mapped indices
  const processMappedLines = (headersList: string[], dataRows: string[][], colIndices: typeof mappings) => {
    const rows: ParsedRow[] = [];
    let unrecognizedBudgetsFound = false;

    dataRows.forEach((cols, idx) => {
      // Must have at least description and amount mapped
      if (colIndices.descCol === -1 || colIndices.amountCol === -1) return;
      if (cols.length <= Math.max(colIndices.descCol, colIndices.amountCol)) return;

      const rawDate = colIndices.dateCol !== -1 ? cols[colIndices.dateCol] : "";
      const rawDescription = cols[colIndices.descCol] || "";
      const rawAmount = colIndices.amountCol !== -1 ? cols[colIndices.amountCol] : "0";
      const rawType = colIndices.typeCol !== -1 ? cols[colIndices.typeCol] : "";
      const rawBudget = colIndices.budgetCol !== -1 ? cols[colIndices.budgetCol] : "";

      // Sanitization: clean amount
      const cleanAmountStr = rawAmount.replace(/[\$\,\s]/g, "");
      let amountNum = parseFloat(cleanAmountStr);
      if (isNaN(amountNum)) amountNum = 0;
      
      const absoluteAmount = Math.abs(amountNum);

      // Sanitization: Normalise date structure format (YYYY-MM-DD HH:MM:SS format)
      let finalDateStr = new Date().toISOString().slice(0, 10);
      if (rawDate) {
        try {
          const parsedD = new Date(rawDate);
          if (!isNaN(parsedD.getTime())) {
            finalDateStr = parsedD.toISOString().slice(0, 10);
          }
        } catch (_) {
          // Keep current date
        }
      }
      finalDateStr = finalDateStr + " 12:00:00"; // fallback middle of day

      // Sanitization: clean description
      const cleanDesc = rawDescription.trim();
      if (!cleanDesc) return; // skip entirely blank rows

      // Normalize Type
      let finalType: "profit" | "expense" = "expense";
      if (rawType) {
        finalType = normalizeType(rawType, amountNum);
      } else {
        // Guess type based on sign of the amount
        finalType = amountNum >= 0 ? "profit" : "expense"; 
        amountNum = absoluteAmount; // store as positive, type handles sign
      }

      // Smart Categorization & Automatic Classification
      let finalBudget = "";
      if (rawBudget && rawBudget.trim()) {
        finalBudget = rawBudget.trim();
      } else {
        // Run AI classification
        try {
          finalBudget = transactionClassifier.classify(cleanDesc).category || existingBudgets[0] || "General";
        } catch {
          finalBudget = "General";
        }
      }

      const isCustomBg = !existingBudgets.includes(finalBudget);
      if (isCustomBg) unrecognizedBudgetsFound = true;

      rows.push({
        index: idx,
        rawDate,
        rawDescription,
        rawAmount,
        rawType,
        rawBudget,
        date: finalDateStr,
        description: cleanDesc,
        amount: absoluteAmount,
        type: finalType,
        budget: finalBudget,
        isExcluded: false,
        isCustomBudget: isCustomBg
      });
    });

    setParsedRows(rows);
    setHasUnrecognizedBudgets(unrecognizedBudgetsFound);
  };

  // Perform core CSV scanning and detect columns
  const parseFileContent = (text: string) => {
    setErrorText("");
    // split on newlines
    const rawLinesText = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (rawLinesText.length < 2) {
      setErrorText("CSV too short! Provide a valid sheet header and data rows.");
      return;
    }

    const headerRowCells = parseCSVLine(rawLinesText[0]);
    const bodyRowsCells = rawLinesText.slice(1).map(parseCSVLine);

    setHeaders(headerRowCells);
    setRawLines(bodyRowsCells);

    // Dynamic auto matcher heuristics
    let dCol = -1, descCol = -1, amtCol = -1, tCol = -1, bgCol = -1;
    
    headerRowCells.forEach((header, idx) => {
      const h = header.toLowerCase().replace(/[\s\_\-]/g, "");
      
      if (h.includes("date") || h.includes("time") || h.includes("timestamp") || h.includes("created")) {
        dCol = idx;
      } else if (h.includes("desc") || h.includes("payee") || h.includes("memo") || h.includes("details") || h.includes("merchant") || h.includes("name") || h.includes("title")) {
        descCol = idx;
      } else if (h.includes("amount") || h.includes("value") || h.includes("cost") || h.includes("sum") || h.includes("charge") || h.includes("spent") || h.includes("received")) {
        amtCol = idx;
      } else if (h.includes("type") || h.includes("creditdebit") || h.includes("drcr") || h.includes("method")) {
        tCol = idx;
      } else if (h.includes("budget") || h.includes("category") || h.includes("bucket") || h.includes("pot") || h.includes("ledger")) {
        bgCol = idx;
      }
    });

    // fallback matching standard positions
    if (descCol === -1) {
      // try scanning first col with text
      descCol = headerRowCells.length > 1 ? 1 : 0;
    }
    if (amtCol === -1) {
      amtCol = headerRowCells.length > 2 ? 2 : 1;
    }

    const initialMap = {
      dateCol: dCol,
      descCol: descCol,
      amountCol: amtCol,
      typeCol: tCol,
      budgetCol: bgCol
    };

    setMappings(initialMap);
    processMappedLines(headerRowCells, bodyRowsCells, initialMap);
    setFileLoaded(true);
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFileName(file.name);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && event.target.result) {
          parseFileContent(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && event.target.result) {
          parseFileContent(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Re-process when column selections change
  const handleMappingChange = (field: keyof typeof mappings, val: number) => {
    const updated = { ...mappings, [field]: val };
    setMappings(updated);
    processMappedLines(headers, rawLines, updated);
  };

  const toggleRowExcluded = (index: number) => {
    setParsedRows(prev => {
      const next = prev.map(row => row.index === index ? { ...row, isExcluded: !row.isExcluded } : row);
      
      // Re-evaluate unrecognized budget warnings
      const activeRows = next.filter(r => !r.isExcluded);
      const unrecognizedFound = activeRows.some(r => !existingBudgets.includes(r.budget));
      setHasUnrecognizedBudgets(unrecognizedFound);
      
      return next;
    });
  };

  const updateRowBudget = (index: number, newB: string) => {
    setParsedRows(prev => {
      const next = prev.map(row => {
        if (row.index === index) {
          const isCustom = !existingBudgets.includes(newB);
          return { ...row, budget: newB, isCustomBudget: isCustom };
        }
        return row;
      });
      
      // Re-evaluate unrecognized budget warnings
      const activeRows = next.filter(r => !r.isExcluded);
      const unrecognizedFound = activeRows.some(r => !existingBudgets.includes(r.budget));
      setHasUnrecognizedBudgets(unrecognizedFound);
      
      return next;
    });
  };

  const updateRowType = (index: number, type: "profit" | "expense") => {
    setParsedRows(prev => prev.map(row => row.index === index ? { ...row, type } : row));
  };

  const updateRowDescription = (index: number, txt: string) => {
    setParsedRows(prev => prev.map(row => row.index === index ? { ...row, description: txt } : row));
  };

  const updateRowAmount = (index: number, amtStr: string) => {
    const amt = Math.abs(parseFloat(amtStr) || 0);
    setParsedRows(prev => prev.map(row => row.index === index ? { ...row, amount: amt } : row));
  };

  // Generate synthetic Demo banking CSV instantly!
  const loadDemoCSV = () => {
    const csvContent = 
`Date,Merchant,Amount,Category,Type
2026-06-15,Starbucks Coffee Premium,$8.45,Coffee & Drinks,Debit
2026-06-14,Whole Foods Organic Market,$124.50,Groceries,Debit
2026-06-13,Monthly Payroll Bonus,$450.00,Salary Income,Credit
2026-06-13,Netflix Streaming Sub,$15.99,Media Entertainment,Debit
2026-06-12,Gym Monthly Fee,$45.00,Health,Debit
2026-06-11,Chevron Gasoline Refill,$62.00,Transport,Debit
2026-06-10,Atm Cash Reward Refund,$20.00,General,Credit`;

    setFileName("starbucks_wholefoods_bonus.csv");
    parseFileContent(csvContent);
  };

  // Perform Final committing analysis import
  const handleCommitImport = () => {
    setErrorText("");
    const activeRows = parsedRows.filter(r => !r.isExcluded);
    if (activeRows.length === 0) {
      setErrorText("No active transactions marked to import!");
      return;
    }

    // Determine budgets to create
    const missingBudgets: string[] = [];
    activeRows.forEach(row => {
      if (!existingBudgets.includes(row.budget) && !missingBudgets.includes(row.budget)) {
        missingBudgets.push(row.budget);
      }
    });

    // Structure Transaction list elements conform to application design
    const transactionsToImport: Transaction[] = activeRows.map(row => ({
      id: "tx-" + makeId(),
      budget: row.budget,
      date: row.date,
      type: row.type,
      amount: row.amount,
      description: row.description,
      recurrence: "one-time"
    }));

    onImportComplete(transactionsToImport, missingBudgets);
  };

  // Pre-analyze active metrics
  const activeRows = parsedRows.filter(r => !r.isExcluded);
  const totalExpense = activeRows.filter(r => r.type === "expense").reduce((sum, r) => sum + r.amount, 0);
  const totalIncome = activeRows.filter(r => r.type === "profit").reduce((sum, r) => sum + r.amount, 0);
  const netImpact = totalIncome - totalExpense;

  const missingBudgetCandidateList = Array.from(
    new Set(activeRows.filter(r => !existingBudgets.includes(r.budget)).map(r => r.budget))
  );

  return (
    <div id="import-module-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-white font-sans">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5 leading-snug">
                Unified Statement Importer 
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 tracking-wider">Instant AI Sync</span>
              </h3>
              <p className="text-[10.5px] text-slate-400 font-medium">Instantly parse debit/credit statements and train classification weights in 1-click</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {!fileLoaded && (
            <button 
              type="button"
              onClick={loadDemoCSV}
              className="px-3 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Load Sample Demo</span>
            </button>
          )}
          <button 
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Back to Wallet
          </button>
        </div>
      </div>

      {errorText && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-350 px-4 py-3 rounded-xl text-xs font-sans font-bold flex items-center justify-between gap-3 animate-fade-in">
          <span>⚠ {errorText}</span>
          <button 
            onClick={() => setErrorText("")} 
            className="text-slate-400 hover:text-white transition-colors cursor-pointer font-sans"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Sandbox Drag/Drop Area */}
      {!fileLoaded ? (
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-4 ${
            dragActive 
              ? "border-rose-500 bg-rose-500/5 shadow-inner shadow-rose-950/20" 
              : "border-slate-800 bg-slate-955 hover:border-slate-700 hover:bg-slate-850/50"
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".csv,.txt,.tsv"
            onChange={handleFileChange}
            className="hidden" 
          />
          
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-full text-slate-400">
            <UploadCloud className="w-8 h-8 animate-pulse text-rose-400" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-bold text-white">Drag & drop your bank statement here</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">Supports standard generic <span className="font-mono text-slate-350 font-semibold">.csv</span> statements exported from Chase, Wells Fargo, Revolut, Cash App or personal ledgers.</p>
          </div>

          <span className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md text-white">
            Browse Files on Disk
          </span>
          
          <div className="text-[10px] text-slate-500 pt-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Secure Sandbox: statement parsing occurs 100% locally in your secure client tab.
          </div>
        </div>
      ) : (
        /* Active Processing Workbench */
        <div id="workbench-arena" className="space-y-6">
          
          {/* File summary and Column Mappers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* Column Mapper unit */}
            <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3.5 col-span-2">
              <div className="flex items-center gap-1.5 border-b border-slate-850 pb-2">
                <FileSpreadsheet className="w-4 h-4 text-[#60a5fa]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">Column Mapping Settings</h4>
              </div>
              
              <p className="text-[10.5px] text-slate-400">We auto-detected columns based on cell headers! Adjust mappings if banking names are misaligned.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {/* Date select */}
                <div className="space-y-1 text-[10.5px]">
                  <label className="text-slate-400 block font-bold">Date Column</label>
                  <select 
                    value={mappings.dateCol}
                    onChange={(e) => handleMappingChange("dateCol", parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value={-1}>-- Ignore column --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Col ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Description select */}
                <div className="space-y-1 text-[10.5px]">
                  <label className="text-slate-400 block font-bold">Payee / Description</label>
                  <select 
                    value={mappings.descCol}
                    onChange={(e) => handleMappingChange("descCol", parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-500 cursor-pointer font-bold"
                  >
                    <option value={-1}>-- Select Column --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Col ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Amount select */}
                <div className="space-y-1 text-[10.5px]">
                  <label className="text-slate-400 block font-bold">Amount Col ($)</label>
                  <select 
                    value={mappings.amountCol}
                    onChange={(e) => handleMappingChange("amountCol", parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-500 cursor-pointer font-bold"
                  >
                    <option value={-1}>-- Select Column --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Col ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Type select */}
                <div className="space-y-1 text-[10.5px]">
                  <label className="text-slate-400 block font-bold">Flow Type Col (Optional)</label>
                  <select 
                    value={mappings.typeCol}
                    onChange={(e) => handleMappingChange("typeCol", parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value={-1}>-- Auto detect by sign --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Col ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                {/* Budget Column */}
                <div className="space-y-1 text-[10.5px]">
                  <label className="text-slate-400 block font-bold">Budget Category Col</label>
                  <select 
                    value={mappings.budgetCol}
                    onChange={(e) => handleMappingChange("budgetCol", parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-white rounded text-xs outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value={-1}>-- Use AI Smart Guesser --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Col ${i+1}`}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button 
                    type="button"
                    onClick={() => {
                      setFileLoaded(false);
                      setParsedRows([]);
                    }}
                    className="w-full py-1.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-rose-500/20 transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Drop Statement</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Metrics and Health Check unit */}
            <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-1.5 border-b border-slate-850 pb-2 mb-2.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">Import Summary Metrics</h4>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Transactions:</span>
                    <span className="font-bold text-white font-mono">{activeRows.length} logged</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Incoming (In):</span>
                    <span className="font-bold text-emerald-400 font-mono">+{formatCurrency(totalIncome)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Outgoing (Out):</span>
                    <span className="font-bold text-rose-400 font-mono">-{formatCurrency(totalExpense)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-850 pt-2 font-bold">
                    <span className="text-slate-300">Net Impact:</span>
                    <span className={`font-mono ${netImpact >= 0 ? "text-emerald-400" : "text-rose-405"}`}>
                      {netImpact >= 0 ? "+" : ""}{formatCurrency(netImpact)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[9.5px] text-slate-500 font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active statement: {fileName}
                </p>
              </div>
            </div>
          </div>

          {/* Missing budget warnings */}
          {hasUnrecognizedBudgets && missingBudgetCandidateList.length > 0 && (
            <div id="missing-categories-glowing-glow" className="p-3.5 bg-amber-950/20 border border-amber-900/40 rounded-xl space-y-1 text-xs text-amber-300 animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0" />
                <p className="font-bold text-white">Missing Budget Category Vaults Detected</p>
              </div>
              <p className="text-[10.5px] text-slate-300">We detected these categories in your file that do not exist in your wallet yet: <strong className="text-amber-400 font-mono">{missingBudgetCandidateList.join(", ")}</strong>.</p>
              <p className="text-[10px] text-slate-400 font-medium">On importing, we will <strong className="text-white hover:underline cursor-pointer">automatically provision</strong> these missing budgets for you with $0.00 base deposits!</p>
            </div>
          )}

          {/* Interactive grid container */}
          <div className="bg-slate-950/40 border border-slate-850 rounded-xl overflow-hidden">
            <div className="p-3 bg-slate-950 text-xs font-bold text-slate-350 border-b border-slate-850 flex items-center justify-between">
              <span>Sanitize Raw Records before ledger insertion</span>
              <span className="text-slate-500 font-normal">Check / uncheck the leftmost boxes to exclude specific logs</span>
            </div>

            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/70 text-slate-400 border-b border-slate-850 uppercase text-[10px] font-bold tracking-wider">
                    <th className="p-2.5 w-10 text-center">Import</th>
                    <th className="p-2.5 w-24">Date</th>
                    <th className="p-2.5">Payee (Editable)</th>
                    <th className="p-2.5 w-24">Type</th>
                    <th className="p-2.5 w-32">Budget Category</th>
                    <th className="p-2.5 w-24 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {parsedRows.map((row) => (
                    <tr 
                      key={row.index} 
                      className={`transition-colors text-[11px] ${
                        row.isExcluded 
                          ? "bg-slate-950/20 opacity-40 italic text-slate-500Line" 
                          : row.isCustomBudget 
                            ? "bg-indigo-950/5 hover:bg-indigo-950/10" 
                            : "hover:bg-slate-900/60"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-2 text-center">
                        <input 
                          type="checkbox" 
                          checked={!row.isExcluded}
                          onChange={() => toggleRowExcluded(row.index)}
                          className="rounded text-rose-600 bg-slate-950 border-slate-800 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>

                      {/* Date */}
                      <td className="p-2 font-mono text-slate-400">
                        {row.date.slice(0, 10)}
                      </td>

                      {/* Payee / Description editable text field */}
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={row.description}
                          disabled={row.isExcluded}
                          onChange={(e) => updateRowDescription(row.index, e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-800/80 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:border-rose-500/50 outline-none transition-all disabled:bg-transparent disabled:border-transparent font-medium"
                        />
                      </td>

                      {/* Type toggle badge */}
                      <td className="p-2">
                        <button 
                          type="button"
                          disabled={row.isExcluded}
                          onClick={() => updateRowType(row.index, row.type === "profit" ? "expense" : "profit")}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase transition-all flex items-center gap-1 cursor-pointer border ${
                            row.type === "profit" 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-450 border-rose-500/20"
                          }`}
                        >
                          {row.type === "profit" ? "IN (Profit)" : "OUT (Cost)"}
                        </button>
                      </td>

                      {/* Budget Dropdown or Missing label tag */}
                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          <select 
                            value={row.budget}
                            disabled={row.isExcluded}
                            onChange={(e) => updateRowBudget(row.index, e.target.value)}
                            className={`w-full px-2 py-1 bg-slate-900 border rounded text-[10.5px] outline-none focus:border-rose-500 cursor-pointer ${
                              row.isCustomBudget ? "border-indigo-800 text-indigo-300 font-bold" : "border-slate-800 text-white"
                            }`}
                          >
                            {/* Existing options */}
                            {existingBudgets.map((b) => (
                              <option key={b} value={b} className="bg-slate-950 text-white">{b}</option>
                            ))}
                            {/* If its raw custom and not in existing */}
                            {row.isCustomBudget && (
                              <option value={row.budget}>{row.budget} (New Budget)</option>
                            )}
                            
                            {row.budget !== "General" && !existingBudgets.includes("General") && (
                              <option value="General" className="bg-slate-950 text-white">General</option>
                            )}
                          </select>
                          
                          {row.isCustomBudget && !row.isExcluded && (
                            <span className="text-[8.5px] text-indigo-400 font-semibold self-start tracking-wide uppercase flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5 shrink-0" /> Will Auto-create budget!
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Amount Input */}
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1 font-mono">
                          <span className={`${row.type === "profit" ? "text-emerald-400" : "text-rose-400"} font-bold`}>
                            {row.type === "profit" ? "+" : "-"}
                          </span>
                          <input 
                            type="text" 
                            value={row.amount.toFixed(2)}
                            disabled={row.isExcluded}
                            onChange={(e) => updateRowAmount(row.index, e.target.value)}
                            className="bg-slate-900/50 border border-slate-800/80 rounded w-16 px-1.5 py-0.5 text-xs text-white text-right font-mono focus:border-rose-500/50 outline-none transition-all disabled:bg-transparent disabled:border-transparent font-semibold"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Trigger Row */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <span className="text-slate-400 text-xs flex items-center gap-1 leading-snug">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Ready to submit <strong>{activeRows.length} transactions</strong> to your personal files.</span>
            </span>

            <div className="flex items-center gap-2.5">
              <button 
                type="button"
                onClick={() => {
                  setFileLoaded(false);
                  setParsedRows([]);
                }}
                className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-slate-350 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Clear File
              </button>
              
              <button 
                type="button"
                onClick={handleCommitImport}
                className="px-6 py-2.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-rose-700/20 cursor-pointer flex items-center gap-1.5"
              >
                <span>Commit Import</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
