"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/auralis/api";
import { useT } from "@/lib/auralis/i18n";
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
    return <div suppressHydrationWarning className="grid h-screen w-screen place-items-center bg-background text-muted-foreground/70 text-[12px]">…</div>;
  }
  if (phase === "locked") {
    return <LoginScreen onUnlock={() => setPhase("unlocked")} />;
  }
  return <>{children}</>;
}

function LoginScreen({ onUnlock }: { onUnlock: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, [mode]);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    setConfirmPassword("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanUser = username.trim();
    if (cleanUser.length < 2) {
      setError(t("auth.usernameInvalid", "Identifiant invalide (2 à 32 caractères)."));
      userRef.current?.focus();
      return;
    }
    if (mode === "register") {
      if (password.length < 6) {
        setError(t("auth.passwordTooShort", "6 caractères minimum."));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("auth.passwordMismatch", "Les mots de passe ne correspondent pas."));
        return;
      }
    }

    setBusy(true);
    setError("");
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(api.url(endpoint), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUser, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok) {
        setError(
          data.error ||
            (mode === "register"
              ? t("auth.denied", "Impossible de créer ce compte.")
              : t("auth.wrongPassword", "Identifiant ou mot de passe incorrect")),
        );
        setBusy(false);
        return;
      }
      if (data.token) api.setToken(data.token);
      try {
        window.localStorage.removeItem("auralis.vault.v1");
      } catch {
        /* ignore */
      }
      onUnlock();
    } catch {
      setError(t("toast.serverUnreachable", "Serveur injoignable"));
      setBusy(false);
    }
  };

  return (
    <div
      className="relative grid min-h-screen w-screen place-items-center overflow-hidden bg-[#0e0e11] px-4 py-8 text-foreground"
      suppressHydrationWarning
    >
      {/* Subtle Liner ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[var(--primary)]/15 blur-[130px]"
      />

      <div className="matte-panel relative w-full max-w-[410px] rounded-[28px] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-[var(--primary)]/15 text-[var(--primary)] ring-1 ring-[var(--primary)]/25">
            <AuralisGlyph className="size-8" />
          </div>
          <h1 className="text-[24px] font-bold tracking-tight text-foreground">
            {t("auth.welcomeTitle", "Auralis")}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            {mode === "login"
              ? t("auth.welcomeSubtitle", "Connecte-toi à ta bibliothèque musicale")
              : t("auth.registerSubtitle", "Crée ton compte personnel en quelques secondes")}
          </p>
        </div>

        {/* Liner segmented pill toggle */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-[var(--panel-2)] p-1 ring-1 ring-white/[0.04]">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`rounded-full py-2 text-[13px] font-semibold transition-all ${
              mode === "login"
                ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.signIn", "Se connecter")}
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`rounded-full py-2 text-[13px] font-semibold transition-all ${
              mode === "register"
                ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.signUp", "Créer un compte")}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label htmlFor="auth-username" className="mb-1.5 block pl-1 text-[12px] font-semibold text-muted-foreground">
              {t("auth.username", "Identifiant")}
            </label>
            <input
              ref={userRef}
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("auth.usernamePlaceholder", "Ton pseudo")}
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1.5 block pl-1 text-[12px] font-semibold text-muted-foreground">
              {t("auth.enterPassword", "Mot de passe")}
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.enterPassword", "Mot de passe")}
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 pr-11 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Masquer" : "Afficher"}
                className="absolute right-2.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-4">
                  {showPw ? (
                    <>
                      <path d="M3 3l18 18" strokeLinecap="round" />
                      <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" strokeLinecap="round" />
                      <path d="M9.36 5.36A9.4 9.4 0 0 1 12 5c5 0 9 7 9 7a16.8 16.8 0 0 1-3.17 4.24" strokeLinecap="round" />
                      <path d="M6.61 6.61A16.5 16.5 0 0 0 3 12s4 7 9 7a9.7 9.7 0 0 0 4.39-1.05" strokeLinecap="round" />
                    </>
                  ) : (
                    <>
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="auth-confirm" className="mb-1.5 block pl-1 text-[12px] font-semibold text-muted-foreground">
                {t("auth.confirmPassword", "Confirmer le mot de passe")}
              </label>
              <input
                id="auth-confirm"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("auth.confirmPassword", "Confirmer le mot de passe")}
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-[var(--primary)]"
              />
            </div>
          )}

          <div role="alert" className="min-h-[20px] pt-0.5 text-center text-[13px] font-medium text-[var(--destructive)]">
            {error}
          </div>

          <button
            type="submit"
            disabled={busy || !username.trim() || !password || (mode === "register" && !confirmPassword)}
            className="signal-button w-full rounded-full py-3.5 text-[15px] font-bold transition-transform active:scale-[0.99] disabled:opacity-40"
          >
            {busy
              ? mode === "register"
                ? t("auth.signingUp", "Création…")
                : t("auth.signingIn", "Connexion…")
              : mode === "register"
                ? t("auth.signUp", "Créer un compte")
                : t("auth.signIn", "Se connecter")}
          </button>
        </form>

        <p className="mt-5 text-center text-[12.5px] text-muted-foreground">
          {mode === "login"
            ? t("auth.noAccountYet", "Pas encore de compte ?")
            : t("auth.alreadyHaveAccount", "Déjà un compte ?")}{" "}
          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
            className="font-semibold text-[var(--primary)] hover:underline"
          >
            {mode === "login"
              ? t("auth.signUp", "Créer un compte")
              : t("auth.signIn", "Se connecter")}
          </button>
        </p>
      </div>
    </div>
  );
}
