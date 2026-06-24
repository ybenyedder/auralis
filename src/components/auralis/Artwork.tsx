"use client";

import { useState } from "react";
import { paletteFor } from "@/lib/auralis/brand";
import { api } from "@/lib/auralis/api";

interface ArtworkProps {
  title?: string;
  name?: string;
  album?: string;
  trackhash?: string;
  albumhash?: string;
  artisthash?: string;
  size?: number;
  rounded?: number;
  className?: string;
  showInitials?: boolean;
  colors?: [string, string, string];
  image?: string;
  /** Let the className drive width/height (e.g. `w-full aspect-square`) instead of
   * locking a fixed pixel box. Required for fluid mobile grids and artwork. */
  fluid?: boolean;
}

export function Artwork({
  title,
  name,
  album,
  trackhash,
  albumhash,
  artisthash,
  size = 48,
  rounded = 11,
  className = "",
  showInitials = true,
  colors,
  image,
  fluid = false,
}: ArtworkProps) {
  const [imgError, setImgError] = useState(false);
  const [c1, c2, c3] = colors ?? paletteFor({ title, name, album, trackhash, albumhash, artisthash });

  const src = api.assetUrl(image);
  const showRealImage = Boolean(src) && !imgError;
  // Fixed-px box for rows/avatars; className-driven box for fluid grids/heroes.
  const boxStyle = fluid ? { borderRadius: rounded } : { width: size, height: size, borderRadius: rounded };

  if (showRealImage) {
    return (
      <div
        className={`relative overflow-hidden shrink-0 ${className}`}
        style={boxStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title || name || "cover"}
          width={fluid ? undefined : size}
          height={fluid ? undefined : size}
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  // Fallback artwork: matte label block, deterministic colors, no decorative glow.
  const initials = (title || name || album || "?").charAt(0).toUpperCase();
  const fontSize = Math.max(10, Math.round(size * 0.36));

  return (
    <div
      className={`relative overflow-hidden shrink-0 ${className}`}
      style={{
        ...boxStyle,
        background:
          `linear-gradient(180deg, ${c1}, ${c2}), repeating-linear-gradient(90deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 7px)`,
        border: "1px solid rgba(237,227,207,0.14)",
      }}
      aria-hidden="true"
    >
      <span
        className="absolute bottom-0 left-0 right-0 h-[18%]"
        style={{ background: c3 }}
      />
      {showInitials && (
        <span
          className="absolute inset-0 grid place-items-center font-black text-white/76"
          style={{ fontSize }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
