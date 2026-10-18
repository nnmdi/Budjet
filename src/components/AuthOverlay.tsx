import { useState } from "react";
import { apiAvailable } from "../api";
import { request } from "../hooks/useWorkspace";
interface Props {
  onLogin: (email: string, name: string) => void;
  onGuest: () => void;
  hosted?: boolean;
}
export default function AuthOverlay({
  onLogin,
  onGuest,
  hosted = apiAvailable,
}: Props) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "resend">(
    "login",
  );
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setPassword("");
    setConfirm("");
    setError("");
    setNotice("");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const normalized = email.trim().toLowerCase();
      if (!hosted) {
        onLogin(normalized, name.trim() || normalized.split("@")[0]);
        return;
      }
      if (mode === "register" && password !== confirm)
        throw new Error("The passwords do not match.");
      const endpoint =
        mode === "register"
          ? "register"
          : mode === "forgot"
            ? "forgot-password"
            : mode === "resend"
              ? "resend-verification"
              : "login";
      const data = await request("/api/auth/" + endpoint, {
        method: "POST",
        body: JSON.stringify({
          email: normalized,
          ...(mode === "register" || mode === "login" ? { password } : {}),
          ...(mode === "register"
            ? {
                name: name.trim(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }
            : {}),
        }),
      });
      if (mode === "login") onLogin(data.user.email, data.user.name);
      else setNotice(data.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPassword("");
      setConfirm("");
    }
  };
  const heading = !hosted
    ? "Open a local profile"
    : mode === "register"
      ? "Create an account"
      : mode === "forgot"
        ? "Recover your password"
        : mode === "resend"
          ? "Resend confirmation"
          : "Sign in to your account";
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-7 space-y-5"
      >
        <div className="text-center">
          <div className="text-3xl">🍽️💵</div>
          <h1 className="font-bold text-2xl mt-3">Cash Diet</h1>
          <h2 className="mt-2 text-sm text-slate-400">{heading}</h2>
        </div>
        {!hosted && (
          <p className="text-sm text-amber-200">
            This profile saves in this browser only. It has no password or
            access protection. Anyone using this browser can open it. Export
            backups to keep a copy.
          </p>
        )}
        {mode === "register" && hosted && (
          <p className="text-sm text-slate-300">
            Confirm your email before signing in. Browser-only profiles are
            separate; you can restore an exported ledger after signing in.
          </p>
        )}
        {(!hosted || mode === "register") && (
          <label className="block text-sm">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required={hosted && mode === "register"}
              className="mt-1 block w-full rounded bg-slate-950 p-3"
              autoComplete="name"
            />
          </label>
        )}
        <label className="block text-sm">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
            className="mt-1 block w-full rounded bg-slate-950 p-3"
            autoComplete="email"
          />
        </label>
        {hosted && (mode === "login" || mode === "register") && (
          <label className="block text-sm">
            Password{mode === "register" && " (at least 12 characters)"}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "register" ? 12 : 1}
              maxLength={128}
              required
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              className="mt-1 block w-full rounded bg-slate-950 p-3"
            />
          </label>
        )}
        {hosted && mode === "register" && (
          <label className="block text-sm">
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
              className="mt-1 block w-full rounded bg-slate-950 p-3"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-emerald-300">
            {notice}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full bg-rose-700 disabled:opacity-50 rounded-xl p-3 font-bold"
        >
          {busy
            ? "Please wait…"
            : !hosted
              ? "Open local profile"
              : mode === "register"
                ? "Create account"
                : mode === "forgot"
                  ? "Send recovery email"
                  : mode === "resend"
                    ? "Send confirmation email"
                    : "Sign in"}
        </button>
        {hosted && (
          <div className="space-y-3 text-sm text-slate-300">
            <button
              type="button"
              className="block w-full"
              onClick={() =>
                changeMode(mode === "register" ? "login" : "register")
              }
            >
              {mode === "register"
                ? "Already registered? Sign in"
                : "Create a new account"}
            </button>
            <button
              type="button"
              className="block w-full"
              onClick={() => changeMode(mode === "forgot" ? "login" : "forgot")}
            >
              {mode === "forgot" ? "Back to sign in" : "Forgot password?"}
            </button>
            <button
              type="button"
              className="block w-full"
              onClick={() => changeMode(mode === "resend" ? "login" : "resend")}
            >
              {mode === "resend"
                ? "Back to sign in"
                : "Resend email confirmation"}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onGuest}
          className="w-full text-sm text-slate-400"
        >
          Try a guest workspace (not saved)
        </button>
      </form>
    </div>
  );
}
