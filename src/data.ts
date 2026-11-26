export const SHEET_URL =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261116_132032_30242d8c-5062-4d60-8a3d-238f0a2ff788.png&w=2200&q=85';

export const INTRO_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20261116_131908_b6239896-c077-450c-ad91-575153973fcf.mp4';

export const SW = 2688;
export const SH = 1520;

export type Box = [number, number, number, number];

export interface Flavour {
  name: string;
  twoLine: [string, string];
  box: Box;
  color: string;
  bit: number;
  ingredients: string;
  barcode: string;
}

export const FLAVOURS: Flavour[] = [
  {
    name: 'Peanut Cocoa',
    twoLine: ['PEANUT', 'COCOA'],
    box: [98, 145, 403, 849],
    color: '#b79474',
    bit: 1,
    ingredients: 'Peanuts, oats, dates, cocoa, pea protein, sea salt.',
    barcode: '5 060812 001015',
  },
  {
    name: 'Berry Oat',
    twoLine: ['BERRY', 'OAT'],
    box: [620, 145, 402, 849],
    color: '#ab9ac4',
    bit: 0,
    ingredients: 'Oats, blueberries, raspberries, dates, pea protein, almonds.',
    barcode: '5 060812 001022',
  },
  {
    name: 'Salted Caramel',
    twoLine: ['SALTED', 'CARAMEL'],
    box: [1137, 145, 402, 849],
    color: '#d1ad6c',
    bit: 2,
    ingredients: 'Dates, cashews, oats, pea protein, sea salt, vanilla.',
    barcode: '5 060812 001039',
  },
  {
    name: 'Mint Chip',
    twoLine: ['MINT', 'CHIP'],
    box: [1661, 145, 402, 849],
    color: '#94bdb4',
    bit: 3,
    ingredients: 'Oats, dark chocolate, almonds, pea protein, peppermint oil.',
    barcode: '5 060812 001046',
  },
  {
    name: 'Strawberry',
    twoLine: ['STRAW-', 'BERRY'],
    box: [2184, 145, 403, 849],
    color: '#d396a7',
    bit: 4,
    ingredients: 'Oats, strawberries, dates, cashews, pea protein, lemon.',
    barcode: '5 060812 001053',
  },
];

export const BITS: Box[] = [
  [650, 1090, 340, 305], // 0: blueberries and raspberry
  [110, 1125, 280, 255], // 1: chocolate chunks and peanuts
  [1175, 1110, 320, 285], // 2: salted caramel cube
  [1680, 1085, 380, 305], // 3: mint leaves and dark chocolate
  [2280, 1095, 250, 295], // 4: half strawberry
];

export interface HeroBit {
  xFrac: number;
  yFrac: number;
  sizeU: number;
  rot: number;
  bit: number;
  hideMobile: boolean;
}

export const HERO_BITS: HeroBit[] = [
  { xFrac: 0.12, yFrac: 0.2, sizeU: 120, rot: -18, bit: 0, hideMobile: false },
  { xFrac: 0.86, yFrac: 0.18, sizeU: 96, rot: 22, bit: 2, hideMobile: true },
  { xFrac: 0.07, yFrac: 0.74, sizeU: 84, rot: 12, bit: 3, hideMobile: false },
  { xFrac: 0.655, yFrac: 0.15, sizeU: 78, rot: -10, bit: 4, hideMobile: true },
  { xFrac: 0.205, yFrac: 0.885, sizeU: 70, rot: 30, bit: 1, hideMobile: true },
];

export interface InsideStep {
  num: string;
  head: string[];
  cap: string[];
  ry: number;
}

export const INSIDE_STEPS: InsideStep[] = [
  {
    num: '01',
    head: ['REAL FOOD,', 'FIRST'],
    cap: ['Oats, nuts, fruit.', "Nothing you can't say."],
    ry: 0,
  },
  {
    num: '02',
    head: ['PRESSED,', 'NOT BAKED'],
    cap: ['Real ingredients.', 'Clean energy.'],
    ry: 180,
  },
  {
    num: '03',
    head: ['WRAPPED', 'SAME DAY'],
    cap: ['Cold-pressed at dawn.', 'Sealed by noon.'],
    ry: 360,
  },
  {
    num: '04',
    head: ['BERRY', 'OAT'],
    cap: ['12g plant protein.', 'No crash.'],
    ry: 720,
  },
];

export function sprStyle(box: Box, pad = 0): { backgroundSize: string; backgroundPosition: string } {
  const x = box[0] - pad;
  const y = box[1] - pad;
  const w = box[2] + 2 * pad;
  const h = box[3] + 2 * pad;
  return {
    backgroundSize: `${(SW / w) * 100}% ${(SH / h) * 100}%`,
    backgroundPosition: `${(x / (SW - w)) * 100}% ${(y / (SH - h)) * 100}%`,
  };
}

export function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
}

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(t) - x;
      const d = sampleDX(t);
      if (Math.abs(err) < 1e-6) break;
      if (Math.abs(d) < 1e-6) break;
      t = clamp(t - err / d, 0, 1);
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 8; i++) {
      const sx = sampleX(t);
      if (Math.abs(sx - x) < 1e-5) break;
      if (sx < x) lo = t;
      else hi = t;
      t = 0.5 * (lo + hi);
    }
    return sampleY(t);
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const a = hexA.replace('#', '');
  const b = hexB.replace('#', '');
  const r = Math.round(lerp(parseInt(a.slice(0, 2), 16), parseInt(b.slice(0, 2), 16), weightB));
  const g = Math.round(lerp(parseInt(a.slice(2, 4), 16), parseInt(b.slice(2, 4), 16), weightB));
  const bl = Math.round(lerp(parseInt(a.slice(4, 6), 16), parseInt(b.slice(4, 6), 16), weightB));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}
