"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { HeroSlide } from "@/config/banners";

type Labels = { featured: string; previous: string; next: string; pause: string; play: string; goTo: (index: number) => string };
type Locale = "en" | "bn";

type Props = {
  slides: HeroSlide[];
  labels: Labels;
  locale: Locale;
  autoplayMs?: number;
  transitionMs?: number;
  swipeThreshold?: number;
};

const pick = (value: { en?: string; bn?: string } | undefined, locale: Locale) =>
  (locale === "bn" ? value?.bn : value?.en) || value?.en || "";

export function HeroSlider({ slides, labels, locale, autoplayMs = 7500, transitionMs = 800, swipeThreshold = 45 }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const count = slides.length;
  const activeIndex = count > 0 ? ((index % count) + count) % count : 0;

  const goTo = useCallback((next: number) => {
    if (count < 2) return;
    setIndex(((next % count) + count) % count);
  }, [count]);

  const step = useCallback((delta: number) => {
    setIndex((current) => (current + delta + count) % count);
  }, [count]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (count < 2 || paused || !visible) return;
    const timer = window.setTimeout(() => step(1), autoplayMs);
    return () => window.clearTimeout(timer);
  }, [activeIndex, count, paused, visible, autoplayMs, step]);

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const point = event.touches[0];
    if (point) touchStart.current = { x: point.clientX, y: point.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const point = event.changedTouches[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) < swipeThreshold || Math.abs(dx) <= Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  };

  if (count === 0) return null;

  return (
    <section className="hero-slider" aria-roledescription="carousel" aria-label={labels.featured}>
      <div
        className="hero-slider-stage"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {slides.map((slide, position) => {
          const active = position === activeIndex;
          const title = pick(slide.title, locale);
          const subtitle = pick(slide.subtitle, locale);
          const cta = pick(slide.buttonText, locale);
          return (
            <Link
              key={slide.id}
              href={slide.categoryUrl}
              className={`hero-slide${active ? " is-active" : ""}`}
              aria-hidden={!active}
              tabIndex={active ? 0 : -1}
              draggable={false}
              style={{ transitionDuration: `${transitionMs}ms` }}
            >
              <picture>
                <source media="(max-width: 767px)" srcSet={slide.mobileImage} />
                <img
                  src={slide.desktopImage}
                  alt={slide.alt}
                  width={1600}
                  height={500}
                  loading={position === 0 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                />
              </picture>
              <span className="hero-slider-overlay">
                <span className="hero-slider-content">
                  {title ? <span className="hero-slider-title">{title}</span> : null}
                  {subtitle ? <span className="hero-slider-subtitle">{subtitle}</span> : null}
                  {cta ? <span className="button-primary hero-slider-shop">{cta}</span> : null}
                </span>
              </span>
            </Link>
          );
        })}

        {count > 1 ? (
          <>
            <button type="button" className="hero-slider-arrow prev" aria-label={labels.previous} onClick={() => step(-1)}>
              <ChevronLeft size={22} />
            </button>
            <button type="button" className="hero-slider-arrow next" aria-label={labels.next} onClick={() => step(1)}>
              <ChevronRight size={22} />
            </button>
            <div className="hero-slider-dots">
              {slides.map((slide, position) => (
                <button
                  key={slide.id}
                  type="button"
                  className={position === activeIndex ? "active" : ""}
                  aria-label={labels.goTo(position + 1)}
                  aria-current={position === activeIndex}
                  onClick={() => goTo(position)}
                />
              ))}
            </div>
            <button
              type="button"
              className="hero-slider-pause"
              aria-label={paused ? labels.play : labels.pause}
              aria-pressed={paused}
              onClick={() => setPaused((current) => !current)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}