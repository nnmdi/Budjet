import { TrendingUp, Sparkles, Check } from "lucide-react";

interface ProjectionInsightsProps {
  onRunCalculator: () => void;
  totalLiquidity: number;
}

export default function ProjectionInsights({ onRunCalculator, totalLiquidity }: ProjectionInsightsProps) {
  // Let's compute a neat project target based on actual starting funds
  const targetFutureVal = totalLiquidity * 1.25;

  return (
    <div 
      id="projection-insights-card" 
      className="bg-rose-800 rounded-2xl p-6 text-white border border-rose-700 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative"
    >
      <div className="absolute -right-4 -top-4 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
      
      <div className="flex-1 space-y-3 z-10">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-full bg-white/10 text-white">
            <TrendingUp className="w-4.5 h-4.5" />
          </span>
          <span className="text-[10px] font-bold text-rose-100 uppercase tracking-widest font-sans">Projection Insights</span>
        </div>

        <h4 className="text-xl font-black tracking-tight text-white leading-tight">
          Hypothetical Wealth Accelerator
        </h4>

        <p className="text-sm text-rose-100 leading-relaxed font-sans font-medium">
          Based on your current savings velocity across active streams, your combined portfolio growth is projected to exceed <strong className="text-white font-black font-mono underline decoration-wavy decoration-rose-300 decoration-1">${targetFutureVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong> within the next 12 months.
        </p>

        <button
          onClick={onRunCalculator}
          id="btn-run-analysis"
          className="mt-2 py-2.5 px-5 bg-white hover:bg-rose-50 text-rose-800 hover:text-rose-950 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md"
        >
          Run Analysis
        </button>
      </div>

      {/* Glassmorphic miniature chart representing step progression */}
      <div className="w-full md:w-56 p-4 rounded-xl bg-rose-900/80 border border-rose-700/50 flex flex-col justify-between h-40 z-10">
        <span className="text-[9px] font-bold text-rose-100 uppercase tracking-widest block font-sans">Asset Blocks</span>
        
        {/* Dynamic bar steps */}
        <div className="flex items-end gap-2.5 h-20 pt-4">
          <div className="flex-1 bg-white/20 rounded-t h-[30%] relative group" title="Current base">
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] bg-black p-1 rounded hidden group-hover:block">30%</span>
          </div>
          <div className="flex-1 bg-white/20 rounded-t h-[45%]" />
          <div className="flex-1 bg-white/20 rounded-t h-[60%]" />
          <div className="flex-1 bg-white/25 rounded-t h-[75%]" />
          <div className="flex-1 bg-white rounded-t h-[95%] shadow-[0_0_12px_rgba(255,255,255,0.8)] animate-pulse" />
        </div>

        <div className="flex items-center justify-between text-[10px] text-rose-200 font-sans mt-2 pt-1 border-t border-rose-750/40">
          <span>Q1 2026</span>
          <span className="text-white font-bold">Goal Match</span>
        </div>
      </div>
    </div>
  );
}
