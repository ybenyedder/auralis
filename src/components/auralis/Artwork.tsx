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
  /** Intended on-screen px of the longest edge — picks the thumbnail variant to
   * download. Defaults to `size` (fixed) or a card-sized bucket (fluid). Pass a
   * big value (or 0) on heroes/fullscreen to fetch the full-resolution original. */
  imgSize?: number;
}

// Square webp buckets the art API can serve (mirror of ART_VARIANT_SIZES).
const ART_BUCKETS = [96, 160, 256, 384, 640];

/** Append `?w=<bucket>` so we fetch a right-sized thumbnail instead of the full
 * (often multi-MB) original. Targets ~2× the CSS px for crisp HiDPI without a
 * hydration-unsafe devicePixelRatio read; anything larger than the top bucket
 * keeps the original. */
export function sizedArt(src: string, intended: number): string {
  if (!src || intended <= 0 || !src.includes("/api/art/")) return src;
  const target = intended * 2;
  const bucket = ART_BUCKETS.find((b) => b >= target);
  if (!bucket) return src; // bigger than every bucket → serve the original
  return `${src}${src.includes("?") ? "&" : "?"}w=${bucket}`;
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
  imgSize,
}: ArtworkProps) {
  const [imgError, setImgError] = useState(false);
  const [c1, c2] = colors ?? paletteFor({ title, name, album, trackhash, albumhash, artisthash });

  const src = sizedArt(api.assetUrl(image) ?? "", imgSize ?? (fluid ? 220 : size));

  // Virtualized lists RECYCLE Artwork instances as rows scroll in/out — the same
  // component renders a new track's `src` without remounting. Without resetting the
  // error flag when `src` changes, one broken cover would stick the fallback on every
  // subsequent track that reuses the instance. This render-phase reset (React's
  // "adjust state when a prop changes" pattern) clears it synchronously, no flash.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setImgError(false);
  }

  const showRealImage = Boolean(src) && !imgError;
  const gradient = `linear-gradient(160deg, ${c1}, ${c2})`;
  // Fixed-px box for rows/avatars; className-driven box for fluid grids/heroes.
  const boxStyle = fluid ? { borderRadius: rounded } : { width: size, height: size, borderRadius: rounded };

  if (showRealImage) {
    return (
      <div
        className={`relative overflow-hidden shrink-0 ${className}`}
        // Paint the deterministic gradient BEHIND the lazy <img> so a not-yet-loaded
        // (or recycled) cover shows colour instead of a blank box — no skeleton flash.
        style={{ ...boxStyle, background: gradient }}
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
        background: gradient,
        border: "1px solid var(--line)",
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
