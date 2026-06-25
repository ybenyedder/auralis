"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/auralis/api";
import { AuralisGlyph } from "./BrandMark";

type Phase = "checking" | "locked" | "unlocked";

/** Gates the whole app behind the admin login. The app only mounts once authenticated. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let alive = true;
    api.get<{ authenticated: boolean; token?: string | null; defaultPassword?: boolean }>("/api/auth/status")
      .then((s) => {
        if (!alive) return;
        // Persist the (re-issued) token even when we were authenticated via cookie,
        // so every later write request carries a valid token and actually saves.
        if (s.authenticated && s.token) api.setToken(s.token);
        // Flag the still-default (auto-generated) admin password so the shell can
        // nudge the user to personalise it and delete the initial-password file.
        if (s.authenticated && s.defaultPassword) {
          try { sessionStorage.setItem("auralis.pwNudge", "1"); } catch { /* unavailable */ }
        }
        setPhase(s.authenticated ? "unlocked" : "locked");
      })
      .catch(() => alive && setPhase("locked"));
    return () => { alive = false; };
  }, []);

  if (phase === "checking") {
    return <div className="grid h-screen w-screen place-items-center bg-background text-muted-foreground/40 text-[12px]">…</div>;
  }
  if (phase === "locked") {
    return <LoginScreen onUnlock={() => setPhase("unlocked")} />;
  }
  return <>{children}</>;
}

function LoginScreen({ onUnlock }: { onUnlock: () => void }) {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Load the list of accounts so the user can pick who they are instead of typing.
  useEffect(() => {
    let alive = true;
    api.get<{ usernames: string[] }>("/api/auth/accounts")
      .then((d) => {
        if (!alive || !d.usernames?.length) return;
        setAccounts(d.usernames);
        setUsername(d.usernames[0]);
      })
      .catch(() => { /* fall back to the text field */ });
    return () => { alive = false; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.url("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() || "admin", password }),
      });
      if (!res.ok) {
        setError("Identifiant ou mot de passe incorrect");
        setBusy(false);
        return;
      }
      // Persist the session token so the app stays logged in across restarts
      // even if the WebView drops the session cookie.
      const data = (await res.json().catch(() => ({}))) as { token?: string };
      if (data.token) api.setToken(data.token);
      // Drop any cached state from a previous account so accounts stay isolated;
      // the server's per-user state is loaded fresh after unlock.
      try { window.localStorage.removeItem("auralis.vault.v1"); } catch { /* ignore */ }
      onUnlock();
    } catch {
      setError("Serveur injoignable");
      setBusy(false);
    }
  };

  return (
    <div className="app-chrome grid h-screen w-screen place-items-center px-6 text-foreground">
      <form onSubmit={submit} className="w-full max-w-[340px]">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-white/5 border-none shadow-[0_4px_24px_rgba(0,0,0,0.2)] backdrop-blur-md text-[var(--primary)]">
          <AuralisGlyph className="h-8 w-8" />
        </div>
        <h1 className="text-center text-[20px] font-black tracking-tight">Auralis</h1>
        <p className="mb-6 mt-1 text-center text-[12.5px] text-muted-foreground/70">Connecte-toi pour accéder à ta bibliothèque.</p>

        <label className="mb-2 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/45">Compte</label>
        {accounts.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {accounts.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setUsername(name)}
                className={
                  "min-h-[44px] rounded-full border px-4 text-[14px] font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 " +
                  (username === name
                    ? "border-[var(--primary)] bg-primary/15 text-foreground"
                    : "border-transparent bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground")
                }
              >
                {name}
              </button>
            ))}
          </div>
        ) : (
          <input
            id="user"
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4 w-full rounded-full border border-transparent bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] px-4 py-3 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-white/10 transition-all"
            placeholder="admin"
          />
        )}
        <label htmlFor="pw" className="mb-2 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/45">Mot de passe</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-full border border-transparent bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] px-4 py-3 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-white/10 transition-all"
          placeholder="••••••••"
        />
        <button
          type="submit"
          disabled={busy || !password}
          className="signal-button mt-4 w-full rounded-full py-3.5 text-[14px] font-black shadow-[0_4px_16px_rgba(0,0,0,0.25)] transition-all duration-200 hover:scale-[1.02] disabled:opacity-40"
        >
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <div className="mt-3 min-h-[18px] text-center text-[12px] text-[var(--destructive)]">{error}</div>
      </form>
    </div>
  );
}
