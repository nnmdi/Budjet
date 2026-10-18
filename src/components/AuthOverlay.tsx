import { useState } from "react";
import { apiAvailable } from "../api";
import { request } from "../hooks/useWorkspace";
interface Props {
  onLogin: (email: string, name: string) => void;
  onGuest: () => void;
}
export default function AuthOverlay({ onLogin, onGuest }: Props) {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const normalized = email.trim().toLowerCase();
      if (apiAvailable) {
        const data = await request(
          register ? "/api/auth/register" : "/api/auth/login",
          {
            method: "POST",
            body: JSON.stringify({
              email: normalized,
              name: name.trim(),
              password,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          },
        );
        onLogin(data.user.email, data.user.name);
      } else {
        onLogin(normalized, name.trim() || normalized.split("@")[0]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPassword("");
    }
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-7 space-y-5"
      >
        <div className="text-center">
          <div className="text-3xl">🍽️💵</div>
          <h1 className="font-bold text-2xl mt-3">Cash Diet</h1>
          <p className="mt-2 text-sm text-slate-400">
            {apiAvailable
              ? register
                ? "Create a server account"
                : "Sign in to your account"
              : "Open a local profile"}
          </p>
        </div>
        {!apiAvailable && (
          <p className="text-sm text-amber-200">
            This profile saves in this browser only. It has no password or
            access protection. Anyone using this browser can open it. Export
            backups to keep a copy.
          </p>
        )}
        {(!apiAvailable || register) && (
          <label className="block text-sm">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required={register}
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
        {apiAvailable && (
          <label className="block text-sm">
            Password{register && " (at least 12 characters)"}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={register ? 12 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              className="mt-1 block w-full rounded bg-slate-950 p-3"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full bg-rose-700 disabled:opacity-50 rounded-xl p-3 font-bold"
        >
          {busy
            ? "Please wait…"
            : apiAvailable
              ? register
                ? "Create account"
                : "Sign in"
              : "Open local profile"}
        </button>
        {apiAvailable && (
          <button
            type="button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
            className="w-full text-sm text-slate-300"
          >
            {register
              ? "Already have an account? Sign in"
              : "Create a new account"}
          </button>
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
