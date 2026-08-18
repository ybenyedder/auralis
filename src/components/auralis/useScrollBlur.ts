"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Hook pour détecter le scroll et appliquer un effet de blur progressif
 * Similaire à l'effet Haze sur Android — le blur s'intensifie au fur et à mesure du scroll
 *
 * @param threshold - Seuil de scroll (px) avant que l'effet ne commence (défaut: 60)
 * @param maxBlur - Blur maximum (px) à appliquer (défaut: 24)
 * @returns { blurAmount, scrollProgress } - blurAmount en pixels, scrollProgress 0-1
 */
export function useScrollBlur(threshold: number = 60, maxBlur: number = 24) {
  const [blurAmount, setBlurAmount] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let ticking = false;

    const updateBlur = () => {
      const scrollY = window.scrollY;
      const scrollDelta = Math.abs(scrollY - lastScrollY.current);

      // Calculer la progression du scroll (0 = pas de scroll, 1 = scroll complet)
      const progress = Math.min(scrollY / threshold, 1);
      setScrollProgress(progress);

      // Calculer le blur basé sur la progression
      const blur = progress * maxBlur;
      setBlurAmount(blur);

      lastScrollY.current = scrollY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateBlur);
        ticking = true;
      }
    };

    // Initialiser
    updateBlur();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold, maxBlur]);

  return { blurAmount, scrollProgress };
}

/**
 * Hook pour détecter le scroll d'un conteneur spécifique (pas toute la fenêtre)
 *
 * @param containerRef - Référence du conteneur à surveiller
 * @param threshold - Seuil de scroll (px) avant que l'effet ne commence
 * @param maxBlur - Blur maximum (px) à appliquer
 */
export function useContainerScrollBlur(
  containerRef: React.RefObject<HTMLElement>,
  threshold: number = 60,
  maxBlur: number = 24
) {
  const [blurAmount, setBlurAmount] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ticking = false;

    const updateBlur = () => {
      const scrollTop = container.scrollTop;
      const progress = Math.min(scrollTop / threshold, 1);
      setScrollProgress(progress);
      setBlurAmount(progress * maxBlur);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateBlur);
        ticking = true;
      }
    };

    updateBlur();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef, threshold, maxBlur]);

  return { blurAmount, scrollProgress };
}
