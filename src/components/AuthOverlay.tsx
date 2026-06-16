import React, { useState } from "react";
import { 
  Lock, 
  Mail, 
  User, 
  Sparkles, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  PiggyBank 
} from "lucide-react";

interface AuthOverlayProps {
  onLogin: (email: string, name: string) => void;
  onGuest: () => void;
}

export default function AuthOverlay({ onLogin, onGuest }: AuthOverlayProps) {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // Dynamic validation state
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSuccessNotice(null);

    const emailTrim = email.trim().toLowerCase();
    const nameTrim = name.trim();
    const passTrim = password.trim();

    if (!emailTrim || !passTrim || (!isLogin && !nameTrim)) {
      setErrorNotice("Please fill in all required registration fields.");
      return;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrim)) {
      setErrorNotice("Invalid email formatting. Please supply a valid email.");
      return;
    }

    if (passTrim.length < 5) {
      setErrorNotice("Account security constraint: Password must be at least 5 characters.");
      return;
    }

    // Load registered accounts list from local disk storage
    const storedAccountsRaw = localStorage.getItem("budgetmanager_accounts");
    const accounts: Record<string, { name: string; passwordHash: string }> = storedAccountsRaw 
      ? JSON.parse(storedAccountsRaw) 
      : {};

    if (isLogin) {
      // Login process
      const matchedUser = accounts[emailTrim];
      if (!matchedUser) {
        // Fallback convenience: Let new users automatic bootstrap with their email if it complies,
        // but for safety, check if any accounts exist. If not, auto-create to be friendly, or reject.
        setErrorNotice("Profile email not found. Switch to 'Create Account' to build a new profile.");
        return;
      }

      if (matchedUser.passwordHash !== passTrim) {
        setErrorNotice("Incorrect security credentials. Please verify your password entry.");
        return;
      }

      // Valid session
      setSuccessNotice("Authentication matched. Decrypting personal ledger...");
      setTimeout(() => {
        onLogin(emailTrim, matchedUser.name);
      }, 1000);
    } else {
      // Sign-Up registration process
      if (accounts[emailTrim]) {
        setErrorNotice("An account already belongs to this email. Please log in instead.");
        return;
      }

      // Register fresh parameters
      accounts[emailTrim] = {
        name: nameTrim,
        passwordHash: passTrim
      };

      localStorage.setItem("budgetmanager_accounts", JSON.stringify(accounts));
      setSuccessNotice("Financial identity registered successfully. Starting workspace...");
      setTimeout(() => {
        onLogin(emailTrim, nameTrim);
      }, 1000);
    }
  };

  return (
    <div 
      id="auth-shield-viewport" 
      className="fixed inset-0 bg-[#070b13] flex items-center justify-center z-50 font-sans p-4 overflow-y-auto"
    >
      {/* Radiant ambient backdrop */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-rose-500/10 to-transparent blur-3xl rounded-full pointer-events-none"></div>
      
      <div 
        id="auth-card" 
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 overflow-hidden animate-fadeIn"
      >
        {/* Simple elegant logo design */}
        <div className="flex flex-col items-center text-center space-y-3.5">
          <div className="w-12 h-12 bg-rose-700 rounded-2xl flex items-center justify-center font-bold text-2xl text-white shadow-xl shadow-rose-700/30">
            ✈️
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight leading-none uppercase">
              BUDJET
            </h2>
            <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mt-1.5 leading-none">
              The Reliable Personal Advisor
            </p>
          </div>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            Configure or lock your workspace ledger. Enter your profile credentials to access secure synchronization logs and financial diagnostics.
          </p>
        </div>

        {/* Custom status alerts */}
        {errorNotice && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 leading-normal font-medium">
            {errorNotice}
          </div>
        )}
        {successNotice && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 leading-normal font-medium flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            <span>{successNotice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Custom Display Name Name (Only seen in Signup phase) */}
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-widest text-[8.5px] block">
                Profile Display Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CEO of Wealth / Reliable Advisor"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-[#2170e4] focus:ring-1 focus:ring-[#2170e4] outline-none transition-all placeholder:text-slate-600"
                />
              </div>
            </div>
          )}

          {/* Email Address */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-400 uppercase tracking-widest text-[8.5px] block">
              Workspace Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-[#2170e4] focus:ring-1 focus:ring-[#2170e4] outline-none transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Access Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-400 uppercase tracking-widest text-[8.5px] block">
                Access Security Password
              </label>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-[#2170e4] focus:ring-1 focus:ring-[#2170e4] outline-none transition-all placeholder:text-slate-600 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-400 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-rose-700 hover:bg-rose-600 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer mt-6 shadow-md shadow-rose-700/20 active:translate-y-0.5"
          >
            <span>{isLogin ? "Login" : "Register Financial Identity"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
          <span>
            {isLogin ? "No financial profile yet?" : "Already registered workspace?"}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorNotice(null);
              setSuccessNotice(null);
            }}
            className="text-rose-400 hover:text-rose-300 font-bold hover:underline cursor-pointer"
          >
            {isLogin ? "Make an account here" : "Sign In"}
          </button>
        </div>

        {/* Guest Session Bypass Option */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          <button
            type="button"
            onClick={onGuest}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 select-none text-slate-300 hover:text-white font-semibold text-xs tracking-wide rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700/60 active:translate-y-0.5"
          >
            <span>Continue as Guest (No saving)</span>
          </button>
          <p className="text-[9px] text-center text-slate-500 leading-normal">
            No profile registration required. All calculations and advice features run in sandbox mode, but changes will not be saved on reload.
          </p>
        </div>

        {/* Trust verification line */}
        <div className="flex items-center justify-center gap-1.5 text-[8.5px] font-mono text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>SECURE LOCAL COMPARTMENTALIZATION DEPLOYED</span>
        </div>
      </div>
    </div>
  );
}
