import { Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "info" | "warning";
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div id="toast-wrapper" className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            id={`toast-${toast.id}`}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-4 rounded bg-slate-900 text-white shadow-xl border border-slate-800`}
          >
            <div className="flex items-center gap-3">
              <span className={`p-1.5 rounded-full ${toast.type === "success" ? "bg-emerald-500/20 text-emerald-400" : "bg-sky-500/20 text-sky-400"}`}>
                <Check className="w-4 h-4" />
              </span>
              <p className="text-sm font-sans tracking-tight font-medium text-slate-100">{toast.message}</p>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
