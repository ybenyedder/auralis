"use client";

// The "Connect" control (Spotify's device picker). Lists the user's other open
// devices and, when one is selected, turns into a live remote: it mirrors that
// device's now-playing and its transport buttons relay commands over the hub.

import { useEffect, useRef, useState } from "react";
import { Laptop, Monitor, MonitorSpeaker, Smartphone, Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { useSync } from "@/store/sync";
import { Artwork } from "./Artwork";
import { formatDuration } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";
import type { DeviceKind } from "@/server/sync";
import type { LiveNowPlaying } from "@/store/sync";

function KindIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  if (kind === "mobile") return <Smartphone className={className} />;
  if (kind === "desktop") return <Laptop className={className} />;
  return <Monitor className={className} />;
}

export function ConnectButton({ variant = "bar" }: { variant?: "bar" | "stage" }) {
  const [open, setOpen] = useState(false);
  const devices = useSync((s) => s.devices);
  const myId = useSync((s) => s.deviceId);
  const controllingId = useSync((s) => s.controllingId);
  const ref = useRef<HTMLDivElement>(null);

  // Only meaningful once there's at least one OTHER device to talk to.
  const others = devices.filter((d) => d.id !== myId);
  const active = !!controllingId;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const stage = variant === "stage";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Appareils — écouter sur un autre appareil"
        aria-pressed={active}
        title="Connect — choisir un appareil"
        className={cn(
          "flex items-center justify-center transition-colors",
          stage ? "grid h-10 w-10 place-items-center" : "",
          active ? "text-[var(--primary)]" : stage ? "text-white/70 hover:text-white" : "text-[var(--text-muted)] hover:text-white",
        )}
      >
        <MonitorSpeaker className={stage ? "size-5" : "size-[18px]"} />
        {active && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--primary)] ring-2 ring-[var(--sidebar)]" />}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-[300px] overflow-hidden rounded-xl bg-[var(--popover)] p-3 shadow-[0_12px_36px_rgba(0,0,0,0.6)]",
            stage ? "bottom-12 left-1/2 -translate-x-1/2" : "bottom-10 right-0",
          )}
        >
          {controllingId ? (
            <RemoteControls deviceId={controllingId} onClose={() => setOpen(false)} />
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 px-1">
                <MonitorSpeaker className="size-4 text-[var(--primary)]" />
                <p className="text-[13px] font-bold text-white">Connexion à un appareil</p>
              </div>
              <DeviceRow current name="Cet appareil" kind={useSync.getState().deviceKind} subtitle="Lecture locale" onClick={() => setOpen(false)} />
              {others.length === 0 ? (
                <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
                  Aucun autre appareil connecté. Ouvre Auralis sur ton téléphone (même compte) pour le piloter d&apos;ici, ou contrôler ce PC depuis le tél.
                </p>
              ) : (
                others.map((d) => (
                  <DeviceRow
                    key={d.id}
                    name={d.name}
                    kind={d.kind}
                    subtitle={d.playing ? "En lecture" : "En pause"}
                    playing={d.playing}
                    onClick={() => {
                      useSync.getState().control(d.id);
                    }}
                  />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceRow({
  name,
  kind,
  subtitle,
  current,
  playing,
  onClick,
}: {
  name: string;
  kind: DeviceKind;
  subtitle: string;
  current?: boolean;
  playing?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06]",
        current && "opacity-90",
      )}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--panel-3)]", playing && "text-[var(--primary)]")}>
        <KindIcon kind={kind} className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-white">{name}</span>
        <span className={cn("block truncate text-[11px]", playing ? "text-[var(--primary)]" : "text-[var(--text-muted)]")}>{subtitle}</span>
      </span>
      {current && <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Ici</span>}
    </button>
  );
}

// Live remote: mirrors the controlled device's now-playing and sends commands. The
// position is interpolated from the last snapshot so the scrubber advances smoothly
// between the (≈4s) updates.
function RemoteControls({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const np = useSync((s) => s.nowPlaying[deviceId]) as LiveNowPlaying | undefined;
  const device = useSync((s) => s.devices.find((d) => d.id === deviceId));
  const command = useSync((s) => s.command);
  const control = useSync((s) => s.control);
  const [now, setNow] = useState(() => Date.now());

  // Tick ~2×/s while the remote plays so the interpolated clock moves.
  useEffect(() => {
    if (!np?.isPlaying) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [np?.isPlaying]);

  // Interpolate from the LOCAL arrival time (receivedAt), not the server-stamped
  // updatedAt — diffing a server clock against this controller's Date.now() would
  // make the scrubber jump or stall whenever the two hosts' clocks differ.
  const livePos = np
    ? Math.min(np.duration || 0, np.position + (np.isPlaying ? Math.max(0, (now - np.receivedAt) / 1000) : 0))
    : 0;
  const pct = np && np.duration > 0 ? Math.min(100, (livePos / np.duration) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-[var(--primary)]">
          <MonitorSpeaker className="size-3.5 shrink-0" />
          <span className="truncate">À l&apos;écoute sur {device?.name ?? "un appareil"}</span>
        </span>
        <button onClick={() => control(null)} className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white">
          Arrêter
        </button>
      </div>

      <div className="flex items-center gap-3 px-1">
        <Artwork
          fluid
          size={56}
          imgSize={64}
          rounded={8}
          title={np?.title}
          image={np?.image}
          className="size-14 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-white">{np?.title ?? "—"}</p>
          <p className="truncate text-[12px] text-[var(--text-muted)]">{np?.artist ?? ""}</p>
        </div>
      </div>

      <div className="mt-3 px-1">
        <div
          className="group relative h-1.5 w-full cursor-pointer rounded-full bg-white/15"
          onClick={(e) => {
            if (!np || !np.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            command("seek", Math.round(ratio * np.duration));
          }}
        >
          <div className="h-full rounded-full bg-white group-hover:bg-[var(--primary)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[var(--text-muted)]">
          <span>{formatDuration(livePos)}</span>
          <span>{formatDuration(np?.duration ?? 0)}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-6">
        <button onClick={() => command("prev")} aria-label="Précédent" className="text-white/80 transition-colors hover:text-white">
          <SkipBack className="size-5 fill-current" />
        </button>
        <button
          onClick={() => command(np?.isPlaying ? "pause" : "play")}
          aria-label={np?.isPlaying ? "Pause" : "Lecture"}
          className="grid size-11 place-items-center rounded-full bg-white text-black transition-transform active:scale-95"
        >
          {np?.isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current ml-0.5" />}
        </button>
        <button onClick={() => command("next")} aria-label="Suivant" className="text-white/80 transition-colors hover:text-white">
          <SkipForward className="size-5 fill-current" />
        </button>
      </div>

      <button onClick={onClose} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--panel-3)] py-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white">
        <X className="size-3" /> Fermer
      </button>
    </div>
  );
}
