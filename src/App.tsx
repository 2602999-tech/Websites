import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BITS,
  FLAVOURS,
  HERO_BITS,
  INSIDE_STEPS,
  INTRO_VIDEO_URL,
  clamp,
  cubicBezier,
  easeInOutSine,
  hexToRgba,
  lerp,
  sprStyle,
} from './data';
import { type BarPose, type BarStage, createBarStage } from './bar3d';

const ARC_SLOTS = [
  { dx: 0, dy: 0, h: 430, rz: 0, ry: 0 },
  { dx: 245, dy: 24, h: 330, rz: 4, ry: 16 },
  { dx: 452, dy: 44, h: 312, rz: 8, ry: 26 },
  { dx: 660, dy: 80, h: 296, rz: 12, ry: 34 },
  { dx: 860, dy: 118, h: 280, rz: 15, ry: 40 },
];

const easeSlide = cubicBezier(0.25, 0.75, 0.2, 1);
const easeEntrance = cubicBezier(0.16, 1, 0.3, 1);

interface StormPiece {
  a: number;
  ph: number;
  spin: number;
  size: number;
  useActive: boolean;
  altBit: number;
}

function createStormPieces(): StormPiece[] {
  let seed = 42069;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: 20 }, (_, i) => ({
    a: rand() * Math.PI * 2,
    ph: i / 20 + rand() * 0.03,
    spin: (rand() < 0.5 ? -1 : 1) * 360,
    size: 0.7 + rand() * 0.7,
    useActive: (i * 7) % 10 < 7,
    altBit: Math.floor(rand() * 5),
  }));
}

const STORM_PIECES = createStormPieces();

function lerpPose(a: BarPose, b: BarPose, t: number): BarPose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    h: lerp(a.h, b.h, t),
    rz: lerp(a.rz, b.rz, t),
    ry: lerp(a.ry, b.ry, t),
    rx: lerp(a.rx, b.rx, t),
    z: lerp(a.z, b.z, t),
    op: lerp(a.op, b.op, t),
    sx: lerp(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
    shadow: lerp(a.shadow, b.shadow, t),
  };
}

function StrideMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="18" className="disc" />
      <path
        className="mtn"
        d="M6.5 25.5L13.6 13.4L18.4 20.6L21.8 15.6L29.5 25.5H6.5Z"
      />
    </svg>
  );
}

