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
  rounded?: number | string;
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
  rounded = 9999,
  className = "",
  showInitials = true,
  colors,
  image,
  fluid = false,
}: ArtworkProps) {
  const [imgError, setImgError] = useState(false);
  const [c1, c2] = colors ?? paletteFor({ title, name, album, trackhash, albumhash, artisthash });

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
          alt={title || name || "Pochette"}
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

  // Fallback artwork: a clean flat colour aplat with a single elegant initial —
  // no diagonal hatch, no stripes, no decorative colour bar. A restrained
  // vertical tone from the deterministic palette gives just enough depth.
  const initials = (title || name || album || "?").charAt(0).toUpperCase();
  const fontSize = Math.max(11, Math.round(size * 0.38));

  return (
    <div
      className={`relative overflow-hidden shrink-0 ${className}`}
      style={{
        ...boxStyle,
        background: `linear-gradient(160deg, ${c1}, ${c2})`,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      role="img"
      aria-label={title || name || album || "Pochette"}
    >
      {showInitials && (
        <span
          className="absolute inset-0 grid place-items-center font-bold text-white/85"
          style={{ fontSize }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
