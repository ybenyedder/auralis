"use client";

import { useEffect, useState } from "react";
import { Users, Play } from "lucide-react";
import { usePlayer } from "@/store/player";
import { api } from "@/lib/auralis/api";
import { paletteForName } from "@/lib/auralis/brand";

/** "Blend du foyer" — a card per other account on this server; tapping plays a mix
 *  that averages both tastes (engine-side). Renders nothing on a single-user server. */
export function BlendShelf() {
  const startBlend = usePlayer((s) => s.startBlend);
  const [others, setOthers] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.get<{ usernames: string[] }>("/api/auth/accounts").catch(() => ({ usernames: [] as string[] })),
      api.get<{ username: string | null }>("/api/auth/status").catch(() => ({ username: null as string | null })),
    ]).then(([acc, st]) => {
      if (cancelled) return;
      const me = (st.username ?? "").toLowerCase();
      setOthers((acc.usernames ?? []).filter((u) => u.toLowerCase() !== me));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (others.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Blend du foyer</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {others.map((u) => {
          const [c0, c1] = paletteForName(u);
          return (
            <button
              key={u}
              onClick={() => void startBlend(u, u)}
              aria-label={`Blend avec ${u}`}
              className="group relative flex flex-col justify-end overflow-hidden rounded-lg p-4 text-left aspect-[1.1]"
              style={{ background: `linear-gradient(150deg, ${c0}, ${c1})` }}
            >
              <Users className="size-7 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" />
              <span className="mt-2 block truncate text-[16px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">Blend avec {u}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-white/80">Vos goûts mélangés</span>
              <span className="signal-button absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Play className="size-5 fill-current ml-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
