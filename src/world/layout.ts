/**
 * Hex-ring packing — deterministic XZ positions for namespaces.
 *
 * Ring 0: [0, 0]
 * Ring 1: 6 slots at radius RING_GAP
 * Ring 2: 12 slots at radius 2*RING_GAP, every 30°
 * ...
 *
 * Slots are pre-allocated so adding namespace N always yields the same
 * center, enabling stable animation targets.
 */

const RING_GAP = 22        // distance between ring centers (units)
const BASE_ANGLE = Math.PI / 6  // 30° offset so ring-1 aligns nicely

/** Return [x, z] center for slot index 0, 1, 2… */
export function slotToCenter(slot: number): [number, number] {
  if (slot === 0) return [0, 0]

  // Determine which ring this slot belongs to
  // Ring r has 6*r slots. Cumulative up to ring r: 1 + 6*(1+2+...+r) = 1 + 3*r*(r+1)
  let ring = 1
  let cumulative = 1
  while (cumulative + 6 * ring <= slot) {
    cumulative += 6 * ring
    ring++
  }

  const posInRing = slot - cumulative
  const totalInRing = 6 * ring
  const angle = BASE_ANGLE + (posInRing / totalInRing) * Math.PI * 2
  const radius = ring * RING_GAP

  return [
    Math.round(Math.cos(angle) * radius * 10) / 10,
    Math.round(Math.sin(angle) * radius * 10) / 10,
  ]
}

/** Find the next free slot given a set of occupied slots */
export function nextFreeSlot(occupiedSlots: Set<number>): number {
  let s = 0
  while (occupiedSlots.has(s)) s++
  return s
}

/** Build slot→center map for the initial namespace list */
export function buildSlotMap(nsIds: string[]): Map<string, number> {
  const map = new Map<string, number>()
  nsIds.forEach((id, i) => map.set(id, i))
  return map
}
