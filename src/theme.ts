/**
 * KubeIslands Design System — single source of truth.
 * All hex values must originate here. Never hardcode outside this file
 * (exception: src/data/seed.ts for per-namespace hues).
 */

// ─── Color palette ────────────────────────────────────────────────────────────
export const color = {
  bg: '#02060F',
  bg2: '#050B1A',
  ink: '#E8F6FF',
  inkDim: '#8AA6C4',
  inkFaint: '#52708E',
  cyan: '#00FFD1',
  cyan2: '#3EF3FF',
  cyanDim: '#0A8F8A',
  red: '#FF3355',
  redDim: '#7A1A2A',
  amber: '#FFB800',
  white: '#FFFFFF',
  obs: '#8BE8FF',
  chassis: '#1A2434',
  chassisMid: '#2A3648',
  chassisLo: '#0D1522',
  ocean: '#061328',
  oceanDeep: '#010409',
} as const

// Three.js numeric hex — for new THREE.Color(hex.cyan) etc.
export const hex = {
  bg: 0x02060f,
  chassis: 0x1a2434,
  chassisMid: 0x2a3648,
  chassisHi: 0x25334a,
  chassisLo: 0x0d1522,
  cyan: 0x00ffd1,
  cyan2: 0x3ef3ff,
  red: 0xff3355,
  amber: 0xffb800,
  obs: 0x8be8ff,
  ocean: 0x061328,
  oceanDeep: 0x010409,
  keyLight: 0x9ed6ff,
  fillLight: 0x0a1a30,
} as const

// ─── Typography ───────────────────────────────────────────────────────────────
export const font = {
  display: 'Orbitron',
  ui: 'Rajdhani',
  mono: 'JetBrains Mono',
} as const

// font URL paths for drei <Text> component (served from /public/fonts/)
export const fontUrl = {
  orbitronBold: '/fonts/Orbitron-Bold.woff2',
  rajdhaniMedium: '/fonts/Rajdhani-Medium.woff2',
  jetbrainsMono: '/fonts/JetBrainsMono-Regular.woff2',
} as const

// ─── Motion ───────────────────────────────────────────────────────────────────
export const motion = {
  fast: 120,
  normal: 240,
  slow: 480,
  vslow: 900,
  easeOut: 'cubic-bezier(.2,.6,.2,1)',
  easeInOut: 'cubic-bezier(.4,0,.2,1)',
} as const

// ─── Glass panel ──────────────────────────────────────────────────────────────
export const glass = {
  bg: 'rgba(8, 14, 28, 0.72)',
  border: 'rgba(0, 255, 209, 0.18)',
  borderStrong: 'rgba(0, 255, 209, 0.42)',
  hair: 'rgba(0, 255, 209, 0.14)',
  blur: 'blur(12px) saturate(140%)',
} as const
