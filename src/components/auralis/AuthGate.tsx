"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/auralis/api";
import { AuralisGlyph } from "./BrandMark";
import { paletteForName } from "@/lib/auralis/brand";

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
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  // The profile the user picked. null = still on the Netflix-style profile grid.
  const [selected, setSelected] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  // Load the list of accounts so the user picks a profile instead of typing.
  useEffect(() => {
    let alive = true;
    api.get<{ usernames: string[] }>("/api/auth/accounts")
      .then((d) => {
        if (!alive) return;
        setAccounts(d.usernames ?? []);
      })
      .catch(() => { /* fall back to the manual profile */ })
      .finally(() => { if (alive) setAccountsLoaded(true); });
    return () => { alive = false; };
  }, []);

  // Focus the password field as soon as a profile is chosen (Netflix flow).
  useEffect(() => {
    if (selected !== null) pwRef.current?.focus();
  }, [selected]);

  const pick = (name: string) => {
    setError("");
    setPassword("");
    setSelected(name);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api.url("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: (selected ?? "admin").trim() || "admin", password }),
      });
      if (!res.ok) {
        setError("Mot de passe incorrect");
        setBusy(false);
        pwRef.current?.focus();
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

  // The selectable profiles. With no accounts endpoint (older server / empty), we
  // still offer a single default "admin" profile so the flow is identical.
  const profiles = accounts.length > 0 ? accounts : ["admin"];

  return (
    <div className="relative grid h-screen w-screen place-items-center overflow-hidden bg-[#101010] px-6 text-foreground">
      {/* A quiet top wash so the black canvas isn't dead-flat, like Netflix. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% -10%, rgba(30,215,96,0.10), transparent 60%)" }}
      />

      {/* Brand, top-left. */}
      <div className="absolute left-6 top-6 flex items-center gap-2.5 lg:left-10 lg:top-8">
        <span className="grid h-8 w-8 place-items-center text-[var(--primary)]">
          <AuralisGlyph className="h-7 w-7" />
        </span>
        <span className="text-[18px] font-black tracking-tight">Auralis</span>
      </div>

      {selected === null ? (
        /* ===== Step 1 — Netflix profile grid ===== */
        <div className="relative flex w-full max-w-3xl flex-col items-center">
          <h1 className="mb-10 text-center text-[32px] font-medium tracking-tight text-foreground lg:text-[44px]">
            Qui écoute ?
          </h1>
          <div className="flex flex-wrap items-start justify-center gap-6 lg:gap-9">
            {!accountsLoaded ? (
              <div className="h-32 w-28 animate-pulse rounded-md bg-white/5 lg:h-40 lg:w-36" />
            ) : (
              profiles.map((name) => <ProfileTile key={name} name={name} onClick={() => pick(name)} />)
            )}
          </div>
        </div>
      ) : (
        /* ===== Step 2 — password for the chosen profile ===== */
        <form onSubmit={submit} className="relative flex w-full max-w-[360px] flex-col items-center">
          <ProfileAvatar name={selected} size={88} />
          <p className="mt-4 text-[22px] font-bold tracking-tight">{selected}</p>
          <p className="mb-7 mt-1 text-[13px] text-muted-foreground/80">Saisis ton mot de passe</p>

          <input
            ref={pwRef}
            id="pw"
            type="password"
            aria-label="Mot de passe"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[4px] border border-white/15 bg-[var(--panel)] px-4 py-3.5 text-center text-[16px] tracking-[0.3em] text-foreground outline-none transition-colors placeholder:tracking-normal placeholder:text-muted-foreground/40 focus:border-white/50"
            placeholder="Mot de passe"
          />
          <div role="alert" className="min-h-[20px] py-2 text-center text-[13px] text-[var(--destructive)]">{error}</div>

          <button
            type="submit"
            disabled={busy || !password}
            className="signal-button w-full rounded-full py-3.5 text-[15px] font-black transition-transform duration-150 hover:scale-[1.02] disabled:opacity-40"
          >
            {busy ? "Connexion…" : "Se connecter"}
          </button>
          <button
            type="button"
            onClick={() => { setSelected(null); setError(""); setPassword(""); }}
            className="mt-5 text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Changer de profil
          </button>
        </form>
      )}
    </div>
  );
}

/** A Netflix-style profile tile: a big rounded avatar that brightens + lifts on
 *  hover, with the name underneath turning white. */
function ProfileTile({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-3">
      <ProfileAvatar name={name} interactive />
      <span className="text-[14px] font-medium text-muted-foreground transition-colors group-hover:text-foreground lg:text-[16px]">
        {name}
      </span>
    </button>
  );
}

/** The avatar square itself — a deterministic colour block with the initial.
 *  `interactive` adds the hover ring + scale used on the selection grid. */
function ProfileAvatar({ name, size, interactive = false }: { name: string; size?: number; interactive?: boolean }) {
  const [c0, c1] = paletteForName(name);
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <span
      className={
        "grid shrink-0 place-items-center overflow-hidden rounded-md font-black text-white/95 " +
        (interactive
          ? "h-28 w-28 ring-0 ring-white transition-all duration-200 group-hover:scale-105 group-hover:ring-4 lg:h-36 lg:w-36"
          : "")
      }
      style={{
        background: `linear-gradient(150deg, ${c0}, ${c1})`,
        width: size, height: size,
        fontSize: size ? size * 0.42 : undefined,
      }}
    >
      {!size && <span className="text-[44px] lg:text-[56px]">{initial}</span>}
      {size && initial}
    </span>
  );
}
