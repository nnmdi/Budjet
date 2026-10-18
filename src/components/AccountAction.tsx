import { useEffect, useState } from "react";
import { request } from "../hooks/useWorkspace";
import { apiAvailable } from "../api";
export interface AccountLink {
  purpose: "verify" | "reset";
  token: string;
}
export function readAccountLink(): AccountLink | null {
  if (typeof window === "undefined") return null;
  const match = /^#(verify-email|reset-password)=([a-f0-9]{64})$/.exec(
    window.location.hash,
  );
  return match
    ? {
        purpose: match[1] === "verify-email" ? "verify" : "reset",
        token: match[2],
      }
    : null;
}
export default function AccountAction({
  action,
  onDone,
  hosted = apiAvailable,
}: {
  action: AccountLink;
  onDone: () => void;
  hosted?: boolean;
}) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);
  const verify = action.purpose === "verify";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!hosted)
        throw new Error(
          "Open this link on the hosted Cash Diet account site. Browser-only profiles do not use email links.",
        );
      if (!verify && password !== confirm)
        throw new Error("The passwords do not match.");
      const data = await request(
        verify ? "/api/auth/verify-email" : "/api/auth/reset-password",
        {
          method: "POST",
          body: JSON.stringify({
            token: action.token,
            password,
            ...(!verify ? { confirmPassword: confirm } : {}),
          }),
        },
      );
      setMessage(data.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPassword("");
      setConfirm("");
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-7 space-y-5"
      >
        <h1 className="text-xl font-bold">
          {verify ? "Confirm your email" : "Choose a new password"}
        </h1>
        {!message ? (
          <>
            <p className="text-sm text-slate-300">
              {verify
                ? "Enter the password you chose when creating this account. If you did not create it, return to sign in and use password recovery."
                : "Use 12–128 characters. This will sign out all existing sessions. You will sign in again afterward."}
            </p>
            <label className="block text-sm">
              {verify ? "Account password" : "New password"}
              <input
                type="password"
                required
                minLength={verify ? 1 : 12}
                maxLength={128}
                autoComplete={verify ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full bg-slate-950 p-3 rounded mt-1"
              />
            </label>
            {!verify && (
              <label className="block text-sm">
                Confirm new password
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="block w-full bg-slate-950 p-3 rounded mt-1"
                />
              </label>
            )}
            <button
              disabled={busy}
              className="w-full rounded-xl bg-rose-700 p-3"
            >
              {busy
                ? "Please wait…"
                : verify
                  ? "Confirm email"
                  : "Change password"}
            </button>
          </>
        ) : (
          <p role="status" className="text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-rose-300 text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onDone}
          className="block w-full text-sm text-slate-300"
        >
          Return to sign in
        </button>
      </form>
    </div>
  );
}