function StepIcon({ idx }: { idx: number }) {
  if (idx === 0) {
    return (
      <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 21C5 12 11 6 21 5c-1 10-7 16-16 16Z" />
        <path d="M5 21c4-4 8-7 12-10" />
      </svg>
    );
  }
  if (idx === 1) {
    return (
      <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <ellipse cx="9" cy="8.5" rx="2.6" ry="4.2" transform="rotate(-24 9 8.5)" />
        <ellipse cx="17" cy="8.5" rx="2.6" ry="4.2" transform="rotate(24 17 8.5)" />
        <ellipse cx="9" cy="17.5" rx="2.6" ry="4.2" transform="rotate(24 9 17.5)" />
        <ellipse cx="17" cy="17.5" rx="2.6" ry="4.2" transform="rotate(-24 17 17.5)" />
      </svg>
    );
  }
  if (idx === 2) {
    return (
      <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 21.5s-7.5-4.7-7.5-10.4A4.4 4.4 0 0 1 13 8.1a4.4 4.4 0 0 1 7.5 3c0 5.7-7.5 10.4-7.5 10.4Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 3.5L6.5 14.5h6l-1 8 8-11h-6l1-8Z" />
    </svg>
  );
}

export default function App() {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // React state for UI & builder
  const [activeFlavour, setActiveFlavour] = useState(1); // Berry Oat (index 1, counter 02)
  const [autoplay, setAutoplay] = useState(!prefersReducedMotion);
  const [insideStep, setInsideStep] = useState(0);
  const [navSection, setNavSection] = useState<'flavors' | 'inside' | 'shop' | 'range'>('flavors');
  const [navTheme, setNavTheme] = useState<'default' | 'light' | 'dark'>('default');
  const [cartCount, setCartCount] = useState(0);
  const [pack, setPack] = useState<Array<number | null>>([null, null, null]);
  const [buyState, setBuyState] = useState<'idle' | 'added'>('idle');
  const [shopRevealed, setShopRevealed] = useState(prefersReducedMotion);
  const [rangeRevealed, setRangeRevealed] = useState(prefersReducedMotion);

  // Intro state
  const [introPhase, setIntroPhase] = useState<'video' | 'cream' | 'out' | 'gone'>(
    prefersReducedMotion ? 'gone' : 'video',
  );
  const [heroEntered, setHeroEntered] = useState(prefersReducedMotion);

  // Refs for DOM elements
  const introRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const pillHlRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const basketRef = useRef<HTMLButtonElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);

  const heroRef = useRef<HTMLElement | null>(null);
  const revealRef = useRef<HTMLDivElement | null>(null);
  const ringsRef = useRef<HTMLDivElement | null>(null);
  const arcRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const countRef = useRef<HTMLDivElement | null>(null);
  const bitRefs = useRef<Array<HTMLDivElement | null>>([]);

  const insideRef = useRef<HTMLElement | null>(null);
  const inDarkRef = useRef<HTMLDivElement | null>(null);
  const inBackFrameRef = useRef<HTMLDivElement | null>(null);
  const inFrontRef = useRef<HTMLDivElement | null>(null);
  const inFrontFrameRef = useRef<HTMLDivElement | null>(null);
  const inNumRef = useRef<HTMLDivElement | null>(null);
  const inBarRef = useRef<HTMLDivElement | null>(null);
  const inHeadRef = useRef<HTMLHeadingElement | null>(null);
  const inCapRef = useRef<HTMLDivElement | null>(null);
  const stormBitRefs = useRef<Array<HTMLDivElement | null>>([]);

  const shopRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardPkRefs = useRef<Array<HTMLDivElement | null>>([]);

  const rangeRef = useRef<HTMLElement | null>(null);
  const slotBarRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Mutable animation engine ref
  const engineRef = useRef({
    stage: null as BarStage | null,
    pos: prefersReducedMotion ? 1 : -2.6,
    target: 1,
    activeFlav: 1,
    slideActive: false,
    slideFrom: 1,
    slideTo: 1,
    slideStart: 0,
    slideDur: 0,
    slideEase: easeSlide,
    slideChangedFlav: false,

    revealActive: false,
    revealStart: 0,
    revealColor: '#ab9ac4',

    lastInteraction: performance.now(),
    dragging: false,
    dragPointerId: -1,
    dragStartX: 0,
    dragStartPos: 1,
    dragMoved: false,
    dragVel: 0,
    dragLastX: 0,
    dragLastT: 0,

    // Section 2 flip
    curStep: 0,
    flipRy: 0,
    flipFromRy: 0,
    flipToRy: 0,
    flipStart: 0,
    flipDur: 0,
    flipActive: false,
    textSwapTimeout: 0 as number,

    // Card hover tilt + poke on live card
    cardTilt: FLAVOURS.map(() => ({ x: 0, y: 0 })),
    pokeStart: -1,

    // Smooth scroll
    smoothActive: false,
    smoothCur: 0,
    smoothTarget: 0,
    isTouch: false,

    // Autoplay & reduced motion
    autoplay: !prefersReducedMotion,
    reduced: prefersReducedMotion,
    heroEntered: prefersReducedMotion,
    scrolledCardOnce: false,
    packTouched: false,
    packAutoFilled: false,
    navSection: 'flavors' as 'flavors' | 'inside' | 'shop' | 'range',
    navTheme: 'default' as 'default' | 'light' | 'dark',
  });

  // Measure canvas for hero title font-size calculation
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const getMeasureCtx = useCallback(() => {
    if (!measureCtxRef.current) {
      const c = document.createElement('canvas');
      measureCtxRef.current = c.getContext('2d');
    }
    return measureCtxRef.current!;
  }, []);

  const updateTitleSize = useCallback(
    (name?: string) => {
      const el = titleRef.current;
      if (!el) return;
      const flavName = (name ?? FLAVOURS[engineRef.current.activeFlav].name).toUpperCase();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ctx = getMeasureCtx();
      ctx.font = '400 100px "Archivo Black", sans-serif';

      if (vw < 820) {
        if (window.matchMedia('(max-width: 900px) and (max-height: 500px) and (orientation: landscape)').matches) {
          el.style.fontSize = '';
          return;
        }
        const words = flavName.split(' ');
        let maxW = 1;
        for (const w of words) {
          maxW = Math.max(maxW, ctx.measureText(w).width);
        }
        const base = clamp(0.125 * vw, 40, 64);
        const fitted = ((vw - 36) * 100) / maxW;
        el.style.fontSize = `${Math.min(base, fitted)}px`;
      } else {
        const u = Math.min(vw / 1440, vh / 900);
        const w = Math.max(1, ctx.measureText(flavName).width);
        const fitted = (760 * u * 100) / w;
        el.style.fontSize = `${Math.min(96 * u, fitted)}px`;
      }
    },
    [getMeasureCtx],
  );

  const buildTitleLayer = useCallback((name: string) => {
    const layer = document.createElement('span');
    layer.className = 'title-layer title-cur';
    const words = name.toUpperCase().split(' ');
    const charSpans: HTMLElement[] = [];
    words.forEach((word, wi) => {
      const wSpan = document.createElement('span');
      wSpan.className = 'word';
      for (const ch of word) {
        const cSpan = document.createElement('span');
        cSpan.className = 'ch';
        cSpan.textContent = ch;
        wSpan.appendChild(cSpan);
        charSpans.push(cSpan);
      }
      layer.appendChild(wSpan);
      if (wi < words.length - 1) {
        layer.appendChild(document.createTextNode(' '));
      }
    });
    return { layer, charSpans };
  }, []);

  const swapHeroTitle = useCallback(
    (name: string, dir: number, instant: boolean) => {
      const titleEl = titleRef.current;
      if (!titleEl) return;
      updateTitleSize(name);

      // Remove any existing old layers
      titleEl.querySelectorAll('.title-old').forEach((n) => n.remove());
      const curLayer = titleEl.querySelector('.title-cur') as HTMLElement | null;

      if (curLayer && !instant) {
        curLayer.classList.remove('title-cur');
        curLayer.classList.add('title-old');
        const oldChars = Array.from(curLayer.querySelectorAll('.ch')) as HTMLElement[];
        let maxEnd = 0;
        oldChars.forEach((ch, idx) => {
          const delay = 11 * idx;
          maxEnd = Math.max(maxEnd, delay + 300);
          ch.animate(
            [
              { transform: 'translateY(0)', opacity: 1 },
              { transform: `translateY(${-110 * dir}%)`, opacity: 0 },
            ],
            {
              duration: 300,
              delay,
              easing: 'cubic-bezier(0.45, 0, 0.75, 0.3)',
              fill: 'forwards',
            },
          );
        });
        window.setTimeout(() => {
          curLayer.remove();
        }, maxEnd + 30);
      } else if (curLayer) {
        curLayer.remove();
      }

      const { layer, charSpans } = buildTitleLayer(name);
      titleEl.appendChild(layer);

      if (!instant) {
        charSpans.forEach((ch, idx) => {
          ch.animate(
            [
              { transform: `translateY(${110 * dir}%)`, opacity: 0 },
              { transform: 'translateY(0)', opacity: 1 },
            ],
            {
              duration: 620,
              delay: 120 + 22 * idx,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both',
            },
          );
        });
      }
    },
    [buildTitleLayer, updateTitleSize],
  );

  const swapHeroCounter = useCallback((numStr: string, instant: boolean) => {
    const el = countRef.current;
    if (!el) return;
    let span = el.querySelector('span');
    if (!span) {
      span = document.createElement('span');
      el.appendChild(span);
    }
    if (instant) {
      span.textContent = numStr;
      return;
    }
    span.getAnimations().forEach((a) => a.cancel());
    span.animate(
      [
        { translate: '0 0', opacity: 1 },
        { translate: '0 -10px', opacity: 0 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
    );
    window.setTimeout(() => {
      if (!span) return;
      span.textContent = numStr;
      span.animate(
        [
          { translate: '0 14px', opacity: 0 },
          { translate: '0 0', opacity: 1 },
        ],
        { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
      );
    }, 220 + 60);
  }, []);

  const crossfadeInsideText = useCallback(
    (stepIdx: number, flavIdx: number, instant: boolean) => {
      const headEl = inHeadRef.current;
      const numEl = inNumRef.current;
      const capEl = inCapRef.current;
      const step = INSIDE_STEPS[stepIdx];
      const flav = FLAVOURS[flavIdx];
      const headLines = stepIdx === 3 ? flav.name.toUpperCase().split(' ') : step.head;

      const apply = () => {
        if (numEl) numEl.textContent = step.num;
        if (headEl) {
          headEl.innerHTML = '';
          headLines.forEach((word) => {
            const sp = document.createElement('span');
            sp.className = word.length > 9 ? 'line sm' : 'line';
            sp.textContent = word;
            headEl.appendChild(sp);
          });
        }
        if (capEl) {
          capEl.innerHTML = '';
          step.cap.forEach((line) => {
            const sp = document.createElement('span');
            sp.textContent = line;
            capEl.appendChild(sp);
          });
        }
      };

      if (instant) {
        apply();
        return;
      }

      const targets = [headEl, numEl, capEl].filter(Boolean) as HTMLElement[];
      targets.forEach((t) => {
        t.getAnimations().forEach((a) => a.cancel());
        t.animate(
          [
            { translate: '0 0', opacity: 1 },
            { translate: '0 -10px', opacity: 0 },
          ],
          { duration: 240, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
        );
      });

      window.setTimeout(() => {
        apply();
        targets.forEach((t) => {
          t.animate(
            [
              { translate: '0 14px', opacity: 0 },
              { translate: '0 0', opacity: 1 },
            ],
            { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
          );
        });
      }, 240 + 40);
    },
    [],
  );

  const finishReveal = useCallback(() => {
    const eng = engineRef.current;
    if (!eng.revealActive) return;
    eng.revealActive = false;
    document.documentElement.style.setProperty('--flav', eng.revealColor);
    const rev = revealRef.current;
    if (rev) {
      rev.style.setProperty('--rv', 'transparent');
      rev.style.maskImage = '';
      rev.style.webkitMaskImage = '';
    }
  }, []);

  const triggerFlavourChange = useCallback(
    (newFlav: number, dir: number, instant: boolean) => {
      const eng = engineRef.current;
      if (newFlav === eng.activeFlav) return;
      eng.activeFlav = newFlav;
      setActiveFlavour(newFlav);

      const flav = FLAVOURS[newFlav];
      if (instant) {
        finishReveal();
        document.documentElement.style.setProperty('--flav', flav.color);
      } else {
        finishReveal();
        eng.revealColor = flav.color;
        eng.revealActive = true;
        eng.revealStart = performance.now();
        const rev = revealRef.current;
        if (rev) {
          rev.style.setProperty('--rv', flav.color);
        }
      }

      swapHeroTitle(flav.name, dir, instant);
      swapHeroCounter(`0${newFlav + 1}`, instant);

      if (eng.curStep === 3) {
        crossfadeInsideText(3, newFlav, instant);
      }
    },
    [crossfadeInsideText, finishReveal, swapHeroCounter, swapHeroTitle],
  );

  const goTo = useCallback(
    (newTarget: number, customDuration?: number) => {
      const eng = engineRef.current;
      eng.lastInteraction = performance.now();
      const oldTarget = eng.target;
      eng.target = newTarget;
      const slots = Math.abs(newTarget - eng.pos);
      const dur = eng.reduced
        ? 0
        : customDuration ?? 650 + Math.max(0, Math.round(slots) - 1) * 160;
      const newFlav = ((Math.round(newTarget) % 5) + 5) % 5;
      const dir = newTarget >= oldTarget ? 1 : -1;

      if (dur <= 0) {
        eng.pos = newTarget;
        eng.slideActive = false;
        eng.slideChangedFlav = true;
        triggerFlavourChange(newFlav, dir, true);
        return;
      }

      eng.slideActive = true;
      eng.slideFrom = eng.pos;
      eng.slideTo = newTarget;
      eng.slideStart = performance.now();
      eng.slideDur = dur;
      eng.slideEase = easeSlide;
      eng.slideChangedFlav = false;
    },
    [triggerFlavourChange],
  );

  // Sync nav active pill underline position
  const updatePillHighlight = useCallback((section: string) => {
    const pill = pillRef.current;
    const hl = pillHlRef.current;
    const link = linkRefs.current[section];
    if (!pill || !hl || !link) return;
    const pr = pill.getBoundingClientRect();
    const lr = link.getBoundingClientRect();
    hl.style.left = `${lr.left - pr.left}px`;
    hl.style.width = `${lr.width}px`;
  }, []);

  useEffect(() => {
    updatePillHighlight(navSection);
  }, [navSection, updatePillHighlight]);

  // Fly to cart helper
  const flyToCart = useCallback(
    (sources: Array<{ el: HTMLElement | null; box: [number, number, number, number] }>, onComplete: () => void) => {
      const eng = engineRef.current;
      const basketEl = basketRef.current;
      if (eng.reduced || !basketEl) {
        onComplete();
        return;
      }

      const valid = sources.filter((s) => s.el !== null) as Array<{
        el: HTMLElement;
        box: [number, number, number, number];
      }>;
      if (valid.length === 0) {
        onComplete();
        return;
      }

      let finished = 0;
      const br = basketEl.getBoundingClientRect();
      const bx = br.left + br.width / 2;
      const by = br.top + br.height / 2;

      valid.forEach((src, i) => {
        const sr = src.el.getBoundingClientRect();
        const clone = document.createElement('div');
        clone.className = 'spr';
        const spr = sprStyle(src.box, 4);
        clone.style.position = 'fixed';
        clone.style.left = `${sr.left}px`;
        clone.style.top = `${sr.top}px`;
        clone.style.width = `${sr.width}px`;
        clone.style.height = `${sr.height}px`;
        clone.style.backgroundSize = spr.backgroundSize;
        clone.style.backgroundPosition = spr.backgroundPosition;
        clone.style.zIndex = '70';
        clone.style.pointerEvents = 'none';
        clone.style.filter = 'drop-shadow(0 10px 14px rgba(0,0,0,.25))';
        clone.style.transformOrigin = 'center center';
        document.body.appendChild(clone);

        const sx = sr.left + sr.width / 2;
        const sy = sr.top + sr.height / 2;
        const dx = bx - sx;
        const dy = by - sy;
        const k = Math.min(0.2, 30 / Math.max(1, sr.height));
        const lift = Math.min(160, 0.35 * Math.abs(dy) + 60);

        const anim = clone.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)', opacity: 1 },
            {
              transform: `translate3d(${0.4 * dx}px, ${0.4 * dy - lift}px, 0) scale(${0.45 + k}) rotate(-10deg)`,
              opacity: 1,
              offset: 0.45,
            },
            {
              transform: `translate3d(${dx}px, ${dy}px, 0) scale(${k}) rotate(-18deg)`,
              opacity: 0.15,
            },
          ],
          {
            duration: 900,
            delay: i * 120,
            easing: 'cubic-bezier(0.5, 0, 0.2, 1)',
            fill: 'forwards',
          },
        );

        anim.onfinish = () => {
          clone.remove();
          basketEl.animate(
            [
              { transform: 'scale(1)' },
              { transform: 'scale(1.18)', offset: 0.45 },
              { transform: 'scale(1)' },
            ],
            { duration: 320, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' },
          );
          finished += 1;
          if (finished === valid.length) {
            onComplete();
          }
        };
      });
    },
    [],
  );

  const incrementCart = useCallback(() => {
    setCartCount((c) => c + 1);
    const badge = badgeRef.current;
    if (badge && !engineRef.current.reduced) {
      badge.animate(
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.5)', opacity: 1, offset: 0.6 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 350, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)', fill: 'forwards' },
      );
    }
  }, []);

  const pulseGlow = useCallback(() => {
    if (engineRef.current.reduced) return;
    glowRef.current?.animate([{ opacity: 0.55 }, { opacity: 1 }], {
      duration: 600,
      easing: 'ease-out',
    });
  }, []);

  // Intro & Hero entrance sequence
  useEffect(() => {
    const eng = engineRef.current;

    // Initialize hero title & counter immediately
    if (titleRef.current && !titleRef.current.querySelector('.title-cur')) {
      const { layer } = buildTitleLayer(FLAVOURS[1].name);
      titleRef.current.appendChild(layer);
    }
    if (countRef.current) {
      const sp = countRef.current.querySelector('span');
      if (sp) sp.textContent = '02';
    }
    updateTitleSize(FLAVOURS[1].name);
    document.fonts.ready.then(() => {
      updateTitleSize();
      updatePillHighlight(engineRef.current.navSection);
    });

    const startBitsDrift = () => {
      bitRefs.current.forEach((el, i) => {
        if (!el) return;
        const cfg = HERO_BITS[i];
        if (eng.reduced) {
          el.style.opacity = '0.55';
          el.style.transform = `translate(-50%, -50%) rotate(${cfg.rot}deg)`;
          return;
        }
        el.animate([{ opacity: 0 }, { opacity: 0.6 }], {
          duration: 900,
          delay: 300 + 90 * i,
          easing: 'ease-out',
          fill: 'forwards',
        });
        const dx = (i % 2 === 0 ? 1 : -1) * (12 + (i % 3));
        const dy = -(22 + 3 * i);
        const drot = (i % 2 === 0 ? 1 : -1) * (10 + (i % 3));
        el.animate(
          [
            { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
            { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${drot}deg)` },
            { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          ],
          {
            duration: 7000 + 900 * i,
            iterations: Infinity,
            easing: 'ease-in-out',
            composite: 'add',
          },
        );
      });
    };

    if (eng.reduced) {
      document.body.classList.remove('locked');
      setIntroPhase('gone');
      setHeroEntered(true);
      eng.heroEntered = true;
      eng.pos = 1;
      eng.target = 1;
      startBitsDrift();
      return;
    }

    document.body.classList.add('locked');
    let entered = false;
    let stampShown = false;
    let videoStarted = false;
    let stampTimer = 0;
    let holdTimer = 0;
    let failsafeTimer = 0;
    let outTimer = 0;

    const enterHero = () => {
      if (entered) return;
      entered = true;
      window.clearTimeout(stampTimer);
      window.clearTimeout(holdTimer);
      window.clearTimeout(failsafeTimer);
      document.body.classList.remove('locked');
      setIntroPhase('out');
      outTimer = window.setTimeout(() => setIntroPhase('gone'), 420);

      setHeroEntered(true);
      eng.heroEntered = true;
      eng.lastInteraction = performance.now();
      eng.slideActive = true;
      eng.slideFrom = -2.6;
      eng.slideTo = 1;
      eng.slideStart = performance.now();
      eng.slideDur = 1700;
      eng.slideEase = easeEntrance;
      eng.slideChangedFlav = true;
      startBitsDrift();
    };

    const showStamp = () => {
      if (stampShown || entered) return;
      stampShown = true;
      const vid = videoRef.current;
      if (vid) {
        vid.pause();
        vid.classList.add('hidden');
      }
      setIntroPhase('cream');
      holdTimer = window.setTimeout(enterHero, 380 + 650);
    };

    const vid = videoRef.current;
    const tryPlay = () => {
      if (!vid || videoStarted || stampShown || entered) return;
      videoStarted = true;
      try {
        vid.currentTime = 0.55;
      } catch {
        // ignore seek error before metadata
      }
      vid.play().catch(() => {
        showStamp();
      });
    };

    const onTimeUpdate = () => {
      if (vid && vid.currentTime >= 4.6) {
        showStamp();
      }
    };

    if (vid) {
      if (vid.readyState >= 3) {
        tryPlay();
      } else {
        vid.addEventListener('canplay', tryPlay, { once: true });
      }
      vid.addEventListener('timeupdate', onTimeUpdate);
      vid.addEventListener('ended', showStamp, { once: true });
      vid.addEventListener('error', showStamp, { once: true });
    }

    stampTimer = window.setTimeout(() => {
      if (!videoStarted) showStamp();
    }, 3500);

    failsafeTimer = window.setTimeout(enterHero, 9000);

    // Expose skip handler on intro button via window event or ref
    const skipBtn = document.getElementById('skip');
    skipBtn?.addEventListener('click', enterHero);

    return () => {
      window.clearTimeout(stampTimer);
      window.clearTimeout(holdTimer);
      window.clearTimeout(failsafeTimer);
      window.clearTimeout(outTimer);
      document.body.classList.remove('locked');
      skipBtn?.removeEventListener('click', enterHero);
      if (vid) {
        vid.removeEventListener('canplay', tryPlay);
        vid.removeEventListener('timeupdate', onTimeUpdate);
        vid.removeEventListener('ended', showStamp);
        vid.removeEventListener('error', showStamp);
      }
    };
  }, [buildTitleLayer, updatePillHighlight, updateTitleSize]);

  // IntersectionObservers for Shop reveal, Range reveal & initial 3-pack auto-fill
  useEffect(() => {
    const shopEl = shopRef.current;
    const rangeEl = rangeRef.current;
    const observers: IntersectionObserver[] = [];

    if (shopEl && !shopRevealed) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setShopRevealed(true);
            io.disconnect();
          }
        },
        { threshold: 0.18 },
      );
      io.observe(shopEl);
      observers.push(io);
    }

    if (rangeEl) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setRangeRevealed(true);
            const eng = engineRef.current;
            if (!eng.packTouched && !eng.packAutoFilled) {
              eng.packAutoFilled = true;
              const base = eng.activeFlav;
              const picks = [base, (base + 1) % 5, (base + 2) % 5];
              [250, 410, 570].forEach((delay, idx) => {
                window.setTimeout(() => {
                  if (engineRef.current.packTouched) return;
                  setPack((prev) => {
                    const next = [...prev];
                    if (next[idx] === null) next[idx] = picks[idx];
                    return next;
                  });
                  document.documentElement.style.setProperty(
                    '--g',
                    hexToRgba(FLAVOURS[picks[idx]].color, 0.72),
                  );
                  pulseGlow();
                }, delay);
              });
            }
            io.disconnect();
          }
        },
        { threshold: 0.3 },
      );
      io.observe(rangeEl);
      observers.push(io);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [shopRevealed]);

  // Main WebGL stage, animation loop, scroll, resize, keyboard, and pointer drag
  useEffect(() => {
    const canvas = document.getElementById('gl') as HTMLCanvasElement | null;
    if (!canvas) return;

    const eng = engineRef.current;
    let rafId = 0;
    let alive = true;
    let lastNow = performance.now();

    const onResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      eng.stage?.resize(vw, vh);
      updateTitleSize();
      updatePillHighlight(eng.navSection);
    };

    createBarStage(canvas).then((stage) => {
      if (!alive) {
        stage.dispose();
        return;
      }
      eng.stage = stage;
      stage.resize(window.innerWidth, window.innerHeight);
    });

    const getArcPose = (j: number, pos: number, vw: number, heroH: number, now: number): BarPose => {
      const isPhone = vw < 820;
      const u = isPhone ? Math.min(vw / 560, heroH / 980) : Math.min(vw / 1440, heroH / 900);
      const cx = vw / 2;
      const cy = isPhone ? 0.4 * heroH : heroH / 2 - 78 * u;
      const xSpread = isPhone ? 1.02 : 1;

      const k = j - pos;
      const ak = Math.min(Math.abs(k), 4);
      const s = Math.sign(k);
      const i0 = Math.floor(ak);
      const i1 = Math.min(4, i0 + 1);
      const t = ak - i0;

      const s0 = ARC_SLOTS[i0];
      const s1 = ARC_SLOTS[i1];
      const dx = lerp(s0.dx, s1.dx, t);
      const dy = lerp(s0.dy, s1.dy, t);
      const h = lerp(s0.h, s1.h, t);
      const rzBase = lerp(s0.rz, s1.rz, t);
      const ryBase = lerp(s0.ry, s1.ry, t);

      let y = cy + dy * u;
      let rz = s * rzBase;
      if (!eng.reduced) {
        const b = Math.sin((now / 4600) * Math.PI * 2 + 1.37 * j);
        y -= (0.5 * b + 0.5) * 9 * u;
        rz += 0.4 * b;
      }

      const op = ak <= 3.3 ? 1 : ak >= 3.9 ? 0 : 1 - (ak - 3.3) / 0.6;

      return {
        x: cx + s * dx * u * xSpread,
        y,
        h: h * u,
        rz,
        ry: s * ryBase,
        rx: 0,
        z: -ak * 34 * u,
        op,
        sx: 1,
        sy: 1,
        shadow: 1,
      };
    };

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(64, Math.max(0, now - lastNow));
      lastNow = now;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isPhone = vw < 820;
      const heroRect = heroRef.current?.getBoundingClientRect();
      const heroH = heroRect?.height || vh;

      // 1. Smooth desktop wheel scrolling
      if (eng.smoothActive) {
        eng.smoothCur += (eng.smoothTarget - eng.smoothCur) * (1 - Math.exp(-dt / 120));
        window.scrollTo(0, eng.smoothCur);
        if (Math.abs(eng.smoothTarget - eng.smoothCur) < 0.5) {
          window.scrollTo(0, eng.smoothTarget);
          eng.smoothActive = false;
        }
      }

      // 2. Hero slide tween
      if (eng.slideActive) {
        const u = clamp((now - eng.slideStart) / Math.max(1, eng.slideDur), 0, 1);
        eng.pos = lerp(eng.slideFrom, eng.slideTo, eng.slideEase(u));
        if (!eng.slideChangedFlav && u >= 0.12) {
          eng.slideChangedFlav = true;
          const newFlav = ((Math.round(eng.slideTo) % 5) + 5) % 5;
          const dir = eng.slideTo >= eng.slideFrom ? 1 : -1;
          triggerFlavourChange(newFlav, dir, false);
        }
        if (u >= 1) {
          eng.pos = eng.slideTo;
          eng.slideActive = false;
        }
      }

      // 3. Feathered colour circle reveal
      if (eng.revealActive) {
        const t = clamp((now - eng.revealStart) / 420, 0, 1);
        const rev = revealRef.current;
        if (rev) {
          const u = isPhone ? Math.min(vw / 560, heroH / 980) : Math.min(vw / 1440, heroH / 900);
          const cx = vw / 2;
          const cy = isPhone ? 0.4 * heroH : heroH / 2 - 78 * u;
          const maxDist = Math.max(
            Math.hypot(cx, cy),
            Math.hypot(vw - cx, cy),
            Math.hypot(cx, heroH - cy),
            Math.hypot(vw - cx, heroH - cy),
          );
          const R = 1.45 * maxDist;
          const r = R * easeSlide(t);
          const f = Math.max(60, 0.35 * r);
          const mask = `radial-gradient(circle at ${cx}px ${cy}px, #000 ${Math.max(0, r - f)}px, transparent ${r}px)`;
          rev.style.maskImage = mask;
          rev.style.webkitMaskImage = mask;
        }
        if (t >= 1) {
          finishReveal();
        }
      }

      // 4. Autoplay timer (3200 ms of no interaction, >= 60% hero in view, tab visible)
      if (
        eng.autoplay &&
        eng.heroEntered &&
        !eng.dragging &&
        !eng.slideActive &&
        document.visibilityState === 'visible' &&
        heroRect &&
        heroRect.bottom >= heroH * 0.6 &&
        now - eng.lastInteraction >= 3200
      ) {
        goTo(eng.target + 1);
      }

      // 5. Section 2 pinned math, flip & storm
      const insideEl = insideRef.current;
      const shopEl = shopRef.current;
      const rangeEl = rangeRef.current;
      let p1 = 0;
      let p3 = 0;
      let q = 0;

      if (insideEl) {
        const ir = insideEl.getBoundingClientRect();
        const k = isPhone ? Math.min(vw / 390, vh / 780) : Math.min(vw / 1440, vh / 900);
        const frameTransform = `translate(-50%, -50%) scale(${k})`;
        if (inBackFrameRef.current) inBackFrameRef.current.style.transform = frameTransform;
        if (inFrontFrameRef.current) inFrontFrameRef.current.style.transform = frameTransform;

        const inFrontEl = inFrontRef.current;
        if (inFrontEl) {
          const vis = ir.bottom > 0 && ir.top < vh;
          inFrontEl.classList.toggle('show', vis);
          if (vis) {
            const pinY = ir.top > 0 ? ir.top : ir.bottom < vh ? ir.bottom - vh : 0;
            inFrontEl.style.transform = `translate3d(0, ${pinY}px, 0)`;
          }
        }

        const p = clamp(-ir.top / Math.max(1, ir.height - vh), 0, 1);
        const step = Math.floor(Math.min(p, 0.759) / 0.19);
        q = clamp((p - 0.76) / 0.24, 0, 1);
        p1 = clamp(1 - ir.top / Math.max(1, vh), 0, 1);

        if (step !== eng.curStep) {
          const oldStep = eng.curStep;
          eng.curStep = step;
          setInsideStep(step);
          const toRy = INSIDE_STEPS[step].ry;
          const fromRy = eng.flipRy;
          const halfTurns = clamp(Math.abs(toRy - fromRy) / 180, 0.4, 2);
          const dur = eng.reduced ? 0 : 720 * halfTurns;
          window.clearTimeout(eng.textSwapTimeout);

          if (dur <= 0) {
            eng.flipRy = toRy;
            eng.flipActive = false;
            crossfadeInsideText(step, eng.activeFlav, true);
          } else {
            eng.flipFromRy = fromRy;
            eng.flipToRy = toRy;
            eng.flipStart = now;
            eng.flipDur = dur;
            eng.flipActive = true;
            const textDelay = 0.38 * Math.min(dur, 720);
            eng.textSwapTimeout = window.setTimeout(() => {
              crossfadeInsideText(step, eng.activeFlav, false);
            }, textDelay);
          }
          void oldStep;
        }

        if (eng.flipActive) {
          const u = clamp((now - eng.flipStart) / Math.max(1, eng.flipDur), 0, 1);
          eng.flipRy = lerp(eng.flipFromRy, eng.flipToRy, easeInOutSine(u));
          if (u >= 1) {
            eng.flipRy = eng.flipToRy;
            eng.flipActive = false;
          }
        }

        // Front frame, number & dark storm backdrop
        const frontFade = String(1 - clamp(4 * q, 0, 1));
        if (inFrontFrameRef.current) inFrontFrameRef.current.style.opacity = frontFade;
        if (inNumRef.current) inNumRef.current.style.opacity = frontFade;
        if (inDarkRef.current) inDarkRef.current.style.opacity = String(clamp(3.5 * q, 0, 1) * 0.42);

        // Storm pieces
        const R = 0.55 * Math.hypot(vw, vh);
        const baseSize = 0.085 * Math.min(vw, vh);
        const activeBit = FLAVOURS[eng.activeFlav].bit;
        for (let i = 0; i < STORM_PIECES.length; i++) {
          const el = stormBitRefs.current[i];
          if (!el) continue;
          const sp = STORM_PIECES[i];
          const s = clamp((q - 0.45 * sp.ph) / 0.55, 0, 1);
          if (eng.reduced || q <= 0 || q >= 1 || s <= 0 || s >= 1) {
            el.style.opacity = '0';
            continue;
          }
          const bitIdx = sp.useActive ? activeBit : sp.altBit;
          const box = BITS[bitIdx];
          const spr = sprStyle(box, 0);
          const wPx = baseSize;
          const hPx = baseSize * (box[3] / box[2]);
          const rad = (0.06 + Math.pow(s, 1.5) * 0.95) * R;
          const px = vw / 2 + Math.cos(sp.a) * rad;
          const py = vh / 2 + Math.sin(sp.a) * rad * 0.8;
          const sc = (0.2 + 1.7 * s) * sp.size;
          const rot = sp.spin * s;
          const op = Math.sin(Math.PI * s) * clamp(5 * q, 0, 1) * clamp(6 * (1 - q), 0, 1);

          el.style.width = `${wPx}px`;
          el.style.height = `${hPx}px`;
          el.style.backgroundSize = spr.backgroundSize;
          el.style.backgroundPosition = spr.backgroundPosition;
          el.style.transform = `translate3d(${px - wPx / 2}px, ${py - hPx / 2}px, 0) rotate(${rot}deg) scale(${sc})`;
          el.style.opacity = String(op);
        }
      }

      if (shopEl) {
        const sr = shopEl.getBoundingClientRect();
        p3 = clamp((vh - sr.top) / (0.7 * vh), 0, 1);
        if (p3 > 0 && isPhone && !eng.scrolledCardOnce) {
          eng.scrolledCardOnce = true;
          const cardsEl = cardsRef.current;
          const cardWrap = cardRefs.current[eng.activeFlav]?.parentElement;
          if (cardsEl && cardWrap) {
            const left = cardWrap.offsetLeft - (cardsEl.clientWidth - cardWrap.clientWidth) / 2;
            cardsEl.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
          }
        } else if (p3 === 0) {
          eng.scrolledCardOnce = false;
        }
      }

      // 6. Nav active section & light/dark theme
      const threshold = vh * 0.35;
      let nextSection: 'flavors' | 'inside' | 'shop' | 'range' = 'flavors';
      if (insideEl && insideEl.getBoundingClientRect().top <= threshold) nextSection = 'inside';
      if (shopEl && shopEl.getBoundingClientRect().top <= threshold) nextSection = 'shop';
      if (rangeEl && rangeEl.getBoundingClientRect().top <= threshold) nextSection = 'range';

      const nextTheme: 'default' | 'light' | 'dark' =
        nextSection === 'range' ? 'dark' : nextSection === 'shop' ? 'light' : 'default';

      if (nextSection !== eng.navSection) {
        eng.navSection = nextSection;
        setNavSection(nextSection);
      }
      if (nextTheme !== eng.navTheme) {
        eng.navTheme = nextTheme;
        setNavTheme(nextTheme);
      }

      // 7. Update 3D bars
      const stage = eng.stage;
      if (stage) {
        const jT = Math.round(eng.target);
        const flavT = ((jT % 5) + 5) % 5;
        const baseFloor = Math.floor(eng.pos);
        const otherFade = 1 - clamp(1.6 * p1, 0, 1);

        let used = 0;
        for (let idx = -5; idx <= 5; idx++) {
          const j = baseFloor + idx;
          if (j === jT) continue;
          const pose = getArcPose(j, eng.pos, vw, heroH, now);
          pose.op *= otherFade;
          const flavIdx = ((j % 5) + 5) % 5;
          stage.setPoolBar(used++, flavIdx, j - eng.target, pose);
        }
        stage.hidePoolFrom(used);

        // Traveller anchors A -> B -> C
        const A = getArcPose(jT, eng.pos, vw, heroH, now);

        const inBarRect = inBarRef.current?.getBoundingClientRect();
        const bob = eng.reduced ? 0 : Math.sin((now / 2600) * Math.PI * 2) * 6;
        const bRy = eng.flipRy + (eng.reduced ? 0 : 720 * q);
        const B: BarPose = inBarRect
          ? {
              x: inBarRect.left + inBarRect.width / 2,
              y: inBarRect.top + inBarRect.height / 2 + bob,
              h: inBarRect.height,
              rz: 14,
              ry: bRy,
              rx: 0,
              z: 0,
              op: 1,
              sx: 1,
              sy: 1,
              shadow: 1,
            }
          : A;

        const pkRect = cardPkRefs.current[flavT]?.getBoundingClientRect();
        const tilt = eng.cardTilt[flavT];
        let pokeSx = 1;
        let pokeSy = 1;
        if (eng.pokeStart >= 0) {
          const pt = (now - eng.pokeStart) / 500;
          if (pt >= 1) {
            eng.pokeStart = -1;
          } else if (pt < 0.3) {
            const k = easeInOutSine(pt / 0.3);
            pokeSx = lerp(1, 1.06, k);
            pokeSy = lerp(1, 0.93, k);
          } else if (pt < 0.6) {
            const k = easeInOutSine((pt - 0.3) / 0.3);
            pokeSx = lerp(1.06, 0.97, k);
            pokeSy = lerp(0.93, 1.04, k);
          } else {
            const k = easeInOutSine((pt - 0.6) / 0.4);
            pokeSx = lerp(0.97, 1, k);
            pokeSy = lerp(1.04, 1, k);
          }
        }

        const C: BarPose = pkRect
          ? {
              x: pkRect.left + pkRect.width / 2,
              y: pkRect.top + pkRect.height / 2,
              h: pkRect.height,
              rz: 0,
              ry: Math.round(B.ry / 360) * 360 + tilt.x * 14,
              rx: -tilt.y * 14,
              z: 30,
              op: 1,
              sx: pokeSx,
              sy: pokeSy,
              shadow: 0.7,
            }
          : B;

        let pose = A;
        if (p1 > 0) pose = lerpPose(pose, B, easeInOutSine(p1));
        if (p3 > 0) pose = lerpPose(pose, C, easeInOutSine(p3));

        stage.setTraveller(flavT, jT - eng.target, pose);
        stage.render();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // Smooth wheel handler (desktop)
    const onWheel = (e: WheelEvent) => {
      if (
        e.ctrlKey ||
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ||
        eng.isTouch ||
        eng.reduced ||
        document.body.classList.contains('locked')
      ) {
        return;
      }
      e.preventDefault();
      const vh = window.innerHeight;
      const dy =
        e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * vh : e.deltaY;
      if (!eng.smoothActive) {
        eng.smoothCur = window.scrollY;
        eng.smoothTarget = window.scrollY;
        eng.smoothActive = true;
      }
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
      eng.smoothTarget = clamp(eng.smoothTarget + dy, 0, maxScroll);
    };

    const onTouchStart = () => {
      eng.isTouch = true;
      eng.smoothActive = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['PageDown', 'PageUp', 'Space', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '].includes(e.key)
      ) {
        eng.smoothActive = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const hr = heroRef.current?.getBoundingClientRect();
        if (hr && hr.bottom >= window.innerHeight * 0.5 && !document.body.classList.contains('locked')) {
          goTo(eng.target + (e.key === 'ArrowRight' ? 1 : -1));
        }
      }
    };

    const onNativePointerDown = () => {
      eng.smoothActive = false;
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onNativePointerDown, { passive: true });

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      window.clearTimeout(eng.textSwapTimeout);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onNativePointerDown);
      eng.stage?.dispose();
      eng.stage = null;
    };
  }, [crossfadeInsideText, finishReveal, goTo, triggerFlavourChange, updatePillHighlight, updateTitleSize]);

  // Hero .arc pointer drag & tap raycast
  useEffect(() => {
    const arcEl = arcRef.current;
    if (!arcEl) return;
    const eng = engineRef.current;

    const getSlotPx = () => {
      const vw = window.innerWidth;
      const heroH = heroRef.current?.getBoundingClientRect().height || window.innerHeight;
      const isPhone = vw < 820;
      const u = isPhone ? Math.min(vw / 560, heroH / 980) : Math.min(vw / 1440, heroH / 900);
      return 245 * u * (isPhone ? 1.02 : 1);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || document.body.classList.contains('locked')) return;
      eng.dragging = false;
      eng.dragMoved = false;
      eng.dragPointerId = e.pointerId;
      eng.dragStartX = e.clientX;
      eng.dragStartPos = eng.pos;
      eng.dragLastX = e.clientX;
      eng.dragLastT = performance.now();
      eng.dragVel = 0;
      eng.lastInteraction = performance.now();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (eng.dragPointerId === e.pointerId) {
        const dx = e.clientX - eng.dragStartX;
        const now = performance.now();
        eng.lastInteraction = now;

        if (!eng.dragMoved && Math.abs(dx) > 6) {
          eng.dragMoved = true;
          eng.dragging = true;
          eng.slideActive = false;
          eng.dragStartPos = eng.pos;
          eng.dragStartX = e.clientX;
          document.body.classList.add('dragging');
          try {
            arcEl.setPointerCapture(e.pointerId);
          } catch {
            // ignore capture error
          }
        }

        if (eng.dragging) {
          const slotPx = Math.max(1, getSlotPx());
          const liveDx = e.clientX - eng.dragStartX;
          eng.pos = eng.dragStartPos - liveDx / slotPx;

          const dt = Math.max(4, now - eng.dragLastT);
          const stepDx = e.clientX - eng.dragLastX;
          const v = -(stepDx / slotPx) / dt;
          eng.dragVel = lerp(eng.dragVel, v, 0.4);
          eng.dragLastX = e.clientX;
          eng.dragLastT = now;
        }
        return;
      }

      // Hover cursor (mouse only)
      if (e.pointerType === 'mouse' && eng.stage) {
        const hit = eng.stage.raycastHero(e.clientX, e.clientY);
        arcEl.style.cursor = hit !== null ? 'pointer' : 'grab';
      }
    };

    const finishDrag = (e: PointerEvent, cancelled: boolean) => {
      if (eng.dragPointerId !== e.pointerId) return;
      const wasMoved = eng.dragMoved;
      eng.dragPointerId = -1;
      eng.dragging = false;
      document.body.classList.remove('dragging');
      try {
        if (arcEl.hasPointerCapture(e.pointerId)) {
          arcEl.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }

      if (wasMoved) {
        const to = cancelled && Math.abs(eng.pos - Math.round(eng.pos)) < 0.02
          ? Math.round(eng.pos)
          : Math.round(eng.pos + clamp(eng.dragVel * 220, -2, 2));
        const dur = Math.max(380, 650 * Math.min(1, Math.abs(to - eng.pos) + 0.35));
        goTo(to, dur);
      } else if (!cancelled && eng.stage) {
        const hitOffset = eng.stage.raycastHero(e.clientX, e.clientY);
        if (hitOffset !== null && Math.round(hitOffset) !== 0) {
          goTo(eng.target + Math.round(hitOffset));
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => finishDrag(e, false);
    const onPointerCancel = (e: PointerEvent) => finishDrag(e, true);

    arcEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    return () => {
      arcEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [goTo]);

  // Smooth scroll helper for nav links & step icons
  const scrollToY = useCallback((y: number) => {
    const eng = engineRef.current;
    if (eng.reduced) {
      window.scrollTo(0, y);
      return;
    }
    eng.smoothActive = false;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, []);

  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const target = document.getElementById(id);
      if (target) {
        scrollToY(target.offsetTop);
      }
    },
    [scrollToY],
  );

  const handleStepClick = useCallback(
    (stepIdx: number) => {
      const insideEl = insideRef.current;
      if (!insideEl) return;
      const vh = window.innerHeight;
      const targetP = (stepIdx + 0.5) * 0.19;
      const y = insideEl.offsetTop + targetP * Math.max(0, insideEl.offsetHeight - vh);
      scrollToY(y);
    },
    [scrollToY],
  );

  // Shop card handlers
  const handleCardPointerMove = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const card = cardRefs.current[idx];
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    engineRef.current.cardTilt[idx] = { x, y };
    card.style.transform = `translateY(-8px) rotateX(${-y * 12}deg) rotateY(${x * 12}deg)`;
    card.style.boxShadow = '0 24px 40px -18px rgba(40,30,20,.35)';
  };

  const handleCardPointerLeave = (idx: number) => {
    const card = cardRefs.current[idx];
    engineRef.current.cardTilt[idx] = { x: 0, y: 0 };
    if (card) {
      card.style.transform = '';
      card.style.boxShadow = '';
    }
  };

  const handleCardPointerDown = (idx: number) => {
    const card = cardRefs.current[idx];
    if (card) {
      card.style.transform = 'scale(0.97)';
    }
  };

  const handleCardPointerUp = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      handleCardPointerMove(idx, e);
    } else {
      handleCardPointerLeave(idx);
    }
  };

  const handlePkClick = (idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (idx === activeFlavour && engineRef.current.stage?.ready) {
      engineRef.current.pokeStart = performance.now();
      return;
    }
    const pk = cardPkRefs.current[idx];
    if (!pk || engineRef.current.reduced) return;
    pk.animate(
      [
        { transform: 'translateX(-50%) translateZ(30px) scale(1, 1)' },
        { transform: 'translateX(-50%) translateZ(30px) scale(1.06, 0.93)', offset: 0.3 },
        { transform: 'translateX(-50%) translateZ(30px) scale(0.97, 1.04)', offset: 0.6 },
        { transform: 'translateX(-50%) translateZ(30px) scale(1, 1)' },
      ],
      { duration: 500, easing: 'ease-out' },
    );
  };

  const handleCardAdd = (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    flyToCart([{ el: cardPkRefs.current[idx], box: FLAVOURS[idx].box }], incrementCart);
  };

  // Builder handlers
  const handleAddThumb = (flavIdx: number) => {
    engineRef.current.packTouched = true;
    const emptySlot = pack.indexOf(null);
    if (emptySlot === -1) return;
    const next = [...pack];
    next[emptySlot] = flavIdx;
    setPack(next);
    document.documentElement.style.setProperty(
      '--g',
      hexToRgba(FLAVOURS[flavIdx].color, 0.72),
    );
    pulseGlow();
  };

  const handleRemoveSlot = (slotIdx: number) => {
    engineRef.current.packTouched = true;
    const next = [...pack];
    next[slotIdx] = null;
    setPack(next);
    pulseGlow();
  };

  const handleBuyPack = () => {
    if (pack.some((p) => p === null) || buyState === 'added') return;
    engineRef.current.packTouched = true;
    const sources = pack.map((flavIdx, sIdx) => ({
      el: slotBarRefs.current[sIdx],
      box: FLAVOURS[flavIdx ?? 0].box,
    }));

    flyToCart(sources, incrementCart);

    window.setTimeout(() => {
      setPack([null, null, null]);
      setBuyState('added');
      window.setTimeout(() => {
        setBuyState('idle');
      }, 1600);
    }, 60);
  };

  const filledCount = pack.filter((p) => p !== null).length;
  const remaining = 3 - filledCount;

  const toggleAutoplay = () => {
    const next = !autoplay;
    setAutoplay(next);
    engineRef.current.autoplay = next;
    engineRef.current.lastInteraction = performance.now();
  };

  return (
    <>
      {/* INTRO */}
      {introPhase !== 'gone' && (
        <div
          id="intro"
          ref={introRef}
          className={
            introPhase === 'cream'
              ? 'cream'
              : introPhase === 'out'
                ? 'cream out'
                : ''
          }
        >
          <video
            ref={videoRef}
            src={INTRO_VIDEO_URL}
            muted
            playsInline
            preload="auto"
          />
          <button id="skip" type="button">
            Skip intro
          </button>
          <div className="stamp">
            <StrideMark className="stamp-mark" />
            <span className="stamp-word">STRIDE</span>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav
        id="nav"
        ref={navRef}
        className={`${heroEntered ? 'in' : ''} ${navTheme !== 'default' ? navTheme : ''}`}
      >
        <a
          href="#flavors"
          className="brand"
          onClick={(e) => handleNavClick(e, 'flavors')}
        >
          <StrideMark className="brand-mark" />
          <span className="brand-word">STRIDE</span>
        </a>

        <div className="nav-pill" ref={pillRef}>
          <div className="pill-hl" ref={pillHlRef} />
          {(
            [
              ['flavors', 'Flavors'],
              ['inside', 'Inside'],
              ['shop', 'Shop'],
              ['range', 'Range'],
            ] as const
          ).map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              ref={(el) => {
                linkRefs.current[id] = el;
              }}
              className={`nav-link ${navSection === id ? 'active' : ''}`}
              onClick={(e) => handleNavClick(e, id)}
            >
              {label}
            </a>
          ))}
        </div>

        <div className="nav-right">
          <button
            type="button"
            className="chip chip-off"
            onClick={() => {
              const el = document.getElementById('range');
              if (el) scrollToY(el.offsetTop);
            }}
          >
            % OFF
          </button>
          <button
            ref={basketRef}
            type="button"
            className="chip chip-basket"
            aria-label="Basket"
            onClick={() => {
              const el = document.getElementById('shop');
              if (el) scrollToY(el.offsetTop);
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 9h14l-1.4 10H6.4L5 9Z" />
              <path d="M9 9V6.5a3 3 0 0 1 6 0V9" />
            </svg>
            <span
              ref={badgeRef}
              className={`cart-badge ${cartCount > 0 ? 'show' : ''}`}
            >
              {cartCount}
            </span>
          </button>
          <button
            type="button"
            className="chip-dibs"
            onClick={() => {
              const el = document.getElementById('range');
              if (el) scrollToY(el.offsetTop);
            }}
          >
            First dibs
          </button>
        </div>
      </nav>

      {/* SECTION 1: HERO */}
      <section id="flavors" ref={heroRef}>
        <div className="reveal" ref={revealRef} />
        <div className={`rings ${heroEntered ? 'in' : ''}`} ref={ringsRef} />
        <div className="bits">
          {HERO_BITS.map((b, i) => {
            const box = BITS[b.bit];
            const spr = sprStyle(box, 0);
            const aspect = box[3] / box[2];
            const mult = typeof window !== 'undefined' && window.innerWidth < 820 ? 1.3 : 1;
            return (
              <div
                key={i}
                ref={(el) => {
                  bitRefs.current[i] = el;
                }}
                className={`spr bit ${b.hideMobile ? 'm-hide' : ''}`}
                style={{
                  left: `${b.xFrac * 100}%`,
                  top: `${b.yFrac * 100}%`,
                  width: `calc(${b.sizeU * mult} * var(--u))`,
                  height: `calc(${b.sizeU * mult * aspect} * var(--u))`,
                  transform: `translate(-50%, -50%) rotate(${b.rot}deg)`,
                  backgroundSize: spr.backgroundSize,
                  backgroundPosition: spr.backgroundPosition,
                }}
              />
            );
          })}
        </div>
        <div className="arc" ref={arcRef} />

        <button
          id="play"
          type="button"
          aria-label="Next flavour"
          className={heroEntered ? 'in' : ''}
          onClick={() => goTo(engineRef.current.target + 1)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10h12" />
            <path d="M11 5l5 5-5 5" />
          </svg>
        </button>

        <h1 id="title" ref={titleRef} className="disp" aria-live="polite" />

        <div id="count" ref={countRef} className={`disp ${heroEntered ? 'in' : ''}`}>
          <span>02</span>
        </div>

        <button
          id="auto"
          type="button"
          aria-pressed={autoplay}
          className={heroEntered ? 'in' : ''}
          onClick={toggleAutoplay}
        >
          <span className="auto-ring">
            {autoplay ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                <rect x="1.8" y="1.5" width="2.2" height="7" rx="1" />
                <rect x="6" y="1.5" width="2.2" height="7" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                <path d="M2.5 1.5L8.5 5L2.5 8.5V1.5Z" />
              </svg>
            )}
          </span>
          <span className="auto-lbl">Autoplay</span>
        </button>
      </section>

      {/* SECTION 2: INSIDE */}
      <section id="inside" ref={insideRef}>
        <div className="pin">
          <div className="in-dark" ref={inDarkRef} />
          <div className="in-frame" ref={inBackFrameRef}>
            <div className="in-num disp" ref={inNumRef}>
              01
            </div>
            <div id="inBar" ref={inBarRef} />
          </div>
        </div>
      </section>

      {/* SECTION 2 FRONT LAYER (ABOVE CANVAS) */}
      <div id="inFront" ref={inFrontRef}>
        <div className="in-frame" ref={inFrontFrameRef}>
          <h2 className="in-head disp" ref={inHeadRef}>
            <span className="line">REAL FOOD,</span>
            <span className="line">FIRST</span>
          </h2>

          <div className="in-icons">
            {[0, 1, 2, 3].map((idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Step 0${idx + 1}`}
                className={`in-ico ${insideStep === idx ? 'active' : ''}`}
                onClick={() => handleStepClick(idx)}
              >
                <StepIcon idx={idx} />
              </button>
            ))}
          </div>

          <div className="in-cap" ref={inCapRef}>
            <span>Oats, nuts, fruit.</span>
            <span>Nothing you can&apos;t say.</span>
          </div>
        </div>

        <div className="storm">
          {STORM_PIECES.map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                stormBitRefs.current[i] = el;
              }}
              className="spr storm-bit"
            />
          ))}
        </div>
      </div>

      {/* SECTION 3: SHOP */}
      <section id="shop" ref={shopRef} className={shopRevealed ? 'revealed' : ''}>
        <h2 className="shop-head disp">
          <span className="rev-mask">
            <span className="rev-line">GRAB</span>
          </span>
          <span className="rev-mask d2">
            <span className="rev-line">A BAG</span>
          </span>
        </h2>

        <p className="shop-cap">
          Five bold flavours. Same
          <br />
          real ingredients. Pick your
          <br />
          favourite (or try them all).
        </p>

        <div className="cards" ref={cardsRef}>
          {FLAVOURS.map((flav, idx) => {
            const spr = sprStyle(flav.box, 4);
            return (
              <div
                key={flav.name}
                className="card-wrap"
                style={{ transitionDelay: `${idx * 80}ms` }}
              >
                <div
                  ref={(el) => {
                    cardRefs.current[idx] = el;
                  }}
                  className={`card ${activeFlavour === idx ? 'live' : ''}`}
                  style={{ background: flav.color }}
                  onClick={(e) => handlePkClick(idx, e)}
                  onPointerMove={(e) => handleCardPointerMove(idx, e)}
                  onPointerLeave={() => handleCardPointerLeave(idx)}
                  onPointerDown={() => handleCardPointerDown(idx)}
                  onPointerUp={(e) => handleCardPointerUp(idx, e)}
                >
                  <h3 className="card-name disp">
                    <span>{flav.twoLine[0]}</span>
                    <span>{flav.twoLine[1]}</span>
                  </h3>

                  <div
                    ref={(el) => {
                      cardPkRefs.current[idx] = el;
                    }}
                    className="spr pk"
                    style={spr}
                  />

                  <button
                    type="button"
                    className="add"
                    aria-label={`Add a bag of ${flav.name} to the cart`}
                    onClick={(e) => handleCardAdd(idx, e)}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 4: BUILDER */}
      <section id="range" ref={rangeRef} className={rangeRevealed ? 'revealed' : ''}>
        <div className="range-inner">
          <h2 className="range-head disp">
            <span className="rev-mask">
              <span className="rev-line">BUILD YOUR</span>
            </span>
            <span className="rev-mask d2">
              <span className="rev-line">
                <span className="three-box">3</span>PACK &amp;
              </span>
            </span>
            <span className="rev-mask d3">
              <span className="rev-line">SAVE $1.49</span>
            </span>
          </h2>

          <div ref={glowRef} className="glow">
            {[0, 1, 2].map((sIdx) => {
              const flavIdx = pack[sIdx];
              const isFilled = flavIdx !== null;
              return (
                <div
                  key={sIdx}
                  className={`slot slot-${sIdx} ${isFilled ? 'filled' : ''}`}
                >
                  {isFilled && flavIdx !== null && (
                    <div
                      ref={(el) => {
                        slotBarRefs.current[sIdx] = el;
                      }}
                      className="spr slot-bar"
                      style={sprStyle(FLAVOURS[flavIdx].box, 4)}
                    />
                  )}
                  <button
                    type="button"
                    className="slot-x"
                    aria-label={isFilled ? `Remove ${FLAVOURS[flavIdx!].name} from slot ${sIdx + 1}` : `Empty slot ${sIdx + 1}`}
                    onClick={() => isFilled && handleRemoveSlot(sIdx)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div className="thumbs">
            {FLAVOURS.map((flav, idx) => {
              const count = pack.filter((p) => p === idx).length;
              return (
                <button
                  key={flav.name}
                  type="button"
                  className="thumb"
                  onClick={() => handleAddThumb(idx)}
                >
                  <span className="thumb-sq" style={{ background: flav.color }}>
                    <span className="spr thumb-spr" style={sprStyle(flav.box, 4)} />
                  </span>
                  <span className="thumb-name">{flav.name}</span>
                  <span className={`thumb-mark ${count > 0 ? 'has' : ''}`}>
                    {count === 1 ? '✓' : count > 1 ? count : ''}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            id="buy"
            type="button"
            disabled={remaining > 0 && buyState !== 'added'}
            className={buyState === 'added' ? 'added' : ''}
            onClick={handleBuyPack}
          >
            <span>
              {buyState === 'added'
                ? 'Added to cart'
                : remaining > 0
                  ? `Pick ${remaining} more`
                  : 'Add 3 pack to cart'}
            </span>
            {buyState !== 'added' && <span className="buy-price">$7.48</span>}
          </button>
        </div>
      </section>
    </>
  );
}
